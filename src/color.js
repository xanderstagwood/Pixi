import { shuffle } from './anim.js';
import { oklchToRgb, rgbToOklab, toOklch } from './oklab.js';

// Pure color math. Colors travel as '#RRGGBB' strings; {r,g,b} is 0-255, hsl is h 0-360, s/l 0-1.

/** The ground between bloxels: the darkest color in the UI (Sprite's --gray-13), almost black but not quite. */
export const GROUND = '#1B1A19';

export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
};

export const rgbToHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

export const hexToHsl = (hex) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));

/** Perceptual-ish brightness 0-1, used to pick readable label ink. */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const inkFor = (hex) => (luminance(hex) > 0.5 ? '#1B1A19' : '#F3F2F1');

const lifted = new Map();

/**
 * A slightly brighter shade of `hex`, for a light hit along the top edge of whatever sits on that color.
 * Lifted in OKLCH: hue and chroma stay (a touch more chroma, since brightening alone reads washed out),
 * so it is the same color, brighter, and never a veil of white over it. The step grows with lightness:
 * a dark color needs only a whisper to catch the light, and the same step that suits a mid-tone is a
 * glare on near-black. `strength` scales the step (1 for bloxels, more for a bigger element).
 */
export function brighter(hex, strength = 1) {
  const key = `${hex}${strength}`;
  if (!lifted.has(key)) {
    const { L, C, h } = toOklch(rgbToOklab(hexToRgb(hex)));
    const step = strength * (0.01 + 0.03 * L);
    // A vivid color sits near the edge of what a screen can show, and lifting it whole would squeeze its
    // chroma. Take the biggest share of the step that keeps at least 96% of the chroma.
    let out = hex;
    for (const share of [1, 0.75, 0.5, 0.3]) {
      const rgb = oklchToRgb({ L: Math.min(1, L + share * step), C: C * 1.06, h });
      out = rgbToHex(rgb);
      if (toOklch(rgbToOklab(rgb)).C >= 0.96 * C) break;
    }
    lifted.set(key, out);
  }
  return lifted.get(key);
}

/** The light hit on a bloxel of this color (`brighter`, as a hex code). */
export const hit = (r, g, b) => brighter(rgbToHex({ r, g, b }));

/** Mix of `hex` toward `toward` ('#RRGGBB'), `amount` 0-1. */
export function mix(hex, toward, amount) {
  const a = hexToRgb(hex), b = hexToRgb(toward);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
}

/**
 * A run of `length` colors drawn from `colors`, every one shown as often as the others give or take
 * one, shuffled, and never the same twice in a row. Decided up front, so what a chip will show is
 * known before the scanner that hunts it sets off.
 */
export function sequence(colors, length) {
  const out = [];
  while (out.length < length) {
    for (const c of shuffle(colors)) {
      if (out.length < length && c !== out[out.length - 1]) out.push(c);
    }
  }
  return out;
}

/**
 * Five subtle takes on one color, made in OKLCH so a step looks the same size on every color:
 * the base, a touch darker and richer, a touch lighter and softer, and the hue nudged either way.
 * Chroma is trimmed to stay in gamut rather than letting the clamp bend the hue. Index 0 is the base.
 */
export function variations(hex) {
  const { L, C, h } = toOklch(rgbToOklab(hexToRgb(hex)));
  const make = (dL, scale, dh) => rgbToHex(oklchToRgb({ L: Math.min(1, Math.max(0, L + dL)), C: C * scale, h: (h + dh + 360) % 360 }));
  return [hex, make(-0.05, 1.06, 0), make(0.05, 0.94, 0), make(0, 1, -8), make(0, 1, 8)];
}
