const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = { dispatchEvent() {} };

async function harness() {
  const module = await import(
    "data:text/javascript;base64," +
      Buffer.from(
        fs.readFileSync(path.join(__dirname, "../assets/admin.js"), "utf8"),
      ).toString("base64")
  );
  const states = [],
    effects = [],
    calls = [];
  let cursor = 0,
    dirty = 0,
    saved = 0;
  const React = {
    Fragment: "Fragment",
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states))
        states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useEffect: (fn) => effects.push(fn),
    useId: () => "test-gallery",
    useRef: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
  };
  const components = Object.fromEntries(
    [
      "Button",
      "LoadingButton",
      "Input",
      "Textarea",
      "Breadcrumbs",
      "DataTable",
      "DropdownMenu",
      "DropdownOption",
      "DropdownChevron",
      "TableActionsMenu",
      "CollapsibleSection",
      "ConfirmDialog",
      "MediaPicker",
      "Dialog",
    ].map((key) => [key, key]),
  );
  const host = {
    React,
    components,
    icons: {},
    toast: { success() {}, error() {} },
    useWorkspaceChanged: () => () => dirty++,
    useWorkspaceSaved: () => () => saved++,
    request: async (url, method, body) => {
      calls.push({ url, method, body });
      if (method === "POST") return { gallery: { ...body, id: 8, version: 1 } };
      return {
        galleries: [
          { id: 8, name: "Планини", status: "active" },
          { id: 9, name: "Чернова", status: "draft" },
        ],
      };
    },
  };
  function render(Component, props) {
    cursor = 0;
    return Component(props);
  }
  function all(tree, predicate) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree))
      return tree.flatMap((item) => all(item, predicate));
    return [
      ...(predicate(tree) ? [tree] : []),
      ...all(tree.props?.children, predicate),
    ];
  }
  return {
    module,
    host,
    render,
    all,
    effects,
    calls,
    dirty: () => dirty,
    saved: () => saved,
  };
}

test("combined gallery editor adds closed dialogs and reorders before saving", async () => {
  const t = await harness(),
    navigate = [];
  const Page = t.module.createPage(t.host);
  const page = Page({
    path: "/extension-pages/flex-galleries-galleries/create",
    navigate: (value) => navigate.push(value),
  });
  const editorNode = t.all(page, (node) => typeof node.type === "function")[0];
  const render = () => t.render(editorNode.type, editorNode.props);
  let tree = render();
  let picker = t.all(tree, (node) => node.type === "MediaPicker")[0];
  const first = {
    id: 1,
    title: "Планина",
    alt: "Планина",
    caption: "Надпис от библиотеката",
    description: "Описание от библиотеката",
    url: "/media-files/1/original",
  };
  const second = { ...first, id: 2, title: "Море" };
  picker.props.onSelectMany([first, second]);
  tree = render();
  picker = t.all(tree, (node) => node.type === "MediaPicker")[0];
  picker.props.onSelectMany([first]);
  tree = render();
  const items = t.all(tree, (node) => node.type === "Dialog");
  assert.equal(items.length, 2);
  assert.equal(items[0].props.open, false);
  assert.equal(
    t.all(tree, (node) => node.props?.label === "Заглавие (title атрибут)")[0]
      .props.value,
    "Планина",
  );
  assert.equal(
    t.all(tree, (node) => node.props?.label === "Надпис")[0].props.value,
    first.caption,
  );
  assert.equal(
    t.all(tree, (node) => node.props?.label === "Описание")[0].props.value,
    first.description,
  );
  t.all(tree, (node) => node.props?.label === "Надпис")[0].props.onChange({
    target: { value: "Само тази галерия" },
  });
  tree = render();
  assert.equal(first.caption, "Надпис от библиотеката");
  t.all(
    tree,
    (node) => node.props?.["aria-label"] === "Редактирай изображението",
  )[0].props.onClick();
  tree = render();
  assert.equal(
    t.all(tree, (node) => node.type === "Dialog")[0].props.open,
    true,
  );
  t.all(tree, (node) => node.type === "Dialog")[0].props.onClose();
  tree = render();
  t.all(
    tree,
    (node) => node.props?.["aria-label"] === "Премести надолу",
  )[0].props.onClick();
  tree = render();
  assert.match(
    t.all(tree, (node) => node.type === "Dialog")[0].props.title,
    /Море/,
  );
  t.all(tree, (node) => node.props?.label === "Име")[0].props.onChange({
    target: { value: "Лято" },
  });
  tree = render();
  await t
    .all(tree, (node) => node.type === "form")[0]
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(
    t.calls.at(-1).body.items.map((item) => item.media_id),
    [2, 1],
  );
  assert.equal(t.calls.at(-1).body.name, "Лято");
  assert.equal(t.calls.at(-1).body.items[1].caption, "Само тази галерия");
  assert.ok(t.dirty() > 0);
  assert.equal(t.saved(), 1);
  assert.equal(
    navigate.at(-1),
    "/extension-pages/flex-galleries-galleries/8/edit",
  );
});

test("embed picker offers only active galleries and creates a placement-specific design reference", async () => {
  const t = await harness(),
    inserted = [];
  const Picker = t.module.createEmbedPicker(t.host);
  const props = { onInsert: (value) => inserted.push(value), onClose() {} };
  t.render(Picker, props);
  t.effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  let tree = t.render(Picker, props);
  const select = t.all(tree, (node) => node.props?.label === "Галерия")[0];
  assert.equal(select.props.options["8"], "Планини");
  assert.equal(select.props.options["9"], undefined);
  select.props.onChange("8");
  t.all(
    tree,
    (node) => node.props?.label === "Дизайн за това поставяне",
  )[0].props.onChange("masonry");
  tree = t.render(Picker, props);
  t.all(tree, (node) => node.type === "Button")[0].props.onClick();
  assert.equal(inserted[0], '[gallery id="8" design="masonry"]');
});

test("drag preview marks the destination and preserves reordered items on save", async () => {
  const t = await harness();
  const Page = t.module.createPage(t.host);
  const page = Page({
    path: "/extension-pages/flex-galleries-galleries/create",
    navigate() {},
  });
  const editor = t.all(page, (node) => typeof node.type === "function")[0];
  const render = () => t.render(editor.type, editor.props);
  let tree = render();
  t.all(tree, (node) => node.type === "MediaPicker")[0].props.onSelectMany(
    [1, 2, 3].map((id) => ({
      id,
      title: String(id),
      url: "/media-files/" + id + "/original",
    })),
  );
  const cards = (tree) =>
    t.all(tree, (node) => typeof node.props?.onDragOver === "function");
  tree = render();
  cards(tree)[0].props.onDragStart({
    target: { closest: () => null },
    dataTransfer: { setData() {} },
  });
  tree = render();
  const event = {
    preventDefault() {},
    clientX: 90,
    clientY: 20,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      offsetWidth: 100,
      offsetHeight: 100,
    },
  };
  cards(tree)[2].props.onDragOver(event);
  tree = render();
  assert.match(cards(tree)[2].props.className, /is-drop-after/);
  cards(tree)[2].props.onDrop(event);
  tree = render();
  assert.ok(
    cards(tree).every((node) => !node.props.className.includes("is-drop-")),
  );
  await t
    .all(tree, (node) => node.type === "form")[0]
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(
    t.calls.at(-1).body.items.map((item) => item.media_id),
    [2, 3, 1],
  );
  assert.equal(
    t.all(
      tree,
      (node) =>
        node.type === "CollapsibleSection" &&
        node.props.title === "Преглед на дизайна",
    ).length,
    0,
  );
});

test("settings have hints and carousel navigation changes the visible slide", async () => {
  const t = await harness(),
    Page = t.module.createPage(t.host);
  const page = Page({
    path: "/extension-pages/flex-galleries-galleries/create",
    navigate() {},
  });
  const editor = t.all(page, (node) => typeof node.type === "function")[0];
  const render = () => t.render(editor.type, editor.props);
  let tree = render();
  const settings = t.all(
    tree,
    (node) =>
      node.type === "CollapsibleSection" &&
      node.props.storageKey === "gallery-settings",
  )[0];
  const fields = t.all(settings, (node) => node.props?.label);
  assert.equal(fields.length, 7);
  fields.forEach((field) => assert.ok(field.props.hint, field.props.label));
  t.all(tree, (node) => node.type === "MediaPicker")[0].props.onSelectMany(
    [1, 2].map((id) => ({
      id,
      title: String(id),
      url: "/media-files/" + id + "/original",
    })),
  );
  tree = render();
  t.all(tree, (node) => node.props?.label === "Дизайн")[0].props.onChange(
    "slider",
  );
  tree = render();
  const cards = (tree) =>
    t.all(tree, (node) => typeof node.props?.onDragOver === "function");
  assert.deepEqual(
    cards(tree).map((card) => card.props.hidden),
    [false, true],
  );
  t.all(
    tree,
    (node) => node.props?.["aria-label"] === "Следващо изображение",
  )[0].props.onClick();
  tree = render();
  assert.deepEqual(
    cards(tree).map((card) => card.props.hidden),
    [true, false],
  );
  const track = t.all(
    tree,
    (node) => typeof node.props?.onPointerDown === "function",
  )[0];
  track.props.onPointerDown({
    button: 0,
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    target: { closest: () => null },
    currentTarget: { setPointerCapture() {} },
  });
  track.props.onPointerMove({ pointerId: 1, clientX: 70, clientY: 12 });
  track.props.onPointerUp({ pointerId: 1, clientX: 70, clientY: 12 });
  tree = render();
  assert.deepEqual(
    cards(tree).map((card) => card.props.hidden),
    [false, true],
  );
  assert.equal(
    t.all(
      tree,
      (node) => node.props?.["aria-label"] === "Следващо изображение",
    )[0].props.disabled,
    false,
  );
});

test("design sections edit independent settings", async () => {
  const t = await harness(),
    Page = t.module.createPage(t.host);
  const page = Page({
    path: "/extension-pages/flex-galleries-galleries/create",
    navigate() {},
  });
  const editor = t.all(page, (node) => typeof node.type === "function")[0];
  const render = () => t.render(editor.type, editor.props);
  const section = (tree, design) =>
    t.all(
      tree,
      (node) =>
        node.type === "CollapsibleSection" &&
        node.props.storageKey === "gallery-design-" + design,
    )[0];
  let tree = render();
  for (const design of ["grid", "masonry", "slider"])
    assert.ok(section(tree, design));
  t.all(
    section(tree, "grid"),
    (node) => node.props?.label === "Колони",
  )[0].props.onChange("2");
  tree = render();
  t.all(
    section(tree, "masonry"),
    (node) => node.props?.label === "Колони",
  )[0].props.onChange("5");
  tree = render();
  assert.equal(
    t.all(section(tree, "grid"), (node) => node.props?.label === "Колони")[0]
      .props.value,
    2,
  );
  assert.equal(
    t.all(section(tree, "masonry"), (node) => node.props?.label === "Колони")[0]
      .props.value,
    5,
  );
  await t
    .all(tree, (node) => node.type === "form")[0]
    .props.onSubmit({ preventDefault() {} });
  assert.equal(t.calls.at(-1).body.settings.design_settings.grid.columns, 2);
  assert.equal(t.calls.at(-1).body.settings.design_settings.masonry.columns, 5);
});

test("editing an existing placement preselects its gallery and design", async () => {
  const t = await harness(),
    Picker = t.module.createEmbedPicker(t.host),
    inserted = [];
  const props = {
    initialValue: '[gallery id="8" design="masonry"]',
    onInsert: (value) => inserted.push(value),
    onClose() {},
  };
  t.render(Picker, props);
  t.effects[0]();
  await new Promise((resolve) => setImmediate(resolve));
  let tree = t.render(Picker, props);
  assert.equal(
    t.all(tree, (node) => node.props?.label === "Галерия")[0].props.value,
    "8",
  );
  assert.equal(
    t.all(tree, (node) => node.props?.label === "Дизайн за това поставяне")[0]
      .props.value,
    "masonry",
  );
  t.all(
    tree,
    (node) => node.props?.label === "Дизайн за това поставяне",
  )[0].props.onChange("slider");
  tree = t.render(Picker, props);
  t.all(tree, (node) => node.type === "Button")[0].props.onClick();
  assert.equal(inserted[0], '[gallery id="8" design="slider"]');
});
