import { frames, rand, randInt } from './anim.js';

const SIZE = 1; // scanner outline is SIZE x SIZE cells: one bloxel
const PARK_MS = 500; // how long a parked drone stays visible before it fades
const NEAREST = 4; // a drone picks at random among this many closest matches, so no two runs retrace one path

/**
 * Seven square drones hop across the block grid. Each is given the colors its chip will show,
 * in order, and hunts them: it hops to the bloxel of its own cluster that looks most like the next
 * one, and comes to rest there. When it has rested enough times it flies to the bloxel nearest its
 * chip's final color and parks. The promise resolves when all have parked.
 * @param {HTMLElement} host positioned layer the drones live in
 * @param {ReturnType<import('./bloxel.js').createBloxels>} grid
 * @param {{rgb: number[], final: number[]}[]} targets per cluster: its color (which bloxels are its own), and
 *        the color of the chip when it settles
 * @param {{next: (i: number) => {rgb: number[], hex: string}, onStop: (i: number, hex: string) => void, onFinish: (i: number) => void}} hooks
 *        `next` is the next color drone i is to hunt; `onStop` fires when it comes to rest on a match for it
 * @param {{stagger: number, roam: [number, number], hits: [number, number]}} opts ms between launches; the latest a drone
 *        roams before it heads home; how many rests it makes first (this sets how long the scan runs)
 */
export function runScanners(host, grid, targets, { next, onStop, onFinish }, { stagger, roam, hits }) {
  // The grid can be laid out again (the viewport changed), so its size is read live and everything
  // derived from it is rebuilt by `refit`.
  let { cols, rows } = grid;
  let owner, mine;
  const claim = () => {
    owner = Uint8Array.from({ length: cols * rows }, (_, i) => {
      const c = grid.rgb(i);
      let best = 0, bd = Infinity;
      targets.forEach((t, j) => {
        const d = (c[0] - t.rgb[0]) ** 2 + (c[1] - t.rgb[1]) ** 2 + (c[2] - t.rgb[2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      return best;
    });
    mine = targets.map((_, j) => owner.reduce((a, o, i) => (o === j ? (a.push(i), a) : a), []));
  };
  claim();

  /** Cells of cluster `i`, closest in color to `rgb` first (the whole grid if the cluster owns none). */
  const closest = (i, rgb, count) => {
    const pool = mine[i].length ? mine[i] : Array.from({ length: cols * rows }, (_, c) => c);
    return pool
      .map((c) => { const p = grid.rgb(c); return [(p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2, c]; })
      .sort((a, b) => a[0] - b[0])
      .slice(0, count)
      .map((x) => x[1]);
  };

  const ease = (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
  const place = (s) => {
    const half = (SIZE - 1) / 2;
    const x = grid.origin.x + (Math.round(s.cx) - half) * grid.cell, y = grid.origin.y + (Math.round(s.cy) - half) * grid.cell;
    s.el.style.transform = `translate(${x}px, ${y}px)`;
  };
  const hop = (s, cx, cy, now) => {
    s.from = { cx: s.cx, cy: s.cy };
    s.to = { cx, cy };
    s.t0 = now;
    s.dur = Math.min(900, 260 + Math.hypot(cx - s.cx, cy - s.cy) * 16);
  };
  /** Head for the bloxel that best matches `rgb`, other than the one it is on. */
  const seek = (s, rgb, now) => {
    const here = Math.round(s.cy) * cols + Math.round(s.cx);
    const options = closest(s.i, rgb, NEAREST + 1).filter((c) => c !== here).slice(0, NEAREST);
    const c = options[randInt(0, options.length - 1)] ?? here;
    hop(s, c % cols, Math.floor(c / cols), now);
  };

  const now0 = performance.now();
  const drones = targets.map((t, i) => {
    const el = document.createElement('div');
    el.className = 'scanner';
    el.style.width = el.style.height = `${SIZE * grid.cell}px`;
    host.append(el);
    const s = {
      i, el, cx: randInt(0, cols - 1), cy: randInt(0, rows - 1), rests: 0, need: randInt(...hits), wants: '',
      startAt: now0 + i * stagger, deadline: now0 + i * stagger + rand(...roam), homing: false, done: false, t0: 0, dur: 1,
    };
    s.from = s.to = { cx: s.cx, cy: s.cy };
    el.style.opacity = '0';
    place(s);
    return s;
  });

  /** Pick the color to hunt next and go for the bloxel that matches it. */
  const hunt = (s, now) => {
    const want = next(s.i);
    s.wants = want.hex;
    seek(s, want.rgb, now);
  };

  const finished = frames((_, now) => {
    for (const s of drones) {
      if (s.done || now < s.startAt) continue;
      if (!s.started) {
        s.started = true;
        s.el.style.opacity = '1';
        s.el.animate([{ scale: 0 }, { scale: 1 }], { duration: 200, easing: 'steps(4)' });
        hunt(s, now);
      }
      const u = Math.min(1, (now - s.t0) / s.dur);
      s.cx = s.from.cx + (s.to.cx - s.from.cx) * ease(u);
      s.cy = s.from.cy + (s.to.cy - s.from.cy) * ease(u);
      place(s);
      if (u < 1) continue;

      if (s.homing) {
        s.done = true;
        s.el.classList.add('parked');
        s.el.animate([{ background: 'rgba(243,242,241,0.6)' }, { background: 'rgba(243,242,241,0)' }], { duration: 300 });
        onFinish(s.i);
        // Its work is done: let it show where it landed, then step away while the chips finish.
        setTimeout(() => s.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'steps(4)', fill: 'forwards' }).finished.then(() => s.el.remove()), PARK_MS);
        continue;
      }
      s.rests++;
      s.el.animate([{ background: 'rgba(243,242,241,0.4)' }, { background: 'rgba(243,242,241,0)' }], { duration: 180 });
      onStop(s.i, s.wants);
      if (s.rests >= s.need || now >= s.deadline) {
        s.homing = true;
        seek(s, targets[s.i].final, now);
      } else {
        hunt(s, now);
      }
    }
    return drones.every((s) => s.done);
  });

  return {
    finished,
    /** The grid was laid out again: carry every drone to the same place in the new one. */
    refit() {
      const kx = grid.cols / cols, ky = grid.rows / rows;
      ({ cols, rows } = grid);
      claim();
      // Whole cells only: a fractional one has no bloxel under it.
      const scale = (p) => ({ cx: Math.min(cols - 1, Math.round(p.cx * kx)), cy: Math.min(rows - 1, Math.round(p.cy * ky)) });
      for (const s of drones) {
        Object.assign(s, scale(s));
        s.from = scale(s.from);
        s.to = scale(s.to);
        if (s.done) {
          const c = closest(s.i, targets[s.i].final, 1)[0];
          if (c !== undefined) Object.assign(s, { cx: c % cols, cy: Math.floor(c / cols) });
        }
        s.el.style.width = s.el.style.height = `${SIZE * grid.cell}px`;
        place(s);
      }
    },
    /** Remove whatever is left: normally every drone has faded away already. */
    clear() { host.replaceChildren(); },
  };
}
