/* ==========================================================================
   Faizaan Lone — portfolio runtime
   Lenis smooth scroll · GSAP (ScrollTrigger, SplitText) · WebGL particle world
   ========================================================================== */
import { createTagSphere } from './tagsphere.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (p, ms) => Promise.race([p, wait(ms).then(() => null)]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const small = window.innerWidth < 900 || matchMedia('(pointer: coarse)').matches;

let lenisRef = null;

// Run a setup step without letting one failure take the whole page down.
// Steps that pre-hide content pass revealAll so nothing stays invisible.
const safe = (name, fn, onFail) => {
  try {
    return fn();
  } catch (err) {
    console.warn(`[portfolio] ${name} failed`, err);
    onFail?.();
    return null;
  }
};

function revealAll() {
  gsap.set('[data-reveal], [data-stagger] > *, [data-hero-fade]', { autoAlpha: 1, clearProps: 'transform' });
  gsap.set('[data-split], [data-lines], .hero__title', { visibility: 'visible' });
}

// Last resort: never leave visitors stuck behind the loader.
function bail(err) {
  console.warn('[portfolio] boot problem, showing the static page', err);
  $('.loader')?.remove();
  lenisRef?.start();
  revealAll();
}

if (!gsap || !ScrollTrigger || !SplitText) {
  root.classList.add('is-fallback');
} else {
  window.__flBooted = true;
  const failsafe = setTimeout(() => bail(new Error('boot timed out')), 15000);
  start().then(() => clearTimeout(failsafe), (err) => {
    clearTimeout(failsafe);
    bail(err);
  });
}

async function start() {
  gsap.registerPlugin(ScrollTrigger, SplitText);
  gsap.config({ nullTargetWarn: false });
  if (reduced) root.classList.add('reduced');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const initialHash = location.hash;
  window.scrollTo(0, 0);

  const lenis = safe('smooth scroll', createSmoothScroll);
  lenisRef = lenis;
  const scenePromise = loadScene();
  const loader = createLoader(lenis);

  safe('rolls', setupRolls);
  const setMenu = safe('menu', () => setupMenu(lenis)) || (() => {});
  safe('anchors', () => setupAnchors(lenis, setMenu));
  safe('header', () => setupHeader(lenis));
  safe('clock', setupClock);
  safe('cursor', setupCursor);
  safe('magnetic', setupMagnetic);
  safe('spotlight', setupSpotlight);
  safe('copy', setupCopy);
  safe('year', setupYear);

  await withTimeout(document.fonts ? document.fonts.ready : Promise.resolve(), 3500);

  // ScrollTriggers are created in page order; the pinned sections go first
  // (top to bottom) so every trigger below them is measured with the pin
  // spacing in place.
  const depth = safe('depth', () => setupDepth(lenis), () => $('.depth')?.classList.remove('is-3d'));
  safe('work', () => setupWork(lenis));
  const heroChars = safe('hero', prepareHero, revealAll) || [];
  safe('manifesto', setupManifesto);
  safe('reveals', setupReveals, revealAll);
  safe('counters', setupCounters);
  safe('tapes', () => setupTapes(lenis));
  safe('holo', setupHolo);
  safe('tilt cards', setupTiltCards);
  const sphere = safe('sphere', setupSphere);
  safe('nav state', setupNavState);
  safe('footer', setupFooter);
  safe('progress', setupProgress);
  safe('drum', setupDrum);

  const scene = await withTimeout(scenePromise, 4000);
  if (scene) {
    safe('scene wiring', () => wireScene(scene, lenis, sphere, depth));
  } else {
    // slow connection: don't hold the page, fade the world in whenever it arrives
    scenePromise.then((late) => {
      if (!late) return;
      safe('scene wiring', () => wireScene(late, lenis, sphere, depth));
      late.intro();
    });
  }

  ScrollTrigger.refresh();
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });

  if (initialHash && initialHash.length > 1) {
    const target = document.getElementById(initialHash.slice(1));
    if (target && lenis) {
      lenis.resize(); // its cached scroll limit predates the pin spacer
      lenis.scrollTo(target, { immediate: true, force: true });
    } else if (target) {
      target.scrollIntoView();
    }
  }

  await loader.finish();
  heroIntro(heroChars, scene);
}

/* --------------------------------------------------------------------------
   Smooth scroll
   -------------------------------------------------------------------------- */
function createSmoothScroll() {
  if (reduced || !Lenis) return null;
  const lenis = new Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

/* --------------------------------------------------------------------------
   WebGL
   -------------------------------------------------------------------------- */
async function loadScene() {
  const canvas = $('.webgl');
  if (!canvas) return null;
  try {
    const { createScene } = await import('./scene.js');
    return createScene({ canvas, gsap, reduced, small });
  } catch (err) {
    console.warn('[portfolio] WebGL scene unavailable', err);
    root.classList.add('no-webgl');
    return null;
  }
}

function wireScene(scene, lenis, sphere, depth) {
  if (sphere) scene.setSphereMatrix(sphere.getMatrix);
  if (depth) scene.setTunnelTravel(depth.getTravel);

  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      scene.resize();
      if (reduced) scene.tick(0);
    });
  });

  if (reduced) {
    let pending = false;
    window.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        scene.tick(0);
      });
    }, { passive: true });
    scene.tick(0);
    return;
  }

  if (finePointer) {
    window.addEventListener('pointermove', (e) => scene.setPointer(e.clientX, e.clientY, true), { passive: true });
    root.addEventListener('mouseleave', () => scene.setPointer(0, 0, false));
  }
  gsap.ticker.add((time) => {
    if (lenis) scene.setVelocity(lenis.velocity);
    scene.tick(time);
  });
}

/* --------------------------------------------------------------------------
   Loader
   -------------------------------------------------------------------------- */
function createLoader(lenis) {
  const el = $('.loader');
  if (!el || reduced) {
    el?.remove();
    return { finish: async () => {} };
  }
  lenis?.stop();

  let visited = false;
  try {
    visited = sessionStorage.getItem('fl-visited') === '1';
    sessionStorage.setItem('fl-visited', '1');
  } catch (_) { /* storage unavailable — play the full intro */ }

  const num = $('.loader__num', el);
  const bar = $('.loader__bar span', el);
  const logo = $('.loader__logo svg', el);
  const state = { p: 0 };
  const render = () => {
    num.textContent = String(Math.round(state.p)).padStart(3, '0');
    bar.style.transform = `scaleX(${state.p / 100})`;
    logo.style.clipPath = `inset(0 ${100 - state.p}% 0 0)`;
  };
  const startedAt = performance.now();
  const crawl = gsap.to(state, { p: 88, duration: visited ? 0.7 : 2.4, ease: 'power2.inOut', onUpdate: render });

  return {
    async finish() {
      const minTime = visited ? 500 : 1700;
      const elapsed = performance.now() - startedAt;
      if (elapsed < minTime) await wait(minTime - elapsed);
      crawl.kill();
      await new Promise((resolve) => {
        gsap.timeline({
          onComplete: () => {
            el.remove();
            lenis?.start();
          },
        })
          .to(state, { p: 100, duration: 0.55, ease: 'power2.out', onUpdate: render })
          .to($$('.loader__row, .loader__logo', el), {
            y: -32, autoAlpha: 0, duration: 0.55, ease: 'power3.in', stagger: 0.05,
          }, '+=0.1')
          .fromTo(el, { clipPath: 'inset(0% 0% 0% 0%)' }, {
            clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: 'expo.inOut',
          }, '-=0.2')
          .add(resolve, '-=0.8');
      });
    },
  };
}

/* --------------------------------------------------------------------------
   Hero
   -------------------------------------------------------------------------- */
function prepareHero() {
  const title = $('.hero__title');
  if (!title) return [];
  if (reduced) return [];

  const split = SplitText.create(title, {
    type: 'chars', charsClass: 'char', tag: 'span', deepSlice: false, aria: 'auto',
  });
  title.setAttribute('aria-label', 'Faizaan Lone');
  root.classList.add('is-intro');

  // parallax out: the two lines drift apart and tip back into the valley
  gsap.set('.hero__line', { transformPerspective: 1100, transformOrigin: '50% 100%' });
  gsap.timeline({
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  })
    .to('.hero__line--1', { yPercent: -70, rotationX: 48, z: -160, ease: 'none' }, 0)
    .to('.hero__line--2', { yPercent: -28, rotationX: 30, z: -80, ease: 'none' }, 0)
    .to('.hero__main', { opacity: 0, ease: 'power1.in' }, 0)
    .to('.hero__top, .hero__bottom', { opacity: 0, y: -60, ease: 'none' }, 0);

  setupHeroTilt(title);
  return split.chars;
}

// The name leans toward the pointer; its two lines slide apart in depth.
function setupHeroTilt(title) {
  if (!finePointer) return;
  const hero = $('.hero');
  const lines = $$('.hero__line', title);
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);
  const tgt = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  const lineX = lines.map((line) => gsap.quickTo(line, 'x', { duration: 1.1, ease: 'power3.out' }));
  window.addEventListener('pointermove', (e) => {
    tgt.x = (e.clientX / window.innerWidth) * 2 - 1;
    tgt.y = (e.clientY / window.innerHeight) * 2 - 1;
    if (!visible) return;
    lineX.forEach((to, i) => to(tgt.x * (i ? 16 : -10)));
  }, { passive: true });
  gsap.ticker.add(() => {
    if (!visible) return;
    cur.x += (tgt.x - cur.x) * 0.06;
    cur.y += (tgt.y - cur.y) * 0.06;
    title.style.transform =
      `perspective(1400px) rotateX(${(-cur.y * 5).toFixed(2)}deg) rotateY(${(cur.x * 7).toFixed(2)}deg)`;
  });
}

function heroIntro(chars, scene) {
  startRotator();
  if (reduced || !chars.length) {
    gsap.set('.hero__title', { visibility: 'visible' });
    gsap.set('[data-hero-fade]', { autoAlpha: 1 });
    scene?.intro();
    return;
  }
  gsap.timeline({
    defaults: { ease: 'expo.out' },
    onComplete: () => root.classList.remove('is-intro'),
  })
    .set('.hero__title', { visibility: 'visible' })
    .from(chars, { yPercent: 118, rotateX: -84, opacity: 0, duration: 1.8, stagger: 0.055 }, 0)
    .from('.hero__square', { scale: 0, rotate: -180, duration: 1.5, ease: 'back.out(2.2)' }, 0.55)
    .fromTo('[data-hero-fade]', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 1.4, stagger: 0.07 }, 0.45);
  scene?.intro();
}

function startRotator() {
  const items = $$('.rotator__item');
  if (items.length < 2 || reduced) return;
  let i = 0;
  setInterval(() => {
    const prev = items[i];
    i = (i + 1) % items.length;
    prev.classList.remove('is-active');
    prev.classList.add('is-leaving');
    items[i].classList.remove('is-leaving');
    items[i].classList.add('is-active');
    setTimeout(() => prev.classList.remove('is-leaving'), 850);
  }, 2600);
}

/* --------------------------------------------------------------------------
   Approach — the section pins and scrolling flies the camera through depth.
   Each principle waits further into the screen inside its own portal frame;
   the WebGL world turns into a tunnel around it (see scene.js).
   -------------------------------------------------------------------------- */
function setupDepth(lenis) {
  const section = $('.depth');
  if (!section || reduced) return null;
  const items = $$('.depth__item', section);
  const frames = $$('.depth__frames i', section);
  const current = $('.depth__current', section);
  const total = $('.depth__total', section);
  const bar = $('.depth__bar span', section);
  const n = items.length;
  if (n < 2) return null;

  section.classList.add('is-3d');
  if (total) total.textContent = String(n).padStart(2, '0');

  const GAP = 1250;    // px of depth between principles
  const PERSP = 1000;  // matches the CSS perspective on the list
  const START = -0.55; // the first principle waits a little way ahead
  const sides = items.map((el) => Number(el.dataset.side) || 0);
  const blur = !small;
  let spread = 0;
  let target = 0;
  let shown = 0;
  let travel = START;
  let active = -1;
  let inView = false;

  const measure = () => {
    spread = window.innerWidth >= 900 ? Math.min(window.innerWidth * 0.1, 170) : 0;
  };
  measure();

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * n * 0.8)}`,
    pin: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onRefresh: measure,
    onUpdate: (self) => { target = self.progress; },
  });
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }).observe(section);

  // dwell on each principle, then glide on to the next
  const dwell = (s) => {
    const i = Math.floor(s);
    return i + smoothstep(0.12, 0.88, s - i);
  };

  const render = () => {
    travel = dwell(START + (n - 1 - START) * clamp(shown / 0.94, 0, 1));
    items.forEach((el, i) => {
      const d = travel - i; // 0 in focus · < 0 still ahead · > 0 flown past
      // the next principle stays a faint hint until the current one departs
      const o = smoothstep(-1.15, -0.35, d) * (1 - smoothstep(0.1, 0.5, d));
      if (o < 0.005) {
        el.style.visibility = 'hidden';
        return;
      }
      const z = Math.min(d * GAP, PERSP * 0.8);
      const turn = -sides[i] * clamp(d, -1, 1) * 10;
      el.style.visibility = 'visible';
      el.style.opacity = o.toFixed(3);
      el.style.zIndex = String(100 - Math.round(Math.abs(d) * 10));
      el.style.transform = `translate3d(${(sides[i] * spread).toFixed(1)}px, 0, ${z.toFixed(1)}px) rotateY(${turn.toFixed(2)}deg)`;
      // depth of field: only the principle in focus is sharp
      if (blur) {
        const b = Math.min(8, Math.max(0, Math.abs(d) - 0.08) * 7);
        el.style.filter = b > 0.05 ? `blur(${b.toFixed(1)}px)` : 'none';
      }
    });
    frames.forEach((el, k) => {
      const d = travel - k;
      const o = smoothstep(-3.4, -0.8, d) * (1 - smoothstep(0.15, 0.62, d));
      if (o < 0.005) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, 0, ${Math.min(d * GAP, PERSP * 0.85).toFixed(1)}px)`;
    });
    const a = clamp(Math.round(travel), 0, n - 1);
    if (a !== active) {
      active = a;
      if (current) current.textContent = String(a + 1).padStart(2, '0');
    }
    if (bar) bar.style.transform = `scaleX(${shown.toFixed(4)})`;
  };
  render();

  gsap.ticker.add(() => {
    if (!inView && Math.abs(target - shown) < 0.0005) return;
    // ease toward the scroll position at the same pace whatever the frame rate
    const k = 1 - Math.pow(1 - (lenis ? 0.2 : 0.14), gsap.ticker.deltaRatio(60));
    shown += (target - shown) * k;
    if (Math.abs(target - shown) < 0.0001) shown = target;
    render();
  });

  return { getTravel: () => travel };
}

/* --------------------------------------------------------------------------
   Scroll reveals
   -------------------------------------------------------------------------- */
function setupReveals() {
  if (reduced) return;

  // headings: characters flip up out of line masks, then the split is undone
  $$('[data-split]').forEach((el) => {
    let split = null;
    split = SplitText.create(el, {
      type: 'lines,words,chars',
      mask: 'lines',
      linesClass: 'line',
      wordsClass: 'word',
      charsClass: 'char',
      tag: 'span',
      autoSplit: true,
      aria: 'auto',
      onSplit(self) {
        gsap.set(el, { visibility: 'visible' });
        return gsap.from(self.chars, {
          yPercent: 90,
          rotationX: -95,
          z: -40,
          transformPerspective: 520,
          transformOrigin: '50% 100%',
          opacity: 0,
          duration: 1.35,
          ease: 'expo.out',
          stagger: 0.018,
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          onComplete: () => requestAnimationFrame(() => split?.revert()),
        });
      },
    });
  });

  // paragraphs: line by line
  $$('[data-lines]').forEach((el) => {
    let split = null;
    split = SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'line',
      tag: 'span',
      autoSplit: true,
      aria: 'none',
      onSplit(self) {
        gsap.set(el, { visibility: 'visible' });
        return gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.085,
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onComplete: () => requestAnimationFrame(() => split?.revert()),
        });
      },
    });
  });

  $$('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 44, rotationX: -22, transformPerspective: 1200, transformOrigin: '50% 0%' }, {
      autoAlpha: 1, y: 0, rotationX: 0, duration: 1.35, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  // groups: each child flips up off the floor, one after another
  $$('[data-stagger]').forEach((el) => {
    gsap.fromTo(el.children, {
      autoAlpha: 0, y: 40, z: -120, rotationX: -62, transformPerspective: 1000, transformOrigin: '50% 100%',
    }, {
      autoAlpha: 1, y: 0, z: 0, rotationX: 0, duration: 1.3, ease: 'expo.out', stagger: 0.085,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

/* --------------------------------------------------------------------------
   Perspective scroll — blocks curve up from below and tip away at the top,
   as if the page were wrapped around a slowly turning drum. Flat mid-screen.
   -------------------------------------------------------------------------- */
function setupDrum() {
  if (reduced) return;
  const items = $$('[data-drum]').map((el) => ({ el, top: 0, h: 0, amp: 1, flat: false }));
  if (!items.length) return;
  const MAX = small ? 9 : 15; // degrees at the viewport edges
  let vh = window.innerHeight;
  let maxScroll = 0;

  const render = () => {
    const y = window.scrollY;
    for (const it of items) {
      const c = it.top + it.h * 0.5 - y; // centre in viewport px
      if (c < -it.h || c > vh + it.h) continue;
      // blocks near the end of the page may never reach mid-screen:
      // make sure they land flat by the time the scroll bottoms out
      const flat = Math.min(vh * 0.62, it.top + it.h * 0.5 - maxScroll);
      const eIn = smoothstep(flat, Math.max(flat + 1, vh + it.h * 0.5), c);
      const eOut = smoothstep(vh * 0.3, -it.h * 0.5, c);
      if (eIn + eOut < 0.001) {
        if (!it.flat) {
          it.el.style.transform = '';
          it.el.style.opacity = '';
          it.flat = true;
        }
        continue;
      }
      it.flat = false;
      const k = it.amp;
      const rx = (eOut - eIn) * MAX * k;
      const z = -(eIn + eOut) * 170 * k;
      const ty = (eIn * 48 - eOut * 24) * k;
      it.el.style.transform = `perspective(1200px) translate3d(0, ${ty.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg)`;
      it.el.style.opacity = (1 - (eIn * 0.3 + eOut * 0.45) * k).toFixed(3);
    }
  };

  // positions are read with the transforms off, whenever the layout settles
  const measure = () => {
    vh = window.innerHeight;
    const y = window.scrollY;
    for (const it of items) it.el.style.transform = '';
    for (const it of items) {
      const r = it.el.getBoundingClientRect();
      it.top = r.top + y;
      it.h = r.height;
      it.amp = clamp(1.25 - it.h / vh, 0.35, 1); // tall blocks tilt less
      it.flat = false;
    }
    maxScroll = ScrollTrigger.maxScroll(window);
    render();
  };
  ScrollTrigger.addEventListener('refreshInit', () => {
    for (const it of items) it.el.style.transform = '';
  });
  ScrollTrigger.addEventListener('refresh', measure);
  measure();
  gsap.ticker.add(render);
}

function setupManifesto() {
  const el = $('[data-scrub-words]');
  if (!el || reduced) return;
  const split = SplitText.create(el, { type: 'words', wordsClass: 'word', aria: 'none' });
  gsap.fromTo(split.words, { opacity: 0.13 }, {
    opacity: 1,
    ease: 'none',
    stagger: 0.1,
    scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 52%', scrub: 0.6 },
  });
}

function setupCounters() {
  if (reduced) return;
  $$('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const obj = { v: 0 };
    el.textContent = '0';
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => gsap.to(obj, {
        v: target,
        duration: 1.8,
        ease: 'power3.out',
        onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
      }),
    });
  });
}

/* --------------------------------------------------------------------------
   Tapes — marquee that reacts to scroll speed and direction
   -------------------------------------------------------------------------- */
function setupTapes(lenis) {
  const tapes = $$('.tape');
  if (!tapes.length || reduced) return;

  const items = tapes.map((tape) => {
    const track = $('.tape__track', tape);
    const unitCount = track.children.length;
    const unitHTML = track.innerHTML;
    const it = { tape, track, unitCount, dir: Number(tape.dataset.tape) || 1, unit: 1, x: 0, visible: false };
    const fill = () => {
      // at least two copies so the loop can wrap by exactly one unit
      while (track.children.length < unitCount * 2 || track.offsetWidth < tape.offsetWidth * 2 + 200) {
        track.insertAdjacentHTML('beforeend', unitHTML);
      }
      it.unit = track.children[unitCount].offsetLeft - track.children[0].offsetLeft;
    };
    fill();
    new ResizeObserver(fill).observe(tape);
    new IntersectionObserver(([e]) => { it.visible = e.isIntersecting; }).observe(tape);
    return it;
  });

  // the two ribbons twist through depth as they cross the screen
  const twist = (el, from, to) => gsap.fromTo(el, { x: 0, y: 0, yPercent: -50, transformPerspective: 1000, ...from }, {
    x: 0, y: 0, yPercent: -50, ...to,
    ease: 'none',
    scrollTrigger: { trigger: '.tapes', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  twist($('.tape--a'), { rotation: -7, rotationX: 38 }, { rotation: -1.5, rotationX: -34 });
  twist($('.tape--b'), { rotation: 6.5, rotationX: -32 }, { rotation: 1, rotationX: 36 });

  let direction = 1;
  let boost = 0;
  let skew = 0;
  gsap.ticker.add((time, dt) => {
    const v = lenis ? lenis.velocity : 0;
    if (Math.abs(v) > 0.2) direction = Math.sign(v);
    boost += (Math.min(Math.abs(v), 90) * 0.16 - boost) * 0.1;
    skew += (clamp(-v * 0.12, -9, 9) - skew) * 0.12;
    const step = (dt / 16.67) * (1 + boost);
    for (const it of items) {
      if (!it.visible) continue;
      it.x -= step * it.dir * direction;
      if (it.x <= -it.unit) it.x += it.unit;
      else if (it.x > 0) it.x -= it.unit;
      it.track.style.transform = `translate3d(${it.x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`;
    }
  });
}

/* --------------------------------------------------------------------------
   Holographic portrait card
   -------------------------------------------------------------------------- */
function setupHolo() {
  const holo = $('[data-tilt]');
  if (!holo || reduced) return;
  const card = $('.holo__card', holo);
  const cur = { rx: 0, ry: 0, mx: 0, my: 0 };
  const tgt = { rx: 0, ry: 0, mx: 0, my: 0 };
  let hovering = false;
  let visible = false;
  let scrollTurn = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(holo);

  if (finePointer) {
    holo.addEventListener('pointermove', (e) => {
      const r = holo.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      hovering = true;
      tgt.ry = x * 15;
      tgt.rx = -y * 12;
      tgt.mx = x;
      tgt.my = y;
    });
    holo.addEventListener('pointerleave', () => { hovering = false; });
  }

  gsap.ticker.add((time) => {
    if (!visible) return;
    if (!hovering) {
      tgt.ry = Math.sin(time * 0.55) * 7;
      tgt.rx = Math.cos(time * 0.45) * 4;
      tgt.mx = Math.sin(time * 0.55) * 0.5;
      tgt.my = Math.cos(time * 0.45) * 0.35;
    }
    for (const k in cur) cur[k] += (tgt[k] - cur[k]) * 0.075;
    // the card also turns as it travels up the screen
    const r = holo.getBoundingClientRect();
    const sp = clamp((r.top + r.height * 0.5 - window.innerHeight * 0.5) / window.innerHeight, -1, 1);
    scrollTurn += (sp - scrollTurn) * 0.1;
    card.style.setProperty('--rx', `${(cur.rx + scrollTurn * 9).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cur.ry - scrollTurn * 16).toFixed(2)}deg`);
    card.style.setProperty('--mx', cur.mx.toFixed(3));
    card.style.setProperty('--my', cur.my.toFixed(3));
    card.style.setProperty('--gx', `${(50 + cur.mx * 45).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(30 + cur.my * 45).toFixed(1)}%`);
  });
}

/* --------------------------------------------------------------------------
   Skill cards — tilt toward the pointer, inner layers drift against it
   -------------------------------------------------------------------------- */
function setupTiltCards() {
  if (!finePointer || reduced) return;
  $$('[data-tilt-card]').forEach((card) => {
    gsap.set(card, { transformPerspective: 900 });
    const toX = gsap.quickTo(card, 'rotationX', { duration: 0.9, ease: 'power3.out' });
    const toY = gsap.quickTo(card, 'rotationY', { duration: 0.9, ease: 'power3.out' });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = ((e.clientY - r.top) / r.height) * 2 - 1;
      toX(-y * 10);
      toY(x * 12);
      card.style.setProperty('--px', x.toFixed(3));
      card.style.setProperty('--py', y.toFixed(3));
    });
    card.addEventListener('pointerleave', () => {
      toX(0);
      toY(0);
      card.style.setProperty('--px', '0');
      card.style.setProperty('--py', '0');
    });
  });
}

/* --------------------------------------------------------------------------
   Skills sphere
   -------------------------------------------------------------------------- */
function setupSphere() {
  const el = $('.sphere');
  if (!el) return null;
  const sphere = createTagSphere(el, { reduced });
  gsap.ticker.add((time, dt) => sphere.tick(dt));
  return sphere;
}

/* --------------------------------------------------------------------------
   Work — pinned 3D carousel driven by scroll (desktop), swipe strip (mobile)
   -------------------------------------------------------------------------- */
function setupWork(lenis) {
  const feature = $('.feature');
  const stage = $('.feature__stage');
  const carousel = $('.carousel');
  const phones = $$('.phone');
  const items = $$('.screens__item');
  const counter = $('.feature__current');
  if (!feature || !carousel || !phones.length) return;
  const n = phones.length;

  const setActive = (a) => {
    items.forEach((it, k) => it.classList.toggle('is-active', k === a));
    if (counter) counter.textContent = String(a + 1).padStart(2, '0');
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 1024px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)', () => {
    const STEP = 34;
    let radius = 0;
    let target = 0;
    let shown = 0;
    let active = -1;
    let inView = false;
    let lean = 0;

    // switch the static row of phones into the 3D carousel
    feature.classList.add('is-3d');

    const layout = () => {
      radius = carousel.offsetWidth * 2.05;
      phones.forEach((p, i) => {
        p.style.transform = `rotateY(${i * STEP}deg) translateZ(${radius}px)`;
      });
    };
    layout();

    ScrollTrigger.create({
      trigger: feature,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * (n - 1) * 0.85)}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefresh: layout,
      onUpdate: (self) => {
        const s = self.progress * (n - 1);
        const i = Math.min(n - 2, Math.floor(s));
        target = i + smoothstep(0.18, 0.82, s - i);
      },
    });

    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; });
    io.observe(feature);

    gsap.fromTo(stage, { autoAlpha: 0, y: 120 }, {
      autoAlpha: 1, y: 0, duration: 1.6, ease: 'expo.out',
      scrollTrigger: { trigger: feature, start: 'top 80%', once: true },
    });

    const tick = () => {
      if (!inView && Math.abs(target - shown) < 0.0005) return;
      shown += (target - shown) * 0.1;
      // the ring leans back into fast scrolls and settles when they stop
      lean += (clamp((lenis ? lenis.velocity : 0) * 0.12, -7, 7) - lean) * 0.08;
      carousel.style.transform =
        `rotateX(${lean.toFixed(2)}deg) translateZ(${-radius}px) rotateY(${(-shown * STEP).toFixed(3)}deg)`;
      phones.forEach((p, i) => {
        const d = Math.abs(i - shown);
        p.style.opacity = clamp(1.3 - d * 0.55, 0, 1).toFixed(3);
        p.style.setProperty('--dim', Math.min(0.7, d * 0.5).toFixed(3));
      });
      const a = Math.round(shown);
      if (a !== active) {
        active = a;
        setActive(a);
      }
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      io.disconnect();
      feature.classList.remove('is-3d');
      carousel.style.transform = '';
      phones.forEach((p) => {
        p.style.transform = '';
        p.style.opacity = '';
        p.style.removeProperty('--dim');
      });
    };
  });
}

/* --------------------------------------------------------------------------
   Header, menu, anchors, nav state
   -------------------------------------------------------------------------- */
function setupHeader(lenis) {
  const header = $('.header');
  if (!header) return;
  let last = 0;
  const onScroll = (y) => {
    header.classList.toggle('is-scrolled', y > 30);
    if (Math.abs(y - last) < 3) return;
    const hide = y > last && y > 240 && !root.classList.contains('menu-open');
    header.classList.toggle('is-hidden', hide);
    last = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
}

function setupMenu(lenis) {
  const btn = $('.menu-btn');
  const menu = $('#menu');
  if (!btn || !menu) return () => {};
  const label = $('.menu-btn__label', btn);
  const set = (open) => {
    if (open === root.classList.contains('menu-open')) return;
    root.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close' : 'Menu';
    if (lenis) {
      open ? lenis.stop() : lenis.start();
    } else {
      document.body.style.overflow = open ? 'hidden' : '';
    }
    $('.header')?.classList.remove('is-hidden');
  };
  btn.addEventListener('click', () => set(!root.classList.contains('menu-open')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('menu-open')) {
      set(false);
      btn.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) set(false);
  });
  return set;
}

function setupAnchors(lenis, setMenu) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const hash = a.getAttribute('href');
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) return;
    e.preventDefault();
    const wasOpen = root.classList.contains('menu-open');
    setMenu(false);
    const go = () => {
      if (lenis) lenis.scrollTo(target, { duration: 1.7, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    };
    wasOpen ? setTimeout(go, 420) : go();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

function setupNavState() {
  $$('.nav-link').forEach((link) => {
    const section = document.getElementById(link.getAttribute('href').slice(1));
    if (!section) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => link.classList.toggle('is-active', self.isActive),
    });
  });
}

function setupProgress() {
  const bar = $('.progress span');
  if (!bar) return;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => { bar.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
  });
}

/* --------------------------------------------------------------------------
   Small interactions
   -------------------------------------------------------------------------- */
function setupRolls() {
  $$('.roll').forEach((el) => {
    const text = el.textContent;
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.className = 'roll__a';
    b.className = 'roll__b';
    a.textContent = text;
    b.textContent = text;
    b.setAttribute('aria-hidden', 'true');
    el.replaceChildren(a, b);
  });
}

function setupClock() {
  const els = $$('[data-clock]');
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const tick = () => {
    const s = `${fmt.format(new Date())} IST`;
    els.forEach((el) => { el.textContent = s; });
  };
  tick();
  setInterval(tick, 1000);
}

function setupCursor() {
  if (!finePointer || reduced) return;
  const cursor = $('.cursor');
  if (!cursor) return;
  const dot = $('.cursor__dot', cursor);
  const ring = $('.cursor__ring', cursor);
  const label = $('.cursor__label', cursor);
  let x = -100;
  let y = -100;
  let rx = -100;
  let ry = -100;
  let started = false;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (!started) {
      started = true;
      rx = x;
      ry = y;
      root.classList.add('has-cursor');
    }
    cursor.classList.remove('is-hidden');
  }, { passive: true });
  window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) cursor.classList.add('is-hidden');
  });

  gsap.ticker.add(() => {
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
  });

  const labels = { drag: 'Drag', view: 'Scroll' };
  document.addEventListener('pointerover', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const zone = t?.closest('[data-cursor]');
    const link = t?.closest('a, button, .traits li');
    const text = zone ? labels[zone.dataset.cursor] || '' : '';
    cursor.classList.toggle('is-label', !!text);
    cursor.classList.toggle('is-link', !text && !!link);
    label.textContent = text;
  });
}

function setupMagnetic() {
  if (!finePointer || reduced) return;
  $$('[data-magnetic]').forEach((el) => {
    const strength = el.classList.contains('btn--sm') ? 0.28 : 0.36;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'elastic.out(1, 0.35)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'elastic.out(1, 0.35)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - gsap.getProperty(el, 'x');
      const cy = r.top + r.height / 2 - gsap.getProperty(el, 'y');
      xTo((e.clientX - cx) * strength);
      yTo((e.clientY - cy) * strength);
    });
    el.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  });
}

function setupSpotlight() {
  if (!finePointer) return;
  $$('[data-spotlight]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

function setupCopy() {
  $$('[data-copy]').forEach((btn) => {
    const label = $('.mail__copy-label', btn);
    let timer = 0;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (__) { ok = false; }
        ta.remove();
      }
      if (!ok) {
        window.location.href = `mailto:${text}`;
        return;
      }
      btn.classList.add('is-copied');
      if (label) label.textContent = 'Copied';
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.classList.remove('is-copied');
        if (label) label.textContent = 'Copy';
      }, 2200);
    });
  });
}

function setupYear() {
  const year = String(new Date().getFullYear());
  $$('[data-year]').forEach((el) => { el.textContent = year; });
}

function setupFooter() {
  const mark = $('.footer__mark');
  if (!mark) return;
  if (finePointer) {
    mark.addEventListener('pointermove', (e) => {
      const r = mark.getBoundingClientRect();
      mark.style.setProperty('--x', `${e.clientX - r.left}px`);
      mark.style.setProperty('--y', `${e.clientY - r.top}px`);
    });
    mark.addEventListener('pointerleave', () => {
      mark.style.setProperty('--x', '-500px');
      mark.style.setProperty('--y', '-500px');
    });
  }
  if (reduced) return;
  gsap.from($$('span', mark), {
    yPercent: 100,
    rotationX: -80,
    transformPerspective: 900,
    transformOrigin: '50% 100%',
    duration: 1.5,
    ease: 'expo.out',
    stagger: 0.12,
    clearProps: 'transform',
    scrollTrigger: { trigger: '.footer', start: 'top 92%', once: true },
  });
}
