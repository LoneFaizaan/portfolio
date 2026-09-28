/* ==========================================================================
   Particle world
   One Points cloud that morphs between forms as the page scrolls:
     terrain (the valley) → chinar leaf → drifting dust → globe → ring → FL. mark
   Every form is anchored to a DOM element carrying [data-shape], so the 3D
   shape travels with the section it belongs to instead of floating freely.
   ========================================================================== */
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  Points,
  Vector2,
  Vector3,
  Matrix3,
  Matrix4,
  Euler,
  Color,
  AdditiveBlending,
} from './vendor/three.min.js';

const SHAPES = { terrain: 0, leaf: 1, dust: 2, sphere: 3, ring: 4, logo: 5 };
const CAM_Z = 10;
const FOV = 35;
const LOOK_Y = -0.9;

/* ---------- small math helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gaussian = (r) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function normalise(pos, targetHeight) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const s = targetHeight / (maxY - minY);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * s;
    pos[i + 1] = (pos[i + 1] - cy) * s;
    pos[i + 2] *= s;
  }
}

/* ---------- shape generators (local space, roughly unit sized) ---------- */

// Chinar (Platanus orientalis) leaf: five deep palmate lobes, serrated margin,
// veins radiating from the stalk. Leaf fill is crimson, veins stay pale.
function buildLeaf(count, r) {
  const pos = new Float32Array(count * 3);
  const acc = new Float32Array(count);
  const lobes = [
    [0, 1.0, 0.36],
    [0.98, 0.86, 0.3],
    [-0.98, 0.86, 0.3],
    [1.92, 0.58, 0.27],
    [-1.92, 0.58, 0.27],
  ];
  const radius = (theta) => {
    const a = wrapAngle(theta - Math.PI / 2);
    let rr = 0.24;
    for (const [c, len, w] of lobes) rr += len * Math.exp(-Math.pow(Math.abs(wrapAngle(a - c)) / w, 1.25));
    return rr * (1 + 0.03 * Math.sin(theta * 46));
  };
  const tips = lobes.map(([c]) => {
    const th = c + Math.PI / 2;
    const rr = radius(th);
    return [Math.cos(th) * rr, Math.sin(th) * rr];
  });
  const cup = (x, y) => 0.18 * x * x - 0.07 * y;

  let i = 0;
  const push = (x, y, z, a) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; acc[i] = a; i++;
  };
  const nFill = Math.floor(count * 0.5);
  const nEdge = Math.floor(count * 0.3);
  const nVein = Math.floor(count * 0.16);
  const nStem = count - nFill - nEdge - nVein;

  while (i < nFill) {
    const x = (r() * 2 - 1) * 1.35;
    const y = -0.4 + r() * 1.8;
    if (Math.hypot(x, y) < radius(Math.atan2(y, x))) push(x, y, cup(x, y) + gaussian(r) * 0.015, r() < 0.84 ? 1 : 0);
  }
  for (let k = 0; k < nEdge; k++) {
    const th = r() * Math.PI * 2;
    const rho = radius(th) * (1 - Math.abs(gaussian(r)) * 0.012);
    const x = Math.cos(th) * rho;
    const y = Math.sin(th) * rho;
    push(x, y, cup(x, y), r() < 0.92 ? 1 : 0);
  }
  for (let k = 0; k < nVein; k++) {
    const [tx, ty] = tips[Math.floor(r() * tips.length)];
    const t = Math.pow(r(), 0.85) * 0.93;
    const x = tx * t + gaussian(r) * 0.006;
    const y = ty * t + gaussian(r) * 0.006;
    push(x, y, cup(x, y) + 0.01, 0);
  }
  for (let k = 0; k < nStem; k++) {
    const t = r();
    const x = 0.02 + t * 0.05 + Math.sin(t * 2.6) * 0.035 + gaussian(r) * 0.006;
    const y = -0.08 - t * 0.56;
    push(x, y, cup(x, y), r() < 0.35 ? 1 : 0);
  }
  normalise(pos, 2);
  return { pos, acc };
}

// Globe: fibonacci surface + three orbital rings + a sparse core.
function buildSphere(count, r) {
  const pos = new Float32Array(count * 3);
  const acc = new Float32Array(count);
  const nSurf = Math.floor(count * 0.6);
  const nRing = Math.floor(count * 0.28);
  let i = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < nSurf; k++, i++) {
    const y = 1 - ((k + 0.5) / nSurf) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = k * golden;
    const j = 1 + gaussian(r) * 0.006;
    pos[i * 3] = Math.cos(th) * rad * j;
    pos[i * 3 + 1] = y * j;
    pos[i * 3 + 2] = Math.sin(th) * rad * j;
    acc[i] = r() < 0.08 ? 1 : 0;
  }
  const normals = [
    new Vector3(0.25, 1, 0.2).normalize(),
    new Vector3(-0.9, 0.35, 0.45).normalize(),
    new Vector3(0.55, -0.25, 1).normalize(),
  ];
  const up = new Vector3();
  const u = new Vector3();
  const v = new Vector3();
  for (let k = 0; k < nRing; k++, i++) {
    const ring = k % 3;
    const n = normals[ring];
    up.set(0, 0, 1);
    if (Math.abs(n.dot(up)) > 0.9) up.set(1, 0, 0);
    u.crossVectors(n, up).normalize();
    v.crossVectors(n, u).normalize();
    const t = r() * Math.PI * 2;
    const rad = [1.2, 1.32, 1.12][ring] + gaussian(r) * 0.008;
    pos[i * 3] = (Math.cos(t) * u.x + Math.sin(t) * v.x) * rad;
    pos[i * 3 + 1] = (Math.cos(t) * u.y + Math.sin(t) * v.y) * rad;
    pos[i * 3 + 2] = (Math.cos(t) * u.z + Math.sin(t) * v.z) * rad;
    acc[i] = ring === 0 ? 1 : 0;
  }
  for (; i < count; i++) {
    const t = r() * Math.PI * 2;
    const p = Math.acos(2 * r() - 1);
    const rad = 0.15 + Math.pow(r(), 0.7) * 0.7;
    pos[i * 3] = Math.sin(p) * Math.cos(t) * rad;
    pos[i * 3 + 1] = Math.cos(p) * rad;
    pos[i * 3 + 2] = Math.sin(p) * Math.sin(t) * rad;
    acc[i] = r() < 0.2 ? 1 : 0;
  }
  return { pos, acc };
}

// Halo ring (lies in the XZ plane; tilted at runtime) with fine dust bands.
function buildRing(count, r) {
  const pos = new Float32Array(count * 3);
  const acc = new Float32Array(count);
  const bands = [
    { share: 0.44, rad: 1.0, sd: 0.028, acc: 0.25 },
    { share: 0.2, rad: 1.2, sd: 0.01, acc: 0.85 },
    { share: 0.12, rad: 0.82, sd: 0.008, acc: 0 },
  ];
  let i = 0;
  for (const b of bands) {
    const n = Math.floor(count * b.share);
    for (let k = 0; k < n; k++, i++) {
      const t = r() * Math.PI * 2;
      const rad = b.rad + gaussian(r) * b.sd;
      pos[i * 3] = Math.cos(t) * rad;
      pos[i * 3 + 1] = gaussian(r) * 0.012;
      pos[i * 3 + 2] = Math.sin(t) * rad;
      acc[i] = r() < b.acc ? 1 : 0;
    }
  }
  for (; i < count; i++) {
    const t = r() * Math.PI * 2;
    const rad = 0.55 + r() * 1.15;
    pos[i * 3] = Math.cos(t) * rad;
    pos[i * 3 + 1] = gaussian(r) * 0.06;
    pos[i * 3 + 2] = Math.sin(t) * rad;
    acc[i] = r() < 0.15 ? 1 : 0;
  }
  return { pos, acc };
}

// "FL." brand mark, extruded, with crisp outlines. The square is crimson.
function buildLogo(count, r) {
  const pos = new Float32Array(count * 3);
  const acc = new Float32Array(count);
  const W = 1841;
  const H = 530;
  const rects = [
    [0, 0, 836, 156], [0, 0, 206, 530], [0, 224, 722, 367],
    [919, 0, 1123, 530], [919, 374, 1609, 530],
    [1635, 408, 1841, 530],
  ];
  const inside = (x, y, skip = -1, eps = 0) => rects.some(([x0, y0, x1, y1], k) =>
    k !== skip && x > x0 + eps && x < x1 - eps && y > y0 + eps && y < y1 - eps);
  const perims = rects.map(([x0, y0, x1, y1]) => 2 * (x1 - x0 + y1 - y0));
  const perimTotal = perims.reduce((a, b) => a + b, 0);
  const s = 2 / W;
  let i = 0;
  const push = (x, y, z) => {
    pos[i * 3] = (x - W / 2) * s;
    pos[i * 3 + 1] = -(y - H / 2) * s;
    pos[i * 3 + 2] = z;
    acc[i] = x >= 1635 ? 1 : 0;
    i++;
  };
  const nFill = Math.floor(count * 0.6);
  while (i < nFill) {
    const x = r() * W;
    const y = r() * H;
    if (inside(x, y)) push(x, y, (r() * 2 - 1) * 0.07);
  }
  let guard = 0;
  while (i < count && guard++ < count * 40) {
    let pick = r() * perimTotal;
    let k = 0;
    while (pick > perims[k]) pick -= perims[k++];
    const [x0, y0, x1, y1] = rects[k];
    const w = x1 - x0;
    const h = y1 - y0;
    let x, y;
    if (pick < w) { x = x0 + pick; y = y0; }
    else if (pick < w + h) { x = x1; y = y0 + pick - w; }
    else if (pick < 2 * w + h) { x = x1 - (pick - w - h); y = y1; }
    else { x = x0; y = y1 - (pick - 2 * w - h); }
    if (inside(x, y, k, 2)) continue;
    push(x + gaussian(r) * 2, y + gaussian(r) * 2, r() < 0.5 ? 0.07 : -0.07);
  }
  for (; i < count; i++) push(r() * 836, r() * 156, 0);
  return { pos, acc };
}

/* ---------- shaders ---------- */
const NOISE = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float ridged(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  float prev = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(snoise(p));
    n *= n;
    sum += n * amp * prev;
    prev = n;
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}
`;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uPR;
uniform float uSize;
uniform float uIntro;
uniform float uFade;
uniform int uFrom;
uniform int uTo;
uniform float uMix;
uniform float uTurb;
uniform float uAgitate;
uniform float uAspect;
uniform float uTanHalf;
uniform float uCamZ;
uniform vec3 uTerrainShift;
uniform float uScrollW;
uniform float uDustSpread;
uniform vec2 uMouse;
uniform float uMouseForce;
uniform vec3 uC1; uniform vec3 uC3; uniform vec3 uC4; uniform vec3 uC5;
uniform float uS1; uniform float uS3; uniform float uS4; uniform float uS5;
uniform mat3 uR1; uniform mat3 uR3; uniform mat3 uR4; uniform mat3 uR5;

attribute vec2 aGrid;
attribute vec3 aLeaf;
attribute vec3 aSphere;
attribute vec3 aRing;
attribute vec3 aLogo;
attribute vec3 aDust;
attribute vec4 aRand;
attribute vec4 aAccent;
attribute vec4 aMask;

varying float vAlpha;
varying float vAccent;

${NOISE}

vec3 terrain(out float fog) {
  float v = aGrid.y;
  float dist = mix(2.5, 72.0, pow(v, 1.55));
  float halfW = dist * uTanHalf * max(uAspect, 0.7) * 1.35;
  float x = aGrid.x * halfW;
  float z = uCamZ - dist;
  float far = smoothstep(8.0, 40.0, dist);
  vec2 q = vec2(x * 0.052, (z - uTime * 0.2) * 0.052);
  float h = ridged(q) * mix(0.3, 7.2, far);
  float lake = snoise(vec2(x * 0.32, (z - uTime * 1.3) * 0.32)) * 0.09 * (1.0 - far);
  float y = -2.25 + (h + lake) * uIntro;
  fog = (1.0 - smoothstep(52.0, 72.0, dist)) * smoothstep(1.5, 6.5, dist);
  fog *= mix(0.45, 1.0, smoothstep(4.0, 22.0, dist));
  fog *= 0.65 + 0.9 * smoothstep(1.2, 5.0, h);
  return vec3(x, y, z) + uTerrainShift;
}

vec3 dustPos() {
  vec3 p = aDust;
  p.x *= uDustSpread;
  float depth = clamp((p.z + 10.0) / 13.0, 0.0, 1.0);
  p.y = mod(p.y + uScrollW * (0.25 + depth * 0.8) + 7.0, 14.0) - 7.0;
  p.x += sin(uTime * 0.07 + aRand.z * 40.0) * 0.25;
  p.y += cos(uTime * 0.06 + aRand.z * 30.0) * 0.18;
  return p;
}

vec3 shapePos(int k, out float a, out float acc) {
  vec3 p = vec3(0.0);
  float member = 0.0;
  a = 1.0;
  acc = 0.0;
  if (k == 0) {
    float fog = 1.0;
    p = terrain(fog);
    a = fog;
    acc = step(aRand.w, 0.035);
    member = 1.0;
  } else if (k == 1) { member = aMask.x; acc = aAccent.x; p = uC1 + uR1 * (aLeaf * uS1); a = 0.8; }
  else if (k == 3) { member = aMask.y; acc = aAccent.y; p = uC3 + uR3 * (aSphere * uS3); a = 0.85; }
  else if (k == 4) { member = aMask.z; acc = aAccent.z; p = uC4 + uR4 * (aRing * uS4); a = 0.9; }
  else if (k == 5) { member = aMask.w; acc = aAccent.w; p = uC5 + uR5 * (aLogo * uS5); a = 0.95; }
  if (member < 0.5) {
    a = 0.4;
    acc = step(aRand.w, 0.07);
    p = dustPos();
  }
  return p;
}

void main() {
  float aA, aB, accA, accB;
  vec3 pA = shapePos(uFrom, aA, accA);
  vec3 pB = pA;
  aB = aA;
  accB = accA;
  if (uTo != uFrom) pB = shapePos(uTo, aB, accB);

  float t = clamp((uMix - aRand.y * 0.4) / 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 pos = mix(pA, pB, t);

  float flight = sin(t * 3.14159265);
  if (flight > 0.001) {
    float n1 = snoise(pos.xy * 0.22 + vec2(uTime * 0.1, aRand.z * 10.0));
    float n2 = snoise(pos.yx * 0.22 - vec2(aRand.z * 7.0, uTime * 0.1));
    pos += vec3(n1, n2, n1 * n2 * 2.0) * flight * uTurb;
  }

  float breathe = 0.012 + uAgitate * 0.09;
  pos += breathe * vec3(
    sin(uTime * 1.1 + aRand.z * 50.0),
    cos(uTime * 0.9 + aRand.z * 40.0),
    sin(uTime * 0.7 + aRand.z * 30.0));

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 diff = (ndc - uMouse) * vec2(uAspect, 1.0);
  float d = length(diff);
  float f = (1.0 - smoothstep(0.0, 0.24, d)) * uMouseForce;
  mv.xy += (diff / max(d, 0.0001)) * f * (-mv.z) * 0.04;
  gl_Position = projectionMatrix * mv;

  float acc = mix(accA, accB, t);
  float size = uSize * (0.45 + aRand.x) * (1.0 + acc * 0.35) * (1.0 + f * 0.6);
  gl_PointSize = max(size * uPR * pow(10.0 / -mv.z, 0.5), uPR * 1.2);

  float tw = 0.72 + 0.28 * sin(uTime * (0.6 + aRand.x * 1.8) + aRand.z * 6.2831);
  vAlpha = mix(aA, aB, t) * tw * uFade * (1.0 + f * 1.4);
  vAccent = acc;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
varying float vAlpha;
varying float vAccent;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.18, 0.5, length(c));
  if (a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(mix(uColA, uColB, vAccent), a * vAlpha);
}
`;

/* ---------- scene ---------- */
export function createScene({ canvas, gsap, reduced = false, small = false }) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x07070a, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, CAM_Z);

  // terrain = dense rows of points that read as glowing ridgelines
  const cols = small ? 300 : 640;
  const rows = small ? 36 : 48;
  const N = cols * rows;
  const r = mulberry32(7);

  // attributes
  const grid = new Float32Array(N * 2);
  const rand = new Float32Array(N * 4);
  const dust = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const c = i % cols;
    const rr = Math.floor(i / cols);
    grid[i * 2] = ((c + 0.5 + (r() - 0.5) * 0.5) / cols) * 2 - 1;
    grid[i * 2 + 1] = (rr + 0.5) / rows;
    rand[i * 4] = r();
    rand[i * 4 + 1] = r();
    rand[i * 4 + 2] = r();
    rand[i * 4 + 3] = r();
    dust[i * 3] = (r() * 2 - 1) * 12;
    dust[i * 3 + 1] = (r() * 2 - 1) * 7;
    dust[i * 3 + 2] = -10 + r() * 13;
  }

  // each form uses a random subset of particles; the rest drift as dust
  const mask = new Float32Array(N * 4);
  const accent = new Float32Array(N * 4);
  const layout = (builder, share, channel, seed) => {
    const rs = mulberry32(seed);
    const count = Math.floor(N * share);
    const { pos, acc } = builder(count, rs);
    const order = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rs() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const out = new Float32Array(N * 3);
    for (let k = 0; k < count; k++) {
      const idx = order[k];
      out[idx * 3] = pos[k * 3];
      out[idx * 3 + 1] = pos[k * 3 + 1];
      out[idx * 3 + 2] = pos[k * 3 + 2];
      mask[idx * 4 + channel] = 1;
      accent[idx * 4 + channel] = acc[k];
    }
    return out;
  };
  const leaf = layout(buildLeaf, 0.5, 0, 11);
  const sphere = layout(buildSphere, 0.55, 1, 23);
  const ring = layout(buildRing, 0.6, 2, 37);
  const logo = layout(buildLogo, 0.52, 3, 41);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
  geometry.setAttribute('aGrid', new BufferAttribute(grid, 2));
  geometry.setAttribute('aRand', new BufferAttribute(rand, 4));
  geometry.setAttribute('aDust', new BufferAttribute(dust, 3));
  geometry.setAttribute('aLeaf', new BufferAttribute(leaf, 3));
  geometry.setAttribute('aSphere', new BufferAttribute(sphere, 3));
  geometry.setAttribute('aRing', new BufferAttribute(ring, 3));
  geometry.setAttribute('aLogo', new BufferAttribute(logo, 3));
  geometry.setAttribute('aMask', new BufferAttribute(mask, 4));
  geometry.setAttribute('aAccent', new BufferAttribute(accent, 4));

  const uniforms = {
    uTime: { value: 0 },
    uPR: { value: 1 },
    uSize: { value: small ? 2.8 : 2.7 },
    uIntro: { value: reduced ? 1 : 0 },
    uFade: { value: reduced ? 1 : 0 },
    uFrom: { value: 0 },
    uTo: { value: 0 },
    uMix: { value: 0 },
    uTurb: { value: 0.9 },
    uAgitate: { value: 0 },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan((FOV * Math.PI) / 360) },
    uCamZ: { value: CAM_Z },
    uTerrainShift: { value: new Vector3() },
    uScrollW: { value: 0 },
    uDustSpread: { value: 1 },
    uMouse: { value: new Vector2(9, 9) },
    uMouseForce: { value: 0 },
    uC1: { value: new Vector3() }, uC3: { value: new Vector3() },
    uC4: { value: new Vector3() }, uC5: { value: new Vector3() },
    uS1: { value: 1 }, uS3: { value: 1 }, uS4: { value: 1 }, uS5: { value: 1 },
    uR1: { value: new Matrix3() }, uR3: { value: new Matrix3() },
    uR4: { value: new Matrix3() }, uR5: { value: new Matrix3() },
    uColA: { value: new Color('#dfe8ff') },
    uColB: { value: new Color('#ff2f66') },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  /* ---------- anchors ---------- */
  const anchors = [...document.querySelectorAll('[data-shape]')]
    .map((el) => ({ el, shape: SHAPES[el.dataset.shape], rect: null, world: new Vector3() }))
    .filter((a) => a.shape !== undefined)
    .sort((a, b) => a.shape - b.shape);
  const heroAnchor = anchors.find((a) => a.shape === 0);

  /* ---------- state ---------- */
  let vw = 1;
  let vh = 1;
  let worldPerPx = 0.01;
  const mouseTarget = new Vector2(0, 0);
  const mouseSmooth = new Vector2(0, 0);
  let mouseActive = false;
  let agitate = 0;
  let sphereMatrix = null;
  const tmp = new Vector3();
  const dir = new Vector3();
  const m4 = new Matrix4();
  const euler = new Euler();

  function screenToWorld(sx, sy, out) {
    tmp.set((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1, 0.5).unproject(camera);
    dir.copy(tmp).sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    return out.copy(camera.position).addScaledVector(dir, t);
  }

  function setRotation(target, x, y, z, order) {
    euler.set(x, y, z, order);
    m4.makeRotationFromEuler(euler);
    target.setFromMatrix4(m4);
  }

  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    uniforms.uPR.value = pr;
    uniforms.uAspect.value = camera.aspect;
    uniforms.uDustSpread.value = clamp(camera.aspect / 1.78, 0.35, 1.1);
    worldPerPx = (2 * CAM_Z * Math.tan((FOV * Math.PI) / 360)) / vh;
  }

  function update(time) {
    uniforms.uTime.value = reduced ? 12 : time;

    // camera drifts gently with the pointer
    mouseSmooth.lerp(mouseTarget, 0.045);
    camera.position.x = reduced ? 0 : mouseSmooth.x * 0.4;
    camera.position.y = reduced ? 0 : mouseSmooth.y * 0.22;
    camera.lookAt(0, LOOK_Y, 0);
    camera.updateMatrixWorld();

    // where is each anchor on screen?
    const mid = vh * 0.5;
    for (const a of anchors) a.rect = a.el.getBoundingClientRect();
    let from = 0;
    let to = 0;
    let t = 0;
    const cy = (a) => a.rect.top + a.rect.height * 0.5;
    const last = anchors.length - 1;
    if (last >= 0) {
      if (cy(anchors[0]) >= mid) {
        from = to = anchors[0].shape;
      } else if (cy(anchors[last]) <= mid) {
        from = to = anchors[last].shape;
      } else {
        for (let k = 0; k < last; k++) {
          const a = anchors[k];
          const b = anchors[k + 1];
          if (cy(a) <= mid && cy(b) > mid) {
            from = a.shape;
            to = b.shape;
            t = (mid - cy(a)) / (cy(b) - cy(a));
            break;
          }
        }
      }
    }
    uniforms.uFrom.value = from;
    uniforms.uTo.value = to;
    // reduced motion: forms swap at the midpoint instead of flying between sections
    uniforms.uMix.value = reduced ? (t < 0.5 ? 0 : 1) : smoothstep(0.18, 0.82, t);

    // place each form on its anchor (kept loosely within the viewport)
    for (const a of anchors) {
      if (a.shape === 0 || a.shape === 2) continue;
      const rc = a.rect;
      const cx = rc.left + rc.width * 0.5;
      const cyc = clamp(rc.top + rc.height * 0.5, -vh * 0.25, vh * 1.25);
      screenToWorld(cx, cyc, a.world);
      const size = Math.min(rc.width, rc.height) * worldPerPx;
      if (a.shape === 1) { uniforms.uC1.value.copy(a.world); uniforms.uS1.value = size * 0.45; }
      if (a.shape === 3) { uniforms.uC3.value.copy(a.world); uniforms.uS3.value = size * 0.33; }
      if (a.shape === 4) { uniforms.uC4.value.copy(a.world); uniforms.uS4.value = size * 0.47; }
      if (a.shape === 5) { uniforms.uC5.value.copy(a.world); uniforms.uS5.value = rc.width * worldPerPx * 0.48; }
    }

    const tt = uniforms.uTime.value;
    setRotation(uniforms.uR1.value, -0.25, Math.sin(tt * 0.35) * 0.5, 0.28 + Math.sin(tt * 0.4) * 0.06, 'ZYX');
    if (sphereMatrix) uniforms.uR3.value.set(...sphereMatrix());
    else setRotation(uniforms.uR3.value, 0.35, tt * 0.2, 0, 'XYZ');
    setRotation(uniforms.uR4.value, 0.42 + Math.sin(tt * 0.2) * 0.05, tt * 0.12, -0.16, 'ZXY');
    setRotation(uniforms.uR5.value, Math.sin(tt * 0.3) * 0.08 - 0.05, Math.sin(tt * 0.45) * 0.32, 0, 'YXZ');

    // the valley rises and rolls toward the camera as the hero scrolls away
    if (heroAnchor) {
      const top = Math.min(0, heroAnchor.rect.top);
      uniforms.uTerrainShift.value.set(0, -top * worldPerPx * 0.55, (-top / vh) * 5);
    }
    uniforms.uScrollW.value = window.scrollY * worldPerPx;

    agitate *= 0.92;
    uniforms.uAgitate.value = agitate;
    uniforms.uMouseForce.value += ((mouseActive && !reduced ? 1 : 0) - uniforms.uMouseForce.value) * 0.08;

    renderer.render(scene, camera);
  }

  resize();
  // compile shaders now, while the loader is still up
  renderer.compile(scene, camera);
  update(0);

  return {
    tick: update,
    resize,
    intro() {
      if (reduced) return;
      gsap.to(uniforms.uFade, { value: 1, duration: 1.6, ease: 'power2.out' });
      gsap.fromTo(uniforms.uIntro, { value: 0 }, { value: 1, duration: 3.2, ease: 'expo.out', delay: 0.1 });
    },
    setPointer(x, y, active) {
      mouseActive = active;
      if (!active) return;
      mouseTarget.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
      uniforms.uMouse.value.copy(mouseTarget);
    },
    setVelocity(v) {
      agitate = Math.max(agitate, Math.min(1, Math.abs(v) / 60));
    },
    setSphereMatrix(fn) {
      sphereMatrix = fn;
    },
  };
}
