import { GROUND, brighter, hit, inkFor, mix } from './color.js';
import { unit } from './pixel.js';

// The finished palette card, drawn straight to a canvas in font-pixel units (see pixel.js)
// so it is crisp on screen and the very same drawing exports as a PNG at a bigger scale.
// The card is a window onto the bloxel grid it was analysed in: same block size, same
// pixels. The source image is never kept, only the grid's cell colors.

export const CELL = 16; // font pixels per bloxel
export const CHIPS = 7;
// Every chip edge should stop halfway through a bloxel, never line up with one. Across: 9
// bloxels wide on a card an even number wide. Down: two bloxels tall on a whole-bloxel
// pitch, started half a bloxel in (see layout).
const CHIP = { w: 144, h: 32, pitch: 48 };
export const CHIP_W = CHIP.w;
const CHIPS_H = (CHIPS - 1) * CHIP.pitch + CHIP.h;
const GRAY_5 = '#979693', INK = '#F3F2F1';
export const CHIP_HIT = 1.6; // a chip's light hit is a bigger step than a bloxel's
export const EXPORT_SCALE = 4;
// A 6px capital centered between the 1px highlight and the 1px shadow sits on this baseline;
// in the footer's 16px line it sits 11px down.
const LABEL_BASE = 1 + (CHIP.h - 2 - 6) / 2 + 6;
const FOOT_BASE = 11;
// The Pixi logo, drawn from Sprite's 6x6 icon: the cells that are filled.
const PIXI = [[0, 0], [3, 0], [1, 1], [3, 2], [5, 2], [1, 3], [3, 3], [0, 4], [3, 4], [2, 5]];

let cells = { cols: 20, rows: 30 };

/**
 * Sizes the card to the viewport, in whole bloxels (even, so it centers on cell lines):
 * up to 20x30, less on a small screen. Room is left above and below for the buttons, which hang
 * 56 font pixels off either end of the card, so the card and its buttons stay centered as a group.
 */
export function fitCardCells() {
  const { css } = unit();
  const root = document.documentElement;
  const even = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(v / 2) * 2));
  cells = {
    cols: even((root.clientWidth / css - 32) / CELL, 12, 20),
    rows: even((root.clientHeight / css - 160) / CELL, 24, 30),
  };
  return cells;
}

export const cardCells = () => cells;

/**
 * Positions inside the card, in font pixels. A footer line runs along the bottom (the name at the left,
 * the credit at the right), and the chips sit above it, as near the middle as a half-bloxel start allows.
 */
export function layout() {
  const w = cells.cols * CELL, h = cells.rows * CELL;
  const name = { x: 12, y: h - 24, w: 128, h: 16 };
  const half = CELL / 2;
  const top = half + CELL * Math.max(0, Math.round(((name.y - CHIPS_H) / 2 - half) / CELL));
  return { w, h, name, chips: { ...CHIP, x: (w - CHIP.w) / 2, y: top } };
}

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

/**
 * @param {HTMLCanvasElement} canvas resized to the card at `s` device px per font pixel
 * @param {{grid: {cols: number, rows: number, rgb: Uint8ClampedArray, cx: number, cy: number}, colors: string[], name: string, copied?: number}} palette colors in stack order, bottom row first
 * @param {number} s whole device pixels per font pixel, so every edge and glyph stays crisp
 * @param {{ui?: boolean, dim?: boolean}} opts ui adds on-screen-only hints (the name placeholder); exports leave
 *        them out. dim veils the blocks and chips (a card that is not in the center) but never the name
 */
export function renderCard(canvas, palette, s, { ui = false, dim = false } = {}) {
  const L = layout();
  canvas.width = L.w * s;
  canvas.height = L.h * s;
  const g = canvas.getContext('2d');
  g.fillStyle = GROUND;
  g.fillRect(0, 0, canvas.width, canvas.height);

  // The window onto the grid: cells outside it (a small image) stay dark.
  const { grid } = palette;
  const first = { c: Math.round(grid.cx - cells.cols / 2), r: Math.round(grid.cy - cells.rows / 2) };
  const cell = CELL * s;
  for (let r = 0; r < cells.rows; r++) {
    for (let c = 0; c < cells.cols; c++) {
      const gc = first.c + c, gr = first.r + r;
      if (gc < 0 || gr < 0 || gc >= grid.cols || gr >= grid.rows) continue;
      const i = (gr * grid.cols + gc) * 4;
      const x = c * cell + s, y = r * cell + s;
      g.fillStyle = `rgb(${grid.rgb[i]},${grid.rgb[i + 1]},${grid.rgb[i + 2]})`;
      g.fillRect(x, y, cell - 2 * s, cell - 2 * s); // a font pixel on every side: two between blocks
      g.fillStyle = hit(grid.rgb[i], grid.rgb[i + 1], grid.rgb[i + 2]);
      g.fillRect(x, y, cell - 2 * s, s); // the faint light hit along the top, as bloxel.js draws it
    }
  }

  g.textBaseline = 'alphabetic';
  // A chip is its color with a light line along the top and a shadow line along the bottom,
  // lifted off the blocks by a soft shadow.
  const chip = (row, hex, text) => {
    const x = L.chips.x * s, y = (L.chips.y + row * CHIP.pitch) * s, w = CHIP.w * s, h = CHIP.h * s;
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.4)';
    g.shadowBlur = 6 * s;
    g.shadowOffsetY = 2 * s;
    g.fillStyle = hex;
    g.fillRect(x, y, w, h);
    g.restore();
    g.fillStyle = brighter(hex, CHIP_HIT);
    g.fillRect(x, y, w, s);
    g.fillStyle = mix(hex, '#000000', 0.4);
    g.fillRect(x, y + h - s, w, s);
    g.font = `${16 * s}px "Stagwood Sprite 64", monospace`;
    g.fillStyle = inkFor(hex);
    g.fillText(text, x + textOffset(text, CHIP.w, s), y + LABEL_BASE * s);
  };

  const n = palette.colors.length;
  palette.colors.forEach((hex, i) => chip(n - 1 - i, hex, palette.copied === i ? 'COPIED' : hex));

  if (dim) { // a veil of the ground color, laid before the name so the name is the same color on every card
    g.fillStyle = 'rgba(27, 26, 25, 0.5)';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }

  // The footer: the name at the bottom left, "Made with Pixi" and the logo at the bottom right, both in the
  // 16px face. Their shadow is soft but heavy (drawn twice) so they separate from light blocks without a hard edge.
  const soft = (draw) => {
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.85)';
    g.shadowBlur = 6 * s;
    g.shadowOffsetY = 2 * s;
    draw();
    draw();
    g.restore();
  };
  g.font = `${16 * s}px "Stagwood Sprite 64", monospace`;
  const base = (L.name.y + FOOT_BASE) * s;
  const label = palette.name || (ui ? 'NAME' : '');
  if (label) soft(() => { g.fillStyle = palette.name ? INK : GRAY_5; g.fillText(label, L.name.x * s, base); });

  // On a narrow card the credit gives up its first words rather than run into the name.
  const edge = (L.w - 12) * s, icon = 6 * s, gap = 4 * s;
  const nameEnd = L.name.x * s + (label ? g.measureText(label).width : 0);
  const words = g.measureText('Made with Pixi').width + gap + icon <= edge - nameEnd - 8 * s ? 'Made with Pixi' : 'Pixi';
  soft(() => {
    g.fillStyle = GRAY_5;
    g.fillText(words, Math.round(edge - icon - gap - g.measureText(words).width), base);
    for (const [cx, cy] of PIXI) g.fillRect(edge - icon + cx * s, base - 6 * s + cy * s, s, s); // a 6px icon as tall as a capital
  });
}

/** The card as a PNG blob at export size. */
export function cardPng(palette) {
  const c = document.createElement('canvas');
  renderCard(c, palette, EXPORT_SCALE);
  return new Promise((done) => c.toBlob(done, 'image/png'));
}

/** Which chip a click at (x, y) font pixels hits: its index (0 = bottom row), or -1. */
export function chipAt(x, y, count) {
  const { chips } = layout();
  const row = Math.floor((y - chips.y) / chips.pitch);
  const inside = x >= chips.x && x < chips.x + chips.w && (y - chips.y) - row * chips.pitch < chips.h;
  return inside && row >= 0 && row < count ? count - 1 - row : -1;
}
