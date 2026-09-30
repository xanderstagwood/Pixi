const START_PX = 8; // movement before a touch counts as a swipe rather than a tap

/**
 * Touch and pen swipe along the card strip: the strip follows the finger, and on release
 * it settles on the card the swipe points at (a flick carries further). Mouse input is left
 * alone; the mouse drags cards instead (reorder.js). A long-press that has armed a card
 * reorder wins over a swipe.
 * @param {HTMLElement} track
 * @param {{canSwipe: () => boolean, index: () => number, onSettle: (index: number) => void}} hooks
 */
export function attachSwipe(track, { canSwipe, index, onSettle }) {
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button !== 0 || e.target.closest('button, input') || !canSwipe()) return;
    const startX = e.clientX, t0 = performance.now(), dpr = window.devicePixelRatio || 1;
    const [a, b] = track.children;
    const step = b ? b.offsetLeft - a.offsetLeft : track.offsetWidth; // card plus gap, CSS px
    let dx = 0, swiping = false;

    const move = (ev) => {
      if (track.dataset.reorder) return finish(false);
      dx = ev.clientX - startX;
      if (!swiping) {
        if (Math.abs(dx) < START_PX) return;
        swiping = true;
        track.classList.add('swiping');
      }
      track.style.setProperty('--drag', `${Math.round(dx * dpr) / dpr}px`);
    };
    const finish = (commit) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      if (!swiping) return;
      track.classList.remove('swiping');
      track.style.setProperty('--drag', '0px');
      const flick = (dx / Math.max(1, performance.now() - t0)) * 150;
      if (commit) onSettle(index() - Math.round((dx + flick) / step));
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
