// web/ratelimit.ts — the brightness guard, alone and free of the DOM.
//
// IT LIVES IN ITS OWN FILE FOR A REASON. It began inside `lattice-gl.ts`, and
// an oracle that wanted to test it directly had to import that module — which
// references WebGL2RenderingContext and every other DOM type, none of which
// exist under the Node tsconfig the verifiers compile against. The choice was
// to duplicate the function into the oracle or to extract it, and a duplicate
// would have been the self-witness failure in miniature: the check would agree
// with its own copy of the thing it was checking.
//
// WHY IT IS TESTED SEPARATELY AT ALL. The mutation harness deleted this guard
// and the end-to-end flash check did not notice, correctly: under ordinary play
// the field's target brightness never oscillates, so a limiter on a signal that
// does not swing is invisible from outside. That is a fact about the test, not
// about the guard. This exists to bound a signal a FUTURE change might make
// oscillate, and the only honest way to check a guard against a hazard that has
// not happened yet is to feed it the hazard. `verify-lattice-gl` G4b does.

/**
 * Fraction of full scale the field may brighten in one second.
 *
 * 0.6, AND THE NUMBER IS DERIVED RATHER THAN CHOSEN. It began at 1.6 and G4b
 * measured that value passing 6.1 flashes per second of 13% amplitude when
 * driven with a square wave — over WCAG 2.3.1's safe harbour of three, because
 * a swing of 10% or more counts as a flash.
 *
 * The bound that makes the hazard unreachable: a flash at exactly the 3/s limit
 * has a half-cycle of 167ms, so the rate must not move brightness more than
 * 10% of full scale in that time. 0.10 / 0.167 = 0.6. Anything oscillating
 * FASTER than three times a second therefore moves less than 10% and is not a
 * flash at all, whatever drives it.
 *
 * The cost is a slower fade-in — a full ramp now takes 1.7 seconds — and that
 * is the correct trade. The board arriving gently is a look; the board strobing
 * is a seizure risk.
 */
export const LUMA_RATE_LIMIT = 0.6;

/**
 * One step of the brightness rate limiter.
 *
 * WCAG 2.3.1 puts the photosensitive-seizure safe harbour at three flashes per
 * second. This does not aim to stay under it; it makes the rate unreachable,
 * because brightness cannot move fast enough to constitute a flash however the
 * caller drives it.
 */
export function rateLimit(current: number, wanted: number, dtSec: number): number {
  const maxStep = LUMA_RATE_LIMIT * Math.max(0, dtSec);
  return current + Math.max(-maxStep, Math.min(maxStep, wanted - current));
}
