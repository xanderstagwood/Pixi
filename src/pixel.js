// The whole UI is drawn on a grid of "font pixels": one pixel of the Stagwood Sprite 64
// font, which is 1/16 of its size. That font is only crisp at a whole multiple of 16
// device pixels (see sprite/src/pixel-snap.js), so the body size snaps to that, and one
// font pixel is then a whole number `n` of device pixels. Every length in style.css is a
// multiple of --px, so every edge lands on a device pixel whatever the display's ratio.
const BASE = 16;
const CELL = 16;

/** dpr: device px per CSS px; n: device px per font pixel; css: CSS px per font pixel. */
export function unit() {
  const dpr = window.devicePixelRatio || 1;
  const n = Math.max(1, Math.round((BASE * dpr) / CELL));
  return { dpr, n, css: n / dpr };
}

/** Viewport centre in CSS px, on a whole device pixel (half of an odd width is a half pixel). */
export function center() {
  const { dpr } = unit();
  const root = document.documentElement;
  return { x: Math.round((root.clientWidth * dpr) / 2) / dpr, y: Math.round((root.clientHeight * dpr) / 2) / dpr };
}

function apply() {
  const root = document.documentElement;
  const c = center();
  root.style.setProperty('--px', `${unit().css}px`);
  root.style.setProperty('--cx', `${c.x}px`);
  root.style.setProperty('--cy', `${c.y}px`);
}

/** Applies the snap now and again on resize, browser zoom or a move between monitors. */
export function watchPixelSnap(onChange = () => {}) {
  const run = () => { apply(); onChange(); };
  run();
  addEventListener('resize', run);
  const listen = () =>
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { run(); listen(); }, { once: true });
  listen();
}
