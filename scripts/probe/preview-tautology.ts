// Is PREVIEW a discovery or a tautology?
//
// The post-run audit: "If Agency is defined as the ability to plan, and Preview
// is the ability to see the future, then the correlation is a mathematical
// certainty, not a game design insight... If PREVIEW makes the game solvable, it
// isn't increasing agency; it's deleting the game."
//
// The test is the SOLVER MARGIN, which agency floor does not contain. Agency is
// plan-vs-readable. Solver margin is ceiling-vs-plan: how much play is left
// ABOVE the best planner. If preview raises agency while collapsing solver
// margin, it is not adding depth, it is moving the whole game up against its own
// ceiling -- which is deleting it, exactly as the audit says.
import { readFileSync } from 'node:fs';
import { FACTORS, screeningDesign } from '../../foundry/montecarlo/design.js';

interface Cell { label: string; readable: number; plan: number; ceiling: number; agencyFloorPct: number }
const data = JSON.parse(readFileSync('design/mc/stage1/cells.json', 'utf8')) as { cells: Cell[] };
const rows = screeningDesign();
const pi = FACTORS.findIndex((f) => f.key === 'PREVIEW');

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log('preview | agency floor | solver margin (ceiling over plan) | plan as % of ceiling');
for (const lvl of [-1, 1]) {
  const cs = data.cells.filter((_, j) => rows[j]![pi] === lvl);
  const agency = mean(cs.map((c) => c.agencyFloorPct));
  const solver = mean(cs.map((c) => ((c.ceiling - c.plan) / c.plan) * 100));
  const pct = mean(cs.map((c) => (c.plan / c.ceiling) * 100));
  console.log(`${(lvl === 1 ? '5' : '0').padStart(7)} | ${agency.toFixed(1).padStart(12)}% | ${solver.toFixed(1).padStart(32)}% | ${pct.toFixed(1)}%`);
}
console.log('');
console.log('If preview buys agency by spending solver margin, it is moving the game');
console.log('up against its ceiling rather than adding depth to it.');
