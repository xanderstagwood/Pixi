// Run: node test/check.mjs. Smallest checks that fail if the pure logic breaks.
import assert from 'node:assert/strict';
import { crc32 as nodeCrc } from 'node:zlib';
import { sequence, mix, variations, hexToRgb } from '../src/color.js';
import { extractColors } from '../src/extract.js';
import { arrange, decide, shadeCost, temperatureCost } from '../src/arrange.js';
import { classify } from '../src/perceive.js';
import { oklabToRgb, rgbToOklab, toOklch } from '../src/oklab.js';
import * as f from '../src/export/formats.js';
import { zip } from '../src/export/zip.js';
import { createQueue } from '../src/queue.js';

assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');

// Five variations, base first: a darker one, a lighter one, and hue nudged 8 degrees either way.
const v = variations('#D04A2A');
const lch = v.map((h) => toOklch(rgbToOklab(hexToRgb(h))));
assert.equal(v.length, 5);
assert.equal(v[0], '#D04A2A');
assert.ok(lch[1].L < lch[0].L && lch[2].L > lch[0].L);
assert.ok(Math.abs(lch[3].h - lch[0].h + 8) < 1.5 && Math.abs(lch[4].h - lch[0].h - 8) < 1.5);

// A predetermined run of colors: right length, only the given colors, none twice in a row.
const run = sequence(['#111111', '#222222', '#333333', '#444444', '#555555'], 17);
assert.equal(run.length, 17);
assert.ok(run.every((c) => ['#111111', '#222222', '#333333', '#444444', '#555555'].includes(c)));
assert.ok(run.every((c, i) => i === 0 || c !== run[i - 1]));

// Two flat halves extract to their own colors, at a coordinate inside their half.
const w = 20, h = 10, data = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) data.set(i % w < 10 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
const got = extractColors({ data, width: w, height: h }, 2);
assert.deepEqual(got.map((c) => c.hex).sort().map((h) => classify(h).temperature), ['cool', 'warm']);
assert.ok(got.find((c) => c.hex === '#FF0000').x < 0.5 && got.find((c) => c.hex === '#0000FF').x > 0.5);

// OKLab round-trips a color.
const back = oklabToRgb(rgbToOklab({ r: 200, g: 30, b: 90 }));
assert.deepEqual([back.r, back.g, back.b].map(Math.round), [200, 30, 90]);

// An eye's verdicts: orange is warm and blue is cool; a pale yellow is light and a navy is dark.
assert.equal(classify('#FF5A1F').temperature, 'warm');
assert.equal(classify('#2E5AAC').temperature, 'cool');
assert.equal(classify('#F5E6A0').lightness, 'light');
assert.equal(classify('#101830').lightness, 'dark');
assert.equal(classify('#8A8A8A').temperature, 'neutral');
assert.ok(classify('#948A82').warmth > classify('#82888F').warmth, 'a warm gray reads warmer than a cool gray');

// Pattern costs: a fit costs nothing, the reverse costs plenty.
assert.ok(temperatureCost([0.9, 0.5, 0.1, -0.3, -0.8], 'warm-to-cool') < 0.01);
assert.ok(temperatureCost([0.9, 0.5, 0.1, -0.3, -0.8], 'cool-to-warm') > 1);
assert.ok(shadeCost([0.1, 0.3, 0.5, 0.7, 0.9], 'dark-to-light') < 0.01);
assert.ok(shadeCost([0.1, 0.3, 0.5, 0.7, 0.9], 'light-to-dark') > 0.5);
assert.ok(shadeCost([0.2, 0.5, 0.9, 0.5, 0.2], 'dark-light-dark') < 0.01);
assert.ok(shadeCost([0.2, 0.5, 0.9, 0.5, 0.2], 'light-dark-light') > 0.5);
assert.ok(shadeCost([0.9, 0.5, 0.2, 0.5, 0.9], 'light-dark-light') < 0.01);
assert.ok(shadeCost([0.1, 0.3, 0.5, 0.7, 0.9], 'dark-light-dark') > 0.1, 'a plain slope is not a peak');

// Arranging: every palette gets both patterns, every color placed once, and the order fits what it says.
const palette = ['#E8552B', '#F2B540', '#2E6FA5', '#1F3A5F', '#8FB8C9', '#B85C38', '#3E2A2A'];
for (const roll of [0, 0.5, 0.99]) {
  const plan = arrange(palette, () => roll);
  assert.deepEqual([...plan.order].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.ok(['warm-to-cool', 'cool-to-warm'].includes(plan.temperature));
  assert.ok(['dark-to-light', 'light-to-dark', 'dark-light-dark', 'light-dark-light'].includes(plan.shade));
  const seen = plan.order.map((i) => classify(palette[i]));
  assert.ok(temperatureCost(seen.map((c) => c.warmth), plan.temperature) < 0.3);
}
// The choice of candidate keeps the count and stays in range.
const cands = palette.map((h) => [h, h, h]);
const kept = decide(cands, arrange(palette, () => 0));
assert.equal(kept.length, 7);
assert.ok(kept.every((c) => c >= 0 && c < 3));

// A small vivid patch is not lost among a large dull field, and a gradient keeps both its ends.
const field = new Uint8ClampedArray(40 * 40 * 4);
for (let i = 0; i < 1600; i++) field.set(i % 40 > 36 && i < 160 ? [220, 30, 40, 255] : [120 + (i % 9), 118 + (i % 7), 112 + (i % 8), 255], i * 4);
assert.ok(extractColors({ data: field, width: 40, height: 40 }, 3).some((c) => classify(c.hex).temperature === 'warm' && classify(c.hex).C > 0.15));
const ramp = new Uint8ClampedArray(60 * 10 * 4);
for (let i = 0; i < 600; i++) { const v = Math.round(((i % 60) / 59) * 255); ramp.set([v, v, v, 255], i * 4); }
const ends = extractColors({ data: ramp, width: 60, height: 10 }, 5).map((c) => classify(c.hex).L);
assert.ok(Math.min(...ends) < 0.2 && Math.max(...ends) > 0.9);

// Binary format headers and sizes.
const cols = ['#0000FF', '#808080', '#FF7F00'];
assert.equal(new TextDecoder().decode(f.ase(cols).slice(0, 4)), 'ASEF');
assert.equal(f.act(cols).length, 772);
assert.equal(f.aco(cols).length, 4 + 3 * 10 + 4 + 3 * (10 + 4 + 14));
assert.match(f.pal(cols), /^JASC-PAL\r\n0100\r\n3\r\n/);

// Zip: end record counts entries, each entry's stored CRC matches its bytes.
const blob = zip([{ name: 'a/x.txt', data: new TextEncoder().encode('hello') }, { name: 'b.bin', data: f.act(cols) }]);
const z = new Uint8Array(await blob.arrayBuffer());
const dv = new DataView(z.buffer);
assert.equal(dv.getUint16(z.length - 22 + 10, true), 2);
assert.equal(dv.getUint32(14, true), nodeCrc(new TextEncoder().encode('hello')));

// Queue: one at a time, in arrival order, late additions join the end, a failure does not stop the rest.
const seen = [];
let active = 0, most = 0;
const q = createQueue(async (x, left) => {
  active++; most = Math.max(most, active);
  await new Promise((r) => setTimeout(r, 5));
  seen.push(`${x}:${left}`);
  active--;
  if (x === 'b') throw new Error('boom');
}, { onError: () => {}, onIdle: () => { idled++; } });
let idled = 0;
q.add('a', 'b');
q.add('c');
await new Promise((r) => setTimeout(r, 100));
assert.deepEqual(seen, ['a:1', 'b:1', 'c:0']);
assert.equal(most, 1);
assert.equal(idled, 1);

console.log('ok');
