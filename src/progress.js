import { frames } from './anim.js';
import { unit } from './pixel.js';

/**
 * The loading bar along the bottom edge. `to(p, ms)` eases the fill to fraction `p` over `ms`
 * and never goes backwards; `reset()` empties it. Its width is kept on whole device pixels.
 * @param {HTMLElement} el
 */
export function createProgress(el) {
  let shown = 0; // what is painted
  let target = 0; // where the latest `to` is heading
  let run = 0; // the tween in charge; a newer one takes over from it

  const paint = (p) => {
    const { dpr } = unit();
    const wide = Math.round(document.documentElement.clientWidth * dpr);
    shown = p;
    el.style.width = `${Math.round(p * wide) / dpr}px`;
  };

  return {
    reset() { run++; target = 0; paint(0); },
    to(p, ms = 0) {
      target = Math.max(target, Math.min(1, p));
      const from = shown, goal = target, id = ++run;
      if (!ms) { paint(goal); return Promise.resolve(); }
      return frames((t) => {
        if (id !== run) return true;
        paint(from + (goal - from) * Math.min(1, t / ms));
        return t >= ms;
      });
    },
    /** The viewport changed: repaint at the same fraction. */
    refit() { paint(shown); },
  };
}
