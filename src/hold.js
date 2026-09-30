/**
 * Tap or press-and-hold button. Releasing before it charges calls `onTap`; holding for
 * `ms` calls `onBurst` once, and the release that follows does nothing. Sliding off
 * cancels. `onCharge(p)` reports 0-1 progress every frame (and 0 when it resets).
 * Keyboard activation counts as a tap.
 */
export function holdButton(el, { ms, onTap, onCharge, onBurst }) {
  let holding = false, spent = false, raf = 0, t0 = 0;

  const stop = () => { holding = false; cancelAnimationFrame(raf); };
  const tick = (now) => {
    if (!holding) return;
    const p = Math.min(1, (now - t0) / ms);
    onCharge(p);
    if (p < 1) { raf = requestAnimationFrame(tick); return; }
    stop();
    spent = true;
    onBurst();
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    holding = true; spent = false; t0 = performance.now();
    raf = requestAnimationFrame(tick);
  });
  el.addEventListener('pointerup', () => {
    const tapped = holding && !spent;
    stop();
    if (tapped) { onCharge(0); onTap(); }
    spent = false;
  });
  const cancel = () => { if (holding) { stop(); onCharge(0); } };
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('click', (e) => { if (e.detail === 0) onTap(); }); // keyboard only; pointer taps are handled above
}
