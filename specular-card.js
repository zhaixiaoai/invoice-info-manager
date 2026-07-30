(() => {
  "use strict";

  const card = document.getElementById("loginCard");
  const screen = document.getElementById("loginScreen");
  if (!card || !screen) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let hovering = false;
  let raf = 0;
  let running = false;

  function visible() {
    return !screen.hidden && getComputedStyle(screen).display !== "none";
  }

  function setPosition(x, y, intensity = 1) {
    card.style.setProperty("--specular-x", `${x}%`);
    card.style.setProperty("--specular-y", `${y}%`);
    card.style.setProperty("--specular-opacity", String(intensity));
  }

  function perimeterPoint(t) {
    const segment = (t % 1) * 4;
    if (segment < 1) return { x: segment * 100, y: 0 };
    if (segment < 2) return { x: 100, y: (segment - 1) * 100 };
    if (segment < 3) return { x: (3 - segment) * 100, y: 100 };
    return { x: 0, y: (4 - segment) * 100 };
  }

  function frame(now) {
    if (!hovering && !reduceMotion.matches) {
      const p = perimeterPoint((now % 7600) / 7600);
      setPosition(p.x, p.y, 0.84);
    }
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible() || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function sync() {
    if (visible() && !document.hidden) start();
    else stop();
  }

  card.addEventListener("pointerenter", () => {
    hovering = true;
    card.classList.add("is-specular-active");
  });

  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    setPosition(x, y, 1);
  }, { passive: true });

  card.addEventListener("pointerleave", () => {
    hovering = false;
    card.classList.remove("is-specular-active");
  });

  card.addEventListener("pointerdown", () => {
    card.classList.remove("specular-pulse");
    void card.offsetWidth;
    card.classList.add("specular-pulse");
  });
  card.addEventListener("animationend", () => card.classList.remove("specular-pulse"));

  new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener?.("change", () => {
    if (reduceMotion.matches) setPosition(50, 0, 0.72);
  });

  setPosition(50, 0, 0.82);
  sync();
})();
