// game/chem/synth.ts — the synthesis line. Game two's shipping ruleset.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS ALONGSIDE `round.ts` RATHER THAN INSTEAD OF IT.
//
// `round.ts` is the ENERGY game: bank the heat released by rearranging the
// board. It is a complete, verified ruleset held by its own oracles, and it is
// measurably not a game. Eight probes said so, and the decisive one is short:
// a beam search over the whole horizon beats a greedy agent by 5.7%, under the
// auditor's own stated failure line of 5%. The cause is structural rather than
// tunable — see `rankedRearrangements` — so no amount of rebalancing `round.ts`
// reaches a different answer.
//
// It is kept, unchanged and still verified, because it is the CONTROL. Every
// claim this file makes about headroom is a claim relative to it, and deleting
// the thing you improved on leaves the improvement unfalsifiable.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MOVE IS A SELECTION *AND A CHOICE OF WHAT TO MAKE*.
//
// That single change is the whole design. The engine already enumerated every
// conservation-legal partition of a selection and returned only the most
// exothermic; three are now offered, ranked by energy, and taking a cheaper one
// to make what is ordered is the decision the game is built on.
//
// Measured, 220 boards, orders filled in 12 turns:
//
//     options/region   FLOOR   ORDER-1   ORDER-2   CEILING   headroom
//       1 (round.ts)    1.01     3.59      4.27      5.13      30.0%
//       3 (here)        1.50     5.08      6.33      7.64      33.5%
//
// ─────────────────────────────────────────────────────────────────────────────
// AN ACTION IS A SELECTION AND AN INDEX. NEVER A REACTION AND NEVER A SCORE.
//
// The same rule the other two rulesets run on. The client submits the cells it
// traced and WHICH of the offered options it took; the executor re-derives the
// shortlist from the board and reads the option out of it. A patched client
// cannot submit products, because products are not in the action — it can only
// name an index into a list the executor computes for itself.
//
// The index is bounds-checked rather than clamped. Clamping would silently turn
// an out-of-range index into a legal move and make a malformed action score,
// which is the difference between rejecting a lie and rounding it off.

import { hashState } from '../../engine/sim/hash.js';
import { makeRng } from '../../engine/sim/world-gen.js';
import { MOLECULES, type Molecule } from './library.js';
import { type Reaction, isEndothermic, rankedRearrangements } from './reaction.js';
import { BOARD_W } from './board.js';
import {
  type Topology,
  adjacentIn,
  cellCount as topoCellCount,
  dockCells,
  regions as topoRegions,
} from './topology.js';
import {
  type MoleculeWeights,
  CELL_COUNT,
  MAX_SELECT,
  UNIFORM_WEIGHTS,
  drawReactiveBoard,
} from './board-react.js';

const BY_FORMULA: ReadonlyMap<string, Molecule> = new Map(MOLECULES.map((m) => [m.formula, m]));
const INDEX_OF: ReadonlyMap<string, number> = new Map(MOLECULES.map((m, i) => [m.formula, i]));

/** A cell holding nothing. Only reachable when `refill` is VOID. */
export const VOID_CELL = '';

/**
 * How many product options a selection offers.
 *
 * Three, and the number is a measurement rather than a screen-size argument: a
 * two-ply player scores 5.37 at three options and 5.37 with all of them, so past
 * three only a beam search improves. See `rankedRearrangements`.
 */
export const OPTIONS_PER_SELECTION = 3;

/**
 * Orders standing open at once.
 *
 * A FIXED list of orders was measured first and saturates: with delivery, random
 * play fills 2.48 of 3 and the entire agent ladder lands inside 1.2% of the
 * ceiling. An objective everyone completes cannot separate anyone. A standing
 * book makes the score THROUGHPUT — how many you route before the board winds
 * down — which is the quantity the sink measurements were already about.
 */
export const BOOK_SIZE = 3;

/**
 * The molecules that get ordered.
 *
 * Deliberately the awkward ones. Ordering from the full library measured at
 * 6.6-12.4% spread at every board size — abundant targets are satisfied by a
 * random walk, so the order is not a goal, it is a formality. These five have to
 * be built: the atoms exist on the board but rarely in the arrangement you need.
 * Rare targets moved the same sweep to 28.9-37.5%.
 */
export const ORDER_POOL: readonly string[] = ['F2', 'Cl2', 'CH3Cl', 'H2O2', 'C2H2'];

export type SynthMode = 'SOLO' | 'VS' | 'COOP';

/**
 * Molecules that a single reaction rarely produces, computed once rather than
 * chosen.
 *
 * The measured defect this exists to attack: an order is shippable on 22.4% of
 * turns and the one-ply rule ships 0.31 per turn against 0.30 available. It
 * takes every chance the instant it appears, so no plan can beat it. An order
 * that CANNOT be made in one move is an order a plan has to route toward.
 *
 * "Rarely" is measured over a fixed sample of random reactant multisets rather
 * than asserted, and the pool is the bottom half by production frequency. A
 * hand-picked list would be me deciding which molecules are hard, which is the
 * kind of invented constant that already set a scale ceiling once in this
 * project.
 */
let MULTISTEP_POOL: readonly string[] | null = null;

export function multistepPool(): readonly string[] {
  if (MULTISTEP_POOL !== null) return MULTISTEP_POOL;
  const produced = new Map<string, number>();
  for (const m of MOLECULES) produced.set(m.formula, 0);
  let h = 0x9e3779b9;
  const nextIdx = (n: number): number => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) % n;
  };
  for (let trial = 0; trial < 3000; trial += 1) {
    const size = 2 + (nextIdx(3));
    const picks: Molecule[] = [];
    for (let i = 0; i < size; i += 1) picks.push(MOLECULES[nextIdx(MOLECULES.length)]!);
    for (const r of rankedRearrangements(picks, OPTIONS_PER_SELECTION)) {
      for (const f of r.products) produced.set(f, (produced.get(f) ?? 0) + 1);
    }
  }
  const ranked = [...produced.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  MULTISTEP_POOL = ranked.slice(0, Math.max(3, Math.floor(ranked.length / 2))).map(([f]) => f);
  return MULTISTEP_POOL;
}

/**
 * A pool drawn against THIS board's atoms, so every order is physically
 * reachable from what was dealt.
 *
 * Conservation means an order for F2 on a board with one fluorine atom is not
 * hard, it is impossible, and impossible orders are pure deal. That is the
 * suspected driver of SEED SHARE at 53.9% against Farkle's 3.3%.
 */
export function adaptivePool(tiles: readonly string[]): readonly string[] {
  const atoms = new Map<string, number>();
  for (const f of tiles) {
    const m = BY_FORMULA.get(f);
    if (m === undefined) continue;
    for (const a of m.atoms) atoms.set(a, (atoms.get(a) ?? 0) + 1);
  }
  const out = MOLECULES.filter((m) => {
    const need = new Map<string, number>();
    for (const a of m.atoms) need.set(a, (need.get(a) ?? 0) + 1);
    // Twice the atoms needed, so an order is reachable without consuming the
    // board's entire supply of an element to fill one slot.
    for (const [sym, n] of need) if ((atoms.get(sym) ?? 0) < n * 2) return false;
    return true;
  }).map((m) => m.formula);
  return out.length >= 3 ? out : ORDER_POOL;
}

export function poolFor(config: SynthConfig, tiles: readonly string[]): readonly string[] {
  if (config.pool !== undefined) return config.pool;
  switch (config.poolMode ?? 'RARE5') {
    case 'MULTISTEP': return multistepPool();
    case 'ADAPTIVE': return adaptivePool(tiles);
    default: return ORDER_POOL;
  }
}

/**
 * What replaces a molecule that ships.
 *
 * POOL tops the cell back up, which is what every measurement in the design
 * brief was taken under. VOID leaves the cell empty and unreactive forever, so
 * the board shrinks as you deliver.
 *
 * The audit named the cost of POOL exactly: delivery "transforms the game from a
 * closed system, where mass is finite and space is a scarce resource, to a
 * steady-state conveyor... the player no longer fears running out of atoms or
 * room, only running out of efficiency." VOID is the answer to that, and it is
 * a config rather than a decision because it has not been measured yet. The
 * default is the rule the headroom numbers were taken under; changing it
 * requires re-running the ladder, not an opinion.
 */
export type RefillRule = 'POOL' | 'VOID';

/** Whether delivery cares where the molecule is. See `SynthConfig.deliver`. */
export type DeliveryRule = 'ANYWHERE' | 'DOCK';

export type SwapRule = 'NONE' | 'TURN' | 'FREE' | 'MODIFIER';

/**
 * How the order pool is chosen.
 *
 * RARE5     five awkward molecules, fixed. What phase 2 measured.
 * MULTISTEP only molecules that CANNOT be made in one reaction from any
 *           legal region of a fresh board — so filling one requires building a
 *           precursor first. This is the direct attack on the measured defect:
 *           an order shippable in one move is an order no plan can improve.
 * ADAPTIVE  drawn against the board's own atom inventory, so an order is always
 *           physically reachable. The direct attack on SEED SHARE 53.9%: if
 *           every deal carries comparable reachable orders, the deal stops
 *           explaining half the outcome.
 */
export type PoolMode = 'RARE5' | 'MULTISTEP' | 'ADAPTIVE';

export interface SynthConfig {
  readonly turns: number;
  readonly mode: SynthMode;
  readonly weights?: MoleculeWeights;
  readonly options?: number;
  readonly book?: number;
  readonly pool?: readonly string[];
  readonly refill?: RefillRule;
  /**
   * How many NOT-YET-OPEN orders the player can see coming.
   *
   * Zero is a blind book and was the first thing measured. It makes planning
   * depth worthless, and not as a matter of tuning: with three slots and no
   * visibility, every multi-ply plan saturates at "empty the book", every
   * candidate ties there, and the tie-break drags the planner back to greedy.
   * Both a three-ply beam (2.72) and a four-ply rollout scored BELOW the one-ply
   * rule (3.68) for that reason alone.
   *
   * This is the second row of the forecast grid: row one is what is on the book
   * NOW and is certain; row two is what is coming and is the thing worth
   * planning against.
   */
  readonly preview?: number;
  /**
   * Where a finished molecule has to BE for the order to ship.
   *
   * ANYWHERE matches the whole board, which is what every measurement so far was
   * taken under and is the reason position does not matter: a molecule that
   * matches an open order ships the instant it exists, wherever it is. That
   * makes the transposition verb worthless by construction — there is nothing to
   * carry anything to — and it is the suspected cause of the failing agency
   * floor, where the one-ply rule captures ~95% of what any planner reaches.
   *
   * DOCK ships only from the bottom row. Making delivery positional is what
   * turns "notice the opportunity" into "route the molecule", which is the
   * decision a planner can be better at than a rule.
   */
  readonly deliver?: DeliveryRule;
  /** Board shape. See `topology.ts` — six neighbours instead of four. */
  readonly topology?: Topology;
  /**
   * How the move verb is paid for.
   *
   * NONE      no move verb. The phase-2 game, where position is unreachable.
   * TURN      a swap consumes a turn and 120 kJ. MEASURED: costs the readable
   *           rule 18%, because a 12-turn game cannot repay a spent turn.
   * FREE      a small budget of swaps per round that cost no turn and no energy.
   *           Removes the thing that made TURN unaffordable, keeps scarcity.
   * MODIFIER  swap AND react in one action, paying energy but not a turn. The
   *           version most likely to pay, and it is in the design because TURN's
   *           failure was a PRICE failure rather than a verb failure.
   */
  readonly swap?: SwapRule;
  /** Swaps allowed per round under FREE. Ignored otherwise. */
  readonly swapBudget?: number;
  /**
   * Off-board holding cells. Storage is the simplest construction verb there is:
   * park a molecule now for a reaction three turns away.
   */
  readonly bench?: number;
  /** Which molecules get ordered, and how the pool is chosen. */
  readonly poolMode?: PoolMode;
  /**
   * Multiplier on consecutive deliveries, applied to the SCORE.
   *
   * Same shape as Farkle's run multiplier, which rescued that game from a flat
   * reward where a rule printed on the screen reached 94% of hindsight-perfect
   * play. Different payload, and it must be SWEPT the way that one was rather
   * than chosen — the Farkle constant is meaningless here because it is
   * downstream of a different pay table.
   */
  readonly streak?: number;
  /** Players sharing the board. 1 for solo, 2 for coop and vs. */
  readonly players?: number;
}

export const DEFAULT_SYNTH: SynthConfig = {
  turns: 12,
  mode: 'SOLO',
  refill: 'POOL',
  preview: 2,
  topology: 'SQUARE36',
  swap: 'NONE',
  bench: 0,
  poolMode: 'RARE5',
  streak: 1,
};

/** Cells in the configured board. Not a constant any more. */
export function cellsOf(config: SynthConfig): number {
  return topoCellCount(config.topology ?? 'SQUARE36');
}

/** The orders coming after the current book, as far ahead as `preview` allows. */
export function previewOf(state: SynthState, config: SynthConfig): string[] {
  const depth = config.preview ?? 0;
  const out: string[] = [];
  for (let i = 0; i < depth; i += 1) {
    out.push(orderAt(state.seed, state.issued + i, state.pool));
  }
  return out;
}

/**
 * A player action.
 *
 * REACT is a selection plus which offered option was taken. TRANSPOSE swaps two
 * adjacent molecules and reacts nothing.
 *
 * ── WHY A MOVE VERB EXISTS AT ALL, WHICH A MEASUREMENT FORCED ───────────────
 *
 * Without it, adjacency is luck and synthesis is impossible. Measured over 504
 * turns with only REACT available: an open order was shippable on 22.4% of
 * turns, 0.30 orders per turn — and the one-ply rule shipped 0.31 per turn. It
 * was taking essentially EVERY chance the moment it appeared, and no amount of
 * planning produced more chances. A six-ply beam beat the one-ply rule by 5.5%
 * against a clairvoyant ceiling of 30.8%, and the gap was foreknowledge rather
 * than skill.
 *
 * That is a precise defect and it is not about depth: THE PLAYER COULD NOT
 * CONSTRUCT ANYTHING. Reagents react where they happen to lie, so a route from
 * "these atoms exist somewhere" to "this molecule exists here" did not exist.
 * The board generated opportunities; the player only noticed them. It is also
 * why the deal explained 46.4% of the variance.
 *
 * Transposing is the verb every match-3 has and the one this design was missing.
 * The payload is what differs: you are not lining up colours, you are bringing
 * reagents together, and it costs energy because moving a reagent is work.
 */
export type SynthActionKind = 'REACT' | 'TRANSPOSE';

export interface SynthAction {
  readonly cells: readonly number[];
  readonly option: number;
  readonly kind?: SynthActionKind;
}

/**
 * What a transposition costs from the bank, kJ/mol.
 *
 * Priced rather than free, so that arranging the board trades against the energy
 * the reactions pay. A free move verb would make the bank meaningless and the
 * board a puzzle with unlimited undo.
 */
export const TRANSPOSE_COST = 120;

/** Passing is a legal action and says so in the type, rather than being an empty selection. */
export const PASS: SynthAction = { cells: [], option: -1 };

export type SynthRejection =
  | 'NOT_ADJACENT'
  | 'CANNOT_AFFORD_MOVE'
  | 'TOO_FEW_CELLS'
  | 'TOO_MANY_CELLS'
  | 'OUT_OF_RANGE'
  | 'DUPLICATE_CELL'
  | 'VOID_CELL'
  | 'NO_REACTION'
  | 'NO_SUCH_OPTION'
  | 'CANNOT_AFFORD';

/**
 * The options a selection offers, and the one function both sides judge by.
 *
 * The client greys out illegal selections with this; the server judges with
 * this. A client-side rule that merely resembles the server's is the drift this
 * repository refuses.
 */
export function optionsFor(
  tiles: readonly string[],
  cells: readonly number[],
  k = OPTIONS_PER_SELECTION,
): Reaction[] {
  if (cells.length < 2 || cells.length > MAX_SELECT) return [];
  if (cells.some((c) => !Number.isInteger(c) || c < 0 || c >= CELL_COUNT)) return [];
  if (new Set(cells).size !== cells.length) return [];
  if (cells.some((c) => tiles[c] === VOID_CELL)) return [];
  return rankedRearrangements(
    cells.map((c) => BY_FORMULA.get(tiles[c]!)!),
    k,
  );
}

/** Orthogonally adjacent on the board. The one geometric rule the executor keeps. */
export function adjacent(a: number, b: number): boolean {
  if (a === b) return false;
  const ar = (a / BOARD_W) | 0;
  const br = (b / BOARD_W) | 0;
  const ac = a % BOARD_W;
  const bc = b % BOARD_W;
  return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
}

export function judgeSynth(
  tiles: readonly string[],
  action: SynthAction,
  bank: number,
  config: SynthConfig,
  bankSwapsLeft = Number.POSITIVE_INFINITY,
): { reaction: Reaction | null; rejected: SynthRejection | null } {
  const { cells, option } = action;
  if ((action.kind ?? 'REACT') === 'TRANSPOSE') {
    if (cells.length !== 2) return { reaction: null, rejected: 'TOO_FEW_CELLS' };
    const [a, b] = cells as [number, number];
    if (![a, b].every((c) => Number.isInteger(c) && c >= 0 && c < cellsOf(config))) {
      return { reaction: null, rejected: 'OUT_OF_RANGE' };
    }
    if ((config.swap ?? 'NONE') === 'NONE') {
      return { reaction: null, rejected: 'NO_SUCH_OPTION' };
    }
    if (!adjacentIn(config.topology ?? 'SQUARE36', a, b)) {
      return { reaction: null, rejected: 'NOT_ADJACENT' };
    }
    if (tiles[a] === VOID_CELL || tiles[b] === VOID_CELL) {
      return { reaction: null, rejected: 'VOID_CELL' };
    }
    // Moving a reagent is work and it is charged. A transposition that the bank
    // cannot pay for is refused rather than run into debt.
    // FREE spends a per-round budget instead of energy: TURN's failure was a
    // PRICE failure (it costs the readable rule 18%, because a 12-turn game
    // cannot repay a spent turn) rather than evidence against the verb.
    if ((config.swap ?? 'NONE') === 'FREE') {
      if (bankSwapsLeft <= 0) return { reaction: null, rejected: 'CANNOT_AFFORD_MOVE' };
    } else if (bank < TRANSPOSE_COST) {
      return { reaction: null, rejected: 'CANNOT_AFFORD_MOVE' };
    }
    return { reaction: null, rejected: null };
  }
  if (cells.length < 2) return { reaction: null, rejected: 'TOO_FEW_CELLS' };
  if (cells.length > MAX_SELECT) return { reaction: null, rejected: 'TOO_MANY_CELLS' };
  if (cells.some((c) => !Number.isInteger(c) || c < 0 || c >= cellsOf(config))) {
    return { reaction: null, rejected: 'OUT_OF_RANGE' };
  }
  if (new Set(cells).size !== cells.length) return { reaction: null, rejected: 'DUPLICATE_CELL' };
  if (cells.some((c) => tiles[c] === VOID_CELL)) return { reaction: null, rejected: 'VOID_CELL' };

  const offered = optionsFor(tiles, cells, config.options ?? OPTIONS_PER_SELECTION);
  if (offered.length === 0) return { reaction: null, rejected: 'NO_REACTION' };
  // Bounds-checked, never clamped: an index the executor did not offer is a
  // malformed action, and rounding it to a legal one would let it score.
  if (!Number.isInteger(option) || option < 0 || option >= offered.length) {
    return { reaction: null, rejected: 'NO_SUCH_OPTION' };
  }

  const reaction = offered[option]!;
  // Endothermic reactions are real and are offered; they are not free. The only
  // place the game refuses one, and it refuses for a reason a chemist would
  // accept — not enough energy — rather than by calling it impossible.
  if (isEndothermic(reaction) && bank + reaction.released < 0) {
    return { reaction: null, rejected: 'CANNOT_AFFORD' };
  }
  return { reaction, rejected: null };
}

/**
 * The order at position `index` in the stream.
 *
 * ── PURE IN THE INDEX, AND THE AUDIT ASKED FOR EXACTLY THIS ─────────────────
 *
 * The auditor's standing suspicion after round two was the order stream: "is it
 * truly decoupled from the board state, or is there a hidden feedback loop?"
 *
 * It is decoupled, and this signature is the proof rather than the claim: the
 * only inputs are the seed and the position, so the k-th order issued in a run
 * is the same molecule for every agent, every policy and every replay of that
 * seed. What differs between a strong player and a weak one is HOW FAR DOWN THE
 * STREAM THEY GET, which is the score. If the draw instead depended on the board
 * or on the bank, a better player would face a different sequence of orders and
 * no two agents could be compared on the same run at all.
 *
 * `verify-synth` Y3 holds this by re-deriving the stream against a mutated board
 * and requiring it unchanged.
 */
export function orderAt(seed: number, index: number, pool: readonly string[]): string {
  let h = (seed ^ Math.imul(index + 0x9e37, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35);
  return pool[((h ^ (h >>> 16)) >>> 0) % pool.length]!;
}

/** The molecule that replaces a shipped one, pure in the count already shipped. */
export function refillAt(seed: number, filled: number): string {
  let h = (seed ^ Math.imul(filled + 1, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return MOLECULES[((h ^ (h >>> 16)) >>> 0) % MOLECULES.length]!.formula;
}

/**
 * The molecule that tops up a cell a reaction left spare, pure in (seed, turn,
 * cell).
 *
 * ── NO HIDDEN STREAM ANYWHERE ON THE TURN PATH ──────────────────────────────
 *
 * A reaction can yield fewer molecules than it consumed — 3 H2 + N2 gives 2 NH3
 * — so a selection of four cells can leave two to fill. `round.ts` fills them by
 * pulling the round's stateful rng, which makes the board a function of HOW MANY
 * DRAWS HAVE HAPPENED rather than of the seed and the actions.
 *
 * Two things break on that, and the first is the one that caught it:
 *
 *   · a search cannot branch. Cloning the state to explore two futures forks a
 *     closure, and the two branches then consume the same stream and diverge
 *     from anything the real game would do. The ceiling measurement for this
 *     game is a beam search, so this was a blocker rather than a nicety.
 *   · the execution plan requires replicas to be bitwise identical given the
 *     same seed and the same action list. A stateful stream on the turn path
 *     means a replay that skips a rejected action lands on a different board.
 *
 * Keyed on the cell as well as the turn so that two spare cells in one turn do
 * not receive the same molecule, which would quietly bias the board toward
 * pairs.
 */
export function fillAt(seed: number, turn: number, cell: number, weights: MoleculeWeights): string {
  let h = (seed ^ Math.imul(turn + 1, 0x27d4eb2d) ^ Math.imul(cell + 1, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const r = (h ^ (h >>> 16)) >>> 0;
  let total = 0;
  for (const w of weights) total += w;
  let pick = r % Math.max(1, total);
  for (let i = 0; i < MOLECULES.length; i += 1) {
    pick -= weights[i] ?? 0;
    if (pick < 0) return MOLECULES[i]!.formula;
  }
  return MOLECULES[0]!.formula;
}

export interface SynthTurn {
  readonly turn: number;
  readonly cells: readonly number[];
  readonly option: number;
  readonly reaction: Reaction | null;
  readonly rejected: SynthRejection | null;
  /** Orders that shipped as a result of this turn. */
  readonly shipped: readonly string[];
  readonly bank: number;
  readonly filled: number;
}

export interface SynthState {
  readonly seed: number;
  readonly tiles: string[];
  readonly rng: () => number;
  readonly weights: MoleculeWeights;
  readonly pool: readonly string[];
  /** Orders currently open, in the order they were issued. */
  book: string[];
  /** How many orders have been ISSUED, which is the stream position. */
  issued: number;
  /** How many have SHIPPED. Throughput — legible, and not the score under a streak. */
  filled: number;
  /**
   * The score: deliveries weighted by the streak multiplier at the moment each
   * one shipped. Equals `filled` exactly when streak is 1.00, so the control
   * level of that factor is not merely similar to the old game, it is identical.
   */
  points: number;
  /** Consecutive turns ending in a delivery. Broken by a turn that ships nothing. */
  streak: number;
  /** Off-board holding cells. VOID_CELL means empty. */
  readonly bench: string[];
  /** Free swaps remaining this round, under SwapRule FREE. */
  swapsLeft: number;
  bank: number;
  turn: number;
  digest: number;
  readonly log: SynthTurn[];
}

export interface SynthResult {
  /** The score: streak-weighted deliveries. Equals `shipped` when streak is 1. */
  readonly score: number;
  /** Orders shipped, unweighted. Throughput. */
  readonly shipped: number;
  /** Energy banked, kJ/mol. A resource, not the objective. */
  readonly bank: number;
  readonly turnsPlayed: number;
  readonly digest: number;
  readonly log: readonly SynthTurn[];
  /** True when the board ran out of reactions before the turns did. */
  readonly stalled: boolean;
}

function boardWords(tiles: readonly string[]): Int32Array {
  const words = new Int32Array(tiles.length);
  for (let i = 0; i < tiles.length; i += 1) words[i] = INDEX_OF.get(tiles[i]!) ?? -1;
  return words;
}

function topUpBook(state: SynthState, size: number): void {
  while (state.book.length < size) {
    state.book.push(orderAt(state.seed, state.issued, state.pool));
    state.issued += 1;
  }
}

/**
 * Ships every open order the board can currently satisfy, and returns them.
 *
 * ── DELIVERY IS A RULE THAT TWO MEASUREMENT DEFECTS FORCED ──────────────────
 *
 * Without it a completed target sits on the board as a hostage, and two separate
 * measurements caught the consequence before it was recognised as a rule:
 *
 *   · the objective scored WORSE at 60 turns than at 12, because players were
 *     making targets and then destroying them with later moves;
 *   · the beam search was scored on the best state it ever passed through while
 *     every other agent was scored on its final board — not a ceiling, a
 *     different scoring rule wearing one.
 *
 * Shipping on completion fixes both at once, and it is the honest reading of
 * what an order is.
 *
 * The cell is REPLACED rather than removed. Removing it would shorten the board
 * and leave every later cell index pointing at the wrong tile, which is exactly
 * the defect that crashed the first tightening probe.
 */
function shipReady(state: SynthState, config: SynthConfig): string[] {
  const size = config.book ?? BOOK_SIZE;
  const rule = config.refill ?? 'POOL';
  const where = config.deliver ?? 'ANYWHERE';
  // The dock is the bottom row: the one edge of the board a molecule has to
  // reach. A single cell was considered and rejected without measuring it as a
  // design — one cell makes every order a queue at one door, which is a
  // congestion puzzle rather than a routing one.
  // The dock is a SET of cells from the topology, not an index threshold. On a
  // hex "the bottom row" is not a thing, and an index cut would have selected an
  // arbitrary arc — the dock would then mean something different on each
  // topology while wearing one name.
  const dock: ReadonlySet<number> | null =
    where === 'DOCK' ? new Set(dockCells(config.topology ?? 'SQUARE36')) : null;
  const shipped: string[] = [];
  for (;;) {
    let any = false;
    for (let i = state.book.length - 1; i >= 0; i -= 1) {
      const want = state.book[i]!;
      const at = dock === null
        ? state.tiles.indexOf(want)
        : state.tiles.findIndex((f, i) => f === want && dock.has(i));
      if (at === -1) continue;
      state.tiles[at] = rule === 'VOID' ? VOID_CELL : refillAt(state.seed, state.filled);
      state.book.splice(i, 1);
      state.filled += 1;
      // The streak multiplies the delivery it is ON, compounding within a run
      // of consecutive delivering turns. Applied at the moment of shipping and
      // never accumulated, the way Farkle floors its run multiplier once at
      // banking rather than carrying a growing float through the round.
      const mult = config.streak ?? 1;
      state.points += mult <= 1 ? 1 : Math.pow(mult, state.streak);
      shipped.push(want);
      any = true;
    }
    // A replacement order may already be satisfied by the same board, so the
    // book settles rather than shipping at most once per turn.
    topUpBook(state, size);
    if (!any) break;
  }
  return shipped;
}

/**
 * Draws a board for the configured topology with at least one reaction on it.
 *
 * `drawReactiveBoard` is square-only and hard-wired to CELL_COUNT, so a hex
 * board cannot come from it. Same draw-and-validate discipline, and the same
 * refusal: a dead board is a generator defect rather than bad luck.
 */
function drawBoardFor(seed: number, config: SynthConfig): string[] {
  const topo = config.topology ?? 'SQUARE36';
  const n = topoCellCount(topo);
  const weights = config.weights ?? UNIFORM_WEIGHTS;
  const regs = topoRegions(topo, MAX_SELECT);
  for (let attempt = 1; attempt <= 64; attempt += 1) {
    const tiles = Array.from({ length: n }, (_, i) =>
      fillAt(seed ^ Math.imul(attempt, 0x7feb352d), -1, i, weights),
    );
    for (const reg of regs) {
      const opts = rankedRearrangements(reg.map((c) => BY_FORMULA.get(tiles[c]!)!), 1);
      if (opts.length > 0 && opts[0]!.released > 0) return tiles;
    }
  }
  throw new RangeError(
    `drawBoardFor: 64 draws produced no reactive ${topo} board. That is a weight defect ` +
      'rather than bad luck; a distribution of only inert molecules cannot produce one at all.',
  );
}

export function beginSynth(seed: number, config: SynthConfig): SynthState {
  const rng = makeRng(seed);
  const weights = config.weights ?? UNIFORM_WEIGHTS;
  const tiles = drawBoardFor(seed, config);
  const state: SynthState = {
    seed,
    tiles,
    rng,
    weights,
    pool: poolFor(config, tiles),
    bench: Array.from({ length: config.bench ?? 0 }, () => VOID_CELL),
    swapsLeft: (config.swap ?? 'NONE') === 'FREE' ? (config.swapBudget ?? 3) : 0,
    streak: 0,
    points: 0,
    book: [],
    issued: 0,
    filled: 0,
    bank: 0,
    turn: 0,
    digest: hashState(boardWords(tiles)),
    log: [],
  };
  topUpBook(state, config.book ?? BOOK_SIZE);
  // A board that already satisfies its opening book would hand out free ships
  // before anyone moved, so the book settles first and the count is then zeroed:
  // those were the deal, not the play.
  shipReady(state, config);
  // Zero ALL THREE. Resetting `filled` alone left `points` carrying the opening
  // settle, so every agent banked the deal as score while the beam search did
  // not — ORDER-1 read 12.70 against a ceiling of 4.33. Stage 0's C3 caught it
  // on its first run, which is the entire argument for running C3 first.
  state.filled = 0;
  state.points = 0;
  state.streak = 0;
  return state;
}

export function advanceSynth(
  state: SynthState,
  config: SynthConfig,
  chooseAction: (
    tiles: readonly string[],
    book: readonly string[],
    queue: readonly string[],
    bank: number,
    turn: number,
  ) => SynthAction,
): boolean {
  if (state.turn >= config.turns) return false;

  const action = chooseAction(
    [...state.tiles],
    [...state.book],
    previewOf(state, config),
    state.bank,
    state.turn,
  );
  const { reaction, rejected } = judgeSynth(
    state.tiles,
    action,
    state.bank,
    config,
    state.swapsLeft,
  );

  let shipped: string[] = [];
  if (rejected === null && (action.kind ?? 'REACT') === 'TRANSPOSE') {
    const [a, b] = action.cells as [number, number];
    const tmp = state.tiles[a]!;
    state.tiles[a] = state.tiles[b]!;
    state.tiles[b] = tmp;
    if ((config.swap ?? 'NONE') === 'FREE') state.swapsLeft -= 1;
    else state.bank -= TRANSPOSE_COST;
    // The book is settled after a transposition for symmetry, and it will never
    // actually ship: `shipReady` matches a molecule ANYWHERE on the board, so
    // anything a swap could deliver had already shipped the turn it appeared.
    // A transposition's whole value is the reaction it sets up next turn, which
    // is exactly why the one-ply readable rule cannot use the verb and a
    // planner can.
    shipped = shipReady(state, config);
  } else if (reaction !== null) {
    state.bank += reaction.released;
    const products = [...reaction.products];
    for (const cell of action.cells) {
      // A reaction can yield fewer molecules than it consumed — 3 H2 + N2 gives
      // 2 NH3 — so leftover cells top up from the pool. Atoms are conserved by
      // the REACTION; the refill is the board replenishing itself.
      const next = products.pop();
      state.tiles[cell] = next ?? fillAt(state.seed, state.turn, cell, state.weights);
    }
    shipped = shipReady(state, config);
  }

  // The streak counts consecutive DELIVERING turns and a dry turn breaks it.
  // Incremented after shipping so the first delivery of a run scores at
  // multiplier^0 = 1 and the streak is a reward for continuing, not for starting.
  state.streak = shipped.length > 0 ? state.streak + 1 : 0;
  state.turn += 1;
  state.digest = (Math.imul(state.digest, 31) ^ hashState(boardWords(state.tiles))) >>> 0;
  state.log.push({
    turn: state.turn - 1,
    cells: [...action.cells],
    option: action.option,
    reaction,
    rejected,
    shipped,
    bank: state.bank,
    filled: state.filled,
  });
  return true;
}

export function playSynth(
  seed: number,
  config: SynthConfig,
  chooseAction: (
    tiles: readonly string[],
    book: readonly string[],
    queue: readonly string[],
    bank: number,
    turn: number,
  ) => SynthAction,
): SynthResult {
  const state = beginSynth(seed, config);
  while (advanceSynth(state, config, chooseAction));
  const last = state.log[state.log.length - 1];
  return {
    score: state.points,
    shipped: state.filled,
    bank: Math.max(0, Math.round(state.bank)),
    turnsPlayed: state.turn,
    digest: state.digest,
    log: state.log,
    stalled: last !== undefined && last.rejected === 'NO_REACTION',
  };
}

/**
 * Replays a submitted action list and returns what it ACTUALLY scores.
 *
 * The server's only scoring path. It takes the actions and nothing else — no
 * claimed score, no claimed products, no claimed digest to compare against
 * before it has derived its own.
 */
export function verifySynth(
  seed: number,
  config: SynthConfig,
  actions: readonly SynthAction[],
): SynthResult {
  let i = 0;
  return playSynth(seed, config, () => actions[i++] ?? PASS);
}
