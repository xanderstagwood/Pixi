import { rgbToHex } from './color.js';
import { deltaE, oklabToRgb, rgbToOklab } from './oklab.js';

// Choosing the colors of a picture the way a designer would, not just the way an average would:
//
//  1. Histogram. Pixels fall into 32x32x32 bins, so a photo becomes a few thousand weighted colors
//     instead of tens of thousands of pixels (the trick behind median-cut and Wu quantizers).
//  2. Weight for the eye. A bin counts for its pixels, softened (count^0.75) and boosted by its
//     chroma, because a small vivid patch draws the eye more than its area suggests.
//  3. Cluster in OKLab, where distance follows what an eye sees, with weighted k-means started from
//     k-means++ seeds (Celebi 2011: careful seeding is what makes k-means good for color).
//     There are more clusters (24) than the palette needs; they are candidates.
//  4. Each candidate is a real color, not a muddy average: its centroid pulled halfway to its most
//     common bin.
//  5. Pick k of them by farthest-point sampling weighted by quality: a mix of how much of the picture
//     a color covers (softened) and how vivid it is (the Android Palette idea), the picks kept far
//     apart in OKLab so none is a near-duplicate, and a bonus for stretching the range from dark to
//     light so the palette has both anchors.
//
// The randomness (seeds, a small jitter on scores) means the same picture can come out a little
// different each time.

const CANDIDATES = 24;
const ITERATIONS = 10;
const TOO_ALIKE = 0.04; // OKLab distance under which two picks are near-duplicates
const RANGE_REACH = 0.2; // how far past the current lightness range a color must be for the full bonus

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} k colors wanted
 * @param {() => number} random
 * @returns {{hex: string, x: number, y: number}[]} each color with where in the picture (0-1 fractions) a
 *          pixel of about that color sits, for a scanner to land on
 */
export function extractColors({ data, width, height }, k = 7, random = Math.random) {
  // 1. Histogram
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    const bin = bins.get(key);
    if (bin) { bin.n++; bin.r += data[i]; bin.g += data[i + 1]; bin.b += data[i + 2]; }
    else bins.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2], at: i / 4 });
  }
  if (!bins.size) return [];

  // 2. Points, weighted for the eye
  const pts = [...bins.values()].map((bin) => {
    const lab = rgbToOklab({ r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n });
    const chroma = Math.hypot(lab.a, lab.b);
    return { lab, n: bin.n, at: bin.at, w: bin.n ** 0.75 * (1 + 1.5 * Math.min(1, chroma / 0.15)) };
  });
  const total = pts.reduce((sum, p) => sum + p.n, 0);

  // 3. Weighted k-means in OKLab, seeded by k-means++
  const m = Math.min(CANDIDATES, pts.length);
  const pick = (weights) => { // an index chosen with probability proportional to its weight
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  };
  const cents = [{ ...pts[pick(pts.map((p) => p.w))].lab }];
  const near = pts.map((p) => deltaE(p.lab, cents[0]) ** 2);
  while (cents.length < m) {
    const chosen = near.some((d) => d > 0) ? pick(pts.map((p, i) => p.w * near[i])) : Math.floor(random() * pts.length);
    cents.push({ ...pts[chosen].lab });
    pts.forEach((p, i) => { near[i] = Math.min(near[i], deltaE(p.lab, cents[cents.length - 1]) ** 2); });
  }
  const owner = new Int16Array(pts.length);
  for (let it = 0; it < ITERATIONS; it++) {
    const sum = cents.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
    pts.forEach((p, i) => {
      let best = 0, bd = Infinity;
      cents.forEach((c, j) => { const d = (p.lab.L - c.L) ** 2 + (p.lab.a - c.a) ** 2 + (p.lab.b - c.b) ** 2; if (d < bd) { bd = d; best = j; } });
      owner[i] = best;
      const s = sum[best];
      s.L += p.lab.L * p.w; s.a += p.lab.a * p.w; s.b += p.lab.b * p.w; s.w += p.w;
    });
    sum.forEach((s, j) => { if (s.w) cents[j] = { L: s.L / s.w, a: s.a / s.w, b: s.b / s.w }; });
  }

  // 4. Candidates: real colors, with how much of the picture each covers
  const cands = [];
  cents.forEach((c, j) => {
    const members = pts.filter((_, i) => owner[i] === j);
    if (!members.length) return;
    const mode = members.reduce((a, b) => (b.n > a.n ? b : a));
    const lab = { L: (c.L + mode.lab.L) / 2, a: (c.a + mode.lab.a) / 2, b: (c.b + mode.lab.b) / 2 };
    cands.push({ lab, members, pop: members.reduce((sum, p) => sum + p.n, 0) / total, chroma: Math.hypot(lab.a, lab.b) });
  });

  // 5. Choose k: quality times distance from what is already chosen, with a bonus for reaching
  // toward whichever end of the lightness range is not yet covered.
  const reach = Math.max(...cands.map((c) => Math.sqrt(c.pop)));
  const quality = (c) => 0.55 * (Math.sqrt(c.pop) / reach) + 0.45 * Math.min(1, c.chroma / 0.16);
  const jitter = () => 0.85 + 0.3 * random();
  const chosen = [];
  let pool = [...cands];
  while (chosen.length < k && pool.length) {
    let best = null, bestScore = -Infinity;
    for (const c of pool) {
      const gap = chosen.length ? Math.min(...chosen.map((s) => deltaE(c.lab, s.lab))) : 1;
      if (chosen.length && gap < TOO_ALIKE && pool.some((o) => Math.min(...chosen.map((s) => deltaE(o.lab, s.lab))) >= TOO_ALIKE)) continue;
      const lo = chosen.length ? Math.min(...chosen.map((s) => s.lab.L)) : c.lab.L;
      const hi = chosen.length ? Math.max(...chosen.map((s) => s.lab.L)) : c.lab.L;
      const stretch = Math.min(1, Math.max(0, (lo - c.lab.L) / RANGE_REACH)) + Math.min(1, Math.max(0, (c.lab.L - hi) / RANGE_REACH));
      const score = (0.35 + quality(c)) * gap ** 0.8 * (1 + 0.35 * stretch) * jitter();
      if (score > bestScore) { bestScore = score; best = c; }
    }
    chosen.push(best);
    pool = pool.filter((c) => c !== best);
  }

  // The palette must keep both ends of the picture's lightness. The range bonus leans that way but a
  // jittered pick can still settle for the second-darkest, so make sure the darkest and the lightest
  // color that covers a real share of the picture are in, swapping out the most redundant other pick.
  const real = cands.filter((c) => c.pop >= 0.01);
  if (real.length && chosen.length >= 3) {
    const darkest = real.reduce((a, b) => (b.lab.L < a.lab.L ? b : a));
    const lightest = real.reduce((a, b) => (b.lab.L > a.lab.L ? b : a));
    for (const end of [darkest, lightest]) {
      const lows = chosen.map((c) => c.lab.L);
      const beyond = end.lab.L < Math.min(...lows) - 0.03 || end.lab.L > Math.max(...lows) + 0.03;
      if (chosen.includes(end) || !beyond) continue;
      const others = chosen.filter((c) => c !== darkest && c !== lightest);
      const crowd = (c) => Math.min(...chosen.filter((o) => o !== c).map((o) => deltaE(c.lab, o.lab)));
      if (others.length) chosen[chosen.indexOf(others.reduce((a, b) => (crowd(b) < crowd(a) ? b : a)))] = end;
    }
  }
  while (chosen.length < k) chosen.push(chosen[chosen.length % Math.max(1, chosen.length)]); // fewer colors than asked for: repeat

  return chosen.map((c) => {
    const rgb = oklabToRgb(c.lab);
    // A pixel to land on: the member bin closest to this color, favouring the more common.
    const spot = c.members.reduce((a, b) => (deltaE(b.lab, c.lab) - 0.01 * Math.log(b.n) < deltaE(a.lab, c.lab) - 0.01 * Math.log(a.n) ? b : a));
    return { hex: rgbToHex(rgb), x: ((spot.at % width) + 0.5) / width, y: (Math.floor(spot.at / width) + 0.5) / height };
  });
}
