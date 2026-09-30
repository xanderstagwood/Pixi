import { rand, shuffle, sleep } from './anim.js';
import { hexToRgb, stackOrder, variations } from './color.js';
import { extractColors, lightOnTop } from './extract.js';
import { CHIPS, cardCells, cardPng, chipAt, fitCardCells, layout, renderCard } from './card.js';
import { createCarousel } from './carousel.js';
import { holdButton } from './hold.js';
import { center, unit, watchPixelSnap } from './pixel.js';
import { createStage } from './stage.js';
import { createStack } from './stack.js';
import { attachReorder } from './reorder.js';
import { runScanners } from './scanners.js';
import { attachSwipe } from './swipe.js';
import { buildZip } from './export/bundle.js';

const $ = (id) => document.getElementById(id);
const track = $('track');

// Every duration in ms. The shrink is stage.js MORPH_MS, matched by the track transition in CSS.
const T = {
  ripple: 2400, lockGap: 160, hold: 900,
  stagger: 220, roam: [2600, 4800], dwell: [300, 560],
  chargeToBurst: 1200,
};
const MAX_SIDE = 2048; // the working copy of a huge image never exceeds this

const app = { status: 'IDLE' };
const setStatus = (s) => { app.status = s; document.body.dataset.status = s; };
const idle = () => app.status === 'IDLE' || app.status === 'CAROUSEL';

const carousel = createCarousel(track);
const stage = createStage($('stage'), $('stage').querySelector('canvas'));

/**
 * Seam for the future decision engine: given every slot's five candidates, return the
 * index to keep for each. Until then every slot keeps its base color.
 */
const choose = (slots) => slots.map(() => 0);

/** Decodes the file into a working canvas capped at MAX_SIDE; the original is let go at once. */
async function load(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } finally { URL.revokeObjectURL(url); }
  const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const work = Object.assign(document.createElement('canvas'), {
    width: Math.max(1, Math.round(img.naturalWidth * s)),
    height: Math.max(1, Math.round(img.naturalHeight * s)),
  });
  work.getContext('2d').drawImage(img, 0, 0, work.width, work.height);
  img.src = '';
  return work;
}

/** The working canvas shrunk to at most 200px on its long side, as ImageData. */
function sample(work, max = 200) {
  const s = Math.min(1, max / Math.max(work.width, work.height));
  const w = Math.max(1, Math.round(work.width * s)), h = Math.max(1, Math.round(work.height * s));
  const g = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
  g.drawImage(work, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}

/** Show each slot's five candidates one after another, ending on the one kept. */
async function compare(stack, slot, candidates, keep) {
  const seq = [...shuffle([1, 2, 3, 4]), keep].filter((c, k, a) => c !== a[k - 1]);
  await stack.swapTo(slot, candidates[0]);
  for (const c of seq) {
    await sleep(rand(...T.dwell));
    await stack.swapTo(slot, candidates[c]);
  }
}

const paintCard = (card) => renderCard(card.querySelector('canvas'), card.palette, unit().n, { ui: true });

/** Sizes the card, and the CSS that positions things inside it, for the current viewport. */
function applyLayout() {
  fitCardCells();
  const L = layout(), root = document.documentElement.style;
  for (const [name, v] of Object.entries({ cw: L.w, ch: L.h, kw: L.chips.w, sx: L.chips.x, sy: L.chips.y, nx: L.name.x, ny: L.name.y, nw: L.name.w })) {
    root.setProperty(`--${name}`, v);
  }
}

/** The card's window, centered in the viewport, in CSS px. */
function cardRect() {
  const { css } = unit(), L = layout(), c = center();
  const w = L.w * css, h = L.h * css;
  return new DOMRect(c.x - w / 2, c.y - h / 2, w, h);
}

async function analyze(file) {
  if (!idle()) return;
  await fontReady;
  let work;
  try { work = await load(file); } catch { return; }
  const pixels = sample(work);
  const clusters = extractColors(pixels, CHIPS);
  if (!clusters.length) return;
  const lightAtTop = lightOnTop(pixels);

  try {
    carousel.focus(Infinity, true);
    setStatus('EXPANDING');
    const bloxels = await stage.open(work, cardRect(), unit(), cardCells());
    work.width = work.height = 0; // the source pixels are spent: the bloxel grid holds all that is kept

    setStatus('ANALYZING');
    await bloxels.ripple(T.ripple);

    const bases = clusters.map((c) => c.hex);
    const slotOf = []; // cluster index -> slot (0 = bottom row)
    stackOrder(bases, lightAtTop).forEach((cluster, slot) => { slotOf[cluster] = slot; });
    const candidates = bases.map(variations);
    const keep = choose(candidates);

    const stack = createStack(CHIPS);
    $('stack-host').append(stack.el);
    stack.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'steps(5)' });

    const targets = clusters.map((c) => ({ rgb: Object.values(hexToRgb(c.hex)), ...bloxels.cellAt(c.x, c.y) }));
    const comparing = [];
    const scan = runScanners($('scanners'), bloxels, targets, (i) => {
      comparing.push(compare(stack, slotOf[i], candidates[i], keep[i]));
    }, T);
    await scan.finished;
    await Promise.all(comparing);

    await Promise.all(clusters.map((_, slot) => sleep(slot * T.lockGap).then(() => stack.lock(slot))));
    await sleep(T.hold);
    await scan.clear();

    const palette = { name: '', colors: [], coordinates: [], grid: bloxels.keep(), copied: -1, createdAt: Date.now() };
    clusters.forEach((c, i) => {
      palette.colors[slotOf[i]] = candidates[i][keep[i]];
      palette.coordinates[slotOf[i]] = { x: c.x, y: c.y };
    });

    setStatus('SHRINKING');
    const card = carousel.insert(palette);
    wire(card);
    paintCard(card);
    await stage.close();
    // The window has closed onto the card exactly, and the card is the same blocks and chips in
    // the same device pixels, so it takes over in the very frame the stage goes: no fade.
    card.style.visibility = '';
    stage.hide();
    $('stack-host').replaceChildren();
    if (matchMedia('(pointer: fine)').matches) card.querySelector('.name').focus({ preventScroll: true }); // not on touch: it would raise the keyboard
  } catch (err) {
    console.error(err);
    stage.hide();
  }
  work.width = work.height = 0;
  setStatus('CAROUSEL');
}

/* ---- finished cards ---- */

const fileBase = (p) => p.name.trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'palette';

function save(blob, name) {
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const exportPng = async (p) => save(await cardPng(p), `${fileBase(p)}.png`);
const exportZip = async (p) => save(await buildZip({ name: fileBase(p), colors: p.colors }, await cardPng(p)), `${fileBase(p)}.zip`);

/** A ring of red squares flies out of the button, and its icon steps back in. */
function burst(button) {
  const { dpr, css } = unit();
  const snap = (v) => Math.round(v * dpr) / dpr;
  const r = button.getBoundingClientRect();
  const x = snap(r.left + r.width / 2 - 2 * css), y = snap(r.top + r.height / 2 - 2 * css);
  const count = 14;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rand(-0.2, 0.2), d = Math.round(rand(24, 72)) * css;
    const spark = Object.assign(document.createElement('div'), { className: 'spark' });
    document.body.append(spark);
    spark.animate([
      { transform: `translate(${x}px, ${y}px)`, opacity: 1 },
      { transform: `translate(${snap(x + Math.cos(a) * d)}px, ${snap(y + Math.sin(a) * d)}px)`, opacity: 0 },
    ], { duration: 520, easing: 'steps(6)' }).finished.then(() => spark.remove());
  }
  button.querySelector('.icon').animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: 1400, easing: 'steps(8)' });
}

function wire(card) {
  const p = card.palette, name = card.querySelector('.name'), dl = card.querySelector('.dl');
  card.querySelector('.rm').addEventListener('click', () => { if (idle()) carousel.remove(card); });
  name.addEventListener('input', () => { p.name = name.value; paintCard(card); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  holdButton(dl, {
    ms: T.chargeToBurst,
    onTap: () => exportPng(p),
    onCharge: (v) => {
      dl.classList.toggle('charging', v > 0);
      dl.style.setProperty('--charge', v);
      dl.style.setProperty('--shake', v > 0 ? Math.round((Math.random() - 0.5) * 4 * v) : 0); // whole font pixels
    },
    onBurst: () => {
      dl.classList.remove('charging');
      dl.style.setProperty('--charge', 0);
      dl.style.setProperty('--shake', 0);
      burst(dl);
      exportZip(p);
    },
  });
}

function copyChip(card, e) {
  const { css } = unit(), p = card.palette;
  const k = chipAt(e.offsetX / css, e.offsetY / css, p.colors.length);
  if (k < 0) return;
  navigator.clipboard?.writeText(p.colors[k]);
  p.copied = k;
  paintCard(card);
  setTimeout(() => { p.copied = -1; paintCard(card); }, 700);
}

/* ---- input ---- */

const go = (i) => { if (idle()) carousel.focus(i); };
// A narrow screen stacks the cards top to bottom; a wide one lays them out left to right.
const narrow = matchMedia('(max-width: 640px)');
const vertical = () => narrow.matches;
const applyAxis = () => document.body.classList.toggle('vertical', vertical());
narrow.addEventListener('change', applyAxis);
applyAxis();

attachReorder(track, { canDrag: idle, vertical, onReorder: (from, to) => carousel.move(from, to) });
attachSwipe(track, { canSwipe: idle, vertical, index: () => carousel.index, onSettle: go });

// The wheel steps through the cards: a notch is a card, and a trackpad's small deltas add up to one.
let wheelSum = 0, wheelLast = 0, wheelStep = 0;
addEventListener('wheel', (e) => {
  if (!idle() || e.target.closest?.('input')) return;
  e.preventDefault();
  const now = performance.now();
  const d = vertical() || Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  wheelSum = now - wheelLast > 200 ? d : wheelSum + d;
  wheelLast = now;
  if (Math.abs(wheelSum) < 60 || now - wheelStep < 220) return;
  go(carousel.index + Math.sign(wheelSum));
  wheelSum = 0;
  wheelStep = now;
}, { passive: false });

// A long-press on touch would open the browser's image menu; a mouse right-click still gets it, to save the card.
let touching = false;
addEventListener('pointerdown', (e) => { touching = e.pointerType !== 'mouse'; }, true);
addEventListener('contextmenu', (e) => { if (touching) e.preventDefault(); });

track.addEventListener('click', (e) => {
  if (!idle() || e.target.closest('.dl, .rm, .name')) return;
  const card = e.target.closest('.card');
  if (!card) return;
  const i = [...track.children].indexOf(card);
  if (i !== carousel.index) return go(i);
  if (card === carousel.add) return $('file').click();
  if (e.target.closest('canvas')) copyChip(card, e);
});

addEventListener('keydown', (e) => {
  if (e.target.matches?.('input')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(carousel.index - 1);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(carousel.index + 1);
});

$('file').addEventListener('change', (e) => {
  const [file] = e.target.files;
  e.target.value = '';
  if (file) analyze(file);
});

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('dragenter', () => document.body.classList.add('dragging'));
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (file) analyze(file);
});

const repaint = () => document.querySelectorAll('.card.palette').forEach(paintCard);
watchPixelSnap(() => { applyLayout(); repaint(); });
// Canvas text falls back to a plain font if it is drawn before the pixel font arrives, so
// wait for the font before analysing, and redraw the cards whenever a font finishes loading.
const fontReady = document.fonts.load('16px "Stagwood Sprite 64"');
document.fonts.addEventListener('loadingdone', repaint);
setStatus('IDLE');
