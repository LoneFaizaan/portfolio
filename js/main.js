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
  gsap.set('[data-reveal], [data-stagger] > *, [data-hero-fade]', { autoAlpha: 1 });
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

  // ScrollTriggers are created in page order; the pinned work section goes first
  // so every trigger below it is measured with the pin spacing in place.
  safe('work', setupWork);
  const heroChars = safe('hero', prepareHero, revealAll) || [];
  safe('manifesto', setupManifesto);
  safe('reveals', setupReveals, revealAll);
  safe('counters', setupCounters);
  safe('tapes', () => setupTapes(lenis));
  safe('holo', setupHolo);
  const sphere = safe('sphere', setupSphere);
  safe('nav state', setupNavState);
  safe('footer', setupFooter);
  safe('progress', setupProgress);

  const scene = await withTimeout(scenePromise, 4000);
  if (scene) {
    safe('scene wiring', () => wireScene(scene, lenis, sphere));
  } else {
    // slow connection: don't hold the page, fade the world in whenever it arrives
    scenePromise.then((late) => {
      if (!late) return;
      safe('scene wiring', () => wireScene(late, lenis, sphere));
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

function wireScene(scene, lenis, sphere) {
  if (sphere) scene.setSphereMatrix(sphere.getMatrix);

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

  // parallax out: the two lines drift apart as the valley scrolls away
  gsap.timeline({
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  })
    .to('.hero__line--1', { yPercent: -70, ease: 'none' }, 0)
    .to('.hero__line--2', { yPercent: -28, ease: 'none' }, 0)
    .to('.hero__main', { opacity: 0, ease: 'power1.in' }, 0)
    .to('.hero__top, .hero__bottom', { opacity: 0, y: -60, ease: 'none' }, 0);

  return split.chars;
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
   Scroll reveals
   -------------------------------------------------------------------------- */
function setupReveals() {
  if (reduced) return;

  // headings: characters rise out of line masks, then the split is undone
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
          yPercent: 125,
          rotate: 8,
          duration: 1.25,
          ease: 'expo.out',
          stagger: 0.016,
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
    gsap.fromTo(el, { autoAlpha: 0, y: 44 }, {
      autoAlpha: 1, y: 0, duration: 1.35, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  $$('[data-stagger]').forEach((el) => {
    gsap.fromTo(el.children, { autoAlpha: 0, y: 38 }, {
      autoAlpha: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
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
    card.style.setProperty('--rx', `${cur.rx.toFixed(2)}deg`);
    card.style.setProperty('--ry', `${cur.ry.toFixed(2)}deg`);
    card.style.setProperty('--mx', cur.mx.toFixed(3));
    card.style.setProperty('--my', cur.my.toFixed(3));
    card.style.setProperty('--gx', `${(50 + cur.mx * 45).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(30 + cur.my * 45).toFixed(1)}%`);
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
function setupWork() {
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
      carousel.style.transform = `translateZ(${-radius}px) rotateY(${(-shown * STEP).toFixed(3)}deg)`;
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
    duration: 1.5,
    ease: 'expo.out',
    stagger: 0.12,
    clearProps: 'transform',
    scrollTrigger: { trigger: '.footer', start: 'top 92%', once: true },
  });
}
