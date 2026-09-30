import { hexToRgb } from './color.js';
import { rgbToOklab, toOklch } from './oklab.js';

// How a color looks to a person, as numbers. Two questions, asked the way an eye asks them:
// is this warmer or cooler than that, and lighter or darker than that.

const wrap = (h) => ((h % 360) + 360) % 360;

// Warm-to-cool along OKLCH hue. Research on warm/cool judgments (Min 2026; Jov 2025) puts the axis from
// orange-red to greenish-blue: orange and blue are the clear ends, red and green are ambiguous, and
// yellow is warm but weaker. Magenta leans warm, violet cool. Piecewise linear, wrapping at 360.
const WARMTH = [
  [20, 0.6], [45, 1], [75, 0.85], [100, 0.6], [130, 0.15], [150, -0.15], [180, -0.65],
  [205, -1], [245, -0.9], [275, -0.6], [300, -0.2], [325, 0.2], [350, 0.45], [380, 0.6],
];

function warmthAt(hue) {
  const h = wrap(hue - 20) + 20; // into [20, 380)
  for (let i = 1; i < WARMTH.length; i++) {
    if (h <= WARMTH[i][0]) {
      const [h0, w0] = WARMTH[i - 1], [h1, w1] = WARMTH[i];
      return w0 + ((w1 - w0) * (h - h0)) / (h1 - h0);
    }
  }
  return WARMTH[0][1];
}

/**
 * Perceived warmth, about -1 (cool) to +1 (warm). A tint only counts as far as there is color to
 * see (a gray with a touch of blue is a cool gray), and a lighter color reads a little warmer.
 */
export function warmth({ L, C, h }) {
  const seen = 1 - Math.exp(-C / 0.03);
  return warmthAt(h) * seen + 0.2 * (L - 0.55);
}

/**
 * Perceived lightness. Saturated colors look lighter than a gray of the same lightness (the
 * Helmholtz-Kohlrausch effect), most for blues and reds-to-magentas and least for yellows: a
 * chroma term on top of OKLab L after Fairchild and Pirrotta, with the red-magenta peak added.
 */
export function shade({ L, C, h }) {
  const rad = (d) => (d * Math.PI) / 180;
  const k = 0.15 + 0.15 * Math.cos(rad(h - 265)) + 0.1 * Math.max(0, Math.cos(rad(h - 345)));
  return L + C * k;
}

/** Everything the arranger needs to know about one color. */
export function classify(hex) {
  const lch = toOklch(rgbToOklab(hexToRgb(hex)));
  const w = warmth(lch), s = shade(lch);
  return {
    hex, ...lch, warmth: w, shade: s,
    temperature: w > 0.22 ? 'warm' : w < -0.22 ? 'cool' : 'neutral',
    lightness: s < 0.42 ? 'dark' : s > 0.72 ? 'light' : 'mid',
  };
}

