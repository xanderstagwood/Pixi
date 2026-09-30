import { frames } from './anim.js';
import { centerDev } from './pixel.js';

const BG = '#1B1A19';
const CELL_PX = 16; // font pixels per bloxel
const GROW = 0.14; // share of the sweep a block takes to grow to full size
const easeOut = (u) => 1 - (1 - u) ** 3;

/**
 * Turns the image on `canvas` into square blocks ("bloxels") with a 2 font pixel gap,
 * growing out of the dark in a wave from the top-left. The canvas is viewport-sized in
 * whole device pixels; the image is contain-fitted and cropped to whole cells.
 *
 * The grid is laid on cell lines that pass through the edges of the card window
 * (`card` cells, centered on the viewport), so the finished card is exactly a window
 * onto this grid: same blocks, same size, same device pixels.
 * @param {HTMLCanvasElement} canvas
 * @param {{width: number, height: number}} source a canvas or bitmap; only read during this call
 * @param {{dpr: number, n: number}} u device px per CSS px, device px per font pixel (pixel.js)
 * @param {{cols: number, rows: number}} card the card's size in cells
 */
export function createBloxels(canvas, source, { dpr, n: unit }, card) {
  const img = { width: source.width, height: source.height }; // the caller may free `source` once this returns
  const W = Math.round(document.documentElement.clientWidth * dpr);
  const H = Math.round(document.documentElement.clientHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W / dpr}px`;
  canvas.style.height = `${H / dpr}px`;
  const ctx = canvas.getContext('2d');

  const cell = CELL_PX * unit;
  const inset = unit; // one font pixel on every side of a block, so neighbours are two apart
  const full = cell - 2 * inset; // a grown block
  const mod = (v, m) => ((v % m) + m) % m;
  const c = centerDev();
  // Cell lines through the card window's edges: its width is a whole number of cells.
  const alignX = mod(c.x - (card.cols / 2) * cell, cell), alignY = mod(c.y - (card.rows / 2) * cell, cell);

  const fit = Math.min(W / img.width, H / img.height); // device px per image px
  const cols = Math.max(1, Math.min(Math.floor((img.width * fit) / cell), Math.floor((W - alignX) / cell)));
  const rows = Math.max(1, Math.min(Math.floor((img.height * fit) / cell), Math.floor((H - alignY) / cell)));
  // Centered as near as the cell lines allow: shift by whole cells, never off the canvas.
  const place = (total, span, align) => {
    const most = Math.floor((total - align) / cell) - span;
    const want = Math.round(((total - span * cell) / 2 - align) / cell);
    return align + cell * Math.max(0, Math.min(most, want));
  };
  const ox = place(W, cols, alignX), oy = place(H, rows, alignY);
  const srcW = (cols * cell) / fit, srcH = (rows * cell) / fit;
  const srcX = (img.width - srcW) / 2, srcY = (img.height - srcH) / 2;

  // The image at rest, drawn first and then let go: the wave only ever paints over it.
  const base = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const bctx = base.getContext('2d');
  bctx.fillStyle = BG;
  bctx.fillRect(0, 0, W, H);
  bctx.drawImage(source, srcX, srcY, srcW, srcH, ox, oy, cols * cell, rows * cell);

  // One color per cell: the image shrunk to cols x rows.
  const tiny = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(base, ox, oy, cols * cell, rows * cell, 0, 0, cols, rows);
  const px = tctx.getImageData(0, 0, cols, rows).data;

  const count = cols * rows;
  const dist = Float32Array.from({ length: count }, (_, i) => Math.hypot(i % cols, Math.floor(i / cols)));
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => dist[a] - dist[b]);
  const maxDist = dist[order[count - 1]] || 1;
  const when = (i) => dist[i] / maxDist; // 0-1 along the sweep

  /** A block of `size` device px, centered in its cell's footprint, on the dark ground. */
  const paintBlock = (i, size) => {
    const x = ox + (i % cols) * cell, y = oy + Math.floor(i / cols) * cell;
    ctx.fillStyle = BG;
    ctx.fillRect(x, y, cell, cell);
    if (size <= 0) return;
    const off = inset + Math.floor((full - size) / 2);
    ctx.fillStyle = `rgb(${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]})`;
    ctx.fillRect(x + off, y + off, size, size);
  };

  return {
    cols, rows, cell: cell / dpr, // css px
    origin: { x: ox / dpr, y: oy / dpr },
    rgb: (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]],
    /** Image-space fractions (0-1) to the cell that holds them, clamped into the grid. */
    cellAt: (fx, fy) => ({
      cx: Math.min(cols - 1, Math.max(0, Math.floor(((fx * img.width - srcX) / srcW) * cols))),
      cy: Math.min(rows - 1, Math.max(0, Math.floor(((fy * img.height - srcY) / srcH) * rows))),
    }),
    /**
     * What a card keeps of this grid: every cell color, and which cell the viewport
     * centre (and so the card's centre) sits on. Lets a card of any size cut its own window.
     */
    keep: () => ({ cols, rows, rgb: px, cx: (c.x - ox) / cell, cy: (c.y - oy) / cell }),
    /** Draw the image, then free its working copy. */
    showImage() {
      ctx.drawImage(base, 0, 0);
      base.width = base.height = 0;
    },
    /** Blocks grow out of the dark in a wave from the top-left. */
    ripple(ms) {
      let reached = 0, done = 0;
      return frames((t) => {
        const front = t / ms;
        while (reached < count && when(order[reached]) <= front) reached++;
        for (let k = done; k < reached; k++) {
          const i = order[k];
          paintBlock(i, Math.round(full * easeOut(Math.min(1, (front - when(i)) / GROW))));
        }
        while (done < reached && front - when(order[done]) >= GROW) done++;
        return done === count;
      });
    },
  };
}
