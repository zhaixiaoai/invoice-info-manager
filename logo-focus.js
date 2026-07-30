(() => {
  "use strict";

  const root = document.getElementById("loginBrandFocus");
  if (!root) return;

  const items = Array.from(root.querySelectorAll(".brand-logo-item"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let timer = null;
  let interactionLocked = false;

  function positionFrame(index, immediate = false) {
    const item = items[index];
    if (!item) return;

    activeIndex = index;
    items.forEach((node, itemIndex) => node.classList.toggle("is-active", itemIndex === index));

    const rootRect = root.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const inset = 3;

    if (immediate) root.classList.add("focus-no-transition");
    root.style.setProperty("--focus-x", `${itemRect.left - rootRect.left + inset}px`);
    root.style.setProperty("--focus-y", `${itemRect.top - rootRect.top + inset}px`);
    root.style.setProperty("--focus-w", `${Math.max(0, itemRect.width - inset * 2)}px`);
    root.style.setProperty("--focus-h", `${Math.max(0, itemRect.height - inset * 2)}px`);
    if (immediate) requestAnimationFrame(() => root.classList.remove("focus-no-transition"));
  }

  function stopAutoFocus() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startAutoFocus() {
    stopAutoFocus();
    if (reduceMotion.matches || interactionLocked || document.hidden) return;
    timer = window.setInterval(() => positionFrame((activeIndex + 1) % items.length), 2600);
  }

  items.forEach((item, index) => {
    item.addEventListener("pointerenter", () => {
      interactionLocked = true;
      stopAutoFocus();
      positionFrame(index);
    });
    item.addEventListener("focus", () => {
      interactionLocked = true;
      stopAutoFocus();
      positionFrame(index);
    });
  });

  root.addEventListener("pointerleave", () => {
    interactionLocked = false;
    startAutoFocus();
  });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) {
      interactionLocked = false;
      startAutoFocus();
    }
  });

  window.addEventListener("resize", () => positionFrame(activeIndex, true));
  document.addEventListener("visibilitychange", startAutoFocus);
  reduceMotion.addEventListener?.("change", startAutoFocus);
  items.forEach((item) => item.querySelector("img")?.addEventListener("load", () => positionFrame(activeIndex, true), { once: true }));

  requestAnimationFrame(() => {
    positionFrame(0, true);
    startAutoFocus();
  });
})();
