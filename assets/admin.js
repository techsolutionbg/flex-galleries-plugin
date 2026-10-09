const endpoint = "/admin/plugins/flex/galleries/galleries";
const base = "/extension-pages/flex-galleries-galleries";
const statuses = { active: "Активно", inactive: "Неактивно", draft: "Чернова" };
const designs = {
  grid: "Решетка",
  masonry: "Masonry",
  slider: "Carousel слайдер",
};
const defaults = () => ({
  name: "",
  slug: "",
  status: "draft",
  design: "grid",
  version: 1,
  settings: {
    columns: 3,
    gap: 16,
    radius: 8,
    ratio: "original",
    width: "section",
    fit: "cover",
    height: "auto",
    slider_height: 600,
    captions: true,
    lightbox: true,
    zoom: true,
    zoom_max: 3,
  },
  items: [],
});

function ui(host) {
  const { React, components: C, icons, request, toast } = host;
  const h = React.createElement;
  function Select({ label, value, options, onChange, hint, disabled }) {
    return h(
      "label",
      { className: "react-form-field" },
      label,
      h(
        C.DropdownMenu,
        {
          ariaLabel: label,
          triggerClassName: "react-form-dropdown",
          disabled,
          trigger: h(
            React.Fragment,
            null,
            h("span", null, options[value] ?? "Избери…"),
            h(C.DropdownChevron),
          ),
        },
        ...Object.entries(options).map(([key, text]) =>
          h(
            C.DropdownOption,
            {
              key,
              selected: key === String(value),
              disabled,
              onClick: () => onChange(key),
            },
            text,
          ),
        ),
      ),
      hint && h("small", { className: "react-field-hint" }, hint),
    );
  }
  function Field({ label, hint, multiline, className = "", ...props }) {
    return h(
      "label",
      { className: `react-form-field ${className}`.trim() },
      label,
      h(multiline ? C.Textarea : C.Input, props),
      hint && h("small", { className: "react-field-hint" }, hint),
    );
  }
  const error = (message) =>
    message &&
    h("p", { className: "react-form-error", role: "alert" }, message);
  const button = (text, onClick, extra = {}) =>
    h(
      C.Button,
      { type: "button", variant: "secondary", onClick, ...extra },
      text,
    );
  return { React, C, icons, request, toast, h, Select, Field, error, button };
}

export function createPage(host) {
  const { React, C, icons, request, toast, h, Select, Field, error, button } =
    ui(host);
  function List({ navigate }) {
    const [rows, setRows] = React.useState([]),
      [view, setView] = React.useState("active");
    const [search, setSearch] = React.useState(""),
      [status, setStatus] = React.useState("all");
    const [loading, setLoading] = React.useState(true),
      [busy, setBusy] = React.useState(false);
    const [failure, setFailure] = React.useState(""),
      [pending, setPending] = React.useState(null);
    const [revision, setRevision] = React.useState(0);
    React.useEffect(() => {
      const reload = () => setRevision((value) => value + 1);
      window.addEventListener("flex-galleries-changed", reload);
      return () => window.removeEventListener("flex-galleries-changed", reload);
    }, []);
    React.useEffect(() => {
      const abort = new AbortController();
      setLoading(true);
      setFailure("");
      request(`${endpoint}?view=${view}`, "GET", undefined, abort.signal)
        .then((result) => setRows(result.galleries))
        .catch((err) => {
          if (!abort.signal.aborted) setFailure(err.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => abort.abort();
    }, [view, revision]);
    async function action(row, operation) {
      if (busy) return;
      setBusy(true);
      try {
        await request(
          `${endpoint}/${row.id}${operation === "trash" ? "" : "/" + operation}`,
          operation === "restore" ? "POST" : "DELETE",
          { version: row.version },
        );
        setRows((current) => current.filter((item) => item.id !== row.id));
        setPending(null);
        setFailure("");
        toast.success(
          operation === "trash"
            ? "Галерията е преместена в кошчето."
            : operation === "restore"
              ? "Галерията е възстановена."
              : "Галерията е изтрита.",
        );
        window.dispatchEvent(new Event("flex-galleries-changed"));
      } catch (err) {
        setFailure(err.message);
      } finally {
        setBusy(false);
      }
    }
    const columns = [
      {
        key: "name",
        label: "Име",
        sortable: true,
        render: (row) =>
          view === "trash"
            ? row.name
            : h(
                "a",
                {
                  className: "react-page-link",
                  href: `${base}/${row.id}/edit`,
                  onClick: (event) => {
                    if (
                      event.button !== 0 ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    navigate(`${base}/${row.id}/edit`);
                  },
                },
                row.name,
              ),
      },
      { key: "slug", label: "Идентификатор", sortable: true },
      {
        key: "item_count",
        label: "Изображения",
        sortable: true,
        sortValue: (row) => row.item_count,
      },
      {
        key: "design",
        label: "Дизайн",
        sortable: true,
        render: (row) => designs[row.design],
      },
      {
        key: "status",
        label: "Статус",
        sortable: true,
        render: (row) =>
          h(
            "span",
            { className: `react-status-badge status-${row.status}` },
            statuses[row.status],
          ),
      },
      {
        key: "actions",
        label: "Действия",
        render: (row) =>
          h(
            C.TableActionsMenu,
            null,
            view === "active"
              ? h(
                  React.Fragment,
                  null,
                  h(
                    C.DropdownOption,
                    {
                      disabled: busy,
                      onClick: () => navigate(`${base}/${row.id}/edit`),
                    },
                    "Редактирай",
                  ),
                  h(
                    C.DropdownOption,
                    {
                      disabled: busy,
                      onClick: () => setPending({ row, operation: "trash" }),
                    },
                    "Премести в кошчето",
                  ),
                )
              : h(
                  React.Fragment,
                  null,
                  h(
                    C.DropdownOption,
                    { disabled: busy, onClick: () => action(row, "restore") },
                    "Възстанови",
                  ),
                  h(
                    C.DropdownOption,
                    {
                      disabled: busy,
                      onClick: () => setPending({ row, operation: "force" }),
                    },
                    "Изтрий завинаги",
                  ),
                ),
          ),
      },
    ];
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "react-page-heading" },
        h(
          "div",
          null,
          h("h1", null, "Галерии"),
          h(C.Breadcrumbs, {
            items: [{ label: "Галерии" }],
            onHomeClick: () => navigate("/"),
          }),
        ),
        button("Създай галерия", () => navigate(base + "/create")),
      ),
      error(failure),
      h(C.DataTable, {
        data: rows.filter(
          (row) =>
            `${row.name} ${row.slug}`
              .toLocaleLowerCase("bg")
              .includes(search.toLocaleLowerCase("bg")) &&
            (status === "all" || row.status === status),
        ),
        columns,
        rowKey: (row) => row.id,
        loading,
        emptyMessage: "Няма намерени галерии.",
        filterStorageKey: "flex-galleries",
        toolbar: h(
          React.Fragment,
          null,
          h(Select, {
            label: "Изглед",
            value: view,
            options: { active: "Галерии", trash: "Кошче" },
            onChange: setView,
          }),
          h(Select, {
            label: "Статус",
            value: status,
            options: { all: "Всички статуси", ...statuses },
            onChange: setStatus,
          }),
          h(Field, {
            label: "Търсене",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Име или идентификатор…",
          }),
        ),
      }),
      h(C.ConfirmDialog, {
        open: !!pending,
        title:
          pending?.operation === "force"
            ? "Изтриване на галерия"
            : "Преместване в кошчето",
        message:
          pending?.operation === "force"
            ? `Да изтрием ли окончателно „${pending.row.name}“? Изображенията в медийната библиотека се запазват.`
            : `Да преместим ли „${pending?.row.name}“ в кошчето? Тя ще спре да се показва в страниците.`,
        busy,
        confirmLabel:
          pending?.operation === "force"
            ? "Изтрий завинаги"
            : "Премести в кошчето",
        onCancel: () => {
          if (!busy) setPending(null);
        },
        onConfirm: () => pending && action(pending.row, pending.operation),
      }),
    );
  }
  function Editor({ id, navigate }) {
    const [gallery, setGallery] = React.useState(defaults),
      [loading, setLoading] = React.useState(!!id);
    const [saving, setSaving] = React.useState(false),
      [failure, setFailure] = React.useState("");
    const [picker, setPicker] = React.useState(false),
      [drag, setDrag] = React.useState(null),
      [drop, setDrop] = React.useState(null);
    const changed = host.useWorkspaceChanged(),
      saved = host.useWorkspaceSaved();
    const [editingId, setEditingId] = React.useState(null);
    const [slide, setSlide] = React.useState(0);
    const gesture = React.useRef(null);
    const [swipeOffset, setSwipeOffset] = React.useState(0);
    const activeSlide = Math.min(slide, Math.max(0, gallery.items.length - 1));
    React.useEffect(() => {
      if (!id) return;
      const abort = new AbortController();
      request(`${endpoint}/${id}`, "GET", undefined, abort.signal)
        .then((result) => setGallery(result.gallery))
        .catch((err) => {
          if (!abort.signal.aborted) setFailure(err.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => abort.abort();
    }, [id]);
    function update(values) {
      if (saving) return;
      setGallery((current) => ({ ...current, ...values }));
      changed?.();
    }
    function settings(values) {
      update({ settings: { ...gallery.settings, ...values } });
    }
    function itemChange(index, values) {
      update({
        items: gallery.items.map((item, i) =>
          i === index ? { ...item, ...values } : item,
        ),
      });
    }
    function move(from, to) {
      if (from === to || to < 0 || to >= gallery.items.length) return;
      const items = [...gallery.items],
        [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      update({ items });
    }
    async function submit(event) {
      event.preventDefault();
      if (saving || loading) return;
      setSaving(true);
      setFailure("");
      try {
        const result = await request(
          id ? `${endpoint}/${id}` : endpoint,
          id ? "PUT" : "POST",
          gallery,
        );
        setGallery(result.gallery);
        saved?.();
        toast.success("Галерията е запазена.");
        window.dispatchEvent(new Event("flex-galleries-changed"));
        if (!id) navigate(`${base}/${result.gallery.id}/edit`);
      } catch (err) {
        setFailure(err.message);
      } finally {
        setSaving(false);
      }
    }
    const title = id ? "Редактиране на галерия" : "Създаване на галерия";
    if (loading) return h("p", { role: "status" }, "Зареждане…");
    if (id && !gallery.id)
      return h(
        React.Fragment,
        null,
        error(failure),
        button("Назад към галериите", () => navigate(base)),
      );
    const allFields = [
      h(Field, {
        label: "Име",
        className: "flex-gallery-settings-wide",
        value: gallery.name,
        required: true,
        maxLength: 190,
        onChange: (e) => update({ name: e.target.value }),
        hint: "Име за разпознаване на галерията в панела.",
      }),
      h(Field, {
        label: "Идентификатор (по желание)",
        className: "flex-gallery-settings-wide",
        value: gallery.slug,
        maxLength: 190,
        onChange: (e) => update({ slug: e.target.value }),
        hint: "Генерира се автоматично, ако оставите полето празно.",
      }),
      h(Select, {
        label: "Статус",
        value: gallery.status,
        options: statuses,
        onChange: (status) => update({ status }),
        hint: "Само активните галерии се показват в публичните страници.",
      }),
      h(Select, {
        label: "Дизайн",
        value: gallery.design,
        options: designs,
        onChange: (design) => update({ design }),
        hint: "Може да се промени и само за конкретното поставяне на страница.",
      }),
      h(Select, {
        label: "Колони",
        value: gallery.settings.columns,
        options: Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]),
        ),
        onChange: (value) => settings({ columns: Number(value) }),
        hint: "На тесни места броят колони се намалява автоматично.",
      }),
      h(Select, {
        label: "Пропорции",
        value: gallery.settings.ratio,
        options: {
          original: "Оригинални",
          square: "Квадратни",
          landscape: "Хоризонтални (4:3)",
        },
        onChange: (ratio) => settings({ ratio }),
        hint: "Запазете оригиналните пропорции или изберете еднаква форма за изображенията.",
      }),
      h(Select, {
        label: "Ширина на галерията",
        value: gallery.settings.width || "section",
        options: { section: "Цялата секция", page: "Цялата страница" },
        onChange: (width) => settings({ width }),
        hint: "Цялата страница разширява публичната галерия до ширината на прозореца с отстъп от краищата.",
      }),
      h(Select, {
        label: "Запълване на изображението",
        value: gallery.settings.fit || "contain",
        options: {
          contain: "Contain — цялото изображение",
          cover: "Cover — запълни рамката",
          "scale-down": "Scale-down — без увеличаване",
        },
        onChange: (fit) => settings({ fit }),
        hint: "Запълни рамката използва цялата ширина и може да изреже краищата. Цялото изображение запазва всичко видимо.",
      }),
      h(Select, {
        label: "Височина на изображението",
        value: gallery.settings.height || "frame",
        options: {
          auto: "Оригинална височина",
          frame: "Според пропорциите",
          screen: "Височина на екрана",
          custom: "Зададена височина",
        },
        onChange: (height) => settings({ height }),
        hint: "При зададена рамка contain запазва цялото изображение, а cover я запълва и по вертикала. Оригиналната височина запазва пропорциите на снимката.",
      }),
      h(Field, {
        label: "Височина на слайдера (px)",
        type: "number",
        min: 200,
        max: 1600,
        disabled: gallery.settings.height !== "custom",
        value: gallery.settings.slider_height ?? 600,
        onChange: (event) =>
          settings({ slider_height: Number(event.target.value) }),
        hint: "200–1600 px. Изберете Зададена височина, за да приложите стойността. На телефон височината се ограничава до екрана.",
      }),
      h(Field, {
        label: "Разстояние (px)",
        type: "number",
        min: 0,
        max: 48,
        value: gallery.settings.gap,
        onChange: (e) => settings({ gap: Number(e.target.value) }),
        hint: "Разстояние между изображенията: от 0 до 48 пиксела.",
      }),
      h(Field, {
        label: "Заобляне (px)",
        type: "number",
        min: 0,
        max: 32,
        value: gallery.settings.radius,
        onChange: (e) => settings({ radius: Number(e.target.value) }),
        hint: "Заобляне на ръбовете: от 0 до 32 пиксела. 0 означава прави ръбове.",
      }),
      h(Select, {
        label: "Надписи и описания",
        value: gallery.settings.captions ? "yes" : "no",
        options: { yes: "Показвай", no: "Скрий" },
        onChange: (value) => settings({ captions: value === "yes" }),
        hint: "Показва или скрива надписа и описанието под всяко изображение.",
      }),
      h(Select, {
        label: "Преглед в lightbox",
        value: gallery.settings.lightbox ? "yes" : "no",
        options: { yes: "Включен", no: "Изключен" },
        onChange: (value) => settings({ lightbox: value === "yes" }),
        hint: "Изображенията със зададена връзка отварят нея вместо lightbox.",
      }),
    ];
    allFields.push(
      h(Select, {
        label: "Увеличение в lightbox",
        value: gallery.settings.zoom === false ? "no" : "yes",
        options: { yes: "Включено", no: "Изключено" },
        onChange: (value) => settings({ zoom: value === "yes" }),
        hint: "Позволява увеличение с бутони, колелцето на мишката, двойно натискане и жест с два пръста.",
      }),
      h(Field, {
        label: "Максимално увеличение",
        type: "number",
        min: 2,
        max: 5,
        disabled: gallery.settings.zoom === false,
        value: gallery.settings.zoom_max ?? 3,
        onChange: (event) => settings({ zoom_max: Number(event.target.value) }),
        hint: "От 2× до 5×. Увеличението се нулира при смяна на изображението.",
      }),
    );
    const lightboxLabels = [
      "Преглед в lightbox",
      "Увеличение в lightbox",
      "Максимално увеличение",
    ];
    const designKeys = {
      Колони: "columns",
      Пропорции: "ratio",
      "Разстояние (px)": "gap",
      "Запълване на изображението": "fit",
      "Височина на изображението": "height",
      "Височина на слайдера (px)": "slider_height",
    };
    function section(title, key, children, open = true) {
      return h(
        C.CollapsibleSection,
        {
          title,
          icon: icons.Settings,
          storageKey: key,
          defaultOpen: open,
          className: "flex-gallery-settings",
        },
        h(
          "div",
          { className: "flex-gallery-fields flex-gallery-settings-grid" },
          ...children,
        ),
      );
    }
    const fields = h(
      React.Fragment,
      null,
      section(
        "Общи настройки",
        "gallery-settings",
        allFields.filter(
          (field) =>
            !designKeys[field.props.label] &&
            !lightboxLabels.includes(field.props.label),
        ),
      ),
      ...Object.entries(designs).map(([design, label]) => {
        const values = {
          ...gallery.settings,
          ...gallery.settings.design_settings?.[design],
        };
        const allowed =
          design === "grid"
            ? ["columns", "ratio", "gap"]
            : design === "masonry"
              ? ["columns", "gap"]
              : ["ratio", "fit", "height", "slider_height", "gap"];
        const controls = allFields
          .filter((field) => allowed.includes(designKeys[field.props.label]))
          .map((field) => {
            const key = designKeys[field.props.label];
            return h(field.type, {
              ...field.props,
              value:
                values[key] ??
                (key === "slider_height"
                  ? 600
                  : key === "height"
                    ? "auto"
                    : key === "fit"
                      ? "contain"
                      : field.props.value),
              disabled:
                key === "slider_height"
                  ? values.height !== "custom"
                  : undefined,
              onChange: (input) => {
                const value =
                  field.type === Field
                    ? Number(input.target.value)
                    : key === "columns"
                      ? Number(input)
                      : input;
                settings({
                  design_settings: {
                    ...gallery.settings.design_settings,
                    [design]: {
                      ...gallery.settings.design_settings?.[design],
                      [key]: value,
                    },
                  },
                });
              },
            });
          });
        return section(
          label,
          "gallery-design-" + design,
          controls,
          gallery.design === design,
        );
      }),
    );
    const lightboxFields = section(
      "Lightbox и увеличение",
      "gallery-lightbox",
      allFields.filter((field) => lightboxLabels.includes(field.props.label)),
    );
    const viewSettings = {
      ...gallery.settings,
      ...gallery.settings.design_settings?.[gallery.design],
    };
    const imageItems = h(
      C.CollapsibleSection,
      {
        title: `Изображения и преглед (${gallery.items.length})`,
        icon: icons.Images,
        storageKey: "gallery-images",
      },
      h(
        "div",
        { className: "flex-gallery-fields" },
        h(
          "div",
          { className: "flex-gallery-editor-toolbar" },
          button(
            h(React.Fragment, null, h(icons.Images), "Добави изображения"),
            () => setPicker(true),
            {
              disabled: gallery.items.length >= 200,
            },
          ),
          h(
            "small",
            { className: "react-field-hint" },
            `${gallery.items.length} от 200 изображения`,
          ),
        ),
        h(
          "small",
          { className: "react-field-hint" },
          gallery.design === "slider"
            ? "Плъзнете наляво или надясно за преглед. Посочете изображението за редактиране и пренареждане."
            : "Влачете изображенията между редовете и колоните. Посочете изображение за редактиране и пренареждане.",
        ),
        h(
          "div",
          {
            className: `flex-gallery flex-gallery--${gallery.design} flex-gallery-editor`,
            style: {
              "--gallery-columns": viewSettings.columns,
              "--gallery-gap": viewSettings.gap + "px",
              "--gallery-radius": viewSettings.radius + "px",
              "--gallery-slider-height":
                (viewSettings.slider_height ?? 600) + "px",
            },
          },
          h(
            "div",
            {
              className: "flex-gallery-track",
              onPointerDown: (event) => {
                if (
                  gallery.design !== "slider" ||
                  event.button !== 0 ||
                  event.isPrimary === false ||
                  event.target.closest?.("button, input, textarea")
                )
                  return;
                gesture.current = {
                  x: event.clientX,
                  y: event.clientY,
                  id: event.pointerId,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              },
              onPointerMove: (event) => {
                const start = gesture.current;
                if (!start || start.id !== event.pointerId) return;
                const dx = event.clientX - start.x;
                if (Math.abs(dx) > Math.abs(event.clientY - start.y))
                  setSwipeOffset(dx);
              },
              onPointerUp: (event) => {
                const start = gesture.current;
                if (!start || start.id !== event.pointerId) return;
                const dx = event.clientX - start.x;
                if (
                  Math.abs(dx) >= 35 &&
                  Math.abs(dx) > Math.abs(event.clientY - start.y)
                )
                  setSlide(
                    Math.max(
                      0,
                      Math.min(
                        gallery.items.length - 1,
                        activeSlide + (dx < 0 ? 1 : -1),
                      ),
                    ),
                  );
                gesture.current = null;
                setSwipeOffset(0);
              },
              onPointerCancel: () => {
                gesture.current = null;
                setSwipeOffset(0);
              },
              onLostPointerCapture: () => {
                gesture.current = null;
                setSwipeOffset(0);
              },
              "data-ratio": viewSettings.ratio,
              "data-fit": viewSettings.fit || "contain",
              "data-height": viewSettings.height || "frame",
            },
            ...gallery.items.map((item, index) =>
              h(
                "div",
                {
                  key: item.media_id,
                  hidden: gallery.design === "slider" && index !== activeSlide,
                  style:
                    gallery.design === "slider"
                      ? { translate: `${swipeOffset}px 0` }
                      : undefined,
                  draggable:
                    gallery.design !== "slider" &&
                    !saving &&
                    !gallery.deleted_at,
                  onDragStart: (event) => {
                    if (event.target.closest?.("button, input, textarea")) {
                      event.preventDefault();
                      return;
                    }
                    setDrag(index);
                    event.dataTransfer.setData("text/plain", String(index));
                    event.dataTransfer.effectAllowed = "move";
                  },
                  onDragEnd: () => {
                    setDrag(null);
                    setDrop(null);
                  },
                  className: `flex-gallery-item flex-gallery-editor-item${drag === index ? " is-dragging" : ""}${drop?.index === index ? " is-drop-" + drop.side : ""}`,
                  onDragOver: (event) => {
                    if (drag === null) return;
                    event.preventDefault();
                    setDrop({
                      index,
                      side: (
                        gallery.design === "masonry"
                          ? event.clientY >
                            event.currentTarget.getBoundingClientRect().top +
                              event.currentTarget.offsetHeight / 2
                          : event.clientX >
                            event.currentTarget.getBoundingClientRect().left +
                              event.currentTarget.offsetWidth / 2
                      )
                        ? "after"
                        : "before",
                    });
                  },
                  onDrop: (event) => {
                    event.preventDefault();
                    if (drag !== null && drop) {
                      let target = drop.index + (drop.side === "after" ? 1 : 0);
                      if (drag < target) target--;
                      move(drag, target);
                    }
                    setDrag(null);
                    setDrop(null);
                  },
                },
                h(
                  "div",
                  { className: "flex-gallery-image flex-gallery-editor-image" },
                  item.media
                    ? h("img", {
                        src: item.media.thumbnail_url || item.media.url,
                        alt: item.alt || "",
                        draggable: false,
                      })
                    : h(
                        "p",
                        { role: "status" },
                        "Липсващо изображение — ще бъде пропуснато публично.",
                      ),
                ),
                h(
                  "div",
                  { className: "flex-gallery-item-tools" },
                  button(h(icons.Settings), () => setEditingId(item.media_id), {
                    "aria-label": "Редактирай изображението",
                    title: "Редактирай изображението",
                  }),
                  button(h(icons.ArrowUp), () => move(index, index - 1), {
                    disabled: index === 0,
                    "aria-label": "Премести нагоре",
                  }),
                  button(h(icons.ArrowDown), () => move(index, index + 1), {
                    disabled: index === gallery.items.length - 1,
                    "aria-label": "Премести надолу",
                  }),
                  button(
                    h(icons.X),
                    () =>
                      update({
                        items: gallery.items.filter((_, i) => i !== index),
                      }),
                    { "aria-label": "Премахни от галерията" },
                  ),
                ),
                h(
                  C.Dialog,
                  {
                    title: `${index + 1}. ${item.media?.title || "Липсващо изображение"}`,
                    open: editingId === item.media_id,
                    onClose: () => setEditingId(null),
                  },
                  h(
                    "div",
                    { className: "flex-gallery-fields" },
                    ...[
                      ["alt", "Alt текст", 500],
                      ["caption", "Надпис", 1000],
                      ["title", "Заглавие (title атрибут)", 500],
                      ["link", "Връзка (по желание)", 2000],
                      ["description", "Описание", 3000],
                    ].map(([key, label, maxLength]) =>
                      h(Field, {
                        key,
                        label,
                        maxLength,
                        multiline: key === "description",
                        disabled: saving || !!gallery.deleted_at,
                        value: item[key],
                        onChange: (e) =>
                          itemChange(index, { [key]: e.target.value }),
                        hint:
                          key === "alt"
                            ? "Описва изображението за достъпност и търсачки."
                            : key === "link"
                              ? "Локален адрес или пълен HTTP/HTTPS URL."
                              : undefined,
                      }),
                    ),
                    button("Готово", () => setEditingId(null)),
                    h(
                      "small",
                      { className: "react-field-hint" },
                      "Текстовете са копирани от медийната библиотека. Промените важат само за тази галерия и се записват с бутона Запази галерията.",
                    ),
                  ),
                ),
                h(
                  "small",
                  { className: "flex-gallery-editor-name" },
                  `${index + 1}. ${item.media?.title || "Липсващо изображение"}`,
                ),
                viewSettings.captions &&
                  h(
                    "figcaption",
                    null,
                    item.caption,
                    item.description && h("p", null, item.description),
                  ),
              ),
            ),
          ),
          gallery.design === "slider" &&
            gallery.items.length > 0 &&
            h(
              "div",
              { className: "flex-gallery-controls" },
              button(h(icons.ChevronLeft), () => setSlide(activeSlide - 1), {
                className: "flex-gallery-arrow",
                disabled: activeSlide === 0,
                "aria-label": "Предишно изображение",
              }),
              h(
                "div",
                { className: "flex-gallery-dots" },
                ...gallery.items.map((item, index) =>
                  button(String(index + 1), () => setSlide(index), {
                    key: item.media_id,
                    "aria-label": `Изображение ${index + 1}`,
                    "aria-pressed": activeSlide === index,
                  }),
                ),
              ),
              button(h(icons.ChevronRight), () => setSlide(activeSlide + 1), {
                className: "flex-gallery-arrow",
                disabled: activeSlide === gallery.items.length - 1,
                "aria-label": "Следващо изображение",
              }),
            ),
        ),
        gallery.items.length === 0 &&
          h("p", null, "Добавете изображения от медийната библиотека."),
      ),
    );
    return h(
      React.Fragment,
      null,
      h(
        "div",
        { className: "react-page-heading" },
        h(
          "div",
          null,
          h("h1", null, title),
          h(C.Breadcrumbs, {
            onHomeClick: () => navigate("/"),
            items: [
              { label: "Галерии", onClick: () => navigate(base) },
              { label: title },
            ],
          }),
        ),
      ),
      error(failure),
      h(
        "form",
        { onSubmit: submit, className: "react-edit-form flex-gallery-admin" },
        h(
          "fieldset",
          { disabled: saving || !!gallery.deleted_at },
          fields,
          lightboxFields,
          imageItems,
          h(
            "div",
            { className: "react-form-actions" },
            h(
              C.LoadingButton,
              { type: "submit", loading: saving, icon: h(icons.Save) },
              saving ? "Запазване…" : "Запази галерията",
            ),
          ),
        ),
        gallery.deleted_at &&
          h(
            "p",
            { role: "status" },
            "Възстановете галерията от кошчето, за да я редактирате.",
          ),
      ),
      h(C.MediaPicker, {
        open: picker,
        multiple: true,
        imagesOnly: true,
        onClose: () => setPicker(false),
        onSelectMany: (records) => {
          const existing = new Set(gallery.items.map((item) => item.media_id));
          const additions = records
            .filter((record) => !existing.has(record.id))
            .map((media) => ({
              media_id: media.id,
              media,
              alt: media.alt || "",
              caption: media.caption || "",
              description: media.description || "",
              title: media.title || "",
              link: "",
            }));
          if (gallery.items.length + additions.length > 200) {
            toast.error("Разрешени са до 200 изображения.");
            return;
          }
          update({ items: [...gallery.items, ...additions] });
        },
      }),
    );
  }
  return function GalleriesPage({ path, navigate }) {
    const match = path.match(/\/(\d+)\/edit$/);
    return h(
      React.Fragment,
      null,
      h("link", {
        rel: "stylesheet",
        href: "/extensions/flex/galleries/assets/assets/galleries.css",
      }),
      path === base
        ? h(List, { navigate })
        : h(Editor, {
            key: path,
            id: match ? Number(match[1]) : null,
            navigate,
          }),
    );
  };
}

export function createEmbedPicker(host) {
  const { React, C, request, h, Select, Field, error } = ui(host);
  return function GalleryPicker({ onInsert, onClose, initialValue = "" }) {
    const initial = initialValue.match(
      /^\[gallery\s+id="([1-9][0-9]*)"(?:\s+design="(grid|masonry|slider)")?\]$/,
    );
    const [rows, setRows] = React.useState([]),
      [search, setSearch] = React.useState("");
    const [selected, setSelected] = React.useState(initial?.[1] || ""),
      [design, setDesign] = React.useState(initial?.[2] || "default");
    const [loading, setLoading] = React.useState(true),
      [failure, setFailure] = React.useState("");
    React.useEffect(() => {
      const abort = new AbortController();
      request(endpoint, "GET", undefined, abort.signal)
        .then((result) =>
          setRows(result.galleries.filter((row) => row.status === "active")),
        )
        .catch((err) => {
          if (!abort.signal.aborted) setFailure(err.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      return () => abort.abort();
    }, []);
    return h(
      C.Dialog,
      {
        open: true,
        title: initial ? "Редактирай поставената галерия" : "Добави галерия",
        onClose,
      },
      h("link", {
        rel: "stylesheet",
        href: "/extensions/flex/galleries/assets/assets/galleries.css",
      }),
      h(
        "div",
        { className: "flex-gallery-fields" },
        error(failure),
        loading
          ? h("p", { role: "status" }, "Зареждане…")
          : h(
              React.Fragment,
              null,
              h(Field, {
                label: "Търсене",
                value: search,
                onChange: (e) => setSearch(e.target.value),
                placeholder: "Име на галерия…",
              }),
              h(Select, {
                label: "Галерия",
                value: selected,
                options: {
                  "": "Избери галерия…",
                  ...Object.fromEntries(
                    rows
                      .filter((row) =>
                        row.name
                          .toLocaleLowerCase("bg")
                          .includes(search.toLocaleLowerCase("bg")),
                      )
                      .map((row) => [row.id, row.name]),
                  ),
                },
                onChange: setSelected,
              }),
              rows.length === 0 &&
                h(
                  "p",
                  null,
                  "Няма активни галерии. Създайте и активирайте галерия в раздел Галерии.",
                ),
              h(Select, {
                label: "Дизайн за това поставяне",
                value: design,
                options: { default: "Дизайнът на галерията", ...designs },
                onChange: setDesign,
              }),
              h(
                "div",
                { className: "react-form-actions" },
                h(
                  C.Button,
                  {
                    type: "button",
                    disabled:
                      !selected ||
                      !rows.some((row) => String(row.id) === selected),
                    onClick: () =>
                      onInsert(
                        `[gallery id="${selected}"${design === "default" ? "" : ` design="${design}"`}]`,
                      ),
                  },
                  initial ? "Запази промяната" : "Постави галерия",
                ),
              ),
            ),
      ),
    );
  };
}
