import { stepOut } from './anim.js';

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
      card.innerHTML = `<canvas></canvas><input class="name" name="title" maxlength="24" spellcheck="false" autocomplete="off" aria-label="Title"><button class="rm" aria-label="Delete palette">${icon('remove')}</button><button class="dl" aria-label="Export palette">${icon('export')}</button>`;
      card.palette = palette;
      card.style.visibility = 'hidden';
      track.insertBefore(card, add);
      focus(cards().indexOf(card));
      return card;
    },
    /** Steps the card out and closes the gap without moving what the viewer is looking at. */
    remove: (card) => stepOut(card, () => {
      const at = cards().indexOf(card);
      card.remove();
      focus(at < index ? index - 1 : index, true);
    }),
    /** Move the `from`th palette card to sit at palette position `to`, then glide to it. */
    move(from, to) {
      const list = [...track.querySelectorAll('.card.palette')];
      const [card, ref] = [list[from], list[to]];
      if (to > from) ref.after(card); else ref.before(card);
      focus(cards().indexOf(card));
    },
  };
}
