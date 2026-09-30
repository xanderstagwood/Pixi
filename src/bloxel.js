import { frames } from './anim.js';

const BG = '#1B1A19';
const CELL_PX = 16; // font pixels per cell
const GROW = 0.14; // share of the sweep a block takes to grow to full size (or shrink away)
const easeOut = (u) => 1 - (1 - u) ** 3;

/**
 * Turns the image on `canvas` into square blocks ("bloxels") with a 2px gap, rippling
 * out from the top-left. The canvas is viewport-sized in whole device pixels; the image
 * is contain-fitted and cropped to whole cells so the grid has no ragged edge.
 * @param {HTMLCanvasElement} canvas
 * @param {{width: number, height: number}} source a canvas or bitmap; only read during this call
 * @param {{dpr: number, n: number}} u device px per CSS px, device px per font pixel (pixel.js)
 */
export function createBloxels(canvas, source, { dpr, n: unit }) {
  const img = { width: source.width, height: source.height }; // the caller may free `source` once this returns
  const W = Math.round(document.documentElement.clientWidth * dpr);
  const H = Math.round(document.documentElement.clientHeight * dpr);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${W / dpr}px`;
  canvas.style.height = `${H / dpr}px`;
  const ctx = canvas.getContext('2d');

  const cell = CELL_PX * unit; // 16 font pixels
  const gap = unit; // one font pixel between neighbouring blocks
  const full = cell - gap; // a grown block
  const fit = Math.min(W / img.width, H / img.height); // device px per image px
  const cols = Math.max(1, Math.floor((img.width * fit) / cell));
  const rows = Math.max(1, Math.floor((img.height * fit) / cell));
  const ox = Math.floor((W - cols * cell) / 2), oy = Math.floor((H - rows * cell) / 2);
  const srcW = (cols * cell) / fit, srcH = (rows * cell) / fit;
  const srcX = (img.width - srcW) / 2, srcY = (img.height - srcH) / 2;

  // The image at rest, kept aside so the ripple can restore cells from it.
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

  const n = cols * rows;
  const dist = Float32Array.from({ length: n }, (_, i) => Math.hypot(i % cols, Math.floor(i / cols)));
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => dist[a] - dist[b]);
  const maxDist = dist[order[n - 1]] || 1;

  const cellXY = (i) => [ox + (i % cols) * cell, oy + Math.floor(i / cols) * cell];
  const when = (i) => dist[i] / maxDist; // 0-1 along the sweep
  /** A block of `size` device px, centered in its cell's footprint, on the dark ground. */
  const paintBlock = (i, size) => {
    const [x, y] = cellXY(i);
    ctx.fillStyle = BG;
    ctx.fillRect(x, y, cell, cell);
    if (size <= 0) return;
    const off = Math.floor((full - size) / 2);
    ctx.fillStyle = `rgb(${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]})`;
    ctx.fillRect(x + off, y + off, size, size);
  };
  const paintImage = (i) => {
    const [x, y] = cellXY(i);
    ctx.drawImage(base, x, y, cell, cell, x, y, cell, cell);
  };

  /** A wave from the top-left: blocks grow out of the dark (forward) or shrink back to the plain image. */
  function ripple(forward, ms) {
    let reached = 0, done = 0;
    return frames((t) => {
      const front = t / ms;
      while (reached < n && when(order[reached]) <= front) reached++;
      for (let k = done; k < reached; k++) {
        const i = order[k];
        const p = Math.min(1, (front - when(i)) / GROW);
        if (!forward && p >= 1) paintImage(i);
        else paintBlock(i, Math.round(full * easeOut(forward ? p : 1 - p)));
      }
      while (done < reached && front - when(order[done]) >= GROW) done++;
      return done === n;
    });
  }

  return {
    cols, rows, cell: cell / dpr, // css px
    origin: { x: ox / dpr, y: oy / dpr },
    scale: cell * cols / srcW / dpr, // css px per image px
    rgb: (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]],
    /** Image-space fractions (0-1) to the cell that holds them, clamped into the grid. */
    cellAt: (fx, fy) => ({
      cx: Math.min(cols - 1, Math.max(0, Math.floor(((fx * img.width - srcX) / srcW) * cols))),
      cy: Math.min(rows - 1, Math.max(0, Math.floor(((fy * img.height - srcY) / srcH) * rows))),
    }),
    showImage: () => ctx.drawImage(base, 0, 0),
    ripple,
  };
}
