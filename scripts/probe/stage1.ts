// STAGE 1 — the resolution-V screen. 64 cells, eight factors.
//
// Every cell writes to disk BEFORE aggregating, so an overrun leaves usable
// partial data rather than nothing. Every cell is asserted, and a lying
// instrument HALTS the run rather than being marked void.
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  GREEDY,
  ORDER_1,
  decisionDensity,
  planAgent,
  randomAgent,
  runAgent,
  runCeiling,
  seedDominance,
} from '../../foundry/montecarlo/synth-harness.js';
import { assertInstrument, assertSameVerbs } from '../../foundry/montecarlo/assert-instrument.js';
import {
  FACTORS,
  GLYPH_LEGEND,
  configFor,
  designResolution,
  labelFor,
  ruleCount,
  screeningDesign,
} from '../../foundry/montecarlo/design.js';

const SEEDS = Number(process.env.SEEDS ?? 30);
const OUT = 'design/mc/stage1';
mkdirSync(OUT, { recursive: true });

const rows = screeningDesign();
const resolution = designResolution(rows);
if (resolution < 5) {
  // Pre-registered: two-factor interactions must separate, because the whole
  // reason for a factorial here is that the factors interact.
  throw new Error(`design resolution ${resolution} < 5; the screen would confound the comparison it exists to make`);
}

console.log(`stage 1 — ${rows.length} cells, resolution ${resolution}, ${SEEDS} seeds/cell`);
console.log(GLYPH_LEGEND);
console.log('');
console.log('cell     label     rnd  greedy  read  plan  ceil |  agency   seed%  signal  decis  rules');

interface Cell {
  readonly i: number;
  readonly label: string;
  readonly config: Record<string, unknown>;
  readonly random: number;
  readonly greedy: number;
  readonly readable: number;
  readonly plan: number;
  readonly ceiling: number;
  readonly agencyFloorPct: number;
  readonly signalUtilityPct: number;
  readonly seedSharePct: number;
  readonly decisionDensityPct: number;
  readonly throughput: number;
  readonly ruleCount: number;
}

const cells: Cell[] = [];
const started = Date.now();

for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i]!;
  const config = configFor(row);
  const label = labelFor(row);

  assertSameVerbs(config);

  const random = runAgent(randomAgent(1), SEEDS, config).score;
  const greedy = runAgent(GREEDY, SEEDS, config).score;
  const readableRes = runAgent(ORDER_1, SEEDS, config);
  const readable = readableRes.score;
  const plan = runAgent(planAgent(3, 8, 20), SEEDS, config).score;
  const ceiling = runCeiling(SEEDS, config);

  // The instrument check, at every cell. A ceiling below the best bounded agent
  // is arithmetic reporting a broken evaluator, never a finding about the game.
  assertInstrument(`cell ${i} ${label}`, {
    ceiling,
    bestBounded: Math.max(random, greedy, readable, plan),
    responses: [],
  });

  const agencyFloorPct = readable > 0 ? ((plan - readable) / readable) * 100 : 0;
  const signalUtilityPct = greedy > 0 ? ((readable - greedy) / greedy) * 100 : Infinity;
  const seedSharePct = seedDominance(Math.min(SEEDS, 40), config).seedSharePct;
  const decisionDensityPct = decisionDensity(Math.min(SEEDS, 20), config);

  const cell: Cell = {
    i,
    label,
    config: config as unknown as Record<string, unknown>,
    random,
    greedy,
    readable,
    plan,
    ceiling,
    agencyFloorPct,
    signalUtilityPct,
    seedSharePct,
    decisionDensityPct,
    throughput: readableRes.shipped,
    ruleCount: ruleCount(row),
  };
  cells.push(cell);
  // Written per cell, not at the end. The declared degradation path requires an
  // overrun to leave data behind.
  writeFileSync(`${OUT}/cell-${String(i).padStart(2, '0')}.json`, JSON.stringify(cell, null, 2));

  console.log(
    `${String(i).padStart(4)}  ${label}  ${random.toFixed(2).padStart(5)}  ${greedy.toFixed(2).padStart(5)}  ` +
      `${readable.toFixed(2).padStart(5)} ${plan.toFixed(2).padStart(5)} ${ceiling.toFixed(2).padStart(5)} | ` +
      `${agencyFloorPct.toFixed(1).padStart(7)}% ${seedSharePct.toFixed(0).padStart(5)}% ` +
      `${(Number.isFinite(signalUtilityPct) ? signalUtilityPct.toFixed(0) : 'inf').padStart(6)}% ` +
      `${decisionDensityPct.toFixed(0).padStart(4)}% ${String(cell.ruleCount).padStart(5)}`,
  );
}

writeFileSync(`${OUT}/cells.json`, JSON.stringify({ resolution, seeds: SEEDS, factors: FACTORS.map((f) => f.key), cells }, null, 2));
console.log(`\n${cells.length} cells in ${((Date.now() - started) / 1000 / 60).toFixed(1)} min -> ${OUT}/cells.json`);
