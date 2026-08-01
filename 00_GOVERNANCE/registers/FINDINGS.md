# FINDINGS.md — DEF-01..09 Register (§0.7)

Per `07_CLAUDE_CODE_HANDOFF_V6.md` §0.7: "DEF-01..09 land here as Findings." This
register maps each Ecosystem6 defect to its structural counter-measure and the
file(s) that implement/enforce it in this build.

| ID | Ecosystem6 defect | Counter-measure | Implemented in |
|---|---|---|---|
| DEF-01 | Match-3 scored incorrectly (×35 fudge; "pair" gate) | Per-engine correctness tests from source rules before any gate run; an engine needing an arbitrary normalizer to resemble its siblings is presumed wrong | `game/determinism/fixed-point.ts`, `game/determinism/pipeline.ts` (fixed-point scoring, no ad-hoc fudge factors) |
| DEF-02 | King of Tokyo was the wrong game (no opponent, no contested centre) | Experience Conformance Criterion (§6.4) | `foundry/gates/suite.ts` (`checkExperienceConformance`) |
| DEF-02-GEN | All 5 engines shared one interaction loop | Structural loci + novelty gate (§2) | `families/genome/types.ts`, `families/genome/novelty.ts` |
| DEF-03 | Governance was prose (15 invariants, 0 checks) | Everything is a verify-suite check | `00_GOVERNANCE/verify-suite.ts` + 12 per-work-item `verify:*` scripts, all wired into `npm run verify` |
| DEF-04 | Determinism tested in isolation only | Full-chain byte-identical test | `game/determinism/pipeline.ts` (`runFullChain`) — exercises seed→board→render→submit→score→validate as one chain, not an isolated PRNG harness |
| DEF-05 | Monte Carlo ran a simplified model (FR 0.038 vs 0.85 target) | LAW 3 — no gate/MC run without valid, non-stand-in provenance | `foundry/fitness/types.ts` (`GateProvenance`), enforced at runtime in `foundry/fitness/index.ts` and `foundry/gates/suite.ts` |
| DEF-06 | Client/server contract drift (`SUBMIT_CHAIN_FACES`) | Contract test per message type | `game/branch-a/message-contracts.ts` |
| DEF-07 | Two contradictory compliance truths in one package | Gate provenance records | `foundry/gates/suite.ts` (`isValidProvenance`) |
| DEF-08 | Platform lock-in made defects unfixable | Substrate Sovereignty (§0.6) | No vendor SDK dependency introduced anywhere in `families/`, `foundry/`, `corpus/`, `game/` — all engine logic is plain TypeScript + Node built-ins (`node:crypto`) |
| DEF-09 | Identity churn across 3 workspace names | One repo: `Glassbox_Labs` | This build lives in `libriopal/Glassbox_Labs`, additively alongside `game-autobuild-kit/` per §0.7 |

---

*Population per §0.7. Cross-references `governance/FINDINGS_REGISTER.md` (a
separate, earlier audit lineage over the governance protocol package itself —
not to be confused with this DEF-01..09 register).*
