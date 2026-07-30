(() => {
  "use strict";

  const canvas = document.getElementById("loginSplashCursor");
  const screen = document.getElementById("loginScreen");
  if (!canvas || !screen) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");
  const colors = [
    [52, 134, 255],
    [48, 190, 255],
    [91, 111, 255],
    [96, 219, 255]
  ];

  let width = 1;
  let height = 1;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let lastFrame = performance.now();
  let lastPointer = null;
  let lastSpawnAt = 0;
  let particles = [];
  let trail = [];

  function visible() {
    return !screen.hidden && getComputedStyle(screen).display !== "none";
  }

  function resize() {
    const rect = screen.getBoundingClientRect();
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.25 : 1.6);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function addParticle(x, y, vx, vy, size, life, color, opacity = 1) {
    particles.push({ x, y, vx, vy, size, life, maxLife: life, color, opacity, rotation: Math.random() * Math.PI * 2 });
    const max = coarsePointer.matches ? 90 : 180;
    if (particles.length > max) particles.splice(0, particles.length - max);
  }

  function splash(x, y, strength = 1) {
    if (reduceMotion.matches) return;
    const count = Math.round((coarsePointer.matches ? 12 : 24) * strength);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.22 + Math.random() * 0.75) * strength;
      const color = colors[Math.floor(Math.random() * colors.length)];
      addParticle(
        x + Math.cos(angle) * Math.random() * 8,
        y + Math.sin(angle) * Math.random() * 8,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        10 + Math.random() * 25,
        520 + Math.random() * 640,
        color,
        0.75 + Math.random() * 0.25
      );
    }
  }

  function addTrail(x, y, speed) {
    const now = performance.now();
    trail.push({ x, y, life: 1, width: Math.min(34, 13 + speed * 0.065) });
    if (trail.length > (coarsePointer.matches ? 18 : 32)) trail.shift();

    const count = Math.max(1, Math.min(5, Math.round(speed / 160)));
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const sideways = 0.05 + Math.random() * 0.22;
      const color = colors[(i + Math.floor(now / 420)) % colors.length];
      addParticle(
        x + (Math.random() - 0.5) * 9,
        y + (Math.random() - 0.5) * 9,
        Math.cos(angle) * sideways,
        Math.sin(angle) * sideways,
        9 + Math.random() * 18,
        380 + Math.random() * 460,
        color,
        0.62 + Math.random() * 0.25
      );
    }
  }

  function pointerPosition(event) {
    const rect = screen.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerMove(event) {
    if (reduceMotion.matches || !visible()) return;
    const point = pointerPosition(event);
    const now = performance.now();
    if (!lastPointer) {
      lastPointer = { ...point, time: now };
      addTrail(point.x, point.y, 0);
      return;
    }

    const dx = point.x - lastPointer.x;
    const dy = point.y - lastPointer.y;
    const distance = Math.hypot(dx, dy);
    const elapsed = Math.max(8, now - lastPointer.time);
    const speed = distance / elapsed * 1000;
    const step = coarsePointer.matches ? 22 : 13;
    const samples = Math.max(1, Math.ceil(distance / step));

    if (now - lastSpawnAt > 12) {
      for (let i = 1; i <= samples; i += 1) {
        const t = i / samples;
        addTrail(lastPointer.x + dx * t, lastPointer.y + dy * t, speed);
      }
      lastSpawnAt = now;
    }
    lastPointer = { ...point, time: now };
  }

  function drawTrail(dt) {
    trail.forEach((point) => { point.life -= dt / 520; });
    trail = trail.filter((point) => point.life > 0);
    if (trail.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      const alpha = Math.max(0, Math.min(a.life, b.life));
      const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gradient.addColorStop(0, `rgba(54,126,255,${0.05 * alpha})`);
      gradient.addColorStop(0.5, `rgba(67,190,255,${0.23 * alpha})`);
      gradient.addColorStop(1, `rgba(98,126,255,${0.04 * alpha})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = ((a.width + b.width) / 2) * alpha;
      ctx.shadowColor = `rgba(64,164,255,${0.55 * alpha})`;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    particles.forEach((particle) => {
      particle.life -= dt;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      particle.vy -= 0.0007 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.rotation += 0.0005 * dt;

      const progress = Math.max(0, particle.life / particle.maxLife);
      const radius = particle.size * (0.7 + (1 - progress) * 0.8);
      const [r, g, b] = particle.color;
      const gradient = ctx.createRadialGradient(
        particle.x - radius * 0.15,
        particle.y - radius * 0.12,
        0,
        particle.x,
        particle.y,
        radius
      );
      gradient.addColorStop(0, `rgba(${r + 20},${Math.min(255, g + 28)},255,${0.22 * progress * particle.opacity})`);
      gradient.addColorStop(0.32, `rgba(${r},${g},${b},${0.12 * progress * particle.opacity})`);
      gradient.addColorStop(0.72, `rgba(${r},${g},${b},${0.035 * progress})`);
      gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gradient;
      ctx.shadowColor = `rgba(${r},${g},${b},${0.42 * progress})`;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, radius * 1.12, radius * 0.78, particle.rotation, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    particles = particles.filter((particle) => particle.life > 0);
  }

  function frame(now) {
    const dt = Math.min(34, now - lastFrame || 16.7);
    lastFrame = now;
    ctx.clearRect(0, 0, width, height);
    drawTrail(dt);
    drawParticles(dt);
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible() || document.hidden || reduceMotion.matches) return;
    running = true;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ctx.clearRect(0, 0, width, height);
    particles = [];
    trail = [];
    lastPointer = null;
  }

  function sync() {
    if (visible() && !document.hidden && !reduceMotion.matches) start();
    else stop();
  }

  screen.addEventListener("pointermove", onPointerMove, { passive: true });
  screen.addEventListener("pointerdown", (event) => {
    const point = pointerPosition(event);
    splash(point.x, point.y, 1.15);
  }, { passive: true });
  screen.addEventListener("pointerleave", () => { lastPointer = null; });

  new ResizeObserver(() => resize()).observe(screen);
  new MutationObserver(sync).observe(screen, { attributes: true, attributeFilter: ["style", "hidden", "class"] });
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener?.("change", sync);
  coarsePointer.addEventListener?.("change", resize);

  resize();
  sync();
})();
