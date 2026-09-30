import { EASE_OUT } from './anim.js';
import { CHIP_W, textOffset } from './card.js';
import { inkFor } from './color.js';
import { unit } from './pixel.js';

const EMPTY = '#201F1E';
const SLIDE_MS = 220;

const chip = (hex, label = hex) => {
  const el = document.createElement('div');
  el.className = 'chip';
  el.style.setProperty('--c', hex);
  el.style.setProperty('--ink', inkFor(hex));
  el.textContent = label;
  // Centered by hand, on a whole device pixel, exactly as src/card.js draws it.
  const { n, dpr } = unit();
  el.style.paddingLeft = `${label ? textOffset(label, CHIP_W, n) / dpr : 0}px`;
  return el;
};

/**
 * A vertical stack of color slots. Slot 0 sits at the bottom
 * (column-reverse), so index order matches the palette array.
 * @returns {{el: HTMLElement, swapTo: (i: number, hex: string) => Promise<void>, lock: (i: number) => Promise<void>}}
 */
export function createStack(n = 7) {
  const el = document.createElement('div');
  el.className = 'stack';
  const slots = Array.from({ length: n }, () => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.append((slot.cur = chip(EMPTY, '')));
    el.append(slot);
    return slot;
  });

  /** Slide a new chip up into the slot, pushing the current one out the top. */
  async function swapTo(i, hex) {
    const slot = slots[i], prev = slot.cur, next = chip(hex);
    slot.append(next);
    slot.cur = next;
    const slide = (from, to) => [{ transform: `translateY(${from}%)` }, { transform: `translateY(${to}%)` }];
    const opts = { duration: SLIDE_MS, easing: EASE_OUT, fill: 'both' };
    next.animate(slide(100, 0), opts);
    await prev.animate(slide(0, -100), opts).finished;
    prev.remove();
  }

  /** A hard white frame that snaps off: the "locked in" beat. */
  async function lock(i) {
    const flash = document.createElement('div');
    flash.className = 'flash';
    slots[i].append(flash);
    await flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: 'steps(3)' }).finished;
    flash.remove();
  }

  return { el, swapTo, lock };
}
