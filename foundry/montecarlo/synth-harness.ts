// foundry/montecarlo/synth-harness.ts — the instrument for game two.
//
// Built BEFORE the game is balanced, which is the order `design/BUILD-PATTERN.md`
// insists on and the reason it does: a harness written afterward measures what
// you already decided. Everything in the chemistry design brief was measured by
// probes; this promotes those probes into the shape the Farkle harness already
// has, so the two games are gated on the same instrument rather than on two.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS INHERITS FROM THE FARKLE HARNESS AND WHY THE SHAPE IS THE SAME.
//
//   1. An agent ladder: floor, reference rungs, ceiling.
//   2. The persona population — 15 profiles from 8,000 real conversations,
//      driven by the SAME `styleOf` mapping, so a player who is cautious in
//      Farkle is cautious here and the two games can be compared on one
//      population. A per-game persona set would make that comparison meaningless.
//   3. A degenerate-strategy probe: fixed, thoughtless rules. A wide skill
//      ladder does not rule out one mindless heuristic sitting above all of it.
//   4. Seed-vs-policy variance: does the player decide, or the deal?
//   5. The dual constraint — Signal Utility >= 50% AND Agency Floor >= 25%.
//
// The dual constraint is not two versions of one idea. Headroom alone was the
// first gate here and the audit killed it: A BETTER INTERFACE WOULD BE PENALISED
// BY YOUR OWN GATE. The two pull opposite ways on purpose, so neither can be
// satisfied by degrading the other.

import {
  type SynthAction,
  type SynthConfig,
  BOOK_SIZE,
  DEFAULT_SYNTH,
  ORDER_POOL,
  PASS,
  VOID_CELL,
  beginSynth,
  advanceSynth,
  optionsFor,
  orderAt,
  playSynth,
  refillAt,
} from '../../game/chem/synth.js';
import { TRANSPOSE_COST, cellsOf } from '../../game/chem/synth.js';
import { adjacentIn, dockCells, neighbours, regions as topoRegions } from '../../game/chem/topology.js';
import { CELL_COUNT, MAX_SELECT } from '../../game/chem/board-react.js';
import { BOARD_W, BOARD_H } from '../../game/chem/board.js';
import { type Persona, type SimPlayer, personas, simPlayer } from '../sim/personas.js';
import { createRng, seedFrom } from '../sim/prng.js';

/**
 * Connected selections for the configured board.
 *
 * Was a module-level constant built for the square board. Topology is now a
 * factor, so a constant here would have silently kept every agent playing the
 * square board's geometry while the executor played a hex — the kind of split
 * where the harness measures a different program from the one that ships.
 */
export function regionsFor(config: SynthConfig): readonly (readonly number[])[] {
  return topoRegions(config.topology ?? 'SQUARE36', MAX_SELECT);
}

export interface Move {
  readonly action: SynthAction;
  readonly released: number;
  readonly products: readonly string[];
  readonly reactants: readonly string[];
}

/** Every action available on this board, at the configured option breadth. */
export function legalMoves(tiles: readonly string[], config: SynthConfig): Move[] {
  const out: Move[] = [];
  for (const cells of regionsFor(config)) {
    const opts = optionsFor(tiles, cells, config.options);
    for (let i = 0; i < opts.length; i += 1) {
      const r = opts[i]!;
      if (r.released <= 0) continue;
      out.push({
        action: { cells, option: i },
        released: r.released,
        products: r.products,
        reactants: r.reactants,
      });
    }
  }
  return out;
}

/**
 * Every transposition worth considering: a swap that puts an open order's
 * molecule somewhere a reaction can then use, or that brings two reagents
 * together.
 *
 * Enumerated as the pairs of adjacent cells holding DIFFERENT molecules —
 * swapping two identical tiles is a no-op that costs energy, and offering it
 * would be offering a way to lose.
 */
export function transposeMoves(
  tiles: readonly string[],
  bank: number,
  config: SynthConfig,
  swapsLeft = 0,
): Move[] {
  const rule = config.swap ?? 'NONE';
  if (rule === 'NONE') return [];
  if (rule === 'FREE' ? swapsLeft <= 0 : bank < TRANSPOSE_COST) return [];
  const topo = config.topology ?? 'SQUARE36';
  const nb = neighbours(topo);
  const out: Move[] = [];
  for (let a = 0; a < cellsOf(config); a += 1) {
    for (const b of nb[a]!) {
      // Each unordered pair once. Enumerating both directions would double the
      // move list and bias any agent that slices a ranked candidate set.
      if (b <= a) continue;
      if (tiles[a] === tiles[b]) continue;
      out.push({
        action: { cells: [a, b], option: -1, kind: 'TRANSPOSE' },
        released: -TRANSPOSE_COST,
        // `applyTo` pops products onto cells in order, so the list is written
        // in the order that makes the pop produce a SWAP. Listing them the way
        // they read left-to-right makes it a silent no-op instead.
        products: [tiles[a]!, tiles[b]!],
        reactants: [tiles[a]!, tiles[b]!],
      });
    }
  }
  return out;
}

/** Where a delivery has to happen, given the rule. */
export function dockSet(config: SynthConfig): ReadonlySet<number> | null {
  return (config.deliver ?? 'ANYWHERE') === 'DOCK'
    ? new Set(dockCells(config.topology ?? 'SQUARE36'))
    : null;
}

/**
 * Does this move ship anything from the book, and does it destroy anything in it?
 *
 * Under DOCK a product only counts when it LANDS in the dock, so the same
 * reaction is worth a delivery in one place on the board and nothing in another.
 * That is the whole point of the positional rule and it has to be in the agents'
 * scoring or they will rate every move as if position were free.
 */
export function bookDelta(
  m: Move,
  book: readonly string[],
  dock: ReadonlySet<number> | null = null,
): number {
  const open = [...book];
  let ships = 0;
  const cells = m.action.cells;
  for (let i = 0; i < m.products.length; i += 1) {
    const p = m.products[i]!;
    // `applyTo` pops products onto cells in order, so product i lands in the
    // cell this index maps to. Getting that mapping wrong would score
    // deliveries in cells they never reach.
    const landsAt = cells[m.products.length - 1 - i];
    if (landsAt === undefined) continue;
    if (dock !== null && !dock.has(landsAt)) continue;
    const at = open.indexOf(p);
    if (at !== -1) { open.splice(at, 1); ships += 1; }
  }
  // Consuming a molecule that was itself an open order is a real cost and the
  // reason a purely product-counting score would mis-rank moves.
  let destroys = 0;
  for (const r of m.reactants) {
    if (book.includes(r) && !m.products.includes(r)) destroys += 1;
  }
  return ships - destroys;
}

export interface Agent {
  readonly name: string;
  readonly choose: (
    tiles: readonly string[],
    book: readonly string[],
    /** Orders coming after the book, as far as `config.preview` shows. */
    queue: readonly string[],
    bank: number,
    turn: number,
    config: SynthConfig,
  ) => SynthAction;
}

/** The floor. A random legal move, which is not the same as a random selection. */
export function randomAgent(seed: number): Agent {
  const rng = createRng(seedFrom(seed, 'synth:random'));
  return {
    name: 'RANDOM',
    choose: (tiles, _book, _queue, _bank, _turn, config) => {
      const moves = legalMoves(tiles, config);
      return moves.length === 0 ? PASS : moves[rng.nextInt(moves.length)]!.action;
    },
  };
}

/**
 * The degenerate strategy: take the most exothermic move, ignore the book.
 *
 * This is `round.ts`'s optimal player, and it is here as the control. If it
 * competes with agents that read the book, the order objective is decoration and
 * the game is still the energy game that measured at 5.7% headroom.
 */
export const GREEDY: Agent = {
  name: 'GREEDY',
  choose: (tiles, _book, _queue, _bank, _turn, config) => {
    const moves = legalMoves(tiles, config);
    if (moves.length === 0) return PASS;
    return moves.reduce((a, b) => (b.released > a.released ? b : a)).action;
  },
};

/** One ply: ship if you can, otherwise take the energy. The readable rule. */
export const ORDER_1: Agent = {
  name: 'ORDER-1',
  choose: (tiles, book, _queue, bank, _turn, config) => {
    // A one-ply rule takes a transposition only when the swap itself ships,
    // because one ply cannot see the reaction the swap was setting up. That is
    // the honest version of a readable rule and it is what leaves room above it.
    const moves = [...legalMoves(tiles, config), ...transposeMoves(tiles, bank, config)];
    if (moves.length === 0) return PASS;
    let best = moves[0]!;
    let bestScore = -Infinity;
    for (const m of moves) {
      const s = bookDelta(m, book, dockSet(config)) * 1e6 + m.released;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best.action;
  },
};

/**
 * Two ply: look one move past the one you are about to take.
 *
 * Bounded to 20 candidates because the point is a PLAYER'S lookahead rather than
 * a search. An unbounded version is `searchAgent`, and keeping them separate is
 * what makes the gap between them mean something.
 */
export const ORDER_2: Agent = {
  name: 'ORDER-2',
  choose: (tiles, book, _queue, _bank, _turn, config) => {
    const moves = legalMoves(tiles, config);
    if (moves.length === 0) return PASS;
    const ranked = [...moves]
      .sort((a, b) => bookDelta(b, book, dockSet(config)) - bookDelta(a, book, dockSet(config)) || b.released - a.released)
      .slice(0, 20);
    let best = ranked[0]!;
    let bestScore = -Infinity;
    for (const m of ranked) {
      const after = applyTo(tiles, m);
      // The second ply is scored against what the book looks like AFTER the
      // first move ships, not against the book as it stands now. Scoring both
      // plies against the opening book counts the same order twice and was
      // measured making an unbounded search score BELOW this agent.
      const remaining = [...book];
      const shipped = rolloutShip(after, remaining, dockSet(config));
      let bestFollow = 0;
      for (const f of follow(after, remaining, config)) {
        const d = bookDelta(f, remaining, dockSet(config));
        if (d > bestFollow) bestFollow = d;
      }
      const s = (shipped + bestFollow) * 1e6 + m.released;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best.action;
  },
};

/**
 * The follow-up moves ORDER-2 considers. Bounded, so the agent stays a player.
 *
 * ── RANKED, BECAUSE `slice` ON AN UNSORTED LIST IS NOT A BOUND, IT IS A BIAS ─
 *
 * The first version took `legalMoves(...).slice(0, 120)`. `legalMoves` walks
 * REGIONS, which is built by growing outward from cell 0, so the first 120
 * entries are all in the board's top-left corner. ORDER-2 was therefore looking
 * one move ahead IN ONE CORNER OF THE BOARD and blind everywhere else.
 *
 * Measured, that made a two-ply player worth nothing: ORDER-1 3.68, ORDER-2
 * 3.67. The probe this harness was promoted from had the same pair at 5.08 and
 * 6.33, so the flat result was the harness and not the game — the third
 * instrument defect this game has produced, all three found by a number coming
 * out wrong rather than by reading the code.
 *
 * A bound on how much a player considers is fine and is the point. A bound that
 * correlates with board position is a different agent wearing the same name.
 */
function follow(tiles: readonly string[], book: readonly string[], config: SynthConfig): Move[] {
  return [...legalMoves(tiles, config)]
    .sort((a, b) => bookDelta(b, book, dockSet(config)) - bookDelta(a, book, dockSet(config)) || b.released - a.released)
    .slice(0, 120);
}

function applyTo(tiles: readonly string[], m: Move): string[] {
  const next = [...tiles];
  const prods = [...m.products];
  for (const c of m.action.cells) next[c] = prods.pop() ?? next[c]!;
  return next;
}

/**
 * Ships from a LOCAL copy of the book during a rollout, and returns what went.
 *
 * ── THE BUG THIS REPLACES IS THE ONE THE BUILD PATTERN WARNS ABOUT ──────────
 *
 * The first version of the search rolled forward three plies scoring every one
 * of them against the ORIGINAL book, so a move that ships F2 was counted again
 * at every depth. The result was a "ceiling" measured at 3.33 against ORDER-2's
 * 3.40 — A SOLVER MARGIN OF MINUS 2.2%, an unbounded search losing to a
 * twenty-candidate lookahead.
 *
 * That is the failure mode `design/BUILD-PATTERN.md` records from Farkle almost
 * verbatim: "The broken evaluator blamed on the design... I nearly redesigned a
 * game around a bug in my own instrument." A negative solver margin is not a
 * finding about the game. It is arithmetic saying the instrument is wrong,
 * because an unbounded search can always play the bounded agent's move.
 *
 * A shipped order is REMOVED from the local book and NOT replaced. The replacement
 * is drawn from a stream the player cannot see, so valuing it at zero is the
 * honest model of what a player knows — it makes the rollout slightly
 * pessimistic about playing on, which is the safe direction for a ceiling.
 */
function rolloutShip(
  board: string[],
  book: string[],
  dock: ReadonlySet<number> | null = null,
): number {
  let shipped = 0;
  for (let i = book.length - 1; i >= 0; i -= 1) {
    const want = book[i]!;
    const at = dock === null
      ? board.indexOf(want)
      : board.findIndex((f, j) => f === want && dock.has(j));
    if (at === -1) continue;
    book.splice(i, 1);
    shipped += 1;
  }
  return shipped;
}

/**
 * THE CEILING IS A PLAN, NOT A POLICY, AND TWO BROKEN VERSIONS ESTABLISHED THAT.
 *
 * A ceiling belongs in the ladder as the thing no player is. Two attempts to
 * write it as an AGENT — something that picks one move from the current board —
 * both measured BELOW the bounded two-ply player:
 *
 *   · scoring every ply of a rollout against the ORIGINAL book counted the same
 *     order once per ply. Solver margin: -2.2%.
 *   · fixing that, the rollout saturated instead. The local book empties at
 *     three and stops, so most candidates tied on "ships 3" and the tie-break on
 *     energy dragged the agent toward GREEDY. Solver margin: -40.1%.
 *
 * A NEGATIVE SOLVER MARGIN IS NEVER A FINDING ABOUT THE GAME. An unbounded
 * search can always play the bounded agent's move, so anything below zero is
 * arithmetic reporting a broken instrument — the failure mode the build pattern
 * records from Farkle, where a bad search agent nearly caused a redesign.
 *
 * The fix is structural rather than another heuristic. A ceiling for a game
 * whose orders REFILL cannot be computed one move at a time from one board,
 * because the value of a move is the stream of orders it unlocks. So the ceiling
 * searches the whole horizon over real game states, exactly as the probe that
 * produced the design brief's numbers did.
 *
 * It reads the real order stream, which no player can. That is the point: the
 * gap between it and a player is what AGENCY FLOOR measures.
 */
interface BeamNode {
  readonly tiles: string[];
  readonly book: string[];
  readonly issued: number;
  readonly filled: number;
  /** Streak-weighted, so the ceiling is on the same scale as every agent. */
  readonly points: number;
  readonly streak: number;
}

function beamShip(node: BeamNode, seed: number, config: SynthConfig): BeamNode {
  const tiles = [...node.tiles];
  const book = [...node.book];
  let issued = node.issued;
  let filled = node.filled;
  let points = node.points;
  let shippedHere = 0;
  const size = config.book ?? BOOK_SIZE;
  const rule = config.refill ?? 'POOL';
  const dock = dockSet(config);
  for (;;) {
    let any = false;
    for (let i = book.length - 1; i >= 0; i -= 1) {
      const want = book[i]!;
      const at = dock === null
        ? tiles.indexOf(want)
        : tiles.findIndex((f, j) => f === want && dock.has(j));
      if (at === -1) continue;
      tiles[at] = rule === 'VOID' ? VOID_CELL : refillAt(seed, filled);
      book.splice(i, 1);
      const mult = config.streak ?? 1;
      points += mult <= 1 ? 1 : Math.pow(mult, node.streak + (shippedHere > 0 ? 1 : 0));
      filled += 1;
      shippedHere += 1;
      any = true;
    }
    while (book.length < size) {
      book.push(orderAt(seed, issued, config.pool ?? ORDER_POOL));
      issued += 1;
    }
    if (!any) break;
  }
  return {
    tiles,
    book,
    issued,
    filled,
    points,
    streak: shippedHere > 0 ? node.streak + 1 : 0,
  };
}

/**
 * The best throughput reachable on this seed, by beam search over the horizon.
 *
 * Width and per-node breadth are bounded so the number is reproducible and the
 * run finishes; an exhaustive search over a move list thousands wide per turn is
 * not computable and would not be a more honest ceiling, only a slower one.
 */
export function ceilingScore(
  seed: number,
  config: SynthConfig = DEFAULT_SYNTH,
  width = 16,
  breadth = 30,
): number {
  const start = beginSynth(seed, config);
  let beam: BeamNode[] = [
    {
      tiles: [...start.tiles],
      book: [...start.book],
      issued: start.issued,
      filled: 0,
      points: 0,
      streak: 0,
    },
  ];
  let best = 0;
  for (let t = 0; t < config.turns; t += 1) {
    const next: BeamNode[] = [];
    const seen = new Set<string>();
    for (const node of beam) {
      const moves = legalMoves(node.tiles, config);
      const ranked = [...moves]
        .sort((a, b) => bookDelta(b, node.book, dockSet(config)) - bookDelta(a, node.book, dockSet(config)) || b.released - a.released)
        .slice(0, breadth);
      for (const m of ranked) {
        const advanced = beamShip({ ...node, tiles: applyTo(node.tiles, m) }, seed, config);
        const key = `${advanced.filled}|${advanced.tiles.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (advanced.points > best) best = advanced.points;
        next.push(advanced);
      }
    }
    if (next.length === 0) break;
    next.sort((a, b) => b.points - a.points);
    beam = next.slice(0, width);
  }
  return best;
}

export function runCeiling(seeds: number, config: SynthConfig = DEFAULT_SYNTH): number {
  let total = 0;
  for (let s = 1; s <= seeds; s += 1) total += ceilingScore(s * 7919, config);
  return total / seeds;
}

/**
 * The strongest LEGITIMATE player: a receding-horizon beam that sees only the
 * orders currently on the book.
 *
 * ── WITHOUT THIS THE AGENCY FLOOR IS AN OVERCLAIM AND I NEARLY SHIPPED IT ───
 *
 * `ceilingScore` plans across the whole game against the REAL order stream,
 * because a ceiling is allowed to be the thing no player is. But AGENCY FLOOR is
 * supposed to answer "is there play left above the readable rule", and a gap
 * that exists only because the searcher can read orders that have not been
 * issued yet is not play left for a player. It is an information advantage, and
 * quoting it as headroom would tell a human they are leaving 29% on the table
 * when part of that 29% is unreachable by anyone who cannot see the future.
 *
 * So the gate is measured against THIS, and the difference between the two
 * ceilings is reported separately as what foreknowledge is worth. That number is
 * interesting in its own right: it is the upper bound on what showing the player
 * the next order would be worth, which is a live interface question rather than
 * an abstraction.
 *
 * Replanning every turn rather than committing to a line, because a player who
 * cannot see the stream learns what the next order is only when it arrives.
 */
export function planAgent(depth = 3, width = 8, breadth = 20): Agent {
  return {
    name: `PLAN-${depth}`,
    choose: (tiles, book, queue, bank, _turn, config) => {
      const moves = [...legalMoves(tiles, config), ...transposeMoves(tiles, bank, config)];
      if (moves.length === 0) return PASS;
      const ranked = [...moves]
        .sort((a, b) => bookDelta(b, book, dockSet(config)) - bookDelta(a, book, dockSet(config)) || b.released - a.released)
        .slice(0, breadth);

      let best = ranked[0]!;
      let bestScore = -Infinity;
      for (const m of ranked) {
        // Each candidate opens its own beam. An unknown replacement order is
        // worth zero, which is the honest valuation of something the player has
        // not been told — it makes the plan slightly pessimistic about playing
        // on, and pessimism is the safe direction for a bound on a player.
        // The local book is topped up FROM THE PREVIEW as slots free. Without
        // this the plan saturates at book size: three ships and there is nothing
        // left to plan toward, every candidate ties there, and the tie-break on
        // energy drags the planner back to greedy. That is exactly how a
        // three-ply beam measured BELOW the one-ply rule at preview 0.
        const upcoming = [...queue];
        const refillBook = (b: string[]): void => {
          while (b.length < book.length && upcoming.length > 0) b.push(upcoming.shift()!);
        };
        let beam: { tiles: string[]; book: string[]; shipped: number }[] = [];
        {
          const t0 = applyTo(tiles, m);
          const b0 = [...book];
          const s0 = rolloutShip(t0, b0, dockSet(config));
          refillBook(b0);
          beam.push({ tiles: t0, book: b0, shipped: s0 });
        }
        let reach = beam[0]!.shipped;
        for (let d = 1; d < depth; d += 1) {
          const next: typeof beam = [];
          for (const node of beam) {
            if (node.book.length === 0) continue;
            const fm = [...legalMoves(node.tiles, config)]
              .sort(
                (a, b) =>
                  bookDelta(b, node.book, dockSet(config)) - bookDelta(a, node.book, dockSet(config)) || b.released - a.released,
              )
              .slice(0, width);
            for (const f of fm) {
              const t = applyTo(node.tiles, f);
              const b = [...node.book];
              const s = node.shipped + rolloutShip(t, b, dockSet(config));
              refillBook(b);
              if (s > reach) reach = s;
              next.push({ tiles: t, book: b, shipped: s });
            }
          }
          if (next.length === 0) break;
          next.sort((a, b) => b.shipped - a.shipped);
          beam = next.slice(0, width);
        }
        const score = reach * 1e6 + m.released;
        if (score > bestScore) { bestScore = score; best = m; }
      }
      return best.action;
    },
  };
}

/**
 * A persona playing the synthesis line.
 *
 * The traits come from outside; THE MAPPING FROM TRAIT TO DECISION IS MINE and
 * is the part still unvalidated. That is recorded rather than hidden, and it is
 * a smaller claim than the invented 18% error rate this replaced.
 *
 *   searchDepth   how many candidate moves are examined at all. A weak player
 *                 does not see the whole board, so the best move is frequently
 *                 not among the ones they considered.
 *   slipRate      probability of taking something other than their own best.
 *   exploration   willingness to take a lower-energy option to serve the book —
 *                 which in THIS game is the decision the design is built on, so
 *                 openness is load-bearing here in a way it is not in Farkle.
 *   riskAppetite  willingness to spend bank on an endothermic step.
 */
export function personaAgent(runSeed: number, p: Persona): Agent {
  const sim: SimPlayer = simPlayer(runSeed, p);
  const rng = sim.rng;
  const style = sim.style;
  return {
    name: p.name,
    choose: (tiles, book, _queue, _bank, _turn, config) => {
      const moves = legalMoves(tiles, config);
      if (moves.length === 0) return PASS;
      // A weak player considers fewer of the available moves. The floor of 4
      // stops the least skilled persona from degenerating into the random agent,
      // which would make the population's bottom rung a duplicate of the floor.
      const considered = Math.max(4, Math.round(moves.length * (0.15 + 0.85 * style.searchDepth)));
      const pool = moves.slice(0, considered);
      let best = pool[0]!;
      let bestScore = -Infinity;
      for (const m of pool) {
        if (m.released < 0 && rng.next() > style.riskAppetite) continue;
        // Exploration is what buys the product choice: a player who will not
        // give up energy for the book never uses the mechanic at all.
        const weight = 0.2 + 1.8 * style.exploration;
        const s = bookDelta(m, book) * 1e6 * weight + m.released;
        if (s > bestScore) { bestScore = s; best = m; }
      }
      if (rng.next() < style.slipRate) return pool[rng.nextInt(pool.length)]!.action;
      return best.action;
    },
  };
}

export function personaLadder(runSeed: number): Agent[] {
  return personas().map((p) => personaAgent(runSeed, p));
}

export interface AgentResult {
  readonly name: string;
  /** Streak-weighted score. Equals `shipped` when the streak factor is 1.00. */
  readonly score: number;
  readonly shipped: number;
  readonly bank: number;
  readonly turns: number;
  readonly stalls: number;
}

export function runAgent(
  agent: Agent,
  seeds: number,
  config: SynthConfig = DEFAULT_SYNTH,
): AgentResult {
  let score = 0;
  let shipped = 0;
  let bank = 0;
  let turns = 0;
  let stalls = 0;
  for (let s = 1; s <= seeds; s += 1) {
    const r = playSynth(s * 7919, config, (tiles, book, queue, b, t) =>
      agent.choose(tiles, book, queue, b, t, config),
    );
    score += r.score;
    shipped += r.shipped;
    bank += r.bank;
    turns += r.turnsPlayed;
    if (r.stalled) stalls += 1;
  }
  return {
    name: agent.name,
    score: score / seeds,
    shipped: shipped / seeds,
    bank: bank / seeds,
    turns: turns / seeds,
    stalls: stalls / seeds,
  };
}

export interface Ladder {
  readonly rungs: readonly AgentResult[];
  /** The beam search's mean. Not an agent — see `ceilingScore`. */
  readonly ceiling: number;
  readonly population: readonly AgentResult[];
  /** Spread across the POPULATION, not the reference rungs. */
  readonly skillDeltaPct: number;
  /** How far the best bounded player sits below the search. */
  readonly solverMarginPct: number;
}

export function runLadder(seeds = 200, config: SynthConfig = DEFAULT_SYNTH): Ladder {
  const rungs = [randomAgent(1), GREEDY, ORDER_1, ORDER_2, planAgent()].map((a) =>
    runAgent(a, seeds, config),
  );
  const population = personaLadder(1).map((a) => runAgent(a, seeds, config));
  const pop = population.map((r) => r.shipped);
  const lo = Math.min(...pop);
  const hi = Math.max(...pop);
  const bounded = Math.max(...rungs.map((r) => r.shipped));
  const search = runCeiling(seeds, config);
  return {
    rungs,
    ceiling: search,
    population,
    skillDeltaPct: lo > 0 ? ((hi - lo) / lo) * 100 : 0,
    solverMarginPct: bounded > 0 ? ((search - bounded) / bounded) * 100 : 0,
  };
}

export interface DegenerateFinding {
  readonly name: string;
  readonly shipped: number;
  readonly pctOfBest: number;
}

/**
 * Is a thoughtless rule competitive?
 *
 * Farkle's version of this found `bank-after-1` at 99.1% of "best" and nearly
 * caused a redesign — the real defect was the search agent, not the game. So the
 * finding is reported as a RATIO against the best thoughtful agent and the
 * absolute numbers are kept, because a ratio alone cannot tell you which of the
 * two is broken.
 */
export function dominanceProbe(
  seeds = 150,
  config: SynthConfig = DEFAULT_SYNTH,
): { findings: DegenerateFinding[]; dominated: boolean } {
  const thoughtful = Math.max(
    runAgent(ORDER_2, seeds, config).shipped,
    runCeiling(seeds, config),
  );
  const degenerate: Agent[] = [
    GREEDY,
    {
      name: 'FIRST-LEGAL',
      choose: (tiles, _b, _q, _bank, _t, c) => {
        const m = legalMoves(tiles, c);
        return m.length === 0 ? PASS : m[0]!.action;
      },
    },
    {
      name: 'ALWAYS-OPTION-0',
      choose: (tiles, book, _q, _bank, _t, c) => {
        // Reads the book but never uses the product choice, which is the exact
        // control for "is the mechanic doing anything".
        const m = legalMoves(tiles, c).filter((x) => x.action.option === 0);
        if (m.length === 0) return PASS;
        return m.reduce((a, b) =>
          bookDelta(b, book, dockSet(c)) * 1e6 + b.released >
          bookDelta(a, book, dockSet(c)) * 1e6 + a.released
            ? b
            : a,
        ).action;
      },
    },
    {
      name: 'BIGGEST-REGION',
      choose: (tiles, _b, _q, _bank, _t, c) => {
        const m = legalMoves(tiles, c);
        if (m.length === 0) return PASS;
        return m.reduce((a, b) => (b.action.cells.length > a.action.cells.length ? b : a)).action;
      },
    },
  ];
  const findings = degenerate.map((a) => {
    const r = runAgent(a, seeds, config);
    return {
      name: a.name,
      shipped: r.shipped,
      pctOfBest: thoughtful > 0 ? (r.shipped / thoughtful) * 100 : 0,
    };
  });
  return { findings, dominated: findings.some((f) => f.pctOfBest >= 95) };
}

/**
 * Does the player decide, or the deal?
 *
 * Variance in outcome attributable to the seed, against variance attributable to
 * the policy. A game where the seed explains most of the result is a lottery
 * with a skin on it, however wide its skill ladder looks.
 */
export function seedDominance(
  seeds = 150,
  config: SynthConfig = DEFAULT_SYNTH,
): { seedSharePct: number; bySeed: number; byPolicy: number } {
  const agents = [randomAgent(1), GREEDY, ORDER_1, ORDER_2];
  const grid: number[][] = agents.map(() => []);
  for (let s = 1; s <= seeds; s += 1) {
    for (let a = 0; a < agents.length; a += 1) {
      grid[a]!.push(
        playSynth(s * 7919, config, (t, b, q, bank, turn) =>
          agents[a]!.choose(t, b, q, bank, turn, config),
        ).score,
      );
    }
  }
  const all = grid.flat();
  const mean = all.reduce((x, y) => x + y, 0) / all.length;
  const total = all.reduce((x, y) => x + (y - mean) ** 2, 0) / all.length;

  // Between-seed variance: how much the seed's mean moves across seeds.
  const seedMeans: number[] = [];
  for (let i = 0; i < seeds; i += 1) {
    seedMeans.push(grid.reduce((x, row) => x + row[i]!, 0) / agents.length);
  }
  const bySeed = seedMeans.reduce((x, y) => x + (y - mean) ** 2, 0) / seedMeans.length;

  // Between-policy variance: how much the agent's mean moves across agents.
  const polMeans = grid.map((row) => row.reduce((x, y) => x + y, 0) / row.length);
  const byPolicy = polMeans.reduce((x, y) => x + (y - mean) ** 2, 0) / polMeans.length;

  return {
    seedSharePct: total > 0 ? (bySeed / total) * 100 : 0,
    bySeed,
    byPolicy,
  };
}

export const SIGNAL_UTILITY_MIN_PCT = 50;
export const AGENCY_FLOOR_MIN_PCT = 25;

export interface DualConstraint {
  readonly signalUtilityPct: number;
  /** Measured against the strongest agent that cannot see the order stream. */
  readonly agencyFloorPct: number;
  /** What reading unissued orders is worth. Reported, never counted as headroom. */
  readonly foreknowledgePct: number;
  readonly passes: boolean;
}

/**
 * The two constraints that cannot both be gamed.
 *
 * SIGNAL UTILITY — a player who reads the order book beats one who ignores it.
 * If this fails, the interface is showing something that does not matter.
 *
 * AGENCY FLOOR — the book is not a command: play above the readable rule still
 * exists. If this fails, the interface has solved the game and the player is
 * executing instructions.
 *
 * They pull opposite ways. Headroom alone was the first gate and the audit
 * killed it in one line: a better interface would be penalised by it.
 */
export function dualConstraint(seeds = 200, config: SynthConfig = DEFAULT_SYNTH): DualConstraint {
  const blind = runAgent(GREEDY, seeds, config).shipped;
  const readable = runAgent(ORDER_1, seeds, config).shipped;
  const plan = runAgent(planAgent(), seeds, config).shipped;
  const ceiling = runCeiling(seeds, config);
  const signal = blind > 0 ? ((readable - blind) / blind) * 100 : 0;
  const agency = readable > 0 ? ((plan - readable) / readable) * 100 : 0;
  return {
    signalUtilityPct: signal,
    agencyFloorPct: agency,
    foreknowledgePct: plan > 0 ? ((ceiling - plan) / plan) * 100 : 0,
    passes: signal >= SIGNAL_UTILITY_MIN_PCT && agency >= AGENCY_FLOOR_MIN_PCT,
  };
}

/**
 * Does the board still wind down, or has delivery turned it into a conveyor?
 *
 * The audit's cost finding on delivery, in its own words: it "transforms the
 * game from a closed system, where mass is finite and space is a scarce
 * resource, to a steady-state conveyor... the player no longer fears running out
 * of atoms or room, only running out of efficiency."
 *
 * Round one measured decay as real: greedy play doubles the board's
 * thermodynamic sinks from 6.7 to 15.0 of 36 cells and dies at turn 9.5 with one
 * legal move where random play has 37. This re-measures it under the NEW rules,
 * because a finding from the old ruleset is not evidence about this one.
 */
export function decayProfile(
  agent: Agent,
  seeds = 120,
  config: SynthConfig = DEFAULT_SYNTH,
): { optionsFirst: number; optionsLast: number; turnsSurvived: number } {
  let first = 0;
  let last = 0;
  let survived = 0;
  for (let s = 1; s <= seeds; s += 1) {
    const state = beginSynth(s * 7919, config);
    let t = 0;
    let lastCount = 0;
    for (; t < config.turns; t += 1) {
      const moves = legalMoves(state.tiles, config);
      if (t === 0) first += moves.length;
      if (moves.length === 0) break;
      lastCount = moves.length;
      advanceSynth(state, config, (tiles, book, queue, bank, turn) =>
        agent.choose(tiles, book, queue, bank, turn, config),
      );
    }
    last += lastCount;
    survived += t;
  }
  return {
    optionsFirst: first / seeds,
    optionsLast: last / seeds,
    turnsSurvived: survived / seeds,
  };
}
