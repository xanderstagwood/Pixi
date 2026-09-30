// GSAP's power3.inOut, as a CSS curve, so WAAPI and hand-rolled loops share one feel.
export const EASE = 'cubic-bezier(0.645, 0.045, 0.355, 1)';
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Calls fn(elapsedMs, now) each frame until it returns true. Resolves when done. */
export const frames = (fn) => new Promise((done) => {
  const t0 = performance.now();
  const tick = (now) => (fn(now - t0, now) === true ? done() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});

/** Steps an element out in a few hard frames; `done` runs on the frame it disappears. */
export async function stepOut(el, done, ms = 260) {
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'steps(4)', fill: 'forwards' });
  await a.finished;
  done();
  a.cancel();
}
