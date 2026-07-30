/**
 * Verification proof for the P6 consensus & Merkle engine (deterministic, no keys).
 *
 * Demonstrates:
 *   1. Merkle root fingerprinting: same state -> same root; one-item change -> new root;
 *   2. inclusion proofs verify, and tampering fails;
 *   3. path traversal localizes divergence to the exact leaf;
 *   4. BFT (N=4,f=1): one Byzantine replica is isolated (with its divergent leaf) and
 *      consensus proceeds on the majority root;
 *   5. CP halting: when faulty > f, all transitions freeze (no consensus root);
 *   6. the N>=3f+1 constraint rejects a misconfigured cluster before it runs.
 *
 * Run: npm run verify:consensus   ·   Exit 0 = all invariants held.
 */

import { MerkleTree, localizeDivergence } from "./merkle.ts";
import { auditRound, MisconfiguredClusterError, type Replica } from "./consensus.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

const base = ["hp:10", "gold:5", "pos:3", "deck:40"];
const withLeaf = (i: number, v: string) => base.map((x, j) => (j === i ? v : x));

// 1. Root fingerprinting.
const t1 = new MerkleTree(base);
const t1b = new MerkleTree([...base]);
const t2 = new MerkleTree(withLeaf(2, "pos:9"));
ok(t1.root === t1b.root, "same state -> identical Merkle root");
ok(t1.root !== t2.root, "a single changed leaf changes the root");

// 2. Inclusion proof.
const proof = t1.proof(1);
ok(MerkleTree.verifyProof(base[1]!, 1, proof, t1.root), "valid inclusion proof verifies against the root");
ok(!MerkleTree.verifyProof("tampered", 1, proof, t1.root), "tampered leaf fails proof verification");

// 3. Path-traversal divergence localization.
ok(localizeDivergence(t1, t2) === 2, "path traversal isolates the exact divergent leaf (index 2)");
ok(localizeDivergence(t1, new MerkleTree(withLeaf(0, "hp:7"))) === 0, "...and at index 0");

// 4. BFT happy path: N=4, f=1, one Byzantine replica.
const honest = (id: string): Replica => ({ id, leaves: base });
const clusterOk: Replica[] = [honest("A"), honest("B"), honest("C"), { id: "D", leaves: withLeaf(2, "pos:9") }];
const r4 = auditRound(clusterOk, 1);
ok(!r4.halted && r4.consensusRoot === t1.root, "BFT: consensus proceeds on the majority root");
ok(r4.faulty.length === 1 && r4.faulty[0]!.id === "D", "the Byzantine replica D is isolated");
ok(r4.faulty[0]!.divergentLeaf === 2, "  ...with its divergent leaf localized (index 2)");

// 5. CP halting: faulty (2) exceeds f (1).
const clusterHalt: Replica[] = [
  honest("A"),
  honest("B"),
  { id: "C", leaves: withLeaf(2, "pos:9") },
  { id: "D", leaves: withLeaf(0, "hp:1") },
];
const rH = auditRound(clusterHalt, 1);
ok(rH.halted && rH.consensusRoot === null, "CP halt: faulty > f freezes all transitions (no consensus root)");

// 6. Misconfiguration (static property): N=3 cannot tolerate f=1.
let misconfigured = false;
try {
  auditRound([honest("A"), honest("B"), honest("C")], 1);
} catch (e) {
  misconfigured = e instanceof MisconfiguredClusterError;
}
ok(misconfigured, "N < 3f+1 (N=3,f=1) is rejected as misconfigured before running");

console.log("");
console.log(`Consensus root (N=4,f=1): ${r4.consensusRoot?.slice(0, 24)}…  quorum=${r4.quorum}  faulty=[${r4.faulty.map((x) => x.id)}]`);

console.log("");
if (failures === 0) {
  console.log("ALL CONSENSUS INVARIANTS HELD.");
  process.exit(0);
} else {
  console.log(`${failures} INVARIANT(S) FAILED.`);
  process.exit(1);
}
