// Palette cards, kept in the browser between visits. Only what a card is drawn from is kept: its
// name, its seven colors and its bloxel grid (three bytes a cell). The image itself never is.
// localStorage is enough: it is small and simple, and losing it only means the cards are gone.

const KEY = 'pixi.palettes.v1';
const HEX = /^#[0-9A-F]{6}$/i;

/** RGBA bytes to a base64 string of just the RGB, three bytes a cell. */
export function pack(rgba) {
  const bytes = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) { bytes[j++] = rgba[i]; bytes[j++] = rgba[i + 1]; bytes[j++] = rgba[i + 2]; }
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The reverse of `pack`, back to opaque RGBA; null if it is not `cells` cells long. */
export function unpack(base64, cells) {
  let text;
  try { text = atob(base64); } catch { return null; }
  if (text.length !== cells * 3) return null;
  const out = new Uint8ClampedArray(cells * 4);
  for (let i = 0; i < cells; i++) {
    out[i * 4] = text.charCodeAt(i * 3);
    out[i * 4 + 1] = text.charCodeAt(i * 3 + 1);
    out[i * 4 + 2] = text.charCodeAt(i * 3 + 2);
    out[i * 4 + 3] = 255;
  }
  return out;
}

const toStored = (p) => ({
  name: p.name,
  colors: p.colors,
  createdAt: p.createdAt,
  grid: { cols: p.grid.cols, rows: p.grid.rows, cx: p.grid.cx, cy: p.grid.cy, rgb: pack(p.grid.rgb) },
});

/** A stored card back into a palette, or null if it does not look right (so bad data is skipped, not trusted). */
function fromStored(o) {
  const g = o?.grid;
  if (typeof o?.name !== 'string' || !Array.isArray(o.colors) || o.colors.length !== 7 || !o.colors.every((c) => HEX.test(c))) return null;
  if (![g?.cols, g?.rows, g?.cx, g?.cy].every(Number.isFinite) || g.cols < 1 || g.rows < 1 || g.cols * g.rows > 1e6) return null;
  const rgb = typeof g.rgb === 'string' ? unpack(g.rgb, g.cols * g.rows) : null;
  if (!rgb) return null;
  return {
    name: o.name.slice(0, 12), colors: o.colors, coordinates: [], copied: -1,
    createdAt: Number.isFinite(o.createdAt) ? o.createdAt : Date.now(),
    grid: { cols: g.cols, rows: g.rows, cx: g.cx, cy: g.cy, rgb },
  };
}

/**
 * @param {Storage | null} storage localStorage, or null where it is unavailable (then nothing is kept)
 */
export function createStore(storage) {
  return {
    /** Write every card, in order. If the browser is full, keep as many of the newest as fit. */
    save(palettes) {
      if (!storage) return;
      const stored = palettes.map(toStored);
      for (let n = stored.length; n >= 0; n--) {
        try { storage.setItem(KEY, JSON.stringify(stored.slice(stored.length - n))); return; } catch { /* too big: try fewer */ }
      }
    },
    /** Every card that was kept and still looks right, in order. */
    load() {
      try {
        const data = JSON.parse(storage?.getItem(KEY) ?? '[]');
        return Array.isArray(data) ? data.map(fromStored).filter(Boolean) : [];
      } catch { return []; }
    },
  };
}
