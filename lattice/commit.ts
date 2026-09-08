// lattice/commit.ts — the seed is fixed before the round and proved after it.
//
// This is the layer that stops the OPERATOR steering the hidden lattice. Before
// a round the commitment `H = sha256(serverSeed)` is published. During the round
// the player sees only consequences. Afterwards the seed is revealed and anyone
// can recompute the entire hidden structure and check it against H.
//
// It does NOT stop the PLAYER cheating. An offline client on hardware the player
// owns can be patched, and no commitment prevents that — the auditor was right
// about this and it is why `verifyRound` in round.ts recomputes an outcome from
// inputs rather than trusting a reported one. Commit-reveal constrains the house;
// replay constrains the player; the pair is what makes the round symmetric.
//
// The client seed is mixed in so the operator cannot pick a server seed AFTER
// seeing what the player will do. Neither side alone determines the lattice.
//
// AND IT DID NOT ORIGINALLY BIND THE RULES, WHICH WAS THE LARGER HOLE. A seed
// commitment constrains the input; the operator was still free to choose the
// function. `ruleset.ts` documents the attack that survived every check in this
// repo, and `rulesHash` below is what closes it.
//
// REJECTED ALTERNATIVE, recorded because it is the obvious one: fold the rules
// hash into `seedFromReveal` so a modified build simply generates a different
// lattice. That is strictly stronger as a deterrent — divergence becomes
// immediate rather than merely detectable — but it makes "we disagree about the
// rules" and "we disagree about the seed" indistinguishable at the point of
// failure, which is the exact mistake `frame.ts` exists to avoid. Detection
// that names its cause was preferred over silent divergence.

const encoder = new TextEncoder();

export interface Commitment {
  /** Published before the round. Hex sha256 of the server seed. */
  readonly hash: string;
  /** Published before the round; chosen by the player. */
  readonly clientSeed: string;
  /**
   * The rules the round will be played under — see `ruleset.ts`.
   *
   * Committing a seed without committing the rules proves only that the
   * operator did not steer the INPUT. It leaves the FUNCTION free, and a
   * function chosen after the fact is worth more to a dishonest operator than
   * a seed is. This field is what stops two players verifying two different
   * games and both getting `true`.
   */
  readonly rulesHash: string;
}

export interface Reveal {
  readonly serverSeed: string;
  readonly clientSeed: string;
  /** The rules hash the executor that played this round actually computed. */
  readonly rulesHash: string;
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function commit(
  serverSeed: string,
  clientSeed: string,
  rulesHash: string,
): Promise<Commitment> {
  return { hash: await sha256Hex(serverSeed), clientSeed, rulesHash };
}

/**
 * True when the revealed seed is the one that was committed to AND the round
 * was played under the rules that were committed to.
 *
 * `localRulesHash` is the caller's OWN independently-computed digest — see
 * `ruleset.computeRules()`. It is a required argument rather than an optional
 * one on purpose. Comparing the commitment's rules hash against the reveal's
 * rules hash alone would check the operator's word against the operator's word
 * and always pass; the check only has force when a third value, computed on
 * hardware the operator does not control, is brought into the comparison.
 */
export async function checkReveal(
  commitment: Commitment,
  reveal: Reveal,
  localRulesHash: string,
): Promise<boolean> {
  if (reveal.clientSeed !== commitment.clientSeed) return false;
  if (commitment.rulesHash !== reveal.rulesHash) return false;
  if (commitment.rulesHash !== localRulesHash) return false;
  return (await sha256Hex(reveal.serverSeed)) === commitment.hash;
}

/**
 * Folds the revealed pair down to the single i32 the integer world-generator
 * consumes.
 *
 * THE FLOAT BOUNDARY IS HERE AND NOWHERE ELSE. FAR_NZY's CSPRNG exposes
 * `nextFloat()`, which is float64-shaped; letting that anywhere near the
 * simulation would reintroduce exactly the divergence the kernel's i32-wrapping
 * contract exists to prevent. So the hash is consumed as bytes and folded with
 * integer ops only. `verify-lattice` asserts no float appears in this path.
 */
export async function seedFromReveal(reveal: Reveal): Promise<number> {
  const hex = await sha256Hex(`${reveal.serverSeed}:${reveal.clientSeed}`);
  let seed = 0;
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.slice(i, i + 2), 16);
    // FNV-1a over the digest bytes: integer multiply, integer xor, nothing else.
    seed = (seed ^ byte) >>> 0;
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  const folded = seed | 0;
  // 0 is the world generator's "unseeded" sentinel; substituting keeps one seed
  // in four billion from silently sharing a lattice with the default.
  return folded === 0 ? 0x1a2b3c4d : folded;
}
