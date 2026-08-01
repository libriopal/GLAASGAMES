/**
 * Merkle state fingerprinting (P6, determinism Layer 4).
 *
 * State variables, transaction records, and compiled AST JSON signatures are indexed
 * as leaves; a cryptographic root fingerprints the whole state at logical step t. If a
 * single item shifts, its leaf hash mutates and the change propagates to the root.
 * Divergence between two replicas is localized to the exact leaf by walking the tree
 * (requesting sibling branch hashes) — the plan's "path traversal".
 *
 * Grounded: Merkle 1988 (10.1007/3-540-48184-2_32); path-from-leaf-to-root verification
 * (Williams & Sirer 2004, 10.1109/nca.2004.1347805). SHA-256 with domain separation
 * (distinct "leaf:"/"node:" prefixes) to resist second-preimage attacks.
 */

import { createHash } from "node:crypto";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashLeaf(data: string): string {
  return sha256("leaf:" + data);
}
export function hashNode(left: string, right: string): string {
  return sha256("node:" + left + right);
}

export interface ProofStep {
  hash: string;
  /** True if the sibling sits on the right of the current node. */
  siblingRight: boolean;
}

export class MerkleTree {
  /** levels[0] = leaf hashes … levels[last] = [root]. */
  readonly levels: string[][];

  constructor(items: string[]) {
    if (items.length === 0) throw new Error("MerkleTree requires at least one leaf.");
    const leaves = items.map(hashLeaf);
    const levels: string[][] = [leaves];
    let cur = leaves;
    while (cur.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < cur.length; i += 2) {
        const l = cur[i]!;
        const r = i + 1 < cur.length ? cur[i + 1]! : cur[i]!; // duplicate last if odd
        next.push(hashNode(l, r));
      }
      levels.push(next);
      cur = next;
    }
    this.levels = levels;
  }

  get root(): string {
    return this.levels[this.levels.length - 1]![0]!;
  }
  get leafCount(): number {
    return this.levels[0]!.length;
  }

  /** Inclusion proof for a leaf: the sibling hashes from leaf up to the root. */
  proof(index: number): ProofStep[] {
    if (index < 0 || index >= this.leafCount) throw new Error("leaf index out of range");
    const steps: ProofStep[] = [];
    let idx = index;
    for (let lvl = 0; lvl < this.levels.length - 1; lvl++) {
      const level = this.levels[lvl]!;
      const isRight = idx % 2 === 1;
      const sibIdx = isRight ? idx - 1 : idx + 1 < level.length ? idx + 1 : idx; // dup if no sibling
      steps.push({ hash: level[sibIdx]!, siblingRight: !isRight });
      idx = Math.floor(idx / 2);
    }
    return steps;
  }

  static verifyProof(leafData: string, index: number, proof: ProofStep[], root: string): boolean {
    let h = hashLeaf(leafData);
    void index;
    for (const step of proof) {
      h = step.siblingRight ? hashNode(h, step.hash) : hashNode(step.hash, h);
    }
    return h === root;
  }
}

/**
 * Path traversal: given two trees over the same leaf count with different roots, walk
 * down the differing branch to isolate the exact divergent leaf index. Returns -1 if
 * the roots are identical.
 */
export function localizeDivergence(a: MerkleTree, b: MerkleTree): number {
  if (a.root === b.root) return -1;
  const topLevel = a.levels.length - 1;
  let idx = 0;
  for (let lvl = topLevel; lvl > 0; lvl--) {
    const childLevel = lvl - 1;
    const c0 = 2 * idx;
    const c1 = 2 * idx + 1;
    const aL = a.levels[childLevel]!;
    const bL = b.levels[childLevel]!;
    const c0Differs = aL[c0] !== bL[c0];
    if (c0Differs || c1 >= aL.length) {
      idx = c0;
    } else {
      idx = c1;
    }
  }
  return Math.min(idx, a.leafCount - 1);
}
