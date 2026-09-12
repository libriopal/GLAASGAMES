// foundry/sim/merkle.ts — one Merkle implementation, not three.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORTED FROM  DISCOMPLEMENTED_ADMIN  compiler/merkle-verify.ts
//
// WHAT CHANGED: the source repository had THE SAME TREE BUILT TWICE — once in
// `merkle-verify.ts` as `buildMerkleTree`/`generateProof`, and again privately
// inside `deterministic-prng.ts` as `buildMerkleRoot`/`buildMerkleProof`. Both
// hash leaves with SHA-256 and duplicate the last node on an odd level, so they
// agree today. Nothing holds them in agreement tomorrow, and a fingerprint that
// two files compute differently is worse than no fingerprint, because the
// disagreement surfaces as a false divergence alarm in the one system whose job
// is to detect real ones.
//
// So the tree lives here once and both callers use it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ODD-NODE RULE IS A CHOICE, AND IT IS RECORDED AS ONE.
//
// When a level has an odd number of nodes this implementation hashes the last
// node with ITSELF. That is what the source did and it is kept for parity, but
// it is worth naming: duplicating the last node makes a tree of [a, b, c]
// indistinguishable from one of [a, b, c, c]. For an entropy log — a sequence
// whose length is fixed by the run that produced it and is compared only against
// another log of the same run — that ambiguity cannot be reached, because two
// runs with different draw counts have already diverged before the root is
// compared. It would matter if these trees ever committed to variable-length
// user-supplied data, and they do not.

import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** The root of a tree over pre-hashed leaves. Empty is its own named constant. */
export function merkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) return sha('empty');
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : level[i]!;
      next.push(sha(left + right));
    }
    level = next;
  }
  return level[0]!;
}

/** The sibling path proving `index` is in the tree. */
export function merkleProof(leaves: readonly string[], index: number): string[] {
  if (leaves.length === 0 || index < 0 || index >= leaves.length) return [];
  let level = [...leaves];
  let idx = index;
  const proof: string[] = [];
  while (level.length > 1) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    proof.push(sibling < level.length ? level[sibling]! : level[idx]!);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : level[i]!;
      next.push(sha(left + right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/** Recomputes the root from a leaf and its path. */
export function verifyMerkleProof(
  root: string,
  leaf: string,
  index: number,
  proof: readonly string[],
): boolean {
  let hash = leaf;
  let idx = index;
  for (const sibling of proof) {
    hash = idx % 2 === 0 ? sha(hash + sibling) : sha(sibling + hash);
    idx = Math.floor(idx / 2);
  }
  return hash === root;
}

/** A leaf from an arbitrary record, hashed over a canonical key order. */
export function leafFrom(record: Readonly<Record<string, unknown>>): string {
  const keys = Object.keys(record).sort();
  return sha(keys.map((k) => `${k}=${String(record[k])}`).join('|'));
}
