# 幽霊駅 — YŪREI STATION

An award-style promo site for a **fictional** animated feature film. Built as a portfolio
piece to show a different register from product/marketing work: cinematic narrative,
anime art direction, real-time 3D, and scroll-driven storytelling.

**The premise:** every night at 23:47 a train that is on no timetable stops at a station
on no map. A schoolgirl boards the last carriage and rides, one way, toward the final gate.

## Highlights

- **Real-time WebGL hero** — a procedural corridor of vermilion *torii* gates the camera
  flies through on scroll, led by a cel-shaded 3D *kitsune* mask that drifts ahead like a
  spirit. Instanced geometry, custom toon + fresnel shading, additive ember particles, and
  a bloom pass (Three.js `EffectComposer`).
- **Buttery scroll** — Lenis smooth scroll wired into GSAP's ticker; every scene beat is a
  single scrubbed timeline so the 3D flythrough tracks the scrollbar exactly.
- **Pinned horizontal "Passage"** — three anime keyframes scrubbed sideways with
  counter-parallax inside each frame.
- **Z-axis cast cards** — pointer-reactive 3D tilt with a spirit-glow spotlight.
- **Cinematic details** — a curtain loader, film grain, a marquee that skews with scroll
  velocity, a die-cut ticket CTA with a rotating seal, and a film-reel trailer frame.
- **Accessible & resilient** — full `prefers-reduced-motion` path, a WebGL fallback if the
  mask mesh fails to load, and an intro that self-completes even in a backgrounded tab.

## Art direction

Ink-black + washi-bone with a single vermilion accent and spirit-cyan glow. Display type
is **Shippori Mincho B1** (a Japanese serif); UI is **Zen Kaku Gothic New**.

## Assets

All imagery, the trailer, and the 3D mask were generated for demonstration via the
Higgsfield AI pipeline (Nano Banana Pro stills, image-to-3D mesh, Kling image-to-video),
then optimized locally (WebP, H.264). The film, studio, and credits are invented.

## Stack

Vanilla HTML/CSS/JS (ES modules) · [Three.js](https://threejs.org) ·
[GSAP ScrollTrigger](https://gsap.com) · [Lenis](https://lenis.darkroom.engineering) —
no build step.

## Run locally

```bash
python -m http.server 8091
# open http://localhost:8091
```

Any static file server works; the page uses native ES-module imports and CDN-hosted libs.

---

Design & build — **Mohamed Abdulhady**. Artwork AI-generated for a fictional film; not
affiliated with any studio or distributor.
