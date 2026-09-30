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

/**
 * Warm-positive, cool-negative: peaks at orange (30 degrees), bottoms out at blue. Saturation
 * counts in full from 0.2 up, so a muted or grayish color still reads warm or cool instead of
 * collapsing toward zero and letting lightness decide the order. True grays stay near 0.
 */
export function temperature(hex) {
  const { h, s } = hexToHsl(hex);
  return Math.cos(((h - 30) * Math.PI) / 180) * Math.min(1, s / 0.2);
}

/** Mix of `hex` toward `toward` ('#RRGGBB'), `amount` 0-1. */
export function mix(hex, toward, amount) {
  const a = hexToRgb(hex), b = hexToRgb(toward);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
}

/**
 * Indices of `hexes` in stack order, bottom row first: cool at the bottom rising to warm at
 * the top. That is the priority. Lightness only settles near-ties, keeping the ramp from
 * jumping in value: lighter above darker when `lightOnTop`, the reverse otherwise. Indices,
 * not colors, so duplicate colors keep distinct slots.
 */
export const stackOrder = (hexes, lightOnTop) => {
  const lift = lightOnTop ? 0.08 : -0.08;
  const key = (i) => temperature(hexes[i]) + lift * luminance(hexes[i]);
  return hexes.map((_, i) => i).sort((a, b) => key(a) - key(b));
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Five subtle takes on one color; index 0 is the base. */
export function variations(hex) {
  const { h, s, l } = hexToHsl(hex);
  const make = (dh, ds, dl) => hslToHex({ h: (h + dh + 360) % 360, s: clamp01(s + ds), l: clamp01(l + dl) });
  return [hex, make(0, 0.05, -0.08), make(0, -0.05, 0.08), make(-10, 0, 0), make(10, 0, 0)];
}
