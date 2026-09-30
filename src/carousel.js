import { EASE, slideOut } from './anim.js';

const icon = (name) => `<span class="icon icon--${name}"></span>`;

/**
 * Horizontal card track. The focused card is locked to the viewport center; the rest
 * sit either side. The blank "+" card is always last. Focus moves by setting --i on the
 * track and letting CSS transition the transform.
 * @param {HTMLElement} track
 * @param {() => void} onFocus called whenever focus moves, so cards can redraw as centered or not
 */
export function createCarousel(track, onFocus = () => {}) {
  const add = document.createElement('div');
  add.className = 'card add';
  add.innerHTML = icon('new');
  track.append(add);

  let index = 0;
  let ready = false; // the first focus is setup, before anyone is listening
  const cards = () => [...track.children];
  const focus = (i, instant = false) => {
    index = Math.max(0, Math.min(cards().length - 1, i));
    if (instant) track.classList.add('instant');
    track.style.setProperty('--i', index);
    cards().forEach((c, k) => c.classList.toggle('focus', k === index));
    if (instant) { track.getBoundingClientRect(); track.classList.remove('instant'); }
    if (ready) onFocus();
  };
  focus(0, true);
  ready = true;

  return {
    add,
    focus,
    get index() { return index; },
    get focused() { return cards()[index]; },
    /** Insert a hidden palette card just before "+" and focus it; the caller paints and reveals it. */
    insert(palette) {
      const card = document.createElement('div');
      card.className = 'card palette';
      card.innerHTML = `<canvas></canvas><canvas class="twinkle"></canvas><input class="name" name="title" maxlength="12" spellcheck="false" autocomplete="off" aria-label="Title"><button class="rm" aria-label="Delete palette">${icon('remove')}</button><button class="dl" aria-label="Export palette">${icon('export')}</button>`;
      card.palette = palette;
      card.style.visibility = 'hidden';
      track.insertBefore(card, add);
      focus(cards().indexOf(card));
      return card;
    },
    /** Slides the card out (up, or left with `axis` 'X'), then glides the rest into the gap without moving what the viewer is looking at. */
    async remove(card, axis) {
      if (card.leaving) return;
      card.leaving = true;
      await slideOut(card, () => {
        const before = new Map(cards().map((c) => [c, c.getBoundingClientRect()]));
        const at = cards().indexOf(card);
        card.remove();
        focus(at < index ? index - 1 : index, true);
        // FLIP: the DOM has already jumped, so play each card from where it stood to where it is now.
        cards().forEach((c) => {
          const [was, now] = [before.get(c), c.getBoundingClientRect()];
          const [dx, dy] = [was.left - now.left, was.top - now.top];
          if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 400, easing: EASE });
        });
      }, axis);
    },
    /** Move the `from`th palette card to sit at palette position `to`, then glide to it. */
    move(from, to) {
      const list = [...track.querySelectorAll('.card.palette')];
      const [card, ref] = [list[from], list[to]];
      if (to > from) ref.after(card); else ref.before(card);
      focus(cards().indexOf(card));
    },
  };
}
