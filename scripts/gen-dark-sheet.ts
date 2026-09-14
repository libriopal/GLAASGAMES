// The Darkmatter visual gate sheet, drawn from the SHIPPING RULESET rather than
// from a probe. Standing rule (H): render before concluding. Game two's deepest
// visual defect was a rule interacting with a readout, and no amount of
// balancing would have found it. One screenshot did.
//
// ═════════════════════════════════════════════════════════════════════════════
// TWO DEFECTS IN THE FIRST VERSION OF THIS SHEET, BOTH FOUND BY LOOKING AT IT.
//
// (1) THE TRAILS DREW THE FUTURE. `trailsOf` ran a clone FORWARD and drew the
//     result as history. A trail is the one thing that makes a momentum system
//     legible in a still frame, and drawing where a body WILL be in the visual
//     language of where it HAS been is the same class of lie as painting a
//     prediction in matter colours. Now the round is played once with a
//     recorder attached, and a trail contains only steps that actually happened.
//
// (2) THE DECISION WAS AN UNREADABLE BLOB. All fourteen ghosts landed inside a
//     cluster about one body-width across, in a view spanning twenty-four world
//     units. The numbers said the mechanic works -- 78.8% of ceiling against
//     16.3% for aiming -- and the picture said a player cannot execute it,
//     because "pick the nearest dot" is not a decision when the dots overlap.
//     The decision panels are now FRAMED on the marked body and the ring.
//
// (3) AND ALL FIVE PANELS DREW THE SAME STATE. A DarkView holds a REFERENCE to
//     the live universe, and the views were collected first and rendered last,
//     so by the time any SVG was produced the round had already finished and
//     every panel showed the final frame. "SEEDED" was captioned as five bodies
//     at step 80 and rendered seven bodies at step 320. The captions were right
//     and the pictures were all the same picture. Each panel is now rasterised
//     AT THE MOMENT IT DEPICTS.
import { writeFileSync } from 'node:fs';
import { darkScreenSvg, type DarkView, type Ghost, type Frame } from '../web/dark-screen.js';
import { stepUniverse } from '../game/dark/nbody.js';
import { toFloat } from '../game/dark/fixed.js';
import {
  BUDGET, LEG, SHOTS, MARKED,
  beginRound, costOf, ghostsFor, markedAt, nearestGhost, playAct, scoreOf,
  type RoundState,
} from '../game/dark/steer.js';
import { VOID_DEEP } from '../web/spectrum.js';

const SEED = 129;
type Pt = { x: number; y: number; z: number };

/** Records where bodies HAVE been, as the round is actually played. */
class Recorder {
  readonly trails: Pt[][] = [];
  constructor(private readonly s: RoundState) { this.trails = s.universe.bodies.map(() => []); }
  sample(): void {
    this.s.universe.bodies.forEach((b, i) => {
      if (!this.trails[i]) this.trails[i] = [];
      this.trails[i]!.push({ x: toFloat(b.pos.x), y: toFloat(b.pos.y), z: toFloat(b.pos.z) });
    });
  }
  /** Advance the LIVE round, sampling as it goes. Never a clone: the trail must
   *  be of the round that is being shown, or it is a different round's history. */
  advance(n: number): void {
    for (let t = 0; t < n; t += 1) { stepUniverse(this.s.universe); if (t % 5 === 0) this.sample(); }
  }
  snapshot(): Pt[][] { return this.trails.map((t) => t.slice(-48)); }
}

const toGhosts = (s: RoundState): Ghost[] =>
  ghostsFor(s).map((g) => ({ pos: g.pos, label: g.act.label, affordable: g.affordable, escapes: g.escapes }));

/**
 * Frame the DECISION, which is the ghosts and the ring -- and NOT the body.
 *
 * The first framing spanned the marked body, the ring and the landings. It still
 * produced a blob, and the reason is worth writing down because it is a fact
 * about the game rather than about the drawing: over a 240-step round the body
 * DRIFTS much further than the landings SPREAD. Including the body's current
 * position in the extent hands the scale to the drift, and the choice -- which
 * is entirely in the spread -- collapses to a few pixels inside it.
 *
 * So the extent is the ghosts and the ring. The body is usually outside the
 * frame, and its trail leads in from wherever it is, which is the correct
 * relationship: the player is choosing between futures, not looking at a dot.
 */
function frameFor(s: RoundState): Frame {
  const gs = ghostsFor(s).map((g) => g.pos);
  const xs = [s.ring.x, ...gs.map((g) => g.x)];
  const ys = [s.ring.y, ...gs.map((g) => g.y)];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), s.tol * 2.4, 0.5);
  // Fill about 60% of the view, with a hard cap so a degenerate spread cannot
  // zoom to infinity.
  return { cx, cy, cz: gs[0]?.z ?? 0, zoom: Math.min(26, 13 / span) };
}

// Each panel is rendered the instant it is built, because a DarkView holds a
// live reference to the universe and the round keeps running underneath it.
const views: { svg: string; caption: string }[] = [];
const panel = (v: DarkView, caption: string) => views.push({ svg: darkScreenSvg(v), caption });

// ── ONE ROUND, PLAYED ONCE, RECORDED AS IT GOES ────────────────────────────
const s = beginRound(SEED);
const rec = new Recorder(s);
rec.sample();

panel(
  { universe: s.universe, trails: [], label: 'SEEDED', aim: null, marked: MARKED, ring: null, budget: null },
  `Seed ${SEED}. Five bodies, settled 80 steps, rebuilt from the seed alone and bitwise-replayable. The marked body is ringed in white — the one noun the player steers. Wide frame: this panel exists to show that there is a universe.`,
);

const g1 = toGhosts(s);
const c1 = ghostsFor(s).map((g) => g.cost);
panel(
  {
    universe: s.universe, trails: rec.snapshot(), label: 'SHOT 1 · CHOOSE', aim: null,
    marked: MARKED, ring: { at: s.ring, r: s.tol }, ghosts: g1,
    budget: { spent: s.spent, total: BUDGET }, shot: { index: 1, of: SHOTS }, frame: frameFor(s),
  },
  `Framed on the decision. The cyan ring is the target. The fourteen UV rings are where the marked body ENDS UP under each action — not a trajectory, a landing. The cyan tick marks the nearest, which is the engine showing its own arithmetic rather than making a recommendation. Prices run ${Math.min(...c1).toFixed(1)}–${Math.max(...c1).toFixed(1)}: a drop is charged for its leverage, so the near, strong ones cost more.`,
);

const a1 = nearestGhost(s);
const p1 = costOf(s, a1);
playAct(s, a1);
rec.advance(0); // playAct already stepped the round; sample the new state
rec.sample();

const g2 = toGhosts(s);
const unaff = g2.filter((g) => !g.affordable).length;
panel(
  {
    universe: s.universe, trails: rec.snapshot(), label: 'SHOT 2 · CHOOSE', aim: null,
    marked: MARKED, ring: { at: s.ring, r: s.tol }, ghosts: g2,
    budget: { spent: s.spent, total: BUDGET }, shot: { index: 2, of: SHOTS }, frame: frameFor(s),
  },
  `Played “${a1.label}” for ${p1.toFixed(1)}. The ghosts are recomputed from what actually happened, not from what was predicted. ${unaff} of ${g2.length} are struck through — the budget no longer affords them, and they are shown rather than hidden because removing them would remove the cost decision instead of presenting it.`,
);

const a2 = nearestGhost(s);
const p2 = costOf(s, a2);
playAct(s, a2);
rec.sample();

{
  const m = markedAt(s.universe);
  const d = Math.hypot(m.x - s.ring.x, m.y - s.ring.y);
  panel(
    {
      universe: s.universe, trails: rec.snapshot(), label: 'RESOLVED', aim: null,
      marked: MARKED, ring: { at: s.ring, r: s.tol }, ghosts: [],
      budget: { spent: s.spent, total: BUDGET }, frame: frameFor(s),
    },
    `Played “${a2.label}” for ${p2.toFixed(1)}. Final distance ${d.toFixed(2)} against a tolerance of ${s.tol.toFixed(2)} — score <b>${scoreOf(s).toFixed(3)}</b>, budget spent ${s.spent.toFixed(1)} of ${BUDGET}. The trail is what actually happened, sampled every fifth step as the round was played.`,
  );
}

// ── THE NEGATIVE CONTROL · the same seed, untouched ────────────────────────
{
  const z = beginRound(SEED);
  const zr = new Recorder(z);
  zr.advance(LEG * SHOTS);
  const m = markedAt(z.universe);
  const d = Math.hypot(m.x - z.ring.x, m.y - z.ring.y);
  panel(
    {
      universe: z.universe, trails: zr.snapshot(), label: 'DO NOTHING', aim: null,
      marked: MARKED, ring: { at: z.ring, r: z.tol }, ghosts: [],
      budget: { spent: 0, total: BUDGET }, frame: frameFor(z),
    },
    `The same seed with no intervention at all. Distance ${d.toFixed(2)}, score <b>${scoreOf(z).toFixed(3)}</b>. This is the screensaver detector: if this panel looked like the one before it, the universe would be producing the score and the player would be an observer.`,
  );
}

const html = `<!doctype html><meta charset="utf-8"><title>darkmatter — visual gate</title>
<style>
 body{margin:0;background:${VOID_DEEP};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#dfe9f5}
 h1{font-size:15px;letter-spacing:3px;font-weight:500;padding:26px 26px 4px;margin:0}
 p.sub{padding:0 26px 18px;margin:0;color:#8fa3b8;font-size:12px;max-width:1180px;line-height:1.8}
 .grid{display:flex;flex-wrap:wrap;gap:22px;padding:10px 26px 34px}
 figure{margin:0;width:640px}
 figcaption{color:#8fa3b8;font-size:11.5px;padding-top:10px;line-height:1.8}
 b{color:#dfe9f5;font-weight:600}
</style>
<h1>DARKMATTER · VISUAL GATE</h1>
<p class="sub"><b>Drop a mass, or spin the cluster, to steer the marked body into the ring before your budget runs out.</b><br>
One real round of seed ${SEED}, played end to end by the shipping ruleset in <code>game/dark/steer.ts</code> and recorded as it went. Nothing here is posed.</p>
<div class="grid">
${views.map(({ svg, caption }) => `<figure>${svg}<figcaption>${caption}</figcaption></figure>`).join('\n')}
</div>`;

writeFileSync('design/dark-sheet.html', html);
console.log(`ok — ${views.length} panels`);
