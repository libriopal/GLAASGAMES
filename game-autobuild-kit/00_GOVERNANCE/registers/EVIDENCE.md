# EVIDENCE.md

Simulation logs, test metrics, verification proofs for the kit. Authoritative Evidence Register: `../../../governance/EvidenceRegister.md`. Authoritative Source Matrix: `../../../governance/SourceMatrix.md` (SRC-2026-07-001…016).

| ID | Type | Artifact | Result | Status |
|----|------|----------|--------|--------|
| KIT-EVT-001 | Validation | P1 governance foundation scaffolded; gate-lock encoded in NUCLEUS.md. | — | RECORDED |
| KIT-EVT-002 | Validation | Gate G3 authorized; P2–P7 unlocked (`../../../governance/DEC-2026-07-027…`). | — | RECORDED |
| KIT-EVT-003 | Validation | **Determinism proof** — `02_CONTROLLER/verify-determinism.ts` (seed 2654435769). Record→replay identical trace; single-item optimization 13 draws < 14 selection points; truncated-log divergence detected; different seed → different schedule. | **5/5 invariants PASS (exit 0)** | RECORDED |
| KIT-EVT-004 | Validation | **Compilation (LogicStamp) proof** — `02_CONTROLLER/verify-compilation.ts`. Zero-drift: environment noise + flipped commutative operands → byte-identical contract `sha256:a126962ac4c583f6…`; eval/import()/template-literal barred; non-whitelisted predicate & malformed rejected. | **8/8 invariants PASS (exit 0)** | RECORDED |
| KIT-EVT-005 | Validation | **Verification (P4) proof** — `02_CONTROLLER/verify-safety.ts` (CETI reachability reduction). Well-formed→SOUND; bad location/out-of-range card/empty bracket→UNSOUND; over-deep antecedent (depth 12)→UNSOUND; degenerate→LIVENESS fail; **error behind unsatisfiable guard→SOUND (unreachable)**. | **9/9 invariants PASS (exit 0)** | RECORDED |

| KIT-EVT-006 | Validation/Fitness | **Evolutionary engine (P5) proof** — `01_RESEARCH/verify-evolution.ts` (deterministic, NO keys). Search PROMOTED a candidate at C(σ)=1.00 in 2 generations, recovered the reference policy exactly, passed the P4 verifier; same seed→identical result; MWUA tradeoff H(λ=1.0)=2.513 > H(λ=0.05)=0.030 bits; RealLlmRewrite refuses to run without a key. | **9/9 invariants PASS (exit 0)** | RECORDED |

| KIT-EVT-007 | Validation | **Consensus & Merkle (P6) proof** — `02_CONTROLLER/verify-consensus.ts`. Root fingerprinting (same state→same root; one-leaf change→new root); inclusion proofs verify & tampering fails; **path traversal isolates the exact divergent leaf**; BFT N=4,f=1 isolates the Byzantine replica and proceeds on the majority root; CP-halt when faulty>f; N<3f+1 rejected as misconfigured. | **11/11 invariants PASS (exit 0)** | RECORDED |

| KIT-EVT-008 | Validation | **Durable orchestration (P7) proof** — `02_CONTROLLER/verify-durable.ts`. Checkpoints every step; after an injected fault, **resumes from the last checkpoint without re-running completed steps** and reaches the clean-run state; durability survives a fresh store instance; each checkpoint's Merkle root matches its state; replay reproduces checkpoints (transient), corrupted replay flagged as deterministic drift → safety halt. | **12/12 invariants PASS (exit 0)** | RECORDED |

**Full suite (all 7 phases):** compilation (8) + safety (9) + determinism (5) + evolution (9) + consensus (11) + durable (12) = **54/54 PASS**.

## KIT-EVT-006 detail — best evolved program (fitness 1.00, gen 2), verifier-sound
```
IF isSmaller(SELECTED,3,HAND) THEN draw()
IF sum(HAND,GT,BOARD) THEN show(LT,DISCARD)
IF NOT hasRacko(HAND) THEN show(GT,BOARD)
```
Ran with the deterministic mock mutation operator — no provider calls, no API keys. The LLM channel (`RealLlmRewrite`, routed by `02_CONTROLLER/modelRouter.ts`) is key-gated and unwired for live calls pending explicit authorization.

## KIT-EVT-003 detail — Layer-2/3 determinism, operationally verified
```
PASS  record -> replay produces an identical execution trace (zero divergence)
PASS  pick-call counts match (14)
PASS  single-item optimization saved entropy: 13 draws < 14 selection points
PASS  a truncated entropy log is detected and raises ReplayDivergenceError
PASS  a different seed yields a different schedule (schedule is entropy-pinned)
```
Reproduce: `cd game-autobuild-kit && npm install && npm run verify` (runs both P2 compilation + P3 determinism suites).

*P5 fitness/evolution evidence will be recorded here once the evolutionary engine runs against `01_RESEARCH/seed-corpus.placeholder.json` at C(σ) ≥ 0.98.*
