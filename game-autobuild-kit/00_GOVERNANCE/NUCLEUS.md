# NUCLEUS.md — Core System Specification (game-autobuild-kit)

**Kit Version:** 0.1.0 (P1 — Governance Foundation only)
**Governing Authority:** GLASSBOX governance package v3.0.0 (see `../../governance/`)
**Build Authorization:** Tier 1 approval recorded in `../../governance/DEC-2026-07-026_TIER1_APPROVAL.md` — **scoped to Phase 1 (P1) only**.
**Author/Tier:** AI Auditor (Tier 2)

---

## 0. Read this first — what is and isn't built

This kit is being constructed **phase-gated** under GLASSBOX. Only **P1 (this governance foundation)** exists.
Phases **P2–P7 are LOCKED** and MUST NOT be generated until the conditions in §4 are met.

| Phase | Module(s) | Status |
|-------|-----------|--------|
| P1 Governance Foundation | `00_GOVERNANCE/`, entrypoint, `.mcp.json` | **BUILT (this commit)** |
| P2 Static Compilation (ts-morph/LogicStamp) | `02_CONTROLLER/` (partial) | **LOCKED — G3** |
| P3 Deterministic Scheduler | `02_CONTROLLER/` | **LOCKED — G3** |
| P4 DSL & ω-automata Verifier | `01_RESEARCH/`, `02_CONTROLLER/` | **LOCKED — G3** |
| P5 Evolutionary Engine (islands, MWUA) | `01_RESEARCH/` | **LOCKED — hard lock (`04` research workflow) + D4** |
| P6 Consensus & Merkle Engine | `02_CONTROLLER/`, `04_EDI/` | **LOCKED — G3** |
| P7 Durable Orchestration | `02_CONTROLLER/`, `05_CREDIT_ROUTING/` | **LOCKED — G3** |

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

## 4. Unlock conditions for P2–P7 (Tier 1)

P2–P7 remain LOCKED until **all** hold and are recorded in `../../governance/`:
1. **D2 ratified** — bibliography (`SourceMatrix.md`) accepted by Tier 1.
2. **D3 elected** — the "42%" claim dispositioned (recommended: Option B, downgrade to qualitative).
3. **D4 supplied** — the `|S₀|` human-verified seed corpus defined (contents, versioning, ownership, acceptance), **or** `VALIDATION_CONSISTENCY_THRESHOLD` relaxed to 0.98 with a placeholder corpus. *P5 cannot run without this.*
4. **D6 ratified** — the 11 domain parameters (population, λ, thresholds, etc.).
5. **G3 signed** — a Tier 1 Approval Record (`02` § Evidence Standards → Approval Record Schema, 8 fields) with zero open Critical findings.

Until then, any request to generate P2–P7 code is refused and logged to `registers/IMPLEMENTATION_BLOCKERS.md`.

---

*P1 governance foundation. P2–P7 gated. This file is the Execution Domain's source of truth for what may run.*
