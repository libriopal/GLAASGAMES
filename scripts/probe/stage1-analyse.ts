// Reads stage 1's cells and reports what actually moved the failing gate.
//
// Effects are reported with an error estimate derived from the design itself
// rather than from a distributional assumption: in a saturated two-level
// fractional factorial the HIGH-ORDER effects are pure noise, so the spread of
// the smallest effects IS the noise floor. That is Lenth's method, and it is
// used here because 64 cells with one replicate each leave no residual degrees
// of freedom to estimate error the usual way.
import { readFileSync } from 'node:fs';
import {
  FACTORS,
  GLYPH_LEGEND,
  interactionEffects,
  mainEffects,
  screeningDesign,
} from '../../foundry/montecarlo/design.js';

interface Cell {
  readonly i: number;
  readonly label: string;
  readonly agencyFloorPct: number;
  readonly seedSharePct: number;
  readonly signalUtilityPct: number;
  readonly decisionDensityPct: number;
  readonly throughput: number;
  readonly ruleCount: number;
  readonly readable: number;
  readonly plan: number;
  readonly ceiling: number;
}

const data = JSON.parse(readFileSync('design/mc/stage1/cells.json', 'utf8')) as {
  resolution: number;
  seeds: number;
  cells: Cell[];
};
const rows = screeningDesign().slice(0, data.cells.length);

/**
 * Lenth's pseudo standard error. The margin below which an effect is noise.
 *
 * s0 = 1.5 x median|effect|, then PSE = 1.5 x median of the effects smaller
 * than 2.5 s0. Robust to a few genuinely large effects dominating the median,
 * which is exactly the situation a screen is looking for.
 */
function lenthPSE(effects: readonly number[]): number {
  const abs = effects.map(Math.abs).sort((a, b) => a - b);
  const med = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.length % 2 === 1 ? xs[(xs.length - 1) / 2]! : (xs[xs.length / 2 - 1]! + xs[xs.length / 2]!) / 2;
  const s0 = 1.5 * med(abs);
  const trimmed = abs.filter((v) => v < 2.5 * s0);
  return 1.5 * med(trimmed.length > 0 ? trimmed : abs);
}

function report(name: string, response: number[], higherIsBetter: boolean): string[] {
  const main = mainEffects(rows, response);
  const inter = interactionEffects(rows, response);
  const pse = lenthPSE([...main, ...inter.map((x) => x.effect)]);
  // Margin of error at roughly 95%: Lenth's t-like multiplier for this many
  // contrasts. 2.3 is the conventional value for ~36 effects.
  const me = 2.3 * pse;
  const out: string[] = [];
  out.push(`\n── ${name} ${higherIsBetter ? '(higher better)' : '(lower better)'} · noise floor ±${me.toFixed(1)} ──`);
  const ranked = FACTORS.map((f, i) => ({ key: f.key, e: main[i]! }))
    .sort((a, b) => Math.abs(b.e) - Math.abs(a.e));
  for (const r of ranked) {
    const sig = Math.abs(r.e) > me ? '  SIGNIFICANT' : '';
    out.push(`   ${r.key.padEnd(9)} ${r.e >= 0 ? '+' : ''}${r.e.toFixed(1).padStart(7)}${sig}`);
  }
  const bigInter = inter.filter((x) => Math.abs(x.effect) > me).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  if (bigInter.length > 0) {
    out.push('   interactions past the noise floor:');
    for (const x of bigInter.slice(0, 8)) {
      out.push(`     ${x.a}x${x.b}`.padEnd(30) + `${x.effect >= 0 ? '+' : ''}${x.effect.toFixed(1)}`);
    }
  } else {
    out.push('   no two-factor interaction clears the noise floor');
  }
  return out;
}

console.log(`stage 1: ${data.cells.length} cells, resolution ${data.resolution}, ${data.seeds} seeds/cell`);
console.log(GLYPH_LEGEND);

for (const line of report('AGENCY FLOOR %', data.cells.map((c) => c.agencyFloorPct), true)) console.log(line);
for (const line of report('SEED SHARE %', data.cells.map((c) => c.seedSharePct), false)) console.log(line);
for (const line of report('DECISION DENSITY %', data.cells.map((c) => c.decisionDensityPct), true)) console.log(line);
for (const line of report('THROUGHPUT', data.cells.map((c) => c.throughput), true)) console.log(line);

// ── the pre-registered acceptance, applied without moving ──────────────────
const PASSES = (c: Cell): boolean =>
  c.agencyFloorPct >= 25 &&
  c.signalUtilityPct >= 50 &&
  c.seedSharePct <= 35 &&
  c.ceiling >= c.plan - 0.05 &&
  c.throughput >= 2 &&
  c.throughput <= 8;

const winners = data.cells.filter(PASSES);
console.log(`\n── pre-registered acceptance ──────────────────────────`);
console.log(`   cells clearing every threshold: ${winners.length} of ${data.cells.length}`);
for (const c of [...winners].sort((a, b) => a.ruleCount - b.ruleCount || b.agencyFloorPct - a.agencyFloorPct).slice(0, 12)) {
  console.log(
    `   ${c.label}  agency ${c.agencyFloorPct.toFixed(1).padStart(6)}%  seed ${c.seedSharePct.toFixed(0).padStart(3)}%  ` +
      `thru ${c.throughput.toFixed(2)}  decis ${c.decisionDensityPct.toFixed(0)}%  rules ${c.ruleCount}`,
  );
}

// ── the parsimony rule: fewest rules among those within one SE of the best ──
if (winners.length > 0) {
  const best = Math.max(...winners.map((c) => c.agencyFloorPct));
  const se = lenthPSE(mainEffects(rows, data.cells.map((c) => c.agencyFloorPct)));
  const close = winners.filter((c) => c.agencyFloorPct >= best - se);
  const chosen = [...close].sort((a, b) => a.ruleCount - b.ruleCount || b.agencyFloorPct - a.agencyFloorPct)[0]!;
  console.log(`\n── parsimony rule ─────────────────────────────────────`);
  console.log(`   best agency floor ${best.toFixed(1)}%, one SE = ${se.toFixed(1)}, ${close.length} cell(s) within it`);
  console.log(`   CHOSEN (fewest rules, not highest score): ${chosen.label}`);
  console.log(`   agency ${chosen.agencyFloorPct.toFixed(1)}% · seed ${chosen.seedSharePct.toFixed(0)}% · throughput ${chosen.throughput.toFixed(2)} · decision density ${chosen.decisionDensityPct.toFixed(0)}% · rules ${chosen.ruleCount}`);
} else {
  console.log(`\n── NOTHING CLEARED THE PRE-REGISTERED BAR ─────────────`);
  const best = [...data.cells].sort((a, b) => b.agencyFloorPct - a.agencyFloorPct)[0]!;
  console.log(`   best agency floor reached: ${best.agencyFloorPct.toFixed(1)}% at ${best.label}`);
  console.log(`   The pre-registration says this is reported as a finding, not fixed by lowering the bar.`);
}

// ── the falsification check the design named in advance ────────────────────
const optionsIdx = FACTORS.findIndex((f) => f.key === 'OPTIONS');
const withOptions = data.cells.filter((_, j) => rows[j]![optionsIdx] === 1);
const withoutOptions = data.cells.filter((_, j) => rows[j]![optionsIdx] === -1);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(`\n── falsification: does the product choice do anything? ─`);
console.log(`   throughput with 3 options ${mean(withOptions.map((c) => c.throughput)).toFixed(2)} · with 1 option ${mean(withoutOptions.map((c) => c.throughput)).toFixed(2)}`);
console.log(`   (the plan declared: a winner requiring OPTIONS=1 falsifies the design this game rests on)`);
