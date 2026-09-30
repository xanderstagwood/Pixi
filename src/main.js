import { rand, sleep } from './anim.js';
import { arrange, decide, fit, turnsOnMiddle } from './arrange.js';
import { hexToRgb, sequence, variations } from './color.js';
import { extractColors } from './extract.js';
import { createQueue } from './queue.js';
import { CHIPS, cardCells, cardPng, chipAt, fitCardCells, layout, paintTwinkle, renderCard, twinkleCells } from './card.js';
import { createCarousel } from './carousel.js';
import { holdButton } from './hold.js';
import { center, unit, watchPixelSnap } from './pixel.js';
import { createStage } from './stage.js';
import { createStack } from './stack.js';
import { createStore } from './store.js';
import { createTwinkle } from './twinkle.js';
import { attachReorder } from './reorder.js';
import { runScanners } from './scanners.js';
import { attachSwipe } from './swipe.js';
import { buildZip } from './export/bundle.js';
import { VERSION } from './version.js';

const $ = (id) => document.getElementById(id);
const track = $('track');

// Every duration in ms. The shrink is stage.js MORPH_MS, matched by the track transition in CSS.
const T = {
  ripple: 2000, lockGap: 100, hold: 1200,
  stagger: 140, roam: [7000, 10500], hits: [12, 16], // hits sets the length of the scan; roam is only the safety cap
  chargeToBurst: 1200,
};
const MAX_SIDE = 2048; // the working copy of a huge image never exceeds this
// Limits on what is accepted at all, so five huge files cannot strain a phone or a small laptop.
const MAX_BYTES = 25 * 1024 * 1024; // per file, so at most 225MB in a batch
const MAX_PIXELS = 64e6; // 8000 x 8000
const POOL = 12; // colors of a picture drawn on when a pattern needs the seven to be fitted (arrange.js fit)

const app = { status: 'IDLE' };
const setStatus = (s) => { app.status = s; document.body.dataset.status = s; };
const idle = () => app.status === 'IDLE' || app.status === 'CAROUSEL';

// The analysis in flight, if any: what a change of viewport has to lay out again.
let session = null;

const carousel = createCarousel(track, () => repaint());

// Cards are kept in the browser between visits (store.js); localStorage can throw where storage is blocked.
let storage = null;
try { storage = window.localStorage; } catch { /* no storage: cards last only this visit */ }
const store = createStore(storage);
const persist = () => store.save([...track.querySelectorAll('.card.palette')].map((c) => c.palette));
let saveSoon = 0; // typing a name saves once it pauses, not on every key
const persistSoon = () => { clearTimeout(saveSoon); saveSoon = setTimeout(persist, 400); };
const stage = createStage($('stage'), $('stage').querySelector('canvas'));

/** Decodes the file into a working canvas capped at MAX_SIDE; the original is let go at once. */
async function load(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    // Size is known once the header is read; check it before paying to decode a huge picture.
    await new Promise((done, fail) => { img.onload = done; img.onerror = fail; });
    if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) throw new Error('image too large');
    await img.decode();
  } finally { URL.revokeObjectURL(url); }
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

const paintCard = (card) => renderCard(card.querySelector('canvas'), card.palette, unit().n, { ui: true, dim: !card.classList.contains('focus') });

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

/** The first 12 characters of the file's name, without its extension: what a fresh card is called. */
const defaultName = (file) => file.name.replace(/\.[^.]*$/, '').trim().slice(0, 12);

/** @param {boolean} last no more images are waiting, so the name field may take focus */
async function analyze(file, last) {
  if (!idle()) return;
  await fontReady;
  let work;
  try { work = await load(file); } catch { return; }
  const pixels = sample(work);
  let clusters = extractColors(pixels, CHIPS);
  if (!clusters.length) return;

  // Everything about the palette is settled before anything moves, so the run itself never hitches.
  // Every palette gets a temperature pattern and a shade pattern together (arrange.js). A shade pattern
  // that turns needs colors that support it, so those are fitted to it from a larger pool. Then each color
  // keeps whichever of its five candidates makes the order fit its patterns best (decide).
  let arrangement = arrange(clusters.map((c) => c.hex));
  if (turnsOnMiddle(arrangement.shade)) {
    ({ colors: clusters, arrangement } = fit(clusters, extractColors(pixels, POOL), arrangement));
  }
  const bases = clusters.map((c) => c.hex);
  const candidates = bases.map(variations);
  const keep = decide(candidates, arrangement);
  const slotOf = []; // cluster index -> slot (0 = bottom row); the arrangement lists the top row first
  arrangement.order.forEach((cluster, row) => { slotOf[cluster] = CHIPS - 1 - row; });

  session = { scan: null };
  try {
    carousel.focus(Infinity, true);
    setStatus('EXPANDING');
    const bloxels = await stage.open(work, cardRect(), cardCells);

    work.width = work.height = 0; // the source pixels are spent: the bloxel grid holds all that is kept

    setStatus('ANALYZING');
    await bloxels.ripple(T.ripple);
    if (!stillMotion()) bloxels.twinkle.start(); // once the blocks are grown, a few catch the light

    const stack = createStack(CHIPS);
    $('stack-host').append(stack.el);
    stack.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'steps(5)' });

    const rgbOf = (hex) => Object.values(hexToRgb(hex));
    const targets = clusters.map((c, i) => ({ rgb: rgbOf(c.hex), final: rgbOf(candidates[i][keep[i]]) }));
    // What each chip will show is decided before anything moves, and the drone that hunts it goes to
    // the bloxel closest to that color: it comes to rest there, and only then does the chip shift.
    // When it parks, the chip lands on the kept color.
    const runs = candidates.map((c) => sequence(c, T.hits[1] + 2));
    const taken = clusters.map(() => 0);
    const landing = [];
    const scan = runScanners($('scanners'), bloxels, targets, {
      next: (i) => { const hex = runs[i][taken[i]++]; return { hex, rgb: rgbOf(hex) }; },
      onStop: (i, hex) => { stack.swapTo(slotOf[i], hex); },
      onFinish: (i) => { landing.push(stack.swapTo(slotOf[i], candidates[i][keep[i]])); },
    }, T);
    session.scan = scan;
    await scan.finished;
    await Promise.all(landing);
    bloxels.twinkle.stop(); // the lit ones fade out well before the window closes

    await Promise.all(clusters.map((_, slot) => sleep(slot * T.lockGap).then(() => stack.lock(slot))));
    await sleep(T.hold);
    scan.clear();

    const palette = { name: defaultName(file), colors: [], coordinates: [], grid: bloxels.keep(), copied: -1, createdAt: Date.now() };
    clusters.forEach((c, i) => {
      palette.colors[slotOf[i]] = candidates[i][keep[i]];
      palette.coordinates[slotOf[i]] = { x: c.x, y: c.y };
    });

    setStatus('SHRINKING');
    const card = carousel.insert(palette);
    wire(card);
    paintCard(card);
    await stage.close(cardRect);
    // The window has closed onto the card exactly, and the card is the same blocks and chips in
    // the same device pixels, so it takes over in the very frame the stage goes: no fade.
    card.style.visibility = '';
    stage.hide();
    $('stack-host').replaceChildren();
    persist();
    syncTwinkle();
    // Not on touch (it would raise the keyboard), and not mid-batch (the next image is already coming).
    if (last && matchMedia('(pointer: fine)').matches) card.querySelector('.name').focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    stage.hide();
  }
  stage.release();
  session = null;
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
  name.value = p.name;
  card.querySelector('.rm').addEventListener('click', () => { if (idle()) carousel.remove(card).then(persist); });
  name.addEventListener('input', () => { p.name = name.value; paintCard(card); persistSoon(); });
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

// Images dropped or chosen together are analysed one after another, in the order given, up to
// MAX_BATCH in one go. The corner tag counts them: this one of how many.
const MAX_BATCH = 9;
let batchTotal = 0, batchDone = 0;
const counter = $('counter');
const showCount = () => {
  counter.hidden = batchTotal === 0;
  counter.textContent = `${Math.min(batchDone + 1, batchTotal)}/${batchTotal}`;
};
const batch = createQueue(async (file, left) => {
  showCount();
  try { await analyze(file, left === 0); } finally { batchDone++; showCount(); }
}, { pause: () => sleep(500), onIdle: () => { batchTotal = batchDone = 0; showCount(); } });
const addImages = (files) => {
  const take = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_BYTES).slice(0, Math.max(0, MAX_BATCH - batchTotal));
  if (!take.length) return;
  batchTotal += take.length;
  showCount();
  batch.add(...take);
};

const go = (i) => { if (idle()) carousel.focus(i); };
// A narrow screen stacks the cards top to bottom; a wide one lays them out left to right.
const narrow = matchMedia('(max-width: 640px)');
const vertical = () => narrow.matches;
const applyAxis = () => document.body.classList.toggle('vertical', vertical());
narrow.addEventListener('change', applyAxis);
applyAxis();

attachReorder(track, { canDrag: idle, vertical, onReorder: (from, to) => { carousel.move(from, to); persist(); } });
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
  const files = [...e.target.files];
  e.target.value = '';
  addImages(files);
});

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('dragenter', () => document.body.classList.add('dragging'));
addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  addImages([...e.dataTransfer.files]);
});

const repaint = () => { document.querySelectorAll('.card.palette').forEach(paintCard); syncTwinkle(); };

// The focused card shimmers: now and then one of its blocks brightens and eases back, on a layer over the card.
// Anything else that changes what is focused, or how big things are, comes through repaint, which restarts it.
const stillMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const shimmers = new Map(); // card -> its twinkle
function syncTwinkle() {
  for (const t of shimmers.values()) t.halt();
  shimmers.clear();
  const card = carousel.focused;
  if (stillMotion() || !card?.palette || card.style.visibility === 'hidden') return;
  const base = card.querySelector('canvas'), overlay = card.querySelector('.twinkle');
  overlay.width = base.width;
  overlay.height = base.height;
  const ctx = overlay.getContext('2d'), blocks = twinkleCells(card.palette), s = unit().n;
  if (!blocks.length) return;
  const t = createTwinkle({
    rate: () => blocks.length / 80, // a good scatter at a time, not a shower
    pick: () => Math.floor(Math.random() * blocks.length),
    paint: (i, amount) => paintTwinkle(ctx, blocks[i], s, amount),
  });
  t.start();
  shimmers.set(card, t);
}
watchPixelSnap(() => {
  applyLayout();
  repaint();
  if (session) { // the viewport changed mid-analysis: re-lay the grid, then the drones onto it
    stage.relayout();
    session.scan?.refit();
  }
});
// Canvas text falls back to a plain font if it is drawn before the pixel font arrives, so
// wait for the font before analysing, and redraw the cards whenever a font finishes loading.
const fontReady = document.fonts.load('16px "Stagwood Sprite 64"');
// Cards from earlier visits come back once the pixel font is ready to draw their text.
fontReady.then(() => {
  const kept = store.load();
  for (const palette of kept) {
    const card = carousel.insert(palette);
    wire(card);
    paintCard(card);
    card.style.visibility = '';
  }
  if (kept.length) { carousel.focus(carousel.index, true); setStatus('CAROUSEL'); syncTwinkle(); }
});
document.fonts.addEventListener('loadingdone', repaint);
$('version-label').textContent = `Pixi v${VERSION}`;
setStatus('IDLE');
