// lattice/information.ts — is the hidden structure real, or is it bait?
//
// This is the safety instrument of the whole design, and it exists because of a
// specific empirical finding: habitual gamblers detect illusory patterns in
// random data MORE than other people do. A game that presents a hidden layer to
// be inferred is therefore, if that layer is noise, a machine aimed at exactly
// the population least able to resist it.
//
// The distinction that makes the design defensible is sharp. Apophenia is a
// FALSE POSITIVE on randomness. If the hidden lattice is genuinely structured
// and genuinely inferable, the player's pattern detection is CORRECT — the game
// is teaching a real skill, not rewarding a delusion. So the design must not
// merely assert that its structure is real; it must MEASURE it, and publish the
// number.
//
// What is measured: the mutual information, in bits, between the hidden link
// direction of a cell and the direction a player could infer from watching where
// charge appears. Zero bits means the observable consequences say nothing about
// the hidden cause — the player is staring at noise and any pattern they find is
// invented. The build fails there, by design.

/** Shannon entropy of a distribution given as counts. */
export function entropy(counts: readonly number[]): number {
  let total = 0;
  for (const c of counts) total += c;
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Mutual information I(X;Y) in bits, from a joint count table.
 *
 * `joint[x][y]` is how often x and y were seen together. Float maths is fine
 * here and only here: this is a MEASUREMENT ABOUT the simulation, not a part of
 * it, and nothing downstream of it feeds back into game state. The integer-only
 * rule protects reproducibility of play; an oracle that reports a diagnostic
 * number is outside it.
 */
export function mutualInformation(joint: readonly (readonly number[])[]): number {
  let total = 0;
  for (const row of joint) for (const v of row) total += v;
  if (total === 0) return 0;

  const rowSums = joint.map((row) => row.reduce((a, b) => a + b, 0));
  const colCount = joint[0]?.length ?? 0;
  const colSums = new Array<number>(colCount).fill(0);
  for (const row of joint) {
    for (let y = 0; y < colCount; y += 1) colSums[y] = colSums[y]! + row[y]!;
  }

  let mi = 0;
  for (let x = 0; x < joint.length; x += 1) {
    for (let y = 0; y < colCount; y += 1) {
      const pxy = joint[x]![y]! / total;
      if (pxy === 0) continue;
      const px = rowSums[x]! / total;
      const py = colSums[y]! / total;
      mi += pxy * Math.log2(pxy / (px * py));
    }
  }
  // Floating error can push a true zero very slightly negative.
  return mi < 0 ? 0 : mi;
}

/**
 * Builds the joint table for "hidden link direction" against "direction the
 * charge was observed to travel".
 *
 * Both are drawn from what actually happened in a played round: the hidden
 * column for the cause, the observation stream for the effect. If the effect
 * carried no signal about the cause, this table would be uniform and the mutual
 * information would fall to zero.
 */
export function linkObservationJoint(
  links: Int32Array,
  observations: readonly { readonly chargedCells: readonly number[]; readonly banked: number }[],
  directionOf: (from: number, to: number) => number,
): number[][] {
  const joint: number[][] = [];
  for (let i = 0; i < 5; i += 1) joint.push(new Array(5).fill(0) as number[]);

  for (const observation of observations) {
    const from = observation.banked;
    const hidden = links[from] ?? -1;
    const hiddenDirection = hidden < 0 ? 4 : directionOf(from, hidden);
    for (const charged of observation.chargedCells) {
      const observed = directionOf(from, charged);
      joint[hiddenDirection]![observed]! += 1;
    }
    if (observation.chargedCells.length === 0) {
      joint[hiddenDirection]![4]! += 1;
    }
  }
  return joint;
}
