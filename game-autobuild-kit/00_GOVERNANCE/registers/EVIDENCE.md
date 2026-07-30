# EVIDENCE.md

Simulation logs, test metrics, verification proofs for the kit. Authoritative Evidence Register: `../../../governance/EvidenceRegister.md`. Authoritative Source Matrix: `../../../governance/SourceMatrix.md` (SRC-2026-07-001…016).

| ID | Type | Artifact | Result | Status |
|----|------|----------|--------|--------|
| KIT-EVT-001 | Validation | P1 governance foundation scaffolded; gate-lock encoded in NUCLEUS.md. | — | RECORDED |
| KIT-EVT-002 | Validation | Gate G3 authorized; P2–P7 unlocked (`../../../governance/DEC-2026-07-027…`). | — | RECORDED |
| KIT-EVT-003 | Validation | **Determinism proof** — `02_CONTROLLER/verify-determinism.ts` (seed 2654435769). Record→replay identical trace; single-item optimization 13 draws < 14 selection points; truncated-log divergence detected; different seed → different schedule. | **5/5 invariants PASS (exit 0)** | RECORDED |
| KIT-EVT-004 | Validation | **Compilation (LogicStamp) proof** — `02_CONTROLLER/verify-compilation.ts`. Zero-drift: environment noise + flipped commutative operands → byte-identical contract `sha256:a126962ac4c583f6…`; eval/import()/template-literal barred; non-whitelisted predicate & malformed rejected. | **8/8 invariants PASS (exit 0)** | RECORDED |

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
