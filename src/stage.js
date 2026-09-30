import { EASE } from './anim.js';
import { createBloxels } from './bloxel.js';

const MORPH_MS = 600;
const FULL = 'inset(0px)';

/**
 * The fullscreen field that opens out of a card and closes back onto it. Only the clip
 * window animates: the bloxels never scale, so the card that is left behind shows them at
 * exactly the size they had while it was analysed. The window wears the card's shadow, so
 * its edge stays visible on dark images all the way down to the card.
 */
export function createStage(el, canvas) {
  const frame = el.parentElement; // hides and shows the stage together with its shadow
  /** clip-path for a window over `rect`, measured against the canvas's own device-pixel size. */
  const clipFor = (rect) => {
    const w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
    return `inset(${rect.top}px ${w - rect.right}px ${h - rect.bottom}px ${rect.left}px)`;
  };

  async function morph(from, to) {
    // fill: both holds the last frame until the inline style catches up, so nothing flickers.
    const run = el.animate([{ clipPath: from }, { clipPath: to }], { duration: MORPH_MS, easing: EASE, fill: 'both' });
    await run.finished;
    el.style.clipPath = to;
    run.cancel();
  }

  let rect;
  return {
    /**
     * Show the image through a window over `at` (the card), then open to the whole viewport.
     * `units` is pixel.js unit(); `card` is the card's size in cells. Returns the bloxel grid.
     */
    async open(image, at, units, card) {
      rect = at;
      const bloxels = createBloxels(canvas, image, units, card);
      // Sized to the canvas, so every clip edge is a whole device pixel.
      Object.assign(el.style, { width: canvas.style.width, height: canvas.style.height });
      el.style.clipPath = clipFor(rect);
      bloxels.showImage();
      frame.hidden = false;
      await morph(clipFor(rect), FULL);
      return bloxels;
    },
    /** Close the window back down onto the card. */
    close: () => morph(FULL, clipFor(rect)),
    hide() { frame.hidden = true; },
  };
}
