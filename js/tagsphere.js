/* ==========================================================================
   Tag sphere
   Skill labels distributed on a sphere, projected with a little perspective.
   Drag to spin (with inertia); it idles with a slow drift. The rotation
   matrix is shared with the WebGL globe so both turn together.
   ========================================================================== */

// row-major 3x3 helpers
const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const rotX = (t) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const rotY = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];

function orthonormalise(m) {
  // Gram–Schmidt on the rows to stop floating point drift
  let [ax, ay, az, bx, by, bz] = m;
  let l = Math.hypot(ax, ay, az);
  ax /= l; ay /= l; az /= l;
  const d = ax * bx + ay * by + az * bz;
  bx -= d * ax; by -= d * ay; bz -= d * az;
  l = Math.hypot(bx, by, bz);
  bx /= l; by /= l; bz /= l;
  return [ax, ay, az, bx, by, bz, ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

export function createTagSphere(el, { reduced = false } = {}) {
  const tags = [...el.querySelectorAll('.sphere__tag')];
  const n = tags.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const base = tags.map((_, i) => {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(i * golden) * r, y, Math.sin(i * golden) * r];
  });

  let m = mul(rotX(0.35), rotY(-0.4));
  const idle = { x: 0.0009, y: 0.0024 };
  let vx = idle.x;
  let vy = idle.y;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let radius = 0;
  let frame = 0;
  let visible = true;

  const measure = () => {
    // leave room for the longest labels on narrow screens
    radius = el.clientWidth * (el.clientWidth < 420 ? 0.34 : 0.42);
  };
  measure();
  new ResizeObserver(measure).observe(el);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(el);

  function project() {
    const persp = 3;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = base[i];
      const X = m[0] * x + m[1] * y + m[2] * z;
      const Y = m[3] * x + m[4] * y + m[5] * z;
      const Z = m[6] * x + m[7] * y + m[8] * z;
      const s = persp / (persp - Z);
      const depth = (Z + 1) / 2;
      const tag = tags[i];
      tag.style.transform =
        `translate3d(${(X * radius * s).toFixed(1)}px, ${(-Y * radius * s).toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.62 + depth * 0.5).toFixed(3)})`;
      tag.style.opacity = (0.16 + depth * 0.84).toFixed(3);
      tag.style.zIndex = String(Math.round(depth * 100));
    }
  }

  function rotate(ax, ay) {
    m = mul(mul(rotX(ax), rotY(ay)), m);
    if (++frame % 120 === 0) m = orthonormalise(m);
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    vy = dx * 0.0065;
    vx = dy * 0.0065;
    rotate(vx, vy);
  });
  const release = () => { dragging = false; };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);

  project();

  return {
    tick(dt = 16.7) {
      if (!visible && !dragging) return;
      if (!dragging) {
        const k = reduced ? 0 : 1;
        vx += (idle.x * k - vx) * 0.025;
        vy += (idle.y * k - vy) * 0.025;
        rotate(vx * (dt / 16.7), vy * (dt / 16.7));
      }
      project();
    },
    getMatrix: () => m,
  };
}
