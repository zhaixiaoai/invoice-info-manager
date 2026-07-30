(() => {
  "use strict";

  const canvas = document.getElementById("loginGridScan");
  const screen = document.getElementById("loginScreen");
  if (!canvas || !screen) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let running = false;
  let lastTime = performance.now();
  let phase = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  function resize() {
    const rect = screen.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function isVisible() {
    return !screen.hidden && getComputedStyle(screen).display !== "none";
  }

  function line(x1, y1, x2, y2, alpha, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = `rgba(58, 149, 255, ${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function drawGlowLine(x1, y1, x2, y2, color, widthPx, blur) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.stroke();
    ctx.restore();
  }

  function draw(time) {
    const dt = Math.min(40, time - lastTime || 16.7);
    lastTime = time;
    const speed = motionQuery.matches ? 0.00004 : 0.00015;
    phase = (phase + dt * speed) % 1;
    pointerX += (targetX - pointerX) * 0.045;
    pointerY += (targetY - pointerY) * 0.045;

    const horizonY = height * (0.37 + pointerY * 0.018);
    const vanishingX = width * (0.5 + pointerX * 0.035);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#061a37");
    bg.addColorStop(0.48, "#04172f");
    bg.addColorStop(1, "#020b19");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const halo = ctx.createRadialGradient(vanishingX, horizonY, 0, vanishingX, horizonY, Math.max(width, height) * 0.72);
    halo.addColorStop(0, "rgba(26,112,245,.22)");
    halo.addColorStop(0.35, "rgba(18,72,164,.09)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    // Upper fine grid.
    const upperSpacing = Math.max(32, Math.min(54, width / 28));
    const driftX = (phase * upperSpacing * 0.45) % upperSpacing;
    for (let x = -upperSpacing + driftX; x < width + upperSpacing; x += upperSpacing) {
      line(x, 0, x + pointerX * 14, horizonY, 0.105);
    }
    for (let y = 0; y < horizonY; y += upperSpacing) {
      line(0, y + pointerY * 5, width, y + pointerY * 5, 0.085);
    }

    // Perspective floor grid.
    const columns = Math.max(18, Math.ceil(width / 70));
    const spread = width * 1.28;
    for (let i = -columns; i <= columns; i++) {
      const endX = vanishingX + (i / columns) * spread;
      line(vanishingX, horizonY, endX, height + 2, 0.23, i === 0 ? 1.15 : 0.85);
    }

    const rowCount = 18;
    for (let i = 0; i < rowCount; i++) {
      const p = ((i / rowCount + phase) % 1);
      const eased = p * p;
      const y = horizonY + eased * (height - horizonY);
      const alpha = 0.07 + eased * 0.28;
      line(0, y, width, y, alpha, eased > 0.72 ? 1.15 : 0.8);
    }

    // Moving scan bars.
    const scanX = ((phase * 1.55) % 1) * (width + 160) - 80;
    const scanYProgress = (phase * 0.92 + 0.18) % 1;
    const scanY = horizonY + scanYProgress * scanYProgress * (height - horizonY);

    const band = ctx.createLinearGradient(scanX - 85, 0, scanX + 85, 0);
    band.addColorStop(0, "rgba(25,121,255,0)");
    band.addColorStop(0.5, "rgba(44,151,255,.12)");
    band.addColorStop(1, "rgba(25,121,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(scanX - 85, 0, 170, height);
    drawGlowLine(scanX, 0, scanX, height, "rgba(70,171,255,.92)", 1.2, 13);

    const horizontalBand = ctx.createLinearGradient(0, scanY - 38, 0, scanY + 38);
    horizontalBand.addColorStop(0, "rgba(28,126,255,0)");
    horizontalBand.addColorStop(0.5, "rgba(40,145,255,.13)");
    horizontalBand.addColorStop(1, "rgba(28,126,255,0)");
    ctx.fillStyle = horizontalBand;
    ctx.fillRect(0, scanY - 38, width, 76);
    drawGlowLine(0, scanY, width, scanY, "rgba(75,181,255,.88)", 1.15, 12);

    // Small blue nodes near scan intersections.
    ctx.save();
    ctx.fillStyle = "rgba(132,205,255,.9)";
    ctx.shadowColor = "rgba(46,151,255,.9)";
    ctx.shadowBlur = 10;
    for (let i = 0; i < 7; i++) {
      const nx = (scanX + i * 117) % (width + 40) - 20;
      const ny = horizonY + (((i * 0.137 + phase * 0.6) % 1) ** 2) * (height - horizonY);
      ctx.beginPath();
      ctx.arc(nx, ny, 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (running) rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (running || !isVisible()) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function syncState() {
    if (isVisible() && !document.hidden) start();
    else stop();
  }

  screen.addEventListener("pointermove", (event) => {
    const rect = screen.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
  }, { passive: true });
  screen.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; }, { passive: true });

  new ResizeObserver(() => { resize(); if (!running && isVisible()) { draw(performance.now()); } }).observe(screen);
  new MutationObserver(syncState).observe(screen, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
  document.addEventListener("visibilitychange", syncState);
  motionQuery.addEventListener?.("change", () => { phase = 0; });

  resize();
  syncState();
})();
