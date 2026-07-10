import { createScene } from './scene.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ═══════════════ text splitting ═══════════════ */
function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  const out = [];
  for (const ch of text) {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(span);
    out.push(span);
  }
  return out;
}

function splitWords(el) {
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  const inners = [];
  words.forEach((w, i) => {
    const outer = document.createElement('span');
    outer.className = 'word';
    const inner = document.createElement('i');
    inner.textContent = w;
    outer.appendChild(inner);
    el.appendChild(outer);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    inners.push(inner);
  });
  return inners;
}

/* ═══════════════ smooth scroll ═══════════════ */
let lenis = null;
if (!REDUCED) {
  lenis = new Lenis({ autoRaf: false, lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  lenis.stop();
}

/* ═══════════════ WebGL ═══════════════ */
const canvas = $('#gl');
const scene = createScene(canvas, { reducedMotion: REDUCED });
scene.resize();

gsap.ticker.add(time => {
  lenis?.raf(time * 1000);
  scene.render(time);
});
gsap.ticker.lagSmoothing(0);

window.addEventListener('resize', () => {
  scene.resize();
  ScrollTrigger.refresh();
}, { passive: true });

/* pointer parallax */
if (!REDUCED) {
  window.addEventListener('pointermove', e => {
    scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
}

/* ═══════════════ global scroll progress ═══════════════ */
const railFill = $('#railFill');
const railPct  = $('#railPct');
let introDone = false;

ScrollTrigger.create({
  start: 0,
  end: 'max',
  onUpdate: self => {
    // while the loader locks body height there is nothing to scroll, and ScrollTrigger
    // hands back 0/0 — never let that reach the camera
    const p = Number.isFinite(self.progress) ? self.progress : 0;
    scene.setProgress(p);
    railFill.style.width = (p * 100).toFixed(2) + '%';
    railPct.textContent = String(Math.round(p * 100)).padStart(2, '0');
    // hand the stage back to the DOM once the corridor has done its work
    if (introDone) {
      canvas.style.opacity = String(1 - Math.min(Math.max((p - 0.62) / 0.18, 0), 1) * 0.7);
    }
  },
});

/* ═══════════════ loader ═══════════════ */
const loaderEl    = $('#loader');
const loaderFill  = $('#loaderFill');
const loaderCount = $('#loaderCount');

document.body.classList.add('is-loading');

function preloadImages(srcs) {
  return srcs.map(src => new Promise(res => {
    const img = new Image();
    img.onload = img.onerror = () => res();
    img.src = src;
  }));
}

const IMAGES = [
  'assets/img/kf_platform.webp',
  'assets/img/kf_paddies.webp',
  'assets/img/kf_torii.webp',
  'assets/img/char_hana.webp',
  'assets/img/char_conductor.webp',
  'assets/img/char_kitsune.webp',
];

async function boot() {
  const counter = { v: 0 };
  const jobs = [...preloadImages(IMAGES), scene.load(), document.fonts?.ready ?? Promise.resolve()];
  const total = jobs.length;
  let done = 0;

  jobs.forEach(p => p.then(() => {
    done++;
    gsap.to(counter, {
      v: (done / total) * 100, duration: 0.7, ease: 'power2.out',
      onUpdate: () => {
        loaderCount.textContent = String(Math.floor(counter.v)).padStart(2, '0');
        loaderFill.style.width = counter.v + '%';
      },
    });
  }));

  await Promise.all([...jobs, new Promise(r => setTimeout(r, 1500))]);

  loaderCount.textContent = '100';
  loaderFill.style.width = '100%';
  outro();
}

let cleanedUp = false;
function finishIntro() {
  if (cleanedUp) return;
  cleanedUp = true;
  loaderEl?.remove();
  document.body.classList.remove('is-loading');
  lenis?.start();
  ScrollTrigger.refresh();
  scene.syncProgress(0);
  introDone = true;
}

function outro() {
  loaderEl.classList.add('is-done');
  scene.syncProgress(0);

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finishIntro });

  tl.to(canvas, { opacity: 1, duration: 1.6, ease: 'power2.out' }, 1.7)
    .to('.loader__mark span', { opacity: 1, y: 0, duration: 0.9, stagger: 0.09 }, 0)
    .to('.loader__inner', { opacity: 0, y: -24, duration: 0.7, ease: 'power2.in' }, 1.5)
    .to('[data-curtain]', { yPercent: -101, duration: 1.25, stagger: 0.075 }, 1.8)
    .add(heroInTimeline(), 2.35);

  // The intro plays on GSAP's rAF ticker, which browsers pause in hidden/background
  // tabs — a page opened in a new tab would otherwise sit on the loader forever.
  // Snap the whole thing to its end state if it hasn't finished on a wall-clock deadline,
  // and again the moment the tab becomes visible. progress(1) applies end state
  // synchronously (no ticker needed) and fires onComplete → finishIntro.
  const failsafe = setTimeout(() => { if (!cleanedUp) tl.progress(1); }, 6500);
  const onShow = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', onShow);
    clearTimeout(failsafe);
    if (!cleanedUp) tl.progress(1);
  };
  if (document.hidden) document.addEventListener('visibilitychange', onShow);
}

/* ═══════════════ hero entrance ═══════════════ */
function heroInTimeline() {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });

  $$('.hero__title-row').forEach((row, i) => {
    const chars = splitChars(row);
    tl.from(chars, { yPercent: 118, duration: 1.35, stagger: 0.035 }, i * 0.12);
  });

  tl.from(splitChars($('.hero__eyebrow')), { opacity: 0, duration: 0.8, stagger: 0.012 }, 0.15)
    .from('.hero__tag',       { opacity: 0, y: 26, duration: 1.1 }, 0.75)
    .from('.hero__meta-col',  { opacity: 0, y: 26, duration: 1.1, stagger: 0.09 }, 0.9)
    .from('.hero__vert-line', { yPercent: -100, duration: 1.4 }, 0.5)
    .from('.chrome > *',      { opacity: 0, y: -18, duration: 1, stagger: 0.08 }, 0.4)
    .from('.rail',            { opacity: 0, duration: 1 }, 1)
    .from('.hero__cue',       { opacity: 0, duration: 1 }, 1.1)
    .fromTo('.hero__ghost',   { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: 2.2 }, 0);

  return tl;
}

// hero content drifts away as you leave — independent of the intro timeline
gsap.to('.hero__body', {
  yPercent: -22, opacity: 0, ease: 'none',
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
});

/* ═══════════════ reveals ═══════════════ */
function initReveals() {
  $$('[data-reveal]').forEach(el => {
    gsap.to(el, {
      opacity: 1, y: 0, duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  $$('[data-split="words"]').forEach(el => {
    const inners = splitWords(el);
    gsap.from(inners, {
      yPercent: 110, duration: 1.15, ease: 'expo.out', stagger: 0.018,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  $$('.cast__title[data-split="chars"]').forEach(el => {
    const chars = splitChars(el);
    gsap.from(chars, {
      yPercent: 100, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
}

/* ═══════════════ passage: pinned horizontal scrub ═══════════════ */
function initPassage() {
  const section = $('#passage');
  const track   = $('#passageTrack');
  if (!section || !track) return;

  const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

  gsap.to(track, {
    x: () => -distance(),
    ease: 'none',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + (distance() + window.innerHeight * 0.4),
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      anticipatePin: 1,
    },
  });

  // counter-parallax inside each frame, driven by the same scroll
  $$('.plate__frame img').forEach(img => {
    gsap.fromTo(img, { xPercent: -6 }, {
      xPercent: 6, ease: 'none',
      scrollTrigger: {
        trigger: img.closest('.plate'),
        containerAnimation: gsap.getTweensOf(track)[0],
        start: 'left right',
        end: 'right left',
        scrub: true,
      },
    });
  });

  $$('.plate__cap, .plate--quote blockquote').forEach(cap => {
    gsap.from(cap, {
      opacity: 0, y: 40, duration: 1,
      scrollTrigger: {
        trigger: cap,
        containerAnimation: gsap.getTweensOf(track)[0],
        start: 'left 82%',
      },
    });
  });
}

/* ═══════════════ cast: z-axis tilt cards ═══════════════ */
function initCards() {
  const deck = $('#castDeck');
  if (!deck) return;

  const cards = $$('[data-card]', deck).map(card => ({
    el: card,
    inner: $('.card__inner', card),
    glow: $('.card__glow', card),
    rx: 0, ry: 0, trx: 0, try_: 0,
  }));

  // cards rise out of the page as the section enters
  cards.forEach((c, i) => {
    gsap.from(c.el, {
      opacity: 0, y: 90, rotateX: -18, duration: 1.3, ease: 'expo.out',
      scrollTrigger: { trigger: deck, start: 'top 78%' },
      delay: i * 0.12,
    });
  });

  if (REDUCED) return;

  deck.addEventListener('pointermove', e => {
    cards.forEach(c => {
      const r = c.el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      const near = Math.abs(nx) < 1.1 && Math.abs(ny) < 1.1;
      c.trx = near ? -ny * 13 : 0;
      c.try_ = near ? nx * 15 : 0;
      if (near) {
        c.glow.style.setProperty('--mx', (nx + 0.5) * 100 + '%');
        c.glow.style.setProperty('--my', (ny + 0.5) * 100 + '%');
      }
    });
  }, { passive: true });

  deck.addEventListener('pointerleave', () => cards.forEach(c => { c.trx = 0; c.try_ = 0; }));

  gsap.ticker.add(() => {
    cards.forEach(c => {
      c.rx += (c.trx - c.rx) * 0.09;
      c.ry += (c.try_ - c.ry) * 0.09;
      if (Math.abs(c.rx) < 0.005 && Math.abs(c.ry) < 0.005) return;
      c.inner.style.transform = `rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg) translateZ(0)`;
    });
  });
}

/* ═══════════════ ticker ═══════════════ */
function initTicker() {
  const track = $('#tickerTrack');
  const group = $('.ticker__group', track);
  if (!track || !group) return;

  const need = Math.ceil((window.innerWidth * 2) / group.offsetWidth) + 1;
  for (let i = 0; i < need; i++) track.appendChild(group.cloneNode(true));

  const w = group.offsetWidth;
  gsap.to(track, { x: -w, duration: w / 46, ease: 'none', repeat: -1 });

  // the marquee leans into the scroll direction
  if (!REDUCED) {
    let skew = 0;
    ScrollTrigger.create({
      onUpdate: self => {
        skew = gsap.utils.clamp(-14, 14, self.getVelocity() / -190);
        gsap.to(track, { skewX: skew, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      },
    });
  }
}

/* ═══════════════ trailer ═══════════════ */
function initTrailer() {
  const video = $('#reelVideo');
  const btn   = $('#reelPlay');
  if (!video) return;

  let manuallyPaused = false;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !manuallyPaused) video.play().catch(() => {});
      else video.pause();
    });
  }, { threshold: 0.35 });
  io.observe(video);

  const sync = () => {
    const playing = !video.paused;
    btn.setAttribute('aria-pressed', String(playing));
    $('.reel__sound-txt', btn).textContent = playing ? 'Pause' : 'Play';
  };
  video.addEventListener('play', sync);
  video.addEventListener('pause', sync);

  btn?.addEventListener('click', () => {
    if (video.paused) { manuallyPaused = false; video.play().catch(() => {}); }
    else { manuallyPaused = true; video.pause(); }
  });
}

/* ═══════════════ cursor ═══════════════ */
function initCursor() {
  if (REDUCED || matchMedia('(hover:none)').matches) return;
  const cur = $('#cursor');
  const pos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };

  window.addEventListener('pointermove', e => {
    pos.tx = e.clientX; pos.ty = e.clientY;
    cur.classList.add('on');
  }, { passive: true });

  gsap.ticker.add(() => {
    pos.x += (pos.tx - pos.x) * 0.18;
    pos.y += (pos.ty - pos.y) * 0.18;
    cur.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  });

  $$('a, button, [data-cursor="link"]').forEach(el => {
    el.addEventListener('pointerenter', () => cur.classList.add('hot'));
    el.addEventListener('pointerleave', () => cur.classList.remove('hot'));
  });
}

/* ═══════════════ anchors ═══════════════ */
function initAnchors() {
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(target, { offset: -20, duration: 1.6 })
            : target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/* ═══════════════ go ═══════════════ */
initReveals();
initPassage();
initCards();
initTicker();
initTrailer();
initCursor();
initAnchors();
boot();
