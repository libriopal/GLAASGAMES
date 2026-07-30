/**
 * BFT State Machine Replication contradiction protocol (P6).
 *
 * N replicas over a partially synchronous network tolerate f Byzantine replicas iff
 * N >= 3f+1 (Dwork, Lynch & Stockmeyer 1988, 10.1145/42282.42283; Castro & Liskov 2002,
 * 10.1145/571637.571640). At each step the replicas broadcast their state Merkle roots
 * and run the five-stage protocol: root audit -> divergence detection -> path traversal
 * -> Byzantine isolation -> CP halting.
 */

import { MerkleTree, localizeDivergence } from "./merkle.ts";

export interface Replica {
  id: string;
  /** This replica's ordered state items (variables, tx records, AST signatures). */
  leaves: string[];
}

export class MisconfiguredClusterError extends Error {}

export interface FaultyReport {
  id: string;
  root: string;
  /** Leaf index at which this replica diverges from the consensus state. */
  divergentLeaf: number;
}

export interface AuditResult {
  /** N >= 3f+1 held. */
  wellConfigured: boolean;
  /** Present only when consensus is reached (not halted). */
  consensusRoot: string | null;
  /** Replicas isolated as Byzantine (root != consensus), with their divergent leaf. */
  faulty: FaultyReport[];
  /** CP halting mode: faulty count exceeded f, transitions frozen. */
  halted: boolean;
  quorum: number;
}

function majority(roots: Map<string, string[]>): { root: string; ids: string[] } {
  let best = "";
  let bestIds: string[] = [];
  for (const [root, ids] of roots) {
    if (ids.length > bestIds.length) {
      best = root;
      bestIds = ids;
    }
  }
  return { root: best, ids: bestIds };
}

/**
 * Run one root-audit round.
 * @param replicas the physical replica set (size N)
 * @param f maximum tolerated Byzantine replicas
 */
export function auditRound(replicas: Replica[], f: number): AuditResult {
  const N = replicas.length;
  const quorum = 2 * f + 1;
  if (N < 3 * f + 1) {
    throw new MisconfiguredClusterError(
      `N=${N} < 3f+1=${3 * f + 1}: the cluster is misconfigured before it can run (static property).`,
    );
  }

  // Stage 1 — Root Audit: each replica computes and broadcasts its Merkle root.
  const trees = new Map<string, MerkleTree>();
  const rootToIds = new Map<string, string[]>();
  for (const r of replicas) {
    const t = new MerkleTree(r.leaves);
    trees.set(r.id, t);
    const ids = rootToIds.get(t.root) ?? [];
    ids.push(r.id);
    rootToIds.set(t.root, ids);
  }

  // Stage 2 — Divergence Detection: the majority root is the consensus candidate.
  const maj = majority(rootToIds);
  const faultyIds = replicas.map((r) => r.id).filter((id) => trees.get(id)!.root !== maj.root);

  // Stage 3/4 — Path Traversal + Byzantine Isolation: locate each faulty replica's
  // divergent leaf against an honest reference and exclude it from voting.
  const honestRef = replicas.find((r) => trees.get(r.id)!.root === maj.root)!;
  const honestTree = trees.get(honestRef.id)!;
  const faulty: FaultyReport[] = faultyIds.map((id) => ({
    id,
    root: trees.get(id)!.root,
    divergentLeaf: localizeDivergence(honestTree, trees.get(id)!),
  }));

  // Stage 5 — CP Halting: if confirmed-faulty exceeds f, freeze all transitions.
  const halted = faulty.length > f || maj.ids.length < quorum;

  return {
    wellConfigured: true,
    consensusRoot: halted ? null : maj.root,
    faulty,
    halted,
    quorum,
  };
}
