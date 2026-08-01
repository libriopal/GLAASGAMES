# NUCLEUS.md — Core System Specification (game-autobuild-kit)

**Kit Version:** 0.1.0 (P1 — Governance Foundation only)
**Governing Authority:** GLASSBOX governance package v3.0.0 (see `../../governance/`)
**Build Authorization:** Gate G3 **APPROVED** — `../../governance/DEC-2026-07-027_G3_AUTHORIZATION.md` (Tier 1). P2–P7 unlocked; zero open Critical findings; parameters bound.
**Author/Tier:** AI Auditor (Tier 2)

---

## 0. Read this first — what is and isn't built

Gate **G3 is APPROVED** (`../../governance/DEC-2026-07-027…`). P2–P7 are **UNLOCKED** and built incrementally, each with evidence recorded before promotion.

| Phase | Module(s) | Status |
|-------|-----------|--------|
| P1 Governance Foundation | `00_GOVERNANCE/`, entrypoint, `.mcp.json` | **BUILT** |
| P2 Static Compilation (ts-morph/LogicStamp) | `02_CONTROLLER/` | **UNLOCKED — in progress** |
| P3 Deterministic Scheduler | `02_CONTROLLER/` | **UNLOCKED — building** |
| P4 DSL & ω-automata Verifier | `01_RESEARCH/`, `02_CONTROLLER/` | **UNLOCKED — grammar defined** |
| P5 Evolutionary Engine (islands, MWUA) | `01_RESEARCH/` | **UNLOCKED** — runs at `VALIDATION_CONSISTENCY_THRESHOLD=0.98` with placeholder `\|S₀\|` (D4) |
| P6 Consensus & Merkle Engine | `02_CONTROLLER/`, `04_EDI/` | **UNLOCKED** |
| P7 Durable Orchestration | `02_CONTROLLER/`, `05_CREDIT_ROUTING/` | **UNLOCKED** |

## 1. Core rules (immutable for this kit)

1. **Boundary separation.** Non-deterministic work (LLM mutation, island search, playtesting) lives in the Research Domain, out-of-band. Only statically-verified, normalized JSON/AST contracts cross into the Execution Domain.
2. **No dynamic code at runtime.** `eval`, dynamic `import()`, and template-literal codegen are barred from the Execution Domain — they bypass static AST parsing (RISKS: state divergence).
3. **Zero-drift generation.** All emitted structure is normalized (fixed alphabetical order, stripped absolute paths, host params ignored) so the same source yields bit-identical output across environments. *Grounded: Lamb & Zacchiroli 2022, https://doi.org/10.1109/ms.2021.3073045.*
4. **Deterministic execution.** Actor-model isolation + seedable PRNG + cooperative scheduling; record/replay via Recording/ReplayingEntropySource. *Grounded: Cui et al. 2011 (10.1145/2043556.2043588); Castegren et al. 2018 (10.1016/j.jlamp.2018.06.007).*
5. **Grammar-restricted synthesis.** Evolved logic is confined to a BNF DSL that restricts callable functions/libraries. *Grounded: Tao et al. 2024 (10.3390/a17070287).*
6. **Evidence before promotion.** No artifact is promoted without static AST normalization + ω-automata verification + multi-agent simulation. Every claim carries an admissible source (Tier 1/2); model recall (Tier 0) and vendor/blog citations (Tier 3) are inadmissible.
7. **Human-gated execution.** P2–P7 require a Tier 1 G3 approval meeting §4. The kit's automation may prepare but never sign a Tier 1 gate (GLASSBOX Immutable Directive 6).

## 2. Determinism hierarchy (enforcement targets for P2–P7)

| Layer | Objective | Mechanism | Source |
|-------|-----------|-----------|--------|
| 1 Compilation | same source → same structure | ts-morph static AST + normalization | 10.1109/ms.2021.3073045 |
| 2 Execution | same input → same output | Actor model, IEEE-754 discipline | 10.1016/j.jlamp.2018.06.007 |
| 3 Ordering | same inputs → same sequence | BFT consensus, shared logs | 10.1145/42282.42283; 10.1145/571637.571640 |
| 4 State transitions | O₁…Oₙ from S₀ → Sₙ | Merkle-root SMR | 10.1007/3-540-48184-2_32 |

## 3. Register set

Governance registers live in `registers/`. They mirror and defer to the GLASSBOX registers in `../../governance/`. The authoritative Source Matrix and Evidence Register for all cited claims are `../../governance/SourceMatrix.md` and `../../governance/EvidenceRegister.md`.

## 4. Unlock conditions for P2–P7 — **ALL MET (2026-07-30)**

Recorded in `../../governance/DEC-2026-07-027_G3_AUTHORIZATION.md`:
1. ✅ **D2 ratified** — bibliography (`SourceMatrix.md`) accepted by Tier 1.
2. ✅ **D3 elected** — Option B: "42%" downgraded to qualitative; figure struck.
3. ✅ **D4 handled** — `VALIDATION_CONSISTENCY_THRESHOLD` re-bound 1.00→0.98; placeholder `|S₀|` in `01_RESEARCH/`.
4. ✅ **D6 ratified** — 11 domain parameters bound.
5. ✅ **G3 APPROVED** — Tier 1 Approval Record, zero open Critical findings.

P2–P7 may now be generated. G4 (Validation Consistency, Tier 2) and G5 (Final Acceptance, Tier 1) still gate promotion of evolved candidates.

---

*P1 governance foundation. P2–P7 gated. This file is the Execution Domain's source of truth for what may run.*
