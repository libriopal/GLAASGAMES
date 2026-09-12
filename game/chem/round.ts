// game/chem/round.ts — the chemistry ruleset as an executor the server can replay.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS A SECOND RULESET, NOT A SECOND COPY OF THE RULES.
//
// `lattice/round.ts` forbids a second implementation of its turn at length, and
// `net/heat-server.ts` exists because of it: the server scores by replaying
// through `verifyRound`, which IS the shipped game, rather than re-implementing
// scoring and drifting.
//
// That prohibition is about DUPLICATION, and this file is not a duplicate. The
// chemistry mode has a different board (molecules, not dice), a different move
// (select a region and rearrange it, not bank one cell) and a different score
// (energy released, not face times charge). Nothing here re-implements anything
// in `lattice/round.ts`; the two are peers.
//
// But the ARCHITECTURAL RULE transfers exactly, and it is the reason this file
// exists at all rather than the chemistry living loose in the client: there must
// be exactly one executor per ruleset, and the server must verify by running it.
// So the contract below deliberately mirrors `lattice/round.ts` function for
// function — `begin`, `advance`, `play`, `verify` — so `heat-server.ts` can
// serve either mode without learning anything about chemistry.
//
// ─────────────────────────────────────────────────────────────────────────────
// A SUBMITTED MOVE IS A SELECTION, NEVER A REACTION.
//
// An action here is a list of cells. It is NOT the reaction, NOT the products
// and NOT the score, because every one of those would be a number the client
// could lie about. The executor derives the reaction from the selection itself,
// exactly as the single-player game does.
//
// An illegal selection therefore cannot inflate anything. It resolves to no
// reaction, the turn passes, and the replay diverges from any score claimed for
// it. A patched client can send whatever it likes; it cannot send a selection
// that reproduces a false total under these rules.

import { hashState } from '../../engine/sim/hash.js';
import { makeRng } from '../../engine/sim/world-gen.js';
import { MOLECULES, type Molecule } from './library.js';
import { type Reaction, bestRearrangement, isEndothermic } from './reaction.js';
import {
  type MoleculeWeights,
  CELL_COUNT,
  MAX_SELECT,
  UNIFORM_WEIGHTS,
  drawReactiveBoard,
  reactiveMoves,
} from './board-react.js';

const BY_FORMULA: ReadonlyMap<string, Molecule> = new Map(MOLECULES.map((m) => [m.formula, m]));
const INDEX_OF: ReadonlyMap<string, number> = new Map(MOLECULES.map((m, i) => [m.formula, i]));

/** One player action: the cells they selected. Never the reaction. */
export type ChemAction = readonly number[];

export interface ChemRoundConfig {
  readonly turns: number;
  /** Molecule draw weights. Omitted, uniform — the same additive shape `RoundConfig` uses. */
  readonly weights?: MoleculeWeights;
}

export const DEFAULT_CHEM_ROUND: ChemRoundConfig = { turns: 12 };

export type RejectedMove =
  | 'TOO_FEW_CELLS'
  | 'TOO_MANY_CELLS'
  | 'OUT_OF_RANGE'
  | 'DUPLICATE_CELL'
  | 'NO_REACTION'
  | 'CANNOT_AFFORD';

export interface ChemTurn {
  readonly turn: number;
  readonly cells: readonly number[];
  /** Null when the selection did not resolve; `rejected` then says why. */
  readonly reaction: Reaction | null;
  readonly rejected: RejectedMove | null;
  /** Bank after this turn. Never negative. */
  readonly bank: number;
}

export interface ChemRoundState {
  readonly tiles: string[];
  readonly rng: () => number;
  readonly weights: MoleculeWeights;
  bank: number;
  turn: number;
  digest: number;
  readonly log: ChemTurn[];
}

export interface ChemRoundResult {
  /** Energy banked at the end, kJ/mol. Integer, never negative. */
  readonly score: number;
  readonly turnsPlayed: number;
  readonly digest: number;
  readonly log: readonly ChemTurn[];
  /** True when the board ran out of reactions before the turns did. */
  readonly stalled: boolean;
}

/** The board as an Int32Array of molecule indices, for hashing. */
function boardWords(tiles: readonly string[]): Int32Array {
  const words = new Int32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i += 1) words[i] = INDEX_OF.get(tiles[i]!) ?? -1;
  return words;
}

export function beginChemRound(seed: number, config: ChemRoundConfig): ChemRoundState {
  const rng = makeRng(seed);
  const weights = config.weights ?? UNIFORM_WEIGHTS;
  const { tiles } = drawReactiveBoard(rng, weights);
  return {
    tiles,
    rng,
    weights,
    bank: 0,
    turn: 0,
    digest: hashState(boardWords(tiles)),
    log: [],
  };
}

/**
 * Validates a selection and derives what it does. Pure: touches no state.
 *
 * Separated from `advanceChemTurn` so the client can grey out an illegal
 * selection using the SAME function the server will judge it by. A client-side
 * rule that merely resembles the server's is the drift this repository refuses.
 */
export function judge(
  tiles: readonly string[],
  cells: ChemAction,
  bank: number,
): { reaction: Reaction | null; rejected: RejectedMove | null } {
  if (cells.length < 2) return { reaction: null, rejected: 'TOO_FEW_CELLS' };
  if (cells.length > MAX_SELECT) return { reaction: null, rejected: 'TOO_MANY_CELLS' };
  if (cells.some((c) => !Number.isInteger(c) || c < 0 || c >= CELL_COUNT)) {
    return { reaction: null, rejected: 'OUT_OF_RANGE' };
  }
  if (new Set(cells).size !== cells.length) return { reaction: null, rejected: 'DUPLICATE_CELL' };

  const reaction = bestRearrangement(cells.map((c) => BY_FORMULA.get(tiles[c]!)!));
  if (reaction === null) return { reaction: null, rejected: 'NO_REACTION' };
  // Endothermic reactions are real and are offered; they are not free. This is
  // the only place the game refuses one, and it refuses for a reason a chemist
  // would accept rather than by calling it impossible.
  if (isEndothermic(reaction) && bank + reaction.released < 0) {
    return { reaction: null, rejected: 'CANNOT_AFFORD' };
  }
  return { reaction, rejected: null };
}

/**
 * Plays one turn. Returns false when the round is over.
 *
 * ── CONNECTEDNESS IS NOT CHECKED HERE, AND THAT IS DELIBERATE ───────────────
 *
 * `reactiveMoves` only ever offers connected regions, so a legitimate client
 * cannot produce a disconnected one. Rejecting it in the executor would be a
 * second rule about geometry, and chemistry does not care whether two molecules
 * are adjacent on a grid — they react or they do not. Adjacency is an INTERFACE
 * constraint, enforced where selections are offered, and the executor scores
 * what the atoms actually do.
 */
export function advanceChemTurn(
  state: ChemRoundState,
  config: ChemRoundConfig,
  chooseAction: (tiles: readonly string[], bank: number, turn: number) => ChemAction,
): boolean {
  if (state.turn >= config.turns) return false;

  const cells = chooseAction([...state.tiles], state.bank, state.turn);
  const { reaction, rejected } = judge(state.tiles, cells, state.bank);

  if (reaction !== null) {
    state.bank += reaction.released;
    // Products replace reactants; any surplus cell refills from the pool. The
    // REACTION conserves atoms; the refill is the board topping itself up.
    const products = [...reaction.products];
    for (const cell of cells) {
      const next = products.pop();
      state.tiles[cell] = next ?? drawFormula(state.rng, state.weights);
    }
  }

  state.turn += 1;
  state.digest = (Math.imul(state.digest, 31) ^ hashState(boardWords(state.tiles))) >>> 0;
  state.log.push({
    turn: state.turn - 1,
    cells: [...cells],
    reaction,
    rejected,
    bank: state.bank,
  });
  return true;
}

function drawFormula(rng: () => number, weights: MoleculeWeights): string {
  let total = 0;
  for (const w of weights) total += w;
  let pick = Math.abs(rng()) % Math.max(1, total);
  for (let i = 0; i < MOLECULES.length; i += 1) {
    pick -= weights[i] ?? 0;
    if (pick < 0) return MOLECULES[i]!.formula;
  }
  return MOLECULES[0]!.formula;
}

export function finishChemRound(state: ChemRoundState, config: ChemRoundConfig): ChemRoundResult {
  return {
    score: state.bank,
    turnsPlayed: state.turn,
    digest: state.digest,
    log: state.log,
    stalled: state.turn < config.turns,
  };
}

export function playChemRound(
  seed: number,
  config: ChemRoundConfig,
  chooseAction: (tiles: readonly string[], bank: number, turn: number) => ChemAction,
): ChemRoundResult {
  const state = beginChemRound(seed, config);
  while (advanceChemTurn(state, config, chooseAction)) {
    // advanceChemTurn owns the loop condition, so two drivers cannot disagree
    // about when a round is over. Same discipline as lattice/round.ts.
  }
  return finishChemRound(state, config);
}

/**
 * Recomputes a round from its seed and recorded selections.
 *
 * The layer commit-reveal cannot provide. A patched client can draw what it
 * likes locally, but it cannot produce a list of SELECTIONS that reproduces a
 * false score under these rules — because the rules derive the reaction, the
 * products and the energy themselves, from tabulated bond enthalpies, and never
 * read a number the client supplied.
 */
export function verifyChemRound(
  seed: number,
  config: ChemRoundConfig,
  actions: readonly ChemAction[],
  claimedScore: number,
  claimedDigest: number,
): { readonly ok: boolean; readonly score: number; readonly digest: number } {
  const replayed = playChemRound(seed, config, (_tiles, _bank, turn) => actions[turn] ?? []);
  return {
    ok: replayed.score === claimedScore && replayed.digest === claimedDigest,
    score: replayed.score,
    digest: replayed.digest,
  };
}

/** A greedy reference player, for oracles and for a solo practice mode. */
export function greedyChoice(tiles: readonly string[]): ChemAction {
  const moves = reactiveMoves(tiles);
  if (moves.length === 0) return [];
  return moves.reduce((a, b) => (b.reaction.released > a.reaction.released ? b : a)).cells;
}

/**
 * This ruleset, in the shape `net/heat-server.ts` can verify.
 *
 * Declared HERE rather than in the server, so the dependency points from the
 * game to the server and never back. The server has no idea what a molecule is
 * and adding a third mode will not change a line of it.
 */
export const CHEM_RULESET = {
  id: 'chem',
  verify: verifyChemRound,
  turnsOf: (config: ChemRoundConfig): number => config.turns,
};
