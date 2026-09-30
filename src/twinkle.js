/**
 * A quiet shimmer: now and then a random cell brightens a little and eases back. This is only the
 * timing; what a cell is and how it is lit belong to whoever asked. `pick()` names a cell to light
 * (or -1 for none right now) and `paint(id, amount)` draws it lit by `amount`: 0 is plain, 1 is a good glint,
 * and now and then a flare goes past 1 to about 1.5.
 *
 * @param {{pick: () => number, paint: (id: number, amount: number) => void, rate: () => number, life?: [number, number]}} hooks
 *        `rate()` is how many cells to start each second; `life` is how long, in ms, one stays lit (shortest, longest)
 */
const FLARE = 0.15; // the share of twinkles that catch the light harder than the rest

export function createTwinkle({ pick, paint, rate, life = [1000, 1700] }) {
  const active = new Map(); // id -> { t0, ms }
  let spawning = false, raf = 0, last = 0;

  // Up fast, then a long soft settle back.
  const envelope = (u) => (u < 0.18 ? u / 0.18 : (1 - (u - 0.18) / 0.82) ** 2);

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (spawning && Math.random() < rate() * dt) {
      const id = pick();
      if (id >= 0 && !active.has(id)) active.set(id, { t0: now, ms: life[0] + Math.random() * (life[1] - life[0]), peak: Math.random() < FLARE ? 1.5 : 1 });
    }
    for (const [id, a] of active) {
      const u = (now - a.t0) / a.ms;
      if (u >= 1) { active.delete(id); paint(id, 0); } else paint(id, envelope(u) * a.peak);
    }
    raf = spawning || active.size ? requestAnimationFrame(tick) : 0;
  }

  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  return {
    /** Begin lighting cells. */
    start() { spawning = true; run(); },
    /** Light no new cells; the ones already lit finish fading. */
    stop() { spawning = false; },
    /** Stop at once and put every lit cell back to plain. */
    halt() {
      spawning = false;
      cancelAnimationFrame(raf);
      raf = 0;
      for (const id of active.keys()) paint(id, 0);
      active.clear();
    },
  };
}
