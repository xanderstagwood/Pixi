import { EASE } from './anim.js';

const START_PX = 8; // movement before a touch counts as a swipe rather than a tap
const DISMISS_FRAC = 0.3; // how far across its own size a card must be dragged off the strip to be deleted

/**
 * Touch and pen swipe along the card strip: the strip follows the finger, and on release
 * it settles on the card the swipe points at (a flick carries further). Mouse input is left
 * alone; the mouse drags cards instead (reorder.js). A long-press that has armed a card
 * reorder wins over a swipe. Dragging a palette card across the strip (up, or left on a narrow
 * screen, where the strip's own axis is taken) pulls it off to delete it.
 * @param {HTMLElement} track
 * @param {{canSwipe: () => boolean, vertical: () => boolean, index: () => number, onSettle: (index: number) => void,
 *          onDismiss: (card: HTMLElement, axis: 'X' | 'Y') => void}} hooks
 *        `vertical`: the strip runs top to bottom (a narrow screen), so the swipe follows Y
 */
export function attachSwipe(track, { canSwipe, vertical, index, onSettle, onDismiss }) {
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button !== 0 || e.target.closest('button, input') || !canSwipe()) return;
    const down = vertical();
    const pos = (ev) => (down ? ev.clientY : ev.clientX);
    const cross = (ev) => (down ? ev.clientX : ev.clientY);
    const card = e.target.closest('.card.palette');
    const axis = down ? 'X' : 'Y';
    const start = pos(e), crossStart = cross(e), t0 = performance.now(), dpr = window.devicePixelRatio || 1;
    const [a, b] = track.children;
    const step = b ? (down ? b.offsetTop - a.offsetTop : b.offsetLeft - a.offsetLeft) : 1; // card plus gap, CSS px
    let dx = 0, dy = 0, swiping = false, dismissing = false;

    const move = (ev) => {
      if (track.dataset.reorder) return finish(false);
      dx = pos(ev) - start;
      dy = Math.min(0, cross(ev) - crossStart);
      if (!swiping && !dismissing) {
        if (card && -dy >= START_PX && -dy > Math.abs(dx)) dismissing = true;
        else if (Math.abs(dx) >= START_PX) { swiping = true; track.classList.add('swiping'); }
        else return;
      }
      if (!swiping && !dismissing) return;
      if (dismissing) {
        const size = axis === 'Y' ? card.offsetHeight : card.offsetWidth;
        const flick = (dy / Math.max(1, performance.now() - t0)) * 150;
        if (commit && -(dy + flick) > size * DISMISS_FRAC) onDismiss(card, axis);
        else {
          card.animate([{ transform: card.style.transform }, { transform: 'none' }], { duration: 200, easing: EASE });
          card.style.transform = '';
        }
      } else {
        track.classList.remove('swiping');
        track.style.setProperty('--drag', '0px');
        const flick = (dx / Math.max(1, performance.now() - t0)) * 150;
        if (commit) onSettle(index() - Math.round((dx + flick) / step));
      }
      // The release would also be a click on a card; it was a swipe.
      const swallow = (ev) => ev.stopPropagation();
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, true), 100);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  });
}
