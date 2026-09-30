import { rgbToHex } from './color.js';

/**
 * K-means over RGBA pixels. Returns `k` clusters, each with its centroid hex and the
 * position (0-1 fractions of the image) of the pixel nearest that centroid, so a scanner
 * has a real place to land. Deterministic: k-means++ seeding with a fixed-step pick.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @returns {{hex: string, x: number, y: number}[]}
 */
export function extractColors({ data, width, height }, k = 7, iterations = 12) {
  const px = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) px.push(i);
  if (!px.length) return [];
  const at = (p) => [data[p], data[p + 1], data[p + 2]];
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Seed: first pixel, then repeatedly the pixel farthest from every chosen centroid.
  const cents = [at(px[0])];
  while (cents.length < k) {
    let best = px[0], bestD = -1;
    for (const p of px) {
      const c = at(p);
      const d = Math.min(...cents.map((m) => dist(c, m)));
      if (d > bestD) { bestD = d; best = p; }
    }
    cents.push(at(best));
  }

  const owner = new Int16Array(px.length);
  for (let it = 0; it < iterations; it++) {
    const sums = cents.map(() => [0, 0, 0, 0]);
    px.forEach((p, i) => {
      const c = at(p);
      let bi = 0, bd = Infinity;
      cents.forEach((m, j) => { const d = dist(c, m); if (d < bd) { bd = d; bi = j; } });
      owner[i] = bi;
      const s = sums[bi]; s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    });
    sums.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }

  return cents.map((c, j) => {
    let bestP = px[0], bestD = Infinity;
    px.forEach((p, i) => {
      if (owner[i] !== j) return;
      const d = dist(at(p), c);
      if (d < bestD) { bestD = d; bestP = p; }
    });
    const idx = bestP / 4;
    return {
      hex: rgbToHex({ r: c[0], g: c[1], b: c[2] }),
      x: ((idx % width) + 0.5) / width,
      y: (Math.floor(idx / width) + 0.5) / height,
    };
  });
}

/**
 * Whether the top half of the image is lighter than the bottom half: a light sky over dark
 * ground, or the reverse. Among colors of similar temperature the stack follows it, so its
 * light-to-dark direction fits the picture's own vibe.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 */
export function lightOnTop({ data, width, height }) {
  let top = 0, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (y < height / 2) top += l; else bottom += l;
    }
  }
  return top >= bottom;
}
