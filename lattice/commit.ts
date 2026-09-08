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

const encoder = new TextEncoder();

export interface Commitment {
  /** Published before the round. Hex sha256 of the server seed. */
  readonly hash: string;
  /** Published before the round; chosen by the player. */
  readonly clientSeed: string;
}

export interface Reveal {
  readonly serverSeed: string;
  readonly clientSeed: string;
}

export async function sha256Hex(data: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function commit(serverSeed: string, clientSeed: string): Promise<Commitment> {
  return { hash: await sha256Hex(serverSeed), clientSeed };
}

/** True when the revealed seed is the one that was committed to. */
export async function checkReveal(commitment: Commitment, reveal: Reveal): Promise<boolean> {
  if (reveal.clientSeed !== commitment.clientSeed) return false;
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
