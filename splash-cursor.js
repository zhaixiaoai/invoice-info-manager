(() => {
  "use strict";

  const canvas = document.getElementById("loginSplashCursor");
  const screen = document.getElementById("loginScreen");
  if (!canvas || !screen) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  let width = 1;
  let height = 1;
  let dpr = 1;
  let raf = 0;
  let points = [];
  let lastPoint = null;

  const LIFE = 360;
  const MAX_POINTS = 18;
  const MIN_DISTANCE = 5;

  function visible() {
    return !screen.hidden && getComputedStyle(screen).display !== "none";
  }

  function resize() {
    const rect = screen.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clear();
  }

  function clear() {
    ctx.clearRect(0, 0, width, height);
  }

  function position(event) {
    const rect = screen.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function addPoint(event) {
    if (!visible() || reduceMotion.matches || coarsePointer.matches) return;
    const next = position(event);
    if (lastPoint && Math.hypot(next.x - lastPoint.x, next.y - lastPoint.y) < MIN_DISTANCE) return;

    const now = performance.now();
    points.push({ x: next.x, y: next.y, born: now });
    if (points.length > MAX_POINTS) points.splice(0, points.length - MAX_POINTS);
    lastPoint = next;
    requestDraw();
  }

  function smoothSegment(a, b, c) {
    const mx1 = (a.x + b.x) / 2;
    const my1 = (a.y + b.y) / 2;
    const mx2 = (b.x + c.x) / 2;
    const my2 = (b.y + c.y) / 2;
    return { mx1, my1, mx2, my2 };
  }

  function draw(now) {
    raf = 0;
    clear();
    points = points.filter((point) => now - point.born < LIFE);

    if (points.length >= 2) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation = "lighter";

      for (let i = 1; i < points.length; i += 1) {
        const previous = points[Math.max(0, i - 1)];
        const current = points[i];
        const next = points[Math.min(points.length - 1, i + 1)];
        const age = now - current.born;
        const alpha = Math.max(0, 1 - age / LIFE);
        const segment = smoothSegment(previous, current, next);

        ctx.beginPath();
        ctx.moveTo(segment.mx1, segment.my1);
        ctx.quadraticCurveTo(current.x, current.y, segment.mx2, segment.my2);
        ctx.strokeStyle = `rgba(54,145,255,${0.12 * alpha})`;
        ctx.lineWidth = 14 * alpha + 2;
        ctx.shadowColor = `rgba(54,164,255,${0.22 * alpha})`;
        ctx.shadowBlur = 8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(segment.mx1, segment.my1);
        ctx.quadraticCurveTo(current.x, current.y, segment.mx2, segment.my2);
        ctx.strokeStyle = `rgba(132,218,255,${0.52 * alpha})`;
        ctx.lineWidth = 2.2 * alpha + 0.5;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (points.length) requestDraw();
  }

  function requestDraw() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function reset() {
    points = [];
    lastPoint = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clear();
  }

  function sync() {
    if (!visible() || document.hidden || reduceMotion.matches || coarsePointer.matches) reset();
  }

  screen.addEventListener("pointermove", addPoint, { passive: true });
  screen.addEventListener("pointerleave", () => { lastPoint = null; });
  new ResizeObserver(resize).observe(screen);
  new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener?.("change", sync);
  coarsePointer.addEventListener?.("change", sync);

  resize();
  sync();
})();
