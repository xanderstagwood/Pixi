import { hexToRgb } from './color.js';
import { deltaE, rgbToOklab } from './oklab.js';
import { classify } from './perceive.js';

// Putting a palette in order the way an eye would. Every palette gets one temperature pattern and
// one shade pattern, both at once. The two patterns that turn (dark-light-dark and light-dark-light)
// turn on the middle chip, never the second or the next to last, and that chip is the lightest or the
// darkest color of the seven:
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

const TEMP_TOLERANCE = 0.2; // warmth steps smaller than this read as level: a near-black and an indigo are both just cool
const SHADE_TOLERANCE = 0.04; // so do lightness steps smaller than this
const NOT_ALLOWED = 1e6; // the cost of breaking a rule that has no exceptions
const PEAK_HEIGHT = 0.06; // a peak or valley must stand this far clear of every other chip, or it is just a slope
const WEIGHT = { temperature: 1, shade: 0.9 }; // warmth leads a little, as the owner asked; shade takes over where warmth is level
const ZIGZAG = 0.25; // among orders that fit equally, prefer the one closest to a clean sort
// A gradient should not lurch: big steps between neighbours cost, squared, so two colors that are level
// on temperature go in whichever order makes the gentler run of lightness. Lightness lurches are what
// an eye notices most, so it counts for more than warmth.
const SMOOTH = { temperature: 0.1, shade: 1.5 };
const CLOSE = 0.2; // colors whose warmth differs by less than this are level, so the order between them may follow the gradient
const NEAR_TIE = 0.05; // combinations this close to the best are all "about as good": one is picked at random

/** Steps that go against `dir` (+1 rising, -1 falling), beyond the tolerance. */
function against(x, dir, tolerance, from = 0, to = x.length - 1) {
  let sum = 0;
  for (let k = from; k < to; k++) sum += Math.max(0, -dir * (x[k + 1] - x[k]) - tolerance);
  return sum;
}

/** Sum of squared steps: small when neighbours are close, and evenest for a given span when the steps are equal. */
function lurch(x) {
  let sum = 0;
  for (let k = 0; k < x.length - 1; k++) sum += (x[k + 1] - x[k]) ** 2;
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
  return against(w, dir, TEMP_TOLERANCE) + ZIGZAG * zigzag(w) + SMOOTH.temperature * lurch(w);
}

/** Cost of a run of lightness values for a shade pattern; 0 is a perfect fit. */
export function shadeCost(s, pattern) {
  const n = s.length;
  const smooth = SMOOTH.shade * lurch(s);
  if (pattern === 'dark-to-light') return against(s, 1, SHADE_TOLERANCE) + ZIGZAG * zigzag(s) + smooth;
  if (pattern === 'light-to-dark') return against(s, -1, SHADE_TOLERANCE) + ZIGZAG * zigzag(s) + smooth;
  // The turning chip is the middle one, and it stands clear of every other chip.
  const up = pattern === 'dark-light-dark'; // rises to a peak, then falls; the other one dips to a valley
  const p = middleOf(n);
  const first = against(s, up ? 1 : -1, SHADE_TOLERANCE, 0, p);
  const second = against(s, up ? -1 : 1, SHADE_TOLERANCE, p, n - 1);
  const rest = s.filter((_, i) => i !== p);
  const clear = up ? s[p] - Math.max(...rest) : Math.min(...rest) - s[p];
  if (clear < 0) return NOT_ALLOWED; // the middle chip must be the lightest (or darkest) of all: no exceptions
  return first + second + Math.max(0, PEAK_HEIGHT - clear) + smooth;
}

/** The index of the middle chip: 3 of 0-6. */
const middleOf = (n) => (n - 1) >> 1;

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
const centered = new Map();
/** Every order of n things with thing `c` in the middle: 720 of 5,040 for seven. */
function ordersCentered(n, c) {
  const key = `${n}:${c}`;
  if (!centered.has(key)) centered.set(key, ordersOf(n).filter((perm) => perm[middleOf(n)] === c));
  return centered.get(key);
}
const turns = (shade) => shade === 'dark-light-dark' || shade === 'light-dark-light';

/**
 * The best order of colors with these warmths `w` and lightnesses `s` for one pair of patterns. A pattern
 * that turns puts the lightest (or darkest) color in the middle, so only orders that do are worth trying.
 */
function bestOrder(w, s, temperature, shade) {
  let perms = ordersOf(w.length);
  if (turns(shade)) {
    const up = shade === 'dark-light-dark';
    let extreme = 0;
    s.forEach((v, i) => { if (up ? v > s[extreme] : v < s[extreme]) extreme = i; });
    perms = ordersCentered(w.length, extreme);
  }
  let best = Infinity, order = null;
  for (const perm of perms) {
    const cost = WEIGHT.temperature * temperatureCost(perm.map((i) => w[i]), temperature)
      + WEIGHT.shade * shadeCost(perm.map((i) => s[i]), shade);
    if (cost < best) { best = cost; order = perm; }
  }
  return { order, cost: best };
}

/** Warmth and lightness for each color, as an eye judges them. */
const judge = (hexes) => hexes.map(classify);

/** Cost of a run of colors, in order, against a pair of patterns. */
export function patternCost(hexes, temperature, shade) {
  const seen = judge(hexes);
  return WEIGHT.temperature * temperatureCost(seen.map((c) => c.warmth), temperature)
    + WEIGHT.shade * shadeCost(seen.map((c) => c.shade), shade);
}

/**
 * A last look at neighbours. Two colors that are level on temperature can go either way round without
 * breaking the temperature pattern, so if swapping them makes the run of lightness smoother, they swap.
 * (A near-black and an indigo, both simply cool, should not send the shade dipping and springing back.)
 */
function polish(order, w, s, pinned = -1) {
  const o = [...order];
  for (let pass = 0, moved = true; moved && pass < 20; pass++) {
    moved = false;
    for (let k = 0; k < o.length - 1; k++) {
      if (k === pinned || k + 1 === pinned || Math.abs(w[o[k]] - w[o[k + 1]]) >= CLOSE) continue; // the turning chip stays put
      const swapped = [...o];
      [swapped[k], swapped[k + 1]] = [swapped[k + 1], swapped[k]];
      if (lurch(swapped.map((i) => s[i])) < lurch(o.map((i) => s[i])) - 0.005) { o.splice(0, o.length, ...swapped); moved = true; }
    }
  }
  return o;
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
  const found = [];
  for (const temperature of TEMPERATURES) {
    for (const shade of SHADES) found.push({ ...bestOrder(w, s, temperature, shade), temperature, shade });
  }
  const lowest = Math.min(...found.map((f) => f.cost));
  const close = found.filter((f) => f.cost <= lowest + NEAR_TIE);
  const pick = close[Math.floor(random() * close.length)];
  // Polishing can change which shade pattern the order now fits, so name the one it fits best.
  const order = polish(pick.order, w, s, turns(pick.shade) ? middleOf(hexes.length) : -1);
  const run = order.map((i) => s[i]);
  const shade = SHADES.reduce((a, b) => (shadeCost(run, b) < shadeCost(run, a) ? b : a));
  const cost = WEIGHT.temperature * temperatureCost(order.map((i) => w[i]), pick.temperature) + WEIGHT.shade * shadeCost(run, shade);
  return { order, temperature: pick.temperature, shade, cost };
}

const MAX_SWAPS = 2; // fitting changes at most this many of the seven, so the palette stays the picture's
const MIN_GAIN = 0.03; // and only for a clear improvement

/**
 * Picks the colors to fit a pattern that has already been chosen. A pattern that turns needs a clear
 * lightest (or darkest) color for its middle and colors that step away from it on both sides; when the
 * seven do not give that, up to two are swapped for colors of the same picture from a larger pool, keeping
 * a swap only if the order then fits its patterns clearly better.
 * @param {{hex: string}[]} chosen the seven, as picked from the picture
 * @param {{hex: string}[]} pool more colors of the same picture to draw on
 * @param {{temperature: string, shade: string}} plan the patterns from `arrange`
 * @returns {{colors: {hex: string}[], arrangement: {order: number[], temperature: string, shade: string, cost: number}}}
 */
export function fit(chosen, pool, plan) {
  const { temperature, shade } = plan;
  const measure = (colors) => {
    const seen = colors.map((c) => classify(c.hex));
    const found = bestOrder(seen.map((c) => c.warmth), seen.map((c) => c.shade), temperature, shade);
    return { ...found, seen };
  };
  let colors = [...chosen];
  let best = measure(colors);
  for (let swaps = 0, pass = 0, improved = true; improved && swaps < MAX_SWAPS && pass < 3; pass++) {
    improved = false;
    for (let j = 0; j < colors.length && swaps < MAX_SWAPS; j++) {
      for (const candidate of pool) {
        if (colors.some((c) => c.hex === candidate.hex)) continue;
        const trial = [...colors];
        trial[j] = candidate;
        const tried = measure(trial);
        if (tried.cost < best.cost - MIN_GAIN) { colors = trial; best = tried; improved = true; swaps++; break; }
      }
    }
  }
  return { colors, arrangement: { order: best.order, temperature, shade, cost: best.cost } };
}

/** Whether a shade pattern is one of the two that turn. */
export const turnsOnMiddle = turns;

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
