// Run: node test/check.mjs. Smallest checks that fail if the pure logic breaks.
import assert from 'node:assert/strict';
import { crc32 as nodeCrc } from 'node:zlib';
import { sequence, stackOrder, mix, variations, hexToHsl } from '../src/color.js';
import { extractColors, lightOnTop } from '../src/extract.js';
import * as f from '../src/export/formats.js';
import { zip } from '../src/export/zip.js';
import { createQueue } from '../src/queue.js';

// Temperature first, bottom to top: cool blue, then gray, then warm orange. Duplicates keep separate indices.
assert.deepEqual(stackOrder(['#FF8000', '#0080FF', '#808080'], true), [1, 2, 0]);
assert.deepEqual(stackOrder(['#0000FF', '#0000FF'], true).sort(), [0, 1]);
// A real palette that came out jumbled: muted purples and grays must still run warm to cool, top to bottom.
assert.deepEqual(stackOrder(['#262421', '#443E44', '#B253BC', '#A7AEB5', '#5C5E66', '#7F3E87', '#70878F'], true), [6, 3, 4, 5, 2, 1, 0]);
// Lightness only breaks near-ties: light above dark, or the reverse.
assert.deepEqual(stackOrder(['#EEEEEE', '#222222'], true), [1, 0]);
assert.deepEqual(stackOrder(['#EEEEEE', '#222222'], false), [0, 1]);
assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');

// Five variations, base first, hue shifts wrap.
const v = variations('#FF0000');
assert.equal(v.length, 5);
assert.equal(v[0], '#FF0000');
assert.ok(Math.abs(hexToHsl(v[3]).h - 350) < 1 && Math.abs(hexToHsl(v[4]).h - 10) < 1);

// A predetermined run of colors: right length, only the given colors, none twice in a row.
const run = sequence(['#111111', '#222222', '#333333', '#444444', '#555555'], 17);
assert.equal(run.length, 17);
assert.ok(run.every((c) => ['#111111', '#222222', '#333333', '#444444', '#555555'].includes(c)));
assert.ok(run.every((c, i) => i === 0 || c !== run[i - 1]));

// Two flat halves extract to their own colors, at a coordinate inside their half.
const w = 20, h = 10, data = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) data.set(i % w < 10 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
const got = extractColors({ data, width: w, height: h }, 2);
assert.deepEqual(got.map((c) => c.hex).sort(), ['#0000FF', '#FF0000']);
assert.ok(got.find((c) => c.hex === '#FF0000').x < 0.5 && got.find((c) => c.hex === '#0000FF').x > 0.5);

// The stack follows the picture: light over dark reads as light on top, the reverse as dark on top.
const tall = (topL, botL) => {
  const d = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < 16; i++) d.set(i < 8 ? [topL, topL, topL, 255] : [botL, botL, botL, 255], i * 4);
  return { data: d, width: 4, height: 4 };
};
assert.equal(lightOnTop(tall(230, 20)), true);
assert.equal(lightOnTop(tall(20, 230)), false);

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
