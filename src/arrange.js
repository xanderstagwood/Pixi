import { hexToRgb } from './color.js';
import { deltaE, rgbToOklab } from './oklab.js';
import { classify } from './perceive.js';

// Putting a palette in order the way an eye would. Every palette gets one temperature pattern and
// one shade pattern, both at once:
//
//   temperature   warm to cool, or cool to warm                                 (read top to bottom)
//   shade         dark to light, light to dark, dark-light-dark, light-dark-light
//
// Each color is first judged as a person would judge it (perceive.js): how warm it looks and how
// light it looks. Then every order of the colors is tried against every pair of patterns, and the
// one where each step goes the way its pattern says wins. A step that a viewer could not tell
// from level (under a just-noticeable difference) is not held against it.

export const TEMPERATURES = ['warm-to-cool', 'cool-to-warm'];
export const SHADES = ['dark-to-light', 'light-to-dark', 'dark-light-dark', 'light-dark-light'];

const TEMP_TOLERANCE = 0.12; // warmth steps smaller than this read as level
const SHADE_TOLERANCE = 0.04; // so do lightness steps smaller than this
const PEAK_HEIGHT = 0.06; // a peak or valley must stand this far clear of both ends, or it is just a slope
const WEIGHT = { temperature: 1, shade: 0.8 }; // warmth leads a little, as the owner asked
const ZIGZAG = 0.25; // among orders that fit equally, prefer the one closest to a clean sort
const NEAR_TIE = 0.05; // combinations this close to the best are all "about as good": one is picked at random

/** Steps that go against `dir` (+1 rising, -1 falling), beyond the tolerance. */
function against(x, dir, tolerance, from = 0, to = x.length - 1) {
  let sum = 0;
  for (let k = from; k < to; k++) sum += Math.max(0, -dir * (x[k + 1] - x[k]) - tolerance);
  return sum;
}

/** How far a run of numbers wanders beyond a straight sort: total movement minus net movement. */
function zigzag(x) {
  let total = 0;
  for (let k = 0; k < x.length - 1; k++) total += Math.abs(x[k + 1] - x[k]);
  return total - Math.abs(x[x.length - 1] - x[0]);
}

/** Cost of a run of warmth values for a temperature pattern; 0 is a perfect fit. */
export function temperatureCost(w, pattern) {
  const dir = pattern === 'cool-to-warm' ? 1 : -1;
  return against(w, dir, TEMP_TOLERANCE) + ZIGZAG * zigzag(w);
}

/** Cost of a run of lightness values for a shade pattern; 0 is a perfect fit. */
export function shadeCost(s, pattern) {
  const n = s.length;
  if (pattern === 'dark-to-light') return against(s, 1, SHADE_TOLERANCE) + ZIGZAG * zigzag(s);
  if (pattern === 'light-to-dark') return against(s, -1, SHADE_TOLERANCE) + ZIGZAG * zigzag(s);
  const up = pattern === 'dark-light-dark'; // rises to a peak, then falls; the other one dips to a valley
  let best = Infinity;
  for (let p = 1; p < n - 1; p++) { // the turning point sits inside the run
    const first = against(s, up ? 1 : -1, SHADE_TOLERANCE, 0, p);
    const second = against(s, up ? -1 : 1, SHADE_TOLERANCE, p, n - 1);
    const clear = up ? s[p] - Math.max(s[0], s[n - 1]) : Math.min(s[0], s[n - 1]) - s[p];
    const cost = first + second + Math.max(0, PEAK_HEIGHT - clear);
    if (cost < best) best = cost;
  }
  return best;
}

/** Every order of 0..n-1. */
function permutations(n) {
  const out = [];
  const go = (rest, chosen) => {
    if (!rest.length) { out.push(chosen); return; }
    rest.forEach((v, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, v]));
  };
  go(Array.from({ length: n }, (_, i) => i), []);
  return out;
}

const orders = new Map(); // n -> every order of n things, made once
const ordersOf = (n) => { if (!orders.has(n)) orders.set(n, permutations(n)); return orders.get(n); };

/** Warmth and lightness for each color, as an eye judges them. */
const judge = (hexes) => hexes.map(classify);

/** Cost of a run of colors, in order, against a pair of patterns. */
export function patternCost(hexes, temperature, shade) {
  const seen = judge(hexes);
  return WEIGHT.temperature * temperatureCost(seen.map((c) => c.warmth), temperature)
    + WEIGHT.shade * shadeCost(seen.map((c) => c.shade), shade);
}

/**
 * Chooses the temperature pattern, the shade pattern and the order that fits them best.
 * @param {string[]} hexes
 * @param {() => number} random breaks near-ties, so the same palette can be presented in more than one good way
 * @returns {{order: number[], temperature: string, shade: string, cost: number}} `order` lists indices of `hexes`, top row first
 */
export function arrange(hexes, random = Math.random) {
  const seen = judge(hexes);
  const w = seen.map((c) => c.warmth), s = seen.map((c) => c.shade);
  const perms = ordersOf(hexes.length);
  const found = [];
  for (const temperature of TEMPERATURES) {
    for (const shade of SHADES) {
      let best = Infinity, order = null;
      for (const perm of perms) {
        const cost = WEIGHT.temperature * temperatureCost(perm.map((i) => w[i]), temperature)
          + WEIGHT.shade * shadeCost(perm.map((i) => s[i]), shade);
        if (cost < best) { best = cost; order = perm; }
      }
      found.push({ order, temperature, shade, cost: best });
    }
  }
  const lowest = Math.min(...found.map((f) => f.cost));
  const close = found.filter((f) => f.cost <= lowest + NEAR_TIE);
  return close[Math.floor(random() * close.length)];
}

const lab = (hex) => rgbToOklab(hexToRgb(hex));

/**
 * Picks which of each color's candidates to keep, so the finished order fits its patterns as well as it
 * can and no two neighbours end up too alike to tell apart. A candidate is a small nudge on its base
 * color; the base wins unless a nudge is a clear improvement. A little chance keeps runs different.
 * @param {string[][]} candidates per color (indexed as `order` is), base first
 * @param {{order: number[], temperature: string, shade: string}} plan from `arrange`
 * @returns {number[]} the candidate to keep for each color
 */
export function decide(candidates, plan, random = Math.random) {
  const keep = candidates.map(() => 0);
  const cost = () => {
    const run = plan.order.map((i) => candidates[i][keep[i]]);
    let alike = 0;
    for (let k = 0; k < run.length - 1; k++) alike += Math.max(0, 0.05 - deltaE(lab(run[k]), lab(run[k + 1])));
    return patternCost(run, plan.temperature, plan.shade) + 4 * alike;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (const i of plan.order) {
      let bestCost = Infinity, bestIndex = 0;
      for (let c = 0; c < candidates[i].length; c++) {
        keep[i] = c;
        const total = cost() + (c === 0 ? 0 : 0.02) + random() * 0.015;
        if (total < bestCost) { bestCost = total; bestIndex = c; }
      }
      keep[i] = bestIndex;
    }
  }
  return keep;
}
