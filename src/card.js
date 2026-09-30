import { inkFor, mix } from './color.js';

// The finished palette card, drawn straight to a canvas in font-pixel units (see pixel.js)
// so it is crisp on screen and the very same drawing exports as a PNG at a bigger scale.
// The source image is never kept: only the 40x60 block colors it reduced to.

export const CARD = { w: 320, h: 480, cell: 8 };
export const CHIPS = 7;
// Chip rows, then the floating name (a 32px line) 24px below the last chip; the block is centered on the card.
const ROW = { w: 160, h: 32, pitch: 40, x: 80, y: 76 };
const NAME = { x: 16, w: 288, h: 32, y: ROW.y + (CHIPS - 1) * ROW.pitch + ROW.h + 24 };
export const CHIP_W = ROW.w;
const GRAY_13 = '#1B1A19', GRAY_5 = '#979693', INK = '#F3F2F1';
export const EXPORT_SCALE = 4;
// A 6px capital centered between the 1px highlight and the 1px shadow sits on this baseline.
const LABEL_BASE = 1 + (ROW.h - 2 - 6) / 2 + 6;
// The 32px name: capitals are 12px tall, centered in its 32px line.
const NAME_BASE = (NAME.h - 12) / 2 + 12;

const measure = document.createElement('canvas').getContext('2d');
/**
 * Device pixels from a box's left edge to where `text` starts so it sits centered. Rounded to
 * a whole device pixel, not a whole font pixel: on a display where a font pixel is several
 * device pixels this allows the half-font-pixel nudge that odd-width text needs to look centered.
 */
export function textOffset(text, boxWidth, s, size = 16) {
  measure.font = `${size * s}px "Stagwood Sprite 64", monospace`;
  return Math.round((boxWidth * s - measure.measureText(text).width) / 2);
}

/** The image, cover-fitted to the card and shrunk to one color per block. */
export function makeGrid(src) {
  const cols = CARD.w / CARD.cell, rows = CARD.h / CARD.cell;
  const fit = Math.max(cols / src.width, rows / src.height);
  const sw = cols / fit, sh = rows / fit;
  const tiny = Object.assign(document.createElement('canvas'), { width: cols, height: rows });
  const g = tiny.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, cols, rows);
  return { cols, rows, rgb: g.getImageData(0, 0, cols, rows).data };
}

/**
 * @param {HTMLCanvasElement} canvas resized to the card at `s` device px per font pixel
 * @param {{grid: object, colors: string[], name: string, copied?: number}} palette colors run darkest first (bottom row)
 * @param {number} s whole device pixels per font pixel, so every edge and glyph stays crisp
 * @param {{ui?: boolean}} opts ui adds on-screen-only hints (the name placeholder); exports leave them out
 */
export function renderCard(canvas, palette, s, { ui = false } = {}) {
  canvas.width = CARD.w * s;
  canvas.height = CARD.h * s;
  const g = canvas.getContext('2d');
  g.fillStyle = GRAY_13;
  g.fillRect(0, 0, canvas.width, canvas.height);

  const { cols, rows, rgb } = palette.grid;
  const cell = CARD.cell * s;
  for (let i = 0; i < cols * rows; i++) {
    g.fillStyle = `rgb(${rgb[i * 4]},${rgb[i * 4 + 1]},${rgb[i * 4 + 2]})`;
    g.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell - s, cell - s); // one font pixel between blocks
  }

  g.textBaseline = 'alphabetic';
  // A chip is its color with a light line along the top and a shadow line along the bottom.
  const chip = (row, hex, text) => {
    const x = ROW.x * s, y = (ROW.y + row * ROW.pitch) * s, w = ROW.w * s, h = ROW.h * s;
    g.fillStyle = hex;
    g.fillRect(x, y, w, h);
    g.fillStyle = mix(hex, '#FFFFFF', 0.25);
    g.fillRect(x, y, w, s);
    g.fillStyle = mix(hex, '#000000', 0.4);
    g.fillRect(x, y + h - s, w, s);
    g.font = `${16 * s}px "Stagwood Sprite 64", monospace`;
    g.fillStyle = inkFor(hex);
    g.fillText(text, x + textOffset(text, ROW.w, s), y + LABEL_BASE * s);
  };

  const n = palette.colors.length;
  palette.colors.forEach((hex, i) => chip(n - 1 - i, hex, palette.copied === i ? 'COPIED' : hex));

  // The name floats over the blocks, a size up, with a hard 1px shadow so it reads on light ones.
  const label = palette.name || (ui ? 'NAME' : '');
  if (label) {
    g.font = `${32 * s}px "Stagwood Sprite 64", monospace`;
    const x = NAME.x * s + textOffset(label, NAME.w, s, 32), y = (NAME.y + NAME_BASE) * s;
    g.fillStyle = 'rgba(0, 0, 0, 0.55)';
    g.fillText(label, x + s, y + s);
    g.fillStyle = palette.name ? INK : GRAY_5;
    g.fillText(label, x, y);
  }
}

/** The card as a PNG blob at export size. */
export function cardPng(palette) {
  const c = document.createElement('canvas');
  renderCard(c, palette, EXPORT_SCALE);
  return new Promise((done) => c.toBlob(done, 'image/png'));
}

/** Which chip a click at (x, y) font pixels hits: its index (0 = darkest), or -1. */
export function chipAt(x, y, count) {
  const row = Math.floor((y - ROW.y) / ROW.pitch);
  const inside = x >= ROW.x && x < ROW.x + ROW.w && (y - ROW.y) - row * ROW.pitch < ROW.h;
  return inside && row >= 0 && row < count ? count - 1 - row : -1;
}
