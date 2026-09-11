// foundry/visual/belief.ts — what the player has worked out, as an object.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE INTERFACE HAS NO REPRESENTATION OF INFERENCE, AND THAT IS THE GAP.
//
// This game is about reading a hidden lattice from a charge trail. A player
// banks a cell, watches where charge appears, and slowly builds a model of which
// way each region flows. That model — the entire subject of the game — currently
// exists only in the player's head. Lose your place and there is nothing on
// screen to recover it from.
//
// `verify-learnable` E8 measured what the model is worth: recall alone +6.3%,
// regional deduction alone +4.2%, both together +7.3%. The inference is real,
// it compounds, and it is invisible.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT IS BUILT FROM OBSERVATIONS AND CANNOT BE BUILT FROM ANYTHING ELSE.
//
// `board.observable()` returns FACE, STATE and CHARGE per cell — not
// `OFFSET_LINK` and not `OFFSET_W`. The hidden lattice is not on the client at
// all, so a belief assembled here is necessarily the player's own reconstruction
// rather than a redacted copy of the answer. That is the structural reason this
// module is safe, and it is why every function below takes observations and
// never a board.
//
// The distinction matters because `web/lattice-gl.ts` records the project once
// getting it wrong the other way: hiding real links behind a client-side slice
// gate, where "the client declines to draw the secret" was mistaken for
// security. Nothing here declines to draw anything. There is nothing to decline.

import { type Vec4, vec4, wedge4 } from '../../engine/math/vec4.js';
import { BOARD_W } from '../../lattice/board.js';
import { fromFixed, toFixed } from '../../engine/math/fixed.js';

/** One thing the player actually saw: a bank, and where charge appeared. */
export interface Observation {
  /** The cell that was banked. */
  readonly from: number;
  /** The cell whose charge rose immediately after. */
  readonly to: number;
  /** Turn index, so recency can be weighed. */
  readonly turn: number;
}

const colOf = (i: number): number => i % BOARD_W;
const rowOf = (i: number): number => (i / BOARD_W) | 0;

/**
 * An observation as a vector in R⁴.
 *
 * The first two components are the DIRECTION the charge moved — the thing being
 * inferred. The second two are what the player knows ABOUT that evidence:
 * how often it has been seen, and how recently.
 *
 * That is the honest reason this belongs in four dimensions rather than two. A
 * direction is 2D. A direction you have seen four times, once recently, is not —
 * it carries its own provenance, and the provenance is exactly what tells a
 * player whether to trust it. Putting confidence and recency on their own axes
 * means the geometry can express "I am sure about this" and "I saw this a while
 * ago" as separate facts, which a 2D arrow cannot.
 */
export function observationVector(o: Observation, count: number, latestTurn: number): Vec4 {
  const dx = colOf(o.to) - colOf(o.from);
  const dy = rowOf(o.to) - rowOf(o.from);
  // Confidence saturates: the fifth sighting of the same direction adds less
  // than the second, which is how belief actually behaves.
  const confidence = 1 - 1 / (1 + count);
  // Recency decays over the length of a round rather than absolute turns, so a
  // short heat and a long one produce comparable geometry.
  const recency = Math.max(0, 1 - (latestTurn - o.turn) / 12);
  return vec4(toFixed(dx), toFixed(dy), toFixed(confidence), toFixed(recency));
}

export interface BeliefState {
  /** Observations, in the order witnessed. */
  readonly observations: readonly Observation[];
  /** The running bivector: six components, one per rotation plane of R⁴. */
  readonly bivector: readonly number[];
  /** How much evidence stands behind it. */
  readonly weight: number;
  /** 0..1 — how much the evidence agrees with itself. */
  readonly coherence: number;
}

export const EMPTY_BELIEF: BeliefState = {
  observations: [],
  bivector: [0, 0, 0, 0, 0, 0],
  weight: 0,
  coherence: 0,
};

/**
 * Folds one observation into a belief.
 *
 * ── THE BIVECTOR RATIONALE THIS FUNCTION SHIPPED WITH DOES NOT HOLD ─────────
 *
 * It read: "Parallel evidence wedges to nearly zero AREA; conflicting evidence
 * wedges to a large one. So the magnitude of the running bivector measures
 * DISAGREEMENT." Five observations per stream, all on interior cells:
 *
 *     stream        directions              |bivector|   XY component   coherence
 *     parallel      +x +x +x +x +x             0.4192       0.0000         1.000
 *     orthogonal    +x +y +x +y +x             0.4763       0.0000         0.500
 *     opposed       +x -x +x -x +x             0.5444       0.0000         0.000
 *
 * The XY component is EXACTLY ZERO in every case, and that part is algebra
 * rather than luck: `wedge(v, v)` and `wedge(v, -v)` are both zero, so a stream
 * of parallel evidence and a stream of opposed evidence contribute nothing
 * whatever to the one plane that carries direction. The component that ought to
 * answer the question is identically blind to it.
 *
 * What magnitude the bivector does have comes from the planes involving the
 * confidence and recency axes — provenance bookkeeping, not agreement. Its total
 * spans 0.4192 to 0.5444 across streams that run from perfect agreement to
 * perfect opposition: a 30% difference where the claim promised "nearly zero"
 * against "large", with the ORTHOGONAL stream sitting in the middle even though
 * orthogonal vectors are exactly the pair a wedge should report as extreme.
 *
 * So the original claim was not backwards; it was a confounded proxy. The
 * direction cosine below answers the same question exactly, in one line, with no
 * dependence on how many observations have accumulated: 1.000, 0.500, 0.000.
 * A quantity that is exact is not improved by replacing it with one that
 * correlates.
 *
 * ── WHAT SURVIVES, AND WHY THE FOURTH AXIS IS STILL EARNED ──────────────────
 *
 * The wrong 4D object was the bivector, not the fourth axis. An observation is
 * genuinely a 4-vector — two components of direction, two of provenance — and
 * the display the search selected reads exactly that structure: its ANGLE comes
 * from the xy projection (`resultant`), its SIZE from the magnitude of that same
 * projection, and its BRIGHTNESS from a provenance axis. The extra axes do not
 * draw anything themselves; they govern how the projection is drawn, which is
 * the same relationship `projectTo3D` has to `viewerW`.
 *
 * The bivector is kept because `dominantPlane` feeds the `plane` and `bivXY`
 * angle terms, and those are MEMBERS OF THE SEARCHED GRAMMAR rather than
 * assertions. The search's verdict on them is on the record: across nine runs
 * (three trial sets x three seeds) every winner used `resultant`, and no
 * bivector-derived term appeared in a first place. Leaving them in the space is
 * what makes that a measurement instead of a preference.
 */
export function observe(prior: BeliefState, o: Observation): BeliefState {
  const observations = [...prior.observations, o];
  const latest = o.turn;

  // Count how often this exact direction has been seen, for the confidence axis.
  const dirKey = (x: Observation): string =>
    `${colOf(x.to) - colOf(x.from)},${rowOf(x.to) - rowOf(x.from)}`;
  const key = dirKey(o);
  const count = observations.filter((x) => dirKey(x) === key).length;

  const next = observationVector(o, count, latest);
  const biv = [...prior.bivector];
  let agreement = 0;

  if (prior.observations.length > 0) {
    const last = prior.observations[prior.observations.length - 1]!;
    const prevVec = observationVector(last, count, latest);
    const w = wedge4(prevVec, next);
    for (let i = 0; i < 6; i += 1) biv[i] = (biv[i] ?? 0) + fromFixed(w[i]!);

    // ── AGREEMENT IS MEASURED ON DIRECTION ALONE ────────────────────────────
    //
    // This was a full 4D cosine, and the provenance axes swamped it. Confidence
    // and recency are both positive and of order 1, so their products dominated
    // the +/-1 the direction contributes: measured, an ORTHOGONAL stream and a
    // PARALLEL stream both scored 0.793, identically, while an OPPOSED stream
    // scored 0.586 rather than the -1 the quantity is supposed to report.
    //
    // Coherence is documented as "how much the evidence agrees with itself", and
    // evidence here means the direction charge went. Provenance is not evidence
    // about direction; it is evidence about the evidence, and it already has two
    // channels of its own in `weight` and the recency decay. Mixing it in made
    // the one quantity that is supposed to separate agreement from disagreement
    // unable to do so.
    const ax = fromFixed(prevVec.x);
    const ay = fromFixed(prevVec.y);
    const bx = fromFixed(next.x);
    const by = fromFixed(next.y);
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    agreement = la > 0 && lb > 0 ? (ax * bx + ay * by) / (la * lb) : 0;
  }

  const weight = prior.weight + 1;
  // Coherence is the running mean of pairwise agreement, clamped to 0..1.
  const coherence = prior.observations.length === 0
    ? 0
    : Math.max(0, Math.min(1, (prior.coherence * (weight - 2) + (agreement + 1) / 2) / (weight - 1)));

  return { observations, bivector: biv, weight, coherence };
}

/** The dominant plane of a belief, and how dominant it is. */
export function dominantPlane(b: BeliefState): { plane: number; share: number } {
  let total = 0;
  let best = 0;
  let bestIdx = 0;
  for (let i = 0; i < 6; i += 1) {
    const m = Math.abs(b.bivector[i] ?? 0);
    total += m;
    if (m > best) { best = m; bestIdx = i; }
  }
  return { plane: bestIdx, share: total === 0 ? 0 : best / total };
}

/**
 * The belief's resultant direction on the board, as a unit-ish 2D vector.
 *
 * This is what a player would draw if asked "which way does charge tend to go?"
 * — the sum of observed displacements, weighted by recency and confidence.
 */
export function resultant(b: BeliefState): { x: number; y: number; magnitude: number } {
  let x = 0;
  let y = 0;
  const latest = b.observations.length === 0 ? 0 : b.observations[b.observations.length - 1]!.turn;
  for (const o of b.observations) {
    const r = Math.max(0.15, 1 - (latest - o.turn) / 12);
    x += (colOf(o.to) - colOf(o.from)) * r;
    y += (rowOf(o.to) - rowOf(o.from)) * r;
  }
  const magnitude = Math.hypot(x, y);
  return magnitude === 0 ? { x: 0, y: 0, magnitude: 0 } : { x: x / magnitude, y: y / magnitude, magnitude };
}
