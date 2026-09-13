// web/synth-screen.ts — the synthesis line, drawn from the shipping state.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY VISUAL DEFECT THIS PROJECT FOUND WAS FOUND BY RENDERING, NOT REVIEW.
//
// Farkle's list, in order: a bounding-box hand ground that re-created the fence
// the audit warned about · a bank button clipped by 8px · a "BANK 0" affordance
// offering to make zero safe · near-monochrome against a colourful brief · pips
// at APCA Lc 29 on their own body · die bodies at Lc 0 against the deck ·
// brightening them made them compete with the hand.
//
// So this file draws, and then it gets looked at. Contrast is SWEPT rather than
// eyeballed, because every one of those fixes came from a sweep.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BANDS ARE CLAIMS ABOUT EPISTEMIC STATUS, NOT A PALETTE.
//
//   matter  what IS        molecules on the board, the bank, shipped orders
//   ir      what MIGHT go wrong   sinks, an expiring declaration
//   uv      what is HIDDEN        open orders and the queue — an order is an
//                                 intention, which is exactly what UV means
//   cyan    what the ENGINE READS the readout frame, read-only
//
// "A band whose colour lies about its content is a defect, not a style
// preference." The readout wore IR once while reporting something already
// decided; that was the first direction of the same error.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE ORDER BOOK IS A SPECTRUM AND NOT A ROW OF CARDS.
//
// The brief asks all three games to carry IR/UV forecasting, and game two
// replaces the two-row grid with a spectral readout. Orders emit UV lines;
// sinks emit IR lines; a line MIGRATES toward the matter band as its order
// becomes reachable, so "you can make this now" is a POSITION rather than a
// number. Position carries the information and hue is redundant with it, which
// the two-row grid could not claim.
//
// The swapped-row rule carries over as DEPTH: what is certain renders nearer the
// matter band, what is guessed renders further into UV.

import {
  ENGINE,
  IR_CORE,
  IR_DEEP,
  MATTER,
  UV,
  VOID_DEEP,
  desaturate,
  mixRgb,
  toCss,
} from './spectrum.js';
import { MOLECULES, type Molecule, bondsOf } from '../game/chem/library.js';
import { type Topology, cellCentre, neighbours } from '../game/chem/topology.js';

const BY = new Map(MOLECULES.map((m) => [m.formula, m] as const));

/** Element colours, assigned from the matter band by atomic identity. */
const ELEMENT_BAND: Record<string, number> = {
  H: 1, C: 2, N: 3, O: 4, F: 5, Cl: 6,
};

const hex = (s: string): { r: number; g: number; b: number } => ({
  r: parseInt(s.slice(1, 3), 16),
  g: parseInt(s.slice(3, 5), 16),
  b: parseInt(s.slice(5, 7), 16),
});

/**
 * An atom's colour, lifted toward ink so it reads against its own molecule body.
 *
 * The same fix Farkle's pips needed: a red pip on a red body measured APCA Lc 29
 * and broke the hue/shape redundancy. Swept there at 0.45/0.70/0.78 and shipped
 * at 0.78; the same mix is used here rather than re-derived, because the ground
 * and the geometry are the same.
 */
export function atomFill(sym: string): string {
  const band = ELEMENT_BAND[sym] ?? 0;
  const base = hex(MATTER[band] ?? MATTER[0]!);
  return toCss(mixRgb(base, { r: 240, g: 246, b: 255 }, 0.30));
}

export const CELL_R = 30;
const BOND_INK = '#cfe4f5';

/**
 * One molecule, drawn from its REAL skeleton.
 *
 * A double bond is two lines because it IS two lines. Drawing bond order as a
 * label, or as one thicker line, would be the tile telling a different story
 * from the chemistry the executor scores.
 */
export function moleculeGlyph(m: Molecule, cx: number, cy: number, scale: number): string {
  const n = m.atoms.length;
  const out: string[] = [];
  // Positions: the central atom (index 0) at the centre, substituents around it
  // at the molecule's TABULATED angle where it has one. Water is bent at 104.5
  // and CO2 is linear at 180; one schematic angle cannot serve both, and
  // picking one would be choosing which molecule to misdraw.
  const pos: { x: number; y: number }[] = [{ x: cx, y: cy }];
  const spread = ((m.angle ?? 120) * Math.PI) / 180;
  const start = -Math.PI / 2 - spread / 2;
  for (let i = 1; i < n; i += 1) {
    const t = n === 2 ? -Math.PI / 2 : start + (spread * (i - 1)) / Math.max(1, n - 2);
    pos.push({ x: cx + Math.cos(t) * scale, y: cy + Math.sin(t) * scale });
  }
  for (const [i, j, order] of m.skeleton) {
    const a = pos[i]!;
    const b = pos[j]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 2.2;
    const ny = (dx / len) * 2.2;
    for (let k = 0; k < order; k += 1) {
      const off = (k - (order - 1) / 2) * 2;
      out.push(
        `<line x1="${(a.x + nx * off).toFixed(1)}" y1="${(a.y + ny * off).toFixed(1)}" ` +
          `x2="${(b.x + nx * off).toFixed(1)}" y2="${(b.y + ny * off).toFixed(1)}" ` +
          `stroke="${BOND_INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`,
      );
    }
  }
  for (let i = 0; i < n; i += 1) {
    const p = pos[i]!;
    out.push(
      `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(scale * 0.34).toFixed(1)}" fill="${atomFill(m.atoms[i]!)}"/>`,
    );
  }
  return out.join('');
}

export interface ScreenState {
  readonly topology: Topology;
  readonly tiles: readonly string[];
  readonly book: readonly string[];
  readonly queue: readonly string[];
  readonly bank: number;
  readonly shipped: number;
  readonly turn: number;
  readonly turns: number;
  /** Cells the player is currently dragging through. */
  readonly path: readonly number[];
  /** The live declaration, if the route is on. */
  readonly declared: { formula: string; turnsLeft: number } | null;
  /** Molecules that are thermodynamic sinks on this board. */
  readonly sinks: readonly string[];
  /**
   * Open orders some legal move can MAKE this turn.
   *
   * ── THE SIGNAL WAS UNREACHABLE AND ONLY A SCREENSHOT FOUND IT ───────────────
   *
   * The readout's whole point is that an order line MIGRATES toward the matter
   * band as it becomes live, so "you can make this now" is a position rather
   * than a number. The first version drove that from "is the molecule on the
   * board" -- which under ANYWHERE delivery IS NEVER TRUE FOR AN OPEN ORDER,
   * because an order ships the instant its molecule exists. The brightest state
   * the readout could display was unreachable in the shipping configuration.
   *
   * Found by trying to render it: no seed or turn produced a migrated line, and
   * the reason turned out to be a rule rather than a bad sample. Reachability is
   * the honest signal and it is computable -- it asks whether a move EXISTS, not
   * whether the result is already sitting there.
   */
  readonly reachable: readonly string[];
  /**
   * The balanced equations the CURRENT selection actually offers, in the
   * executor's own order.
   *
   * Passed in rather than invented. The first version of this screen drew three
   * hardcoded equations regardless of what was selected, which is an interface
   * asserting a fact about the game that the game had not produced -- the same
   * failure as a band whose colour lies about its content, in text.
   */
  readonly options: readonly string[];
}

const W = 760;
const H = 800;

/**
 * The spectral readout. Orders as UV lines, sinks as IR lines, both migrating
 * toward the matter band as they become live.
 */
function spectrum(state: ScreenState, x: number, y: number, w: number, h: number): string {
  const out: string[] = [];
  // The band itself: UV at the left, matter in the middle, IR at the right, so
  // "becoming real" is a movement inward from either side.
  out.push(
    `<defs><linearGradient id="spec" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${UV}" stop-opacity="0.55"/>` +
      `<stop offset="0.5" stop-color="${MATTER[4]}" stop-opacity="0.30"/>` +
      `<stop offset="1" stop-color="${IR_CORE}" stop-opacity="0.55"/>` +
      `</linearGradient></defs>`,
  );
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#spec)" opacity="0.30"/>`);
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${ENGINE}" stroke-width="1" opacity="0.45"/>`);

  const live = new Set(state.reachable);
  const mid = x + w / 2;

  // Open orders: UV lines. An order whose molecule is ON THE BOARD has migrated
  // most of the way to matter; one that is not is still deep in UV.
  state.book.forEach((f, i) => {
    // REACH RUNS TOWARD MATTER. The first version computed
    // `x + (w/2) * (1 - reach)`, which put a REACHABLE order deep in UV and an
    // unreachable one near the matter band -- the readout contradicting its own
    // legend. That is the defect the corpus names outright: "a band whose colour
    // lies about its content is a defect, not a style preference", and it is the
    // second time this project has drawn that error in the opposite direction.
    const on = live.has(f);
    const reach = on ? 0.86 : 0.30;
    const lx = x + 14 + (w / 2 - 30) * reach;
    const ly = y + 16 + i * 20;
    // A live line is drawn toward matter and given weight; a dormant one stays
    // deep in UV and thin. Position carries it, width is redundant with it.
    out.push(
      `<line x1="${lx.toFixed(0)}" y1="${ly}" x2="${lx.toFixed(0)}" y2="${ly + 13}" stroke="${on ? toCss(mixRgb(hex(UV), hex(MATTER[4]!), 0.45)) : UV}" stroke-width="${on ? 4 : 2}" opacity="${on ? 1 : 0.62}"/>`,
    );
    out.push(
      `<text x="${(lx + 8).toFixed(0)}" y="${ly + 11}" font-family="ui-monospace,monospace" font-size="12" fill="${on ? '#d8f5e4' : '#b9a6e0'}">${f}${on ? '  MAKEABLE' : ''}</text>`,
    );
  });

  // The queue sits DEEPER in UV — what is guessed renders further out, which is
  // the swapped-row rule expressed as depth rather than as two rows.
  state.queue.forEach((f, i) => {
    const lx = x + 14 + i * 9;
    out.push(
      `<line x1="${lx}" y1="${y + h - 26}" x2="${lx}" y2="${y + h - 14}" stroke="${UV}" stroke-width="2" opacity="0.32"/>`,
    );
  });
  out.push(
    `<text x="${x + 12}" y="${y + h - 32}" font-family="ui-monospace,monospace" font-size="9" fill="#9a86c8" opacity="0.8">INCOMING</text>`,
  );

  // Sinks: IR lines on the right. What might go wrong.
  state.sinks.forEach((f, i) => {
    const count = state.tiles.filter((t) => t === f).length;
    const depth = Math.min(1, count / 8);
    const lx = mid + (w / 2) * (0.25 + depth * 0.7);
    const ly = y + 16 + i * 20;
    out.push(
      `<line x1="${lx.toFixed(0)}" y1="${ly}" x2="${lx.toFixed(0)}" y2="${ly + 13}" stroke="${depth > 0.6 ? IR_DEEP : IR_CORE}" stroke-width="${1 + depth * 3}" opacity="0.9"/>`,
    );
    out.push(
      `<text x="${(lx - 8).toFixed(0)}" y="${ly + 11}" text-anchor="end" font-family="ui-monospace,monospace" font-size="12" fill="#ffc9d4">${f}</text>`,
    );
  });

  out.push(
    `<text x="${mid}" y="${y + h - 6}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" fill="${ENGINE}" opacity="0.55">UV · ORDERS &#8592; REACHABLE &#8594; SINKS · IR</text>`,
  );
  return out.join('');
}

export function synthScreenSvg(state: ScreenState): string {
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${VOID_DEEP}"/>`);

  // ── header ──────────────────────────────────────────────────────────────
  out.push(
    `<text x="28" y="44" font-family="ui-monospace,monospace" font-size="19" fill="#dfe9f5" letter-spacing="3">SYNTHESIS LINE</text>`,
  );
  out.push(
    `<text x="${W - 28}" y="44" text-anchor="end" font-family="ui-monospace,monospace" font-size="13" fill="${MATTER[4]}">` +
      `${state.shipped} SHIPPED</text>`,
  );
  out.push(
    `<text x="${W - 28}" y="64" text-anchor="end" font-family="ui-monospace,monospace" font-size="11" fill="#8fa3b8">` +
      `${Math.round(state.bank)} kJ · TURN ${state.turn}/${state.turns}</text>`,
  );

  // ── the declaration, when one is live ───────────────────────────────────
  if (state.declared !== null) {
    const urgent = state.declared.turnsLeft <= 1;
    out.push(
      `<rect x="28" y="78" width="${W - 56}" height="34" rx="6" fill="${urgent ? IR_DEEP : '#1a1030'}" opacity="${urgent ? 0.5 : 0.8}" stroke="${urgent ? IR_CORE : UV}" stroke-width="1.5"/>`,
    );
    out.push(
      `<text x="42" y="100" font-family="ui-monospace,monospace" font-size="12" fill="#e8dcff">DECLARED &#8594; ${state.declared.formula}</text>`,
    );
    out.push(
      `<text x="${W - 42}" y="100" text-anchor="end" font-family="ui-monospace,monospace" font-size="12" fill="${urgent ? '#ffd7de' : '#b9a6e0'}">` +
        `${state.declared.turnsLeft} TURN${state.declared.turnsLeft === 1 ? '' : 'S'} LEFT</text>`,
    );
  }

  // ── the board ───────────────────────────────────────────────────────────
  const boardTop = state.declared !== null ? 136 : 100;
  const cx0 = W / 2;
  const cy0 = boardTop + 196;
  const step = CELL_R * 2.05;
  const onPath = new Set(state.path);

  // The drag path, drawn UNDER the cells so it reads as a trace rather than a
  // border, and per-cell rather than as a bounding box. A bbox ground was the
  // defect that re-created the exact fence the Farkle audit warned about.
  if (state.path.length > 1) {
    const pts = state.path.map((c) => {
      const p = cellCentre(state.topology, c);
      return `${(cx0 + p.x * step).toFixed(1)},${(cy0 + p.y * step).toFixed(1)}`;
    });
    out.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${MATTER[4]}" stroke-width="${CELL_R * 1.5}" ` +
        `stroke-linecap="round" stroke-linejoin="round" opacity="0.18"/>`,
    );
    out.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${MATTER[4]}" stroke-width="2.5" ` +
        `stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`,
    );
  }

  state.tiles.forEach((f, i) => {
    const p = cellCentre(state.topology, i);
    const x = cx0 + p.x * step;
    const y = cy0 + p.y * step;
    const m = BY.get(f);
    if (m === undefined) return;
    const isSink = state.sinks.includes(f);
    const inPath = onPath.has(i);

    // Out-of-path cells lose SATURATION, not luminance. Dimming by brightness
    // alone was measured to make them either invisible or competitive with the
    // selection; separating the two axes is what fixed it in Farkle.
    const bodyBase = isSink ? '#2a1020' : '#10182a';
    const body = inPath ? '#1b2a44' : desaturate(bodyBase, 0.55);

    // A SINK IS MARKED, NOT RINGED. Ringing every sink put a red outline on
    // roughly 40% of cells, which competed with the selection ring for the same
    // channel and made the one thing the player is doing harder to see. The
    // selection owns the outline; IR owns a small mark at the rim.
    out.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${CELL_R}" fill="${body}" ` +
        `stroke="${inPath ? MATTER[4] : '#22304a'}" stroke-width="${inPath ? 2.5 : 1}"/>`,
    );
    if (isSink && !inPath) {
      out.push(
        `<circle cx="${(x + CELL_R * 0.62).toFixed(1)}" cy="${(y - CELL_R * 0.62).toFixed(1)}" r="3.2" fill="${IR_CORE}" opacity="0.85"/>`,
      );
    }
    const g = moleculeGlyph(m, x, y, CELL_R * 0.52);
    out.push(inPath ? g : `<g opacity="0.78">${g}</g>`);
    out.push(
      `<text x="${x.toFixed(1)}" y="${(y + CELL_R - 6).toFixed(1)}" text-anchor="middle" ` +
        `font-family="ui-monospace,monospace" font-size="9" fill="${inPath ? '#dfe9f5' : '#6d8099'}">${f}</text>`,
    );
  });

  // ── the spectral readout ────────────────────────────────────────────────
  out.push(spectrum(state, 28, H - 210, W - 56, 120));

  // ── the option shortlist, which is the decision ─────────────────────────
  out.push(
    `<text x="28" y="${H - 68}" font-family="ui-monospace,monospace" font-size="10" fill="#7e93ab" letter-spacing="2">MAKE</text>`,
  );
  const opts = state.options;
  if (opts.length === 0) {
    out.push(
      `<rect x="28" y="${H - 58}" width="${W - 56}" height="34" rx="6" fill="#0e1420" stroke="#243147" stroke-width="1.2"/>`,
    );
    out.push(
      `<text x="${W / 2}" y="${H - 36}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#5d7086">TRACE A PATH TO SEE WHAT IT MAKES</text>`,
    );
  }
  opts.forEach((eq, i) => {
    const bw = (W - 56 - 16) / 3;
    const bx = 28 + i * (bw + 8);
    out.push(
      `<rect x="${bx.toFixed(0)}" y="${H - 58}" width="${bw.toFixed(0)}" height="34" rx="6" ` +
        `fill="${i === 0 ? '#16243c' : '#111a2b'}" stroke="${i === 0 ? MATTER[4] : '#243147'}" stroke-width="1.2"/>`,
    );
    out.push(
      `<text x="${(bx + bw / 2).toFixed(0)}" y="${H - 36}" text-anchor="middle" ` +
        `font-family="ui-monospace,monospace" font-size="11" fill="#d8e4f2">${eq}</text>`,
    );
  });

  out.push('</svg>');
  return out.join('');
}
