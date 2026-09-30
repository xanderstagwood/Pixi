// GSAP's power3.inOut, as a CSS curve, so WAAPI and hand-rolled loops share one feel.
export const EASE = 'cubic-bezier(0.645, 0.045, 0.355, 1)';
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const leaving = new Set(); // what is waiting on the tab being left
let watching = false;

/**
 * Settles with `promise`, or with nothing as soon as the tab is hidden (at once if it already is). A
 * background tab draws no frames, so its animations never finish and its timers crawl: whatever waits on
 * motion waits on this instead, and a hidden tab runs the work without the show.
 */
export const unlessAway = (promise) => new Promise((done, fail) => {
  if (document.hidden) { promise.catch(() => {}); return done(); }
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) leaving.forEach((stop) => stop()); });
  }
  leaving.add(done);
  promise.then(done, fail).finally(() => leaving.delete(done));
});

export const sleep = (ms) => unlessAway(new Promise((done) => setTimeout(done, ms)));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Calls fn(elapsedMs, now) each frame until it returns true. Resolves when done, or when the tab is left. */
export const frames = (fn) => {
  let raf = 0, live = true;
  const run = new Promise((done) => {
    const t0 = performance.now();
    const tick = (now) => { if (live) { if (fn(now - t0, now) === true) done(); else raf = requestAnimationFrame(tick); } };
    raf = requestAnimationFrame(tick);
  });
  // Cut short by a hidden tab, the loop must not wake up later and draw over whatever came next.
  return unlessAway(run).finally(() => { live = false; cancelAnimationFrame(raf); });
};

/** Steps an element out in a few hard frames; `done` runs on the frame it disappears. */
export async function stepOut(el, done, ms = 260) {
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'steps(4)', fill: 'forwards' });
  await a.finished;
  done();
  a.cancel();
}
