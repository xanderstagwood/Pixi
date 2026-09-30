import { frames, rand, randInt, sleep } from './anim.js';

const SIZE = 1; // scanner outline is SIZE x SIZE cells: one bloxel

/**
 * Seven square drones hop across the block grid. Each hunts one color cluster: it
 * roams, counts matching cells it lands on, then flies to the cluster's real spot and
 * parks there. `onFinish(i)` fires as each parks; the promise resolves when all have.
 * @param {HTMLElement} host positioned layer the drones live in
 * @param {ReturnType<import('./bloxel.js').createBloxels>} grid
 * @param {{rgb: number[], fx: number, fy: number}[]} targets one per cluster: its color, and where in the
 *        image (0-1 fractions) its color really sits, so a parked drone can be re-placed if the grid changes
 * @param {{stagger: number, roam: [number, number]}} timing ms between launches; range of roam time per drone
 */
export function runScanners(host, grid, targets, onFinish, { stagger, roam }) {
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

  const now0 = performance.now();
  const drones = targets.map((t, i) => {
    const el = document.createElement('div');
    el.className = 'scanner';
    el.style.width = el.style.height = `${SIZE * grid.cell}px`;
    host.append(el);
    const s = {
      i, el, cx: randInt(0, cols - 1), cy: randInt(0, rows - 1), hits: 0, need: randInt(3, 5),
      startAt: now0 + i * stagger, deadline: now0 + i * stagger + rand(...roam), homing: false, done: false, t0: 0, dur: 1,
    };
    s.from = s.to = { cx: s.cx, cy: s.cy };
    el.style.opacity = '0';
    place(s);
    return s;
  });

  const finished = frames((_, now) => {
    for (const s of drones) {
      if (s.done || now < s.startAt) continue;
      if (!s.started) {
        s.started = true;
        s.el.style.opacity = '1';
        s.el.animate([{ scale: 0 }, { scale: 1 }], { duration: 200, easing: 'steps(4)' });
        hop(s, s.cx, s.cy, now);
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
        continue;
      }
      if (owner[s.to.cy * cols + s.to.cx] === s.i) {
        s.hits++;
        s.el.animate([{ background: 'rgba(243,242,241,0.4)' }, { background: 'rgba(243,242,241,0)' }], { duration: 180 });
      }
      if (s.hits >= s.need || now >= s.deadline) {
        s.homing = true;
        const home = grid.cellAt(targets[s.i].fx, targets[s.i].fy);
        hop(s, home.cx, home.cy, now);
      } else if (Math.random() < 0.5 && mine[s.i].length) {
        const c = mine[s.i][randInt(0, mine[s.i].length - 1)];
        hop(s, c % cols, Math.floor(c / cols), now);
      } else {
        const near = (v, max) => Math.min(max - 1, Math.max(0, Math.round(v + rand(-10, 10))));
        hop(s, near(s.cx, cols), near(s.cy, rows), now);
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
      const scale = (p) => ({ cx: Math.min(cols - 1, p.cx * kx), cy: Math.min(rows - 1, p.cy * ky) });
      for (const s of drones) {
        Object.assign(s, scale(s));
        s.from = scale(s.from);
        s.to = scale(s.to);
        if (s.done) Object.assign(s, (({ cx, cy }) => ({ cx, cy }))(grid.cellAt(targets[s.i].fx, targets[s.i].fy)));
        s.el.style.width = s.el.style.height = `${SIZE * grid.cell}px`;
        place(s);
      }
    },
    /** Fade the drones out and remove them. */
    async clear() {
      drones.forEach((s) => s.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'steps(4)', fill: 'forwards' }));
      await sleep(300);
      host.replaceChildren();
    },
  };
}
