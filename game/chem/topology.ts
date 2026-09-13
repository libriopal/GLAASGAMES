// game/chem/topology.ts — the board's shape, as a factor rather than a constant.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE HEX IS NOT A RESKIN.
//
// The square board gives each interior cell four neighbours. A hex gives six,
// and the difference is not decoration: "bring two reagents together" is a
// two-axis problem on a hex and a four-direction one on a square, and the
// measured defect in this game is precisely that a player cannot construct an
// opportunity. More adjacency is more routes.
//
// It also changes the EDGE. A square board's edge cells lose one neighbour; a
// hex's corner cells drop from six to three. That is a real positional asymmetry
// — some cells are genuinely worse real estate — where the square board's edges
// were nearly interchangeable.
//
// Both are offered as levels of one factor rather than one replacing the other,
// because the phase-2 numbers were all taken on the square and a change that
// invalidates the control is not an improvement, it is a reset.
//
// ─────────────────────────────────────────────────────────────────────────────
// RADIUS 3 GIVES 37 CELLS AGAINST THE SQUARE'S 36.
//
// 1 + 6(1+2+3) = 37. Chosen so area is within one cell of the square board and
// every measurement stays comparable; a hex of radius 4 is 61 cells and would
// have confounded "hex helps" with "a bigger board helps".

export type Topology = 'SQUARE36' | 'HEX37';

export const TOPOLOGIES: readonly Topology[] = ['SQUARE36', 'HEX37'];

/** Axial hex coordinates. `s` is derived: q + r + s = 0. */
export interface Axial {
  readonly q: number;
  readonly r: number;
}

const HEX_RADIUS = 3;

const HEX_CELLS: readonly Axial[] = (() => {
  const out: Axial[] = [];
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q += 1) {
    for (let r = -HEX_RADIUS; r <= HEX_RADIUS; r += 1) {
      if (Math.abs(q + r) <= HEX_RADIUS) out.push({ q, r });
    }
  }
  return out;
})();

const SQUARE_W = 6;
const SQUARE_H = 6;

export function cellCount(t: Topology): number {
  return t === 'HEX37' ? HEX_CELLS.length : SQUARE_W * SQUARE_H;
}

/** The six axial directions, in the order a chemist would read a ring. */
const HEX_DIRS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

const NEIGHBOUR_CACHE = new Map<Topology, readonly (readonly number[])[]>();

export function neighbours(t: Topology): readonly (readonly number[])[] {
  const hit = NEIGHBOUR_CACHE.get(t);
  if (hit !== undefined) return hit;

  let out: number[][];
  if (t === 'HEX37') {
    const index = new Map<string, number>();
    HEX_CELLS.forEach((c, i) => index.set(`${c.q},${c.r}`, i));
    out = HEX_CELLS.map((c) => {
      const a: number[] = [];
      for (const d of HEX_DIRS) {
        const j = index.get(`${c.q + d.q},${c.r + d.r}`);
        if (j !== undefined) a.push(j);
      }
      return a;
    });
  } else {
    out = [];
    for (let i = 0; i < SQUARE_W * SQUARE_H; i += 1) {
      const c = i % SQUARE_W;
      const r = (i / SQUARE_W) | 0;
      const a: number[] = [];
      if (r > 0) a.push(i - SQUARE_W);
      if (r < SQUARE_H - 1) a.push(i + SQUARE_W);
      if (c > 0) a.push(i - 1);
      if (c < SQUARE_W - 1) a.push(i + 1);
      out.push(a);
    }
  }
  NEIGHBOUR_CACHE.set(t, out);
  return out;
}

export function adjacentIn(t: Topology, a: number, b: number): boolean {
  return a !== b && (neighbours(t)[a]?.includes(b) ?? false);
}

const REGION_CACHE = new Map<string, readonly (readonly number[])[]>();

/**
 * Every connected selection of 2..maxSelect cells.
 *
 * Memoised on (topology, maxSelect) because it is pure and the hex's region
 * count is large enough that rebuilding it per call dominates a sweep.
 *
 * The `n > cur[0]` guard is what makes each set appear exactly once: growth is
 * only ever allowed into cells above the seed, so a region is enumerated from
 * its lowest-numbered cell and from nowhere else.
 */
export function regions(t: Topology, maxSelect: number): readonly (readonly number[])[] {
  const key = `${t}:${maxSelect}`;
  const hit = REGION_CACHE.get(key);
  if (hit !== undefined) return hit;

  const nb = neighbours(t);
  const n = cellCount(t);
  const out: number[][] = [];
  const seen = new Set<string>();
  const grow = (cur: number[]): void => {
    if (cur.length >= 2) {
      const k = cur.join(',');
      if (!seen.has(k)) { seen.add(k); out.push([...cur]); }
    }
    if (cur.length === maxSelect) return;
    const cand = new Set<number>();
    for (const c of cur) for (const x of nb[c]!) if (!cur.includes(x) && x > cur[0]!) cand.add(x);
    for (const x of cand) {
      cur.push(x);
      cur.sort((a, b) => a - b);
      grow(cur);
      cur.splice(cur.indexOf(x), 1);
    }
  };
  for (let s = 0; s < n; s += 1) grow([s]);
  REGION_CACHE.set(key, out);
  return out;
}

/**
 * The cells that count as the delivery dock.
 *
 * On the square it is the bottom row. On the hex "the bottom row" is not a
 * thing, so it is the cells at maximum r — the lower edge of the hexagon — which
 * is the same idea expressed in the coordinate system that board actually has.
 * Taking the last N indices instead would have selected an arbitrary arc, and
 * the dock would then mean something different on each topology while wearing
 * one name.
 */
export function dockCells(t: Topology): readonly number[] {
  if (t === 'HEX37') {
    const out: number[] = [];
    HEX_CELLS.forEach((c, i) => { if (c.r === HEX_RADIUS) out.push(i); });
    return out;
  }
  const out: number[] = [];
  for (let i = SQUARE_W * (SQUARE_H - 1); i < SQUARE_W * SQUARE_H; i += 1) out.push(i);
  return out;
}

/** Pixel centre of a cell, for the renderer. Unit size; the screen scales it. */
export function cellCentre(t: Topology, i: number): { x: number; y: number } {
  if (t === 'HEX37') {
    const c = HEX_CELLS[i]!;
    // Pointy-top axial to pixel. The board is centred on cell (0,0).
    return { x: Math.sqrt(3) * (c.q + c.r / 2), y: 1.5 * c.r };
  }
  return { x: (i % SQUARE_W) - (SQUARE_W - 1) / 2, y: ((i / SQUARE_W) | 0) - (SQUARE_H - 1) / 2 };
}

/** How many neighbours each cell has, which is the positional asymmetry itself. */
export function degreeHistogram(t: Topology): Map<number, number> {
  const h = new Map<number, number>();
  for (const a of neighbours(t)) h.set(a.length, (h.get(a.length) ?? 0) + 1);
  return h;
}
