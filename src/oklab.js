// OKLab / OKLCH (Bjorn Ottosson, 2020): a color space where distance and lightness track what an eye
// sees far better than RGB or HSL do. Clustering, ordering and variations all work in it.

const toLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** {r,g,b} 0-255 to {L, a, b}. L is 0 (black) to 1 (white). */
export function rgbToOklab({ r, g, b }) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** {L, a, b} to linear sRGB, unclamped (so a caller can test whether it is in gamut). */
function linearRgb({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin) => lin.every((v) => v >= -0.0005 && v <= 1.0005);

/** {L, a, b} to {r,g,b} 0-255, clamped. */
export function oklabToRgb(lab) {
  const [r, g, b] = linearRgb(lab).map((v) => Math.min(255, Math.max(0, toSrgb(Math.min(1, Math.max(0, v))))));
  return { r, g, b };
}

export const toOklch = ({ L, a, b }) => ({ L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 });
export const fromOklch = ({ L, C, h }) => ({ L, a: C * Math.cos((h * Math.PI) / 180), b: C * Math.sin((h * Math.PI) / 180) });

/** Perceptual distance between two OKLab colors. A just-noticeable difference is about 0.02. */
export const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

/**
 * An OKLCH color as {r,g,b}, keeping its lightness and hue and lowering chroma until it fits in sRGB,
 * rather than letting the clamp bend the hue.
 */
export function oklchToRgb({ L, C, h }) {
  let chroma = C;
  for (let i = 0; i < 24; i++) {
    const lab = fromOklch({ L, C: chroma, h });
    if (inGamut(linearRgb(lab))) return oklabToRgb(lab);
    chroma *= 0.92;
  }
  return oklabToRgb(fromOklch({ L, C: 0, h }));
}
