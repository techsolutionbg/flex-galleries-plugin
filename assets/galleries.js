import { openLightbox } from "/assets/flex-lightbox.js";
function animateGalleryImage(image, direction = 1) {
  if (!image?.animate || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  image.getAnimations?.().forEach((animation) => animation.cancel());
  image.animate(
    [
      { transform: `translateX(${direction * 100}%)` },
      { transform: "translateX(0)" },
    ],
    { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

const galleryObservers = new Set();
function observeGallery(element, callback) {
  const observer = new ResizeObserver(callback);
  observer.observe(element);
  galleryObservers.add(observer);
}
function initialize(root) {
  if (root.dataset.galleryReady) return;
  root.dataset.galleryReady = "1";
  if (root.dataset.width === "page") {
    const layout = () => {
      root.style.marginLeft = "0px";
      const left = root.getBoundingClientRect().left;
      root.style.width = `${Math.max(0, document.documentElement.clientWidth - 32)}px`;
      root.style.marginLeft = `${16 - left}px`;
    };
    observeGallery(document.documentElement, layout);
    layout();
  }
  const track = root.querySelector(".flex-gallery-track");
  const figures = [...root.querySelectorAll(".flex-gallery-item")];
  const prev = root.querySelector("[data-gallery-prev]");
  const next = root.querySelector("[data-gallery-next]");
  const counter = root.querySelector("[data-gallery-counter]");
  const dots = [...root.querySelectorAll("[data-gallery-slide]")];
  if (prev && next && counter) {
    let index = 0;
    const update = () => {
      index = figures.reduce(
        (best, figure, i) =>
          Math.abs(
            figure.getBoundingClientRect().left -
              track.getBoundingClientRect().left,
          ) <
          Math.abs(
            figures[best].getBoundingClientRect().left -
              track.getBoundingClientRect().left,
          )
            ? i
            : best,
        0,
      );
      prev.disabled = index === 0;
      next.disabled = index === figures.length - 1;
      counter.textContent = `${index + 1} / ${figures.length}`;
      dots.forEach((dot, i) =>
        dot.setAttribute("aria-pressed", String(i === index)),
      );
      figures.forEach((figure, i) => {
        figure.inert = i !== index;
      });
      if (track.dataset.height === "auto") {
        track.style.height = `${figures[index].getBoundingClientRect().height}px`;
      }
    };
    const move = (offset) => {
      const target =
        figures[Math.max(0, Math.min(figures.length - 1, index + offset))];
      track.scrollTo({
        left: target.offsetLeft - figures[0].offsetLeft,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    };
    prev.addEventListener("click", () => move(-1));
    next.addEventListener("click", () => move(1));
    let gesture = null;
    let suppressClick = false;
    track.addEventListener("dragstart", (event) => event.preventDefault());
    track.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      gesture = {
        x: event.clientX,
        y: event.clientY,
        scroll: track.scrollLeft,
        index,
        id: event.pointerId,
        moved: false,
      };
    });
    track.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      if (
        !gesture.moved &&
        (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(event.clientY - gesture.y))
      )
        return;
      gesture.moved = true;
      track.setPointerCapture(event.pointerId);
      track.style.scrollSnapType = "none";
      track.style.scrollBehavior = "auto";
      track.scrollLeft = gesture.scroll - dx;
    });
    const finish = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const start = gesture;
      gesture = null;
      track.style.scrollSnapType = "";
      track.style.scrollBehavior = "";
      if (start.moved) {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
        const dx = event.clientX - start.x;
        const target = Math.max(
          0,
          Math.min(
            figures.length - 1,
            start.index +
              (event.type !== "pointercancel" && Math.abs(dx) >= 35
                ? dx < 0
                  ? 1
                  : -1
                : 0),
          ),
        );
        move(target - index);
      }
    };
    track.addEventListener("pointerup", finish);
    track.addEventListener("pointercancel", finish);
    track.addEventListener(
      "click",
      (event) => {
        if (suppressClick) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    dots.forEach((dot, i) =>
      dot.addEventListener("click", () => move(i - index)),
    );
    root.setAttribute("aria-roledescription", "carousel");
    track.tabIndex = 0;
    track.setAttribute(
      "aria-label",
      "Изображения — използвайте стрелките за навигация",
    );
    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        move(event.key === "Home" ? -index : figures.length - 1 - index);
      }
    });
    track.addEventListener("scroll", update, { passive: true });
    observeGallery(track, update);
    figures.forEach((figure) => {
      observeGallery(figure, update);
      figure.querySelector("img")?.addEventListener("load", update);
    });
    update();
  }
  const buttons = [...root.querySelectorAll("[data-gallery-image]")];
  buttons.forEach((button, position) =>
    button.addEventListener("click", () => {
      openLightbox({
        title: root.getAttribute("aria-label") || "Галерия",
        position,
        opener: button,
        zoom: root.dataset.zoom !== "0",
        maxZoom: root.dataset.zoomMax,
        images: buttons.map((item) => {
          const image = item.querySelector("img");
          return {
            src: image.src,
            alt: image.alt,
            thumbnail: image.src,
            caption:
              item
                .closest("figure")
                .querySelector("figcaption")
                ?.textContent?.trim() || "",
          };
        }),
      });
    }),
  );
}
document.querySelectorAll("[data-flex-gallery]").forEach(initialize);

document.addEventListener("flex:page-before-change", () => {
  galleryObservers.forEach((observer) => observer.disconnect());
  galleryObservers.clear();
});
document.addEventListener("flex:page-ready", () => {
  document.querySelectorAll("[data-flex-gallery]").forEach(initialize);
});
