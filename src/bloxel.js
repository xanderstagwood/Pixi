import { frames } from './anim.js';
import { GROUND, glint, hexToRgb, hit, rgbToHex } from './color.js';
import { createTwinkle } from './twinkle.js';
import { centerDev, unit } from './pixel.js';

const CELL_PX = 16; // font pixels per bloxel
const GROW = 0.14; // share of the sweep a block takes to grow to full size
const KEEP_SIDE = 1024; // longest side of the private copy of the image, plenty for any screen's grid
const easeOut = (u) => 1 - (1 - u) ** 3;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Turns the image on `canvas` into square blocks ("bloxels") with a 2 font pixel gap,
 * growing out of the dark in a wave from the top-left. The canvas is viewport-sized in
 * whole device pixels; the image is contain-fitted and cropped to whole cells.
 *
 * The grid is laid on cell lines that pass through the edges of the card window
 * (`cardCells`, centered on the viewport), so the finished card is exactly a window
 * onto this grid: same blocks, same size, same device pixels.
 *
 * It keeps a small private copy of the image so `resize()` can lay the grid out again if
 * the viewport changes mid-analysis; `release()` lets that copy go.
 * @param {HTMLCanvasElement} canvas
 * @param {{width: number, height: number}} source a canvas or bitmap; only read during this call
 * @param {() => {cols: number, rows: number}} cardCells the card's current size in cells
 */
export function createBloxels(canvas, source, cardCells) {
  const k = Math.min(1, KEEP_SIDE / Math.max(source.width, source.height));
  const img = Object.assign(document.createElement('canvas'), {
    width: Math.max(1, Math.round(source.width * k)),
    height: Math.max(1, Math.round(source.height * k)),
  });
  img.getContext('2d').drawImage(source, 0, 0, img.width, img.height);
  const iw = img.width, ih = img.height; // `img` is zeroed on release
  const ctx = canvas.getContext('2d');
  const ground = hexToRgb(GROUND);
  const floor = luma(ground.r, ground.g, ground.b);

  let g; // the current layout
  let front = -1; // how far the wave has got: none yet, then along it, then past the end
  let done = 0; // cells in wave order that are fully grown

  /** Measure the viewport, lay the grid out, and draw the image at rest. */
  function layout() {
    const { dpr, n } = unit();
    const card = cardCells();
    const W = Math.round(document.documentElement.clientWidth * dpr);
    const H = Math.round(document.documentElement.clientHeight * dpr);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W / dpr}px`;
    canvas.style.height = `${H / dpr}px`;

    const cell = CELL_PX * n;
    const inset = n; // one font pixel on every side of a block, so neighbours are two apart
    const full = cell - 2 * inset; // a grown block
    const mod = (v, m) => ((v % m) + m) % m;
    const c = centerDev();
    // Cell lines through the card window's edges: its width is a whole number of cells.
    const alignX = mod(c.x - (card.cols / 2) * cell, cell), alignY = mod(c.y - (card.rows / 2) * cell, cell);

    const fit = Math.min(W / iw, H / ih); // device px per image px
    const cols = Math.max(1, Math.min(Math.floor((iw * fit) / cell), Math.floor((W - alignX) / cell)));
    const rows = Math.max(1, Math.min(Math.floor((ih * fit) / cell), Math.floor((H - alignY) / cell)));
    // Centered as near as the cell lines allow: shift by whole cells, never off the canvas.
    const place = (total, span, align) => {
      const most = Math.floor((total - align) / cell) - span;
      const want = Math.round(((total - span * cell) / 2 - align) / cell);
      return align + cell * Math.max(0, Math.min(most, want));
    };
    const ox = place(W, cols, alignX), oy = place(H, rows, alignY);
    const srcW = (cols * cell) / fit, srcH = (rows * cell) / fit;
    const srcX = (iw - srcW) / 2, srcY = (ih - srcH) / 2;

    // The image at rest: drawn now, and painted over by the wave. The scratch canvas is let go.
    const base = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const bctx = base.getContext('2d');
    bctx.fillStyle = GROUND;
    bctx.fillRect(0, 0, W, H);
    bctx.drawImage(img, srcX, srcY, srcW, srcH, ox, oy, cols * cell, rows * cell);
    ctx.drawImage(base, 0, 0);

    // One color per cell: the image shrunk to cols x rows.
    const tiny = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
    const tctx = tiny.getContext('2d', { willReadFrequently: true });
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(base, ox, oy, cols * cell, rows * cell, 0, 0, cols, rows);
    const px = tctx.getImageData(0, 0, cols, rows).data;
    base.width = base.height = 0;

    // A block darker than the ground would sit inside a lighter grid line, which reads as a light
    // rim around dark bloxels. So a block never goes darker than the ground: it merges into it.
    const shown = new Uint8ClampedArray(px);
    for (let i = 0; i < cols * rows; i++) {
      if (luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < floor) shown.set([ground.r, ground.g, ground.b], i * 4);
    }

    const count = cols * rows;
    const dist = Float32Array.from({ length: count }, (_, i) => Math.hypot(i % cols, Math.floor(i / cols)));
    const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => dist[a] - dist[b]);
    g = { dpr, cell, inset, full, cols, rows, ox, oy, srcX, srcY, srcW, srcH, px, shown, count, dist, order, maxDist: dist[order[count - 1]] || 1, c };
  }

  const when = (i) => g.dist[i] / g.maxDist; // 0-1 along the sweep

  /** A block of `size` device px, centered in its cell's footprint, on the dark ground. */
  const paintBlock = (i, size, lift = 0) => {
    const x = g.ox + (i % g.cols) * g.cell, y = g.oy + Math.floor(i / g.cols) * g.cell;
    ctx.fillStyle = GROUND;
    ctx.fillRect(x, y, g.cell, g.cell);
    if (size <= 0) return;
    const off = g.inset + Math.floor((g.full - size) / 2);
    let [r, gr, b] = g.shown.subarray(i * 4, i * 4 + 3);
    if (lift) ({ r, g: gr, b } = glint(r, gr, b, lift)); // a twinkling block, and so its light hit, is lit
    ctx.fillStyle = `rgb(${r},${gr},${b})`;
    ctx.fillRect(x + off, y + off, size, size);
    if (size < 3 * g.inset) return; // too small yet for lines along its edges
    ctx.fillStyle = hit(r, gr, b);
    ctx.fillRect(x + off, y + off, size, g.inset); // the light hit along the top...
    ctx.fillRect(x + off, y + off, g.inset, size); // ...and down the left
  };
  const paintCell = (i) => paintBlock(i, Math.round(g.full * easeOut(Math.min(1, (front - when(i)) / GROW))));

  layout();

  // The shimmer: a random block that has finished growing brightens and eases back. Ids are cells, and
  // after a resize an old id may no longer exist.
  const twinkle = createTwinkle({
    rate: () => g.count / 55, // a good scatter at a time, not a shower
    pick: () => {
      const grown = front === Infinity ? g.count : done; // in wave order, the first `done` cells are grown
      return grown ? g.order[Math.floor(Math.random() * grown)] : -1;
    },
    paint: (i, amount) => { if (i < g.count) paintBlock(i, g.full, amount); },
  });

  return {
    get cols() { return g.cols; },
    get rows() { return g.rows; },
    get cell() { return g.cell / g.dpr; }, // css px
    get origin() { return { x: g.ox / g.dpr, y: g.oy / g.dpr }; },
    rgb: (i) => [g.px[i * 4], g.px[i * 4 + 1], g.px[i * 4 + 2]],
    /** The color cell `i` is drawn in, as hex: what a scanner resting on it is looking at. */
    color: (i) => rgbToHex({ r: g.shown[i * 4], g: g.shown[i * 4 + 1], b: g.shown[i * 4 + 2] }),
    /** Image-space fractions (0-1) to the cell that holds them, clamped into the grid. */
    cellAt: (fx, fy) => ({
      cx: Math.min(g.cols - 1, Math.max(0, Math.floor(((fx * iw - g.srcX) / g.srcW) * g.cols))),
      cy: Math.min(g.rows - 1, Math.max(0, Math.floor(((fy * ih - g.srcY) / g.srcH) * g.rows))),
    }),
    /**
     * What a card keeps of this grid: every cell color as drawn, and which cell the viewport
     * centre (and so the card's centre) sits on. Lets a card of any size cut its own window.
     */
    keep: () => ({ cols: g.cols, rows: g.rows, rgb: g.shown, cx: (g.c.x - g.ox) / g.cell, cy: (g.c.y - g.oy) / g.cell }),
    /** The viewport changed: lay the grid out again and repaint as far as the wave had got. */
    resize() {
      layout();
      done = 0;
      for (let j = 0; j < g.count && when(g.order[j]) <= front; j++) paintCell(g.order[j]);
    },
    /** Twinkle the grown blocks: `start()`, `stop()` (let the lit ones fade), `halt()` (all plain at once). */
    twinkle,
    /** Let go of the private copy of the image. */
    release() { twinkle.halt(); img.width = img.height = 0; },
    /** Blocks grow out of the dark in a wave from the top-left. */
    ripple(ms) {
      done = 0;
      return frames((t) => {
        front = t / ms;
        for (let j = done; j < g.count && when(g.order[j]) <= front; j++) paintCell(g.order[j]);
        while (done < g.count && front - when(g.order[done]) >= GROW) done++;
        if (done < g.count) return false;
        front = Infinity;
        return true;
      });
    },
  };
}
