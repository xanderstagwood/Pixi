// Drag-to-reorder for the card strip, after Sprite's attachDragReorder (sprite/src/ui.js):
// the whole card is the handle, but a press only becomes a drag after DRAG_THRESHOLD px, so
// clicks are left alone. The card dims in place, a ghost follows the pointer, its siblings
// slide to open the gap, and release commits. Pointer events, not native drag-and-drop.
// Dragging off the strip does not delete (unlike Sprite's chips): cards have a delete button.
// With touch, the card is picked up by a long-press first (`track.dataset.reorder` marks it
// armed, so swipe.js stands down); a mouse press-and-move drags at once.
const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 350; // touch only: a quick swipe moves the strip, a press-and-hold picks a card up

function ghostOf(card) {
  const r = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  const from = card.querySelectorAll('canvas');
  ghost.querySelectorAll('canvas').forEach((to, i) => {
    to.width = from[i].width;
    to.height = from[i].height;
    to.getContext('2d').drawImage(from[i], 0, 0);
  });
  ghost.querySelectorAll('button').forEach((b) => b.remove());
  ghost.classList.remove('focus', 'dragging');
  ghost.classList.add('drag-ghost');
  ghost.style.cssText = `left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px;`;
  document.body.append(ghost);
  return ghost;
}

/**
 * @param {HTMLElement} track holds the cards
 * @param {{canDrag: () => boolean, vertical: () => boolean, onReorder: (from: number, to: number) => void}} hooks
 *        indices count palette cards only; `vertical`: the strip runs top to bottom, so slots follow Y
 */
export function attachReorder(track, { canDrag, vertical, onReorder }) {
  track.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card.palette');
    if (e.button !== 0 || !card || e.target.closest('button, input') || !canDrag()) return;
    const items = [...track.querySelectorAll('.card.palette')];
    if (items.length < 2) return;

    const index = items.indexOf(card);
    const startX = e.clientX, startY = e.clientY, rect = card.getBoundingClientRect();
    // Slots are hit-tested against resting positions: the siblings slide, and testing the
    // sliding ones made the target flip back and forth under a still pointer.
    const down = vertical();
    const edge = (el, far) => { const r = el.getBoundingClientRect(); return down ? (far ? r.bottom : r.top) : (far ? r.right : r.left); };
    const ends = items.map((el) => edge(el, true));
    const step = edge(items[1], false) - edge(items[0], false);
    const dpr = window.devicePixelRatio || 1;
    const snap = (v) => Math.round(v * dpr) / dpr; // keep the ghost on whole device pixels
    let ghost = null, hover = index;
    const touch = e.pointerType !== 'mouse';
    let armed = !touch;
    const timer = touch ? setTimeout(() => { armed = true; track.dataset.reorder = 'armed'; navigator.vibrate?.(10); }, LONG_PRESS_MS) : 0;

    const preview = () => items.forEach((el, k) => {
      if (k === index) return;
      let shift = 0;
      if (index < hover && k > index && k <= hover) shift = -1;
      else if (index > hover && k < index && k >= hover) shift = 1;
      el.style.transition = 'transform 120ms ease';
      el.style.transform = shift ? `translate${down ? 'Y' : 'X'}(${shift * step}px)` : '';
    });

    const end = () => {
      clearTimeout(timer);
      delete track.dataset.reorder;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', end);
    };

    const move = (ev) => {
      if (!ghost) {
        const far = Math.hypot(ev.clientX - startX, ev.clientY - startY) >= DRAG_THRESHOLD;
        if (!armed) { if (far) end(); return; } // moved before the long-press: a swipe, not a pickup
        if (!far) return;
        card.classList.add('dragging');
        ghost = ghostOf(card);
        window.getSelection().removeAllRanges();
        document.body.classList.add('grabbing');
      }
      ghost.style.left = `${snap(rect.left + ev.clientX - startX)}px`;
      ghost.style.top = `${snap(rect.top + ev.clientY - startY)}px`;
      const slot = ends.findIndex((end) => (down ? ev.clientY : ev.clientX) < end); // past the last card, the last
      hover = slot === -1 ? items.length - 1 : slot;
      preview();
    };

    const up = () => {
      end();
      if (!ghost) return;
      ghost.remove();
      document.body.classList.remove('grabbing');
      card.classList.remove('dragging');
      // No slide back: the reorder below puts every card where its preview already showed it.
      items.forEach((el) => { el.style.transition = 'none'; el.style.transform = ''; });
      if (hover !== index) onReorder(index, hover);
      requestAnimationFrame(() => items.forEach((el) => { el.style.transition = ''; }));
      // The release would also be a click on the card; it was a drag.
      const swallow = (ev) => ev.stopPropagation();
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, true), 100); // no click follows a release outside the window
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', end);
  });
}
