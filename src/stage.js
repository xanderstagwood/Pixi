import { EASE, stepOut } from './anim.js';
import { createBloxels } from './bloxel.js';

const MORPH_MS = 600;
const FULL = { clip: 'inset(0px)', transform: 'translate(0px, 0px) scale(1)' };

/**
 * The fullscreen viewport that grows out of a card and shrinks back into one. The
 * wrapper's clip-path is the window; the canvas inside is scaled so that at either end
 * the image sits exactly as a cover-fitted card shows it, which is what makes the
 * hand-off to the real card seamless.
 */
export function createStage(el, canvas) {
  let bloxels, img;
  const root = document.documentElement;

  /** Clip window and canvas transform that make the stage look like `rect`. */
  const pose = (rect) => {
    const cover = Math.max(rect.width / img.width, rect.height / img.height);
    const dx = rect.left + rect.width / 2 - root.clientWidth / 2, dy = rect.top + rect.height / 2 - root.clientHeight / 2;
    return {
      clip: `inset(${rect.top}px ${root.clientWidth - rect.right}px ${root.clientHeight - rect.bottom}px ${rect.left}px)`,
      transform: `translate(${dx}px, ${dy}px) scale(${cover / bloxels.scale})`,
    };
  };

  const apply = (p) => {
    el.style.clipPath = p.clip;
    canvas.style.transform = p.transform;
  };

  async function morph(from, to) {
    // fill: both holds the last frame until the inline styles catch up, so nothing flickers.
    const opts = { duration: MORPH_MS, easing: EASE, fill: 'both' };
    const runs = [
      el.animate([{ clipPath: from.clip }, { clipPath: to.clip }], opts),
      canvas.animate([{ transform: from.transform }, { transform: to.transform }], opts),
    ];
    await Promise.all(runs.map((a) => a.finished));
    apply(to);
    runs.forEach((a) => a.cancel());
  }

  return {
    /** Show the image at `rect` (a card), then grow to fill the viewport. Returns the bloxel grid. `units` is pixel.js unit(). */
    async open(image, rect, units) {
      img = { width: image.width, height: image.height }; // dimensions only: the caller frees the pixels
      bloxels = createBloxels(canvas, image, units);
      apply(pose(rect));
      bloxels.showImage();
      el.hidden = false;
      await morph(pose(rect), FULL);
      return bloxels;
    },
    /** Shrink back down onto `rect`. */
    close: (rect) => morph(FULL, pose(rect)),
    /** Steps the stage away, revealing whatever is beneath it. */
    fadeOut: () => stepOut(el, () => { el.hidden = true; }),
    hide() { el.hidden = true; },
  };
}
