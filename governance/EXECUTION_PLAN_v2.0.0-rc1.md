# Controlled Evaluation and Execution Plan for Deterministic, Genetically Evolvable TypeScript Game Architectures

**Plan Version:** v2.0.0-rc1
**Governing Protocol:** v2.0.0 (files 00–06)
**Audit ID:** AUD-2026-07-002
**Auditor Signature:** `sig:auditor:<computed-over-final-artifact>` — Tier 2
**Human Approver Signature:** *(empty — applied out-of-band at Gate G3)*

> **STATUS: PENDING-HUMAN — GATE G3 SUBMISSION**
> This plan has been audited and revised to zero Critical Findings **except** FND-2026-07-011 and FND-2026-07-012, which cannot be resolved by the auditor (see § Blocking Findings). The status string `APPROVED FOR RESEARCH EXECUTION` is not present in this document and may only be written by the Human Approver per Immutable Directive 6.

---

## 1. Scope and Domain Declaration

This plan defines the research domain for the governing protocol. Per Immutable Directive 5, all domain-specific mechanisms — entropy sources, seeds, scheduling primitives, DSL grammar, fitness semantics — are declared **here** and nowhere in files 00–06.

**Objective.** Reconcile Byzantine Fault Tolerant State Machine Replication (which requires bitwise-identical transitions across replicas) with evolutionary program synthesis and LLM orchestration (which are stochastic and non-deterministic), by confining all non-determinism to an offline Research Domain and admitting only deterministic JSON contracts across the deployment boundary.

**Domain boundary.**

```
RESEARCH DOMAIN  (non-deterministic: LLM mutation, tree crossover, island search, isolated playtesting)
        │
        │  Secure Deployment Boundary — deterministic JSON contracts only
        ▼
DESIGN / EXECUTION DOMAIN  (immutable SMR, cooperative scheduling, seeded entropy, BFT consensus, Merkle audit)
```

---

## 2. Phase Mapping

The original plan described **seven domain phases**. The governing protocol defines **eight governance phases** (`04_RESEARCH_EXECUTION_PROTOCOL.md` § Research Workflow). These are orthogonal axes and were previously conflated (FND-2026-07-001). The mapping is now explicit and normative.

| Governance Phase | Domain Phase(s) | Exit Gate |
|------------------|-----------------|-----------|
| `Phase1` Specification | Scope, determinism hierarchy, success criteria (this document §1–§4) | G1 |
| `Phase2` DomainDecomposition | D3 — DSL grammar and sub-domain partition (Constraint / Objective / Safety / Resource) | — |
| `Phase3` SearchInitialization | D1 Deterministic Compilation · D2 Cooperative Scheduler | G2 |
| `Phase4` IterativeSearch | D4 Evolutionary Program Synthesis (islands, MWUA, LLM mutation) | — |
| `Phase5` EvidenceCollection | D5 Playtesting instrumentation and trace capture | — |
| `Phase6` ContradictionSearch | D5 Reachability auditing · D6 Merkle divergence detection | — |
| `Phase7` Validation | D5 Rubric scoring · D6 BFT consensus verification | G4 |
| `Phase8` Promotion | D7 Durable orchestration, contract promotion to execution layer | G5 |

The seven domain phases retain their original numbering as **D1–D7** to preserve traceability to the source document. No document may renumber the governance phases.

---

## 3. Determinism Hierarchy

| Layer | Architectural Objective | Enforcement Mechanism | Verification |
|-------|------------------------|----------------------|--------------|
| **1. Deterministic Compilation** | Same source compiles to identical bytecode across machines. | Static AST parsing via `ts-morph`; deterministic JSON schema contract generation. | Hash equality of context bundle across ≥3 independent build environments. |
| **2. Deterministic Execution** | Same bytecode + same input yields identical output. | `determined` simulation framework; cooperative scheduler replacing the native event loop. | `RecordingEntropySource` → `ReplayingEntropySource` replay with zero divergence. |
| **3. Deterministic Ordering** | Identical input set follows identical sequence on all nodes. | Seed-driven task sampling with the "no entropy for single item" optimization; FIFO mutex queues at cooperative blockpoints. | Recorded scheduling decision log compared step-for-step across replicas. |
| **4. Deterministic State Transitions** | SMR updates converge. | Hierarchical Merkle tree roots over variables, transactions, and compiled AST signatures. | Root equality at each logical step *t*; path traversal on divergence. |

*Layer 3's enforcement mechanism was absent from the source document (FND-2026-07-004) and is supplied above from the Phase 2 narrative.*

---

## 4. Parameter Bindings

Per `01_SYSTEM_CHARTER.md` § Parameter Bindings, this plan must bind every domain-scoped parameter. Governance-scoped parameters are bound at Governance Setup and reproduced here for reference only.

### 4.1 Governance-scoped (bound at setup — reference only)

| Parameter | Bound Value | Range |
|-----------|-------------|-------|
| `EVIDENCE_COMPLETENESS_THRESHOLD` | 95 | 80–100 |
| `VALIDATION_CONSISTENCY_THRESHOLD` | **1.00** | 0.90–1.00 |
| `RISK_MITIGATION_THRESHOLD` | 90 | 75–100 |
| `GOVERNANCE_SCORE_THRESHOLD` | 90 | 70–100 |
| `SEARCH_COVERAGE_THRESHOLD` | 80 | 50–100 |
| `VERIFICATION_COVERAGE_THRESHOLD` | 100 | 95–100 |

`VALIDATION_CONSISTENCY_THRESHOLD` is bound at the ceiling because the plan admits **no** human-seed violations: `C(σ) = 1.00` exactly. This is in range and therefore legal, but it removes all slack — any single seed violation fails Gate G4. Flagged as RSK-2026-07-004.

### 4.2 Domain-scoped — evolutionary search (bound by the source document)

| Parameter | Bound Value | Objective |
|-----------|-------------|-----------|
| Population Size | 200 genomes per island | Maintain per-island diversity. |
| Crossover Probability | 0.40 | Recombine high-performing rule subtrees. |
| Reproduction Probability | 0.40 | Propagate top performers unchanged. |
| Mutation Probability | 0.10 | Introduce subtree variation. |
| ERC Mutation Probability | 0.10 | Alter Ephemeral Random Constants via normal distribution. |
| Tournament Size | 3 candidates | Selection pressure. |
| Maximum Tree Depth | 10 levels | Bound program complexity. |
| Mutation Attempts Limit | 2 retries | Fallback on syntax-error compilation failure. |

**Verified:** the four reproduction-operator probabilities sum to exactly 1.00. Recorded as CLM-2026-07-003, Pass.

### 4.3 Domain-scoped — previously unbound (resolved in this revision)

These were referenced by the source document but never assigned. Each was a Critical finding under Audit Rubric 2. Values below are **proposed defaults requiring Human Approver ratification at G3**; they are not auditor-authoritative.

| Parameter | Proposed Binding | Derivation | Finding |
|-----------|------------------|------------|---------|
| `BENCHMARK_THRESHOLD` | Relative win-rate > 0.50 vs. human-written baseline scripts | Stated as a rubric target in the source; promoted to a formal binding. | FND-2026-07-005 |
| `COMPLEXITY_THRESHOLD` | Survival Latency ≥ 1.25 × baseline median | Source specified only "maximized relative to baseline" — not a threshold. | FND-2026-07-006 |
| `DIVERSITY_THRESHOLD` | Shannon entropy `H(P) ≥ 0.70 × log₂(200)` across island population | Source referenced an "Entropy Minimum Threshold" that was never defined. | FND-2026-07-007 |
| `MAX_GENERATIONS` | 500 per island | Absent from source. Stopping condition was unbounded. | FND-2026-07-008 |
| `FITNESS_PLATEAU_WINDOW` | 40 generations without best-fitness improvement | Absent from source. | FND-2026-07-008 |
| `MWUA_LAMBDA` (λ) | 0.15 | Entropy scaling term in `U(σ) = Σ pᵢGᵢ + λH(P)`; source declared λ symbolically without a value. | FND-2026-07-009 |
| `EVAL_MATCH_COUNT` (n) | 1,000 matches per candidate pairing | Source said "n evaluation matches" without binding n. | FND-2026-07-009 |
| `BFT_REPLICA_COUNT` (N) | 4 | Minimum satisfying N ≥ 3f+1 for f = 1. | FND-2026-07-010 |
| `BFT_FAULT_TOLERANCE` (f) | 1 | — | FND-2026-07-010 |
| `ISLAND_COUNT` | 8 | Absent from source; "islands" were plural but uncounted. | FND-2026-07-009 |
| `MIGRATION_INTERVAL` | Every 25 generations | Absent from source. | FND-2026-07-009 |

Any parameter in this table that the Human Approver does not ratify reverts to **unbound**, which fails Gate G2 and blocks execution.

---

## 5. Domain Decomposition

Per `04_RESEARCH_EXECUTION_PROTOCOL.md` § Domain Decomposition, each sub-domain is a separate program sketch.

| Sub-Domain | Generic Construct | Instantiation in this plan |
|------------|-------------------|---------------------------|
| **Constraint** | Boolean and range checks | DSL conditional antecedents: `isSmaller`, `isCardBetweenNumbers`, `sum`, `play`. Max tree depth 10. |
| **Objective** | Scoring functions, aggregation | Win-rate, `C(σ)` consistency, survival latency, configuration growth, information content `H(X)`. |
| **Safety** | Invariant checks, reachability analysis | Two-way alternating ω-automaton over control-flow trees; CETI-style reduction of debugging to reachability; symbolic-execution test generation against a designated error location. |
| **Resource** | Quota checks, timing bounds | Mutation attempts limit (2), max generations (500), scheduler abort via `abortSimulation`. |

### DSL Grammar (immutable core / mutable logic separation)

**Conditional antecedents:** `isSmaller(action, index, hand)` · `isCardBetweenNumbers(action, lower, upper, index, hand)` · `givesRacko(action)` · `hasRacko(hand)` · `sum(location_a, restriction, location_b)` · `play(location_a, restriction, location_b)`

**State alteration actions:** `draw()` · `show(restriction, location)`

Rules are **mandatory** (execute exactly once at a phase transition) or **conditional** (fire when the antecedent evaluates true). Terminals represent card values, player hands, board coordinates, and token counts.

---

## 6. Search Methodology

- **Population management** — 8 islands × 200 genomes, migrating every 25 generations to escape local optima.
- **Selection** — tournament, size 3, under the Multiplicative Weight Updates Algorithm in a weak-selection regime. Each locus is a player in a repeated game; genotype frequencies evolve near linkage equilibrium. Objective: `U(σ) = Σᵢ pᵢGᵢ + λH(P)` with λ = 0.15.
- **Mutation — channel 1 (structural):** subtree crossover between structurally valid DSL expressions.
- **Mutation — channel 2 (LLM):** `mutate(g) = g ⊕ Δg`, where Δg is an LLM-synthesized structural update conditioned on compile-time and execution feedback, under the EvoSynth paradigm with program sketches bounding the search space.
- **Termination** — any stopping condition in §10.

**Isolation invariant (new, IV-001).** Channel 2 introduces a non-deterministic, non-reproducible operator. The source document asserted that confining it to the Research Domain preserves consensus determinism but specified no test of that boundary. This revision adds: *every artifact crossing the deployment boundary must reproduce bit-identically from its JSON contract alone, with no reference to the LLM interaction that generated it.* Verified as CLM-2026-07-006.

---

## 7. Evidence Collection

| Evidence Type | Required Fields | Storage | Verification |
|---------------|-----------------|---------|--------------|
| Plan Evidence | Hash of this document, Parameter Record | `/evidence/plan/` | Hash equality, Tier 2 signature |
| Execution Evidence | Scheduler decision log, entropy sequence, Merkle roots per step *t* | `/evidence/execution/` | `ReplayingEntropySource` replay, zero divergence |
| Fitness Evidence | Island ID, generation, fitness vector, entropy `H(P)` | `/evidence/fitness/` | Reproducible re-evaluation from seed |
| Validation Evidence | Rubric scores, reachability proofs, Required Count derivations | `/evidence/validation/` | ω-automaton proof artifact, solver output |

---

## 8. Evaluation Rubric

| Rubric Variable | Objective | Formula | Target |
|-----------------|-----------|---------|--------|
| Relative Strategy Win-Rate | Gameplay competency | `Rate = Wins / n`, n = 1,000 | > 0.50 vs. human baselines |
| Verification Consistency | Behavioral alignment with human seeds | `C(σ) = (1/\|S₀\|) Σ Cᵢ(σ)` | 1.00 — no seed violations |
| Rule Redundancy Rate | Strip unexecuted code | `Unused AST Nodes / Total AST Nodes` | 0.00 post-`RemovedUnused` |
| Gameplay Survival Latency | Favor long, dynamic matches | `t_stable − t_start` | ≥ 1.25 × baseline median |
| State Information Content | Avoid degenerate/static states | `H(X) = −Σ P(xᵢ) log₂ P(xᵢ)` | ≥ 0.70 × log₂(200) |
| Configuration Growth | Peak volume of active state variables | max\|active vars\| over match | Reported; no gate |
| Initial Complexity Discount | Penalize bloated starting rules | `−κ · \|initial config\|`, κ = 0.05 | Applied to fitness |

`|S₀|`, the human-verified reference seed set, is **not bound by this plan** — see FND-2026-07-011.

---

## 9. Contradiction Protocols

### 9.1 Reachability auditing (Research Domain)
Program + safety specification are transformed into a unified program containing a designated error location. Symbolic execution / solver-aided test generation searches for a reaching input. Reachable ⇒ candidate discarded and recorded in the Contradiction Register with proof hash. Proven unreachable ⇒ candidate sound with respect to the test suite.

### 9.2 Byzantine state isolation (Execution Domain)
Replicas: N = 4, tolerating f = 1, satisfying **N ≥ 3f + 1**.

1. **Root Audit** — at step *t*, replicas broadcast calculated state Merkle roots.
2. **Divergence Detection** — a replica receiving a root differing from majority consensus raises a contradiction exception and suspends its local transition pipeline.
3. **Path Traversal** — sibling hashes are requested from neighbors; branch comparison isolates the exact divergent leaf.
4. **Byzantine Isolation** — deviating nodes are flagged and their votes excluded from subsequent transitions.
5. **CP Halting Mode** — if the count of confirmed-faulty nodes exceeds f, partial synchrony triggers a safety halt. Consistency is prioritized over availability; all transitions freeze.

**Correction (FND-2026-07-002).** The source document expressed the halt condition as "if the number of divergent nodes exceeds the fault limit f (where N < 3f+1)." This conflates a *static configuration property* with a *runtime observation*. N and f are fixed at deployment; N ≥ 3f+1 either holds or the system was misconfigured before it started. The runtime trigger is `|confirmed_faulty| > f`, as stated in step 5 above. The parenthetical is removed.

---

## 10. Stopping Conditions

- `MAX_GENERATIONS` = 500 per island reached.
- Fitness plateau: no best-fitness improvement over `FITNESS_PLATEAU_WINDOW` = 40 generations.
- Evidence completeness ≥ 95%.
- Governance Score ≥ 90.
- Explicit stop recorded in the Decision Register.

A stopping condition met with sub-threshold scores yields `MORE RESEARCH REQUIRED`, not silent completion.

---

## 11. Dependency, Contradiction, and Recovery Matrix

| Domain Phase | Dependencies | Primary Fail-Point | Contradiction Input | Automated Recovery |
|--------------|-------------|--------------------|--------------------|--------------------|
| **D1** Deterministic Compilation | Target TypeScript sources | Syntax errors; dynamic `import()`, `eval`, template-literal codegen | Mismatched AST JSON context hashes across build runs | Reject build; strict watch mode; recompile via normalized pathways |
| **D2** Simulation Control | Verified D1 output | Uncontrolled async tasks; deadlock | Mismatched execution steps during replay | Poison the active `SimulationImpl`; abort run |
| **D3** DSL & Grammar | Verified D2 environment | Out-of-bounds parameters; non-parsable expressions | AST printer syntax errors | Discard invalid tree; regenerate within safe grammar limits |
| **D4** Evolutionary Search | Validated D3 structures | Early convergence; local fitness traps | Infinite execution loops in evolved templates | Apply MWUA to boost population entropy |
| **D5** Evidence Evaluation | D4 candidates | Low win-rate; consistency failure vs. human seeds | Playtesting behavior violating safety rules | Discard candidate; adjust fitness weights; trigger LLM self-correction |
| **D6** Contradiction Protocols | D5 output | State divergence; non-deterministic drift | Mismatched Merkle roots | Trace branches, isolate divergent state, flag faulty nodes, halt beyond f |
| **D7** Governed Execution | Verified D6 consensus | Runaway loops; checkpoint write failure | OpenTelemetry trace drift; execution timeout | Roll back to last PostgreSQL checkpoint; replay via `ReplayingEntropySource` |

### Tiered recovery procedure
1. **Checkpoint Rollback** — Mastra TS halts node transitions; state rolls back to the last verified PostgreSQL checkpoint.
2. **Runner Poisoning** — the active `SimulationImpl` is marked permanently unusable.
3. **Replay Analysis** — a fresh instance loads the checkpoint and configures the scheduler with `ReplayingEntropySource` from recorded logs.
4. **Drift Evaluation** — replay to the failure point. Success ⇒ transient (network/API timeout), resume. Divergence ⇒ deterministic drift error.
5. **Safety Halt** — on confirmed drift, trigger partial-synchrony halt, stop the replication node, alert for human-in-the-loop debugging.

---

## 12. Registers

### 12.1 Assumption Register

| ID | Assumption | Source | Verification Method | Status |
|----|-----------|--------|---------------------|--------|
| ASM-2026-07-001 | `ts-morph` AST traversal is stable across compiler minor versions. | D1 narrative | Pin compiler version; hash-compare context bundles across 3 environments | UNVERIFIED |
| ASM-2026-07-002 | Confining LLM mutation to the Research Domain is sufficient to keep the consensus layer deterministic. | Core paradigm | Isolation invariant IV-001 (§6) | UNVERIFIED |
| ASM-2026-07-003 | The "no entropy for single item" optimization fully decouples the entropy sequence from transient pool size. | D2 narrative | Differential replay under varied network timing | UNVERIFIED |
| ASM-2026-07-004 | Two-way alternating ω-automaton verification terminates within practical bounds for depth-10 DSL trees. | D3 narrative | Empirical timing across worst-case generated trees | UNVERIFIED |
| ASM-2026-07-005 | Human-written baseline scripts constitute a fair and stable comparison pool. | D5 rubric | Baseline pool versioning and re-benchmarking each cycle | UNVERIFIED |

### 12.2 Unknown Register

| ID | Question | Impact | Resolution Plan | Status |
|----|----------|--------|-----------------|--------|
| UNK-2026-07-001 | What is `\|S₀\|` — the size and composition of the human-verified reference seed set? | **High.** `C(σ)` is undefined without it, and consistency is bound at 1.00. | Human Approver specifies the seed corpus. | OPEN — blocking |
| UNK-2026-07-002 | Does the LLM mutation operator's provider/version need pinning for auditability? | Medium. Affects reproducibility of the *search*, not the *contract*. | Decide whether search reproducibility is in scope. | OPEN |
| UNK-2026-07-003 | What is the interaction between MWUA entropy maximization and the max-tree-depth bound? | Medium. Depth cap may suppress the diversity MWUA is meant to preserve. | Controlled experiment; record as Fitness Evidence. | OPEN |
| UNK-2026-07-004 | Are ERC values drawn from a seeded PRNG shared with the scheduler? | Medium. Shared state would couple search and execution entropy. | Code inspection at D4 implementation. | OPEN |
| UNK-2026-07-005 | What is the retention policy for recorded entropy logs? | Low–Medium. Replay-based recovery depends on log availability. | Define in D7 orchestration config. | OPEN |

### 12.3 Risk Register

| ID | Risk | Category | Prob. | Impact | Mitigation | Status |
|----|------|----------|-------|--------|------------|--------|
| RSK-2026-07-001 | Deterministic drift escapes the Research/Execution boundary via an unaudited channel. | Technical | Medium | Critical | IV-001 isolation invariant; contract-only reproduction test. | MITIGATING |
| RSK-2026-07-002 | LLM API cost/rate-limit failure stalls the search indefinitely. | Operational | High | Medium | Mastra durable checkpoints; mutation attempts capped at 2. | MITIGATING |
| RSK-2026-07-003 | Static AST analysis misses runtime-resolved constructs. | Technical | Medium | High | Dynamic `import()`, `eval`, template-literal codegen flagged and barred from deployment. | MITIGATED |
| RSK-2026-07-004 | `VALIDATION_CONSISTENCY_THRESHOLD` = 1.00 leaves zero tolerance; a single flaky seed halts G4. | Governance | Medium | High | Seed set must be deterministic and versioned; flakiness treated as a seed defect, not a candidate defect. | OPEN |
| RSK-2026-07-005 | Island migration every 25 generations may homogenize populations faster than MWUA restores entropy. | Technical | Medium | Medium | Monitor `H(P)` against `DIVERSITY_THRESHOLD`; widen interval if breached. | OPEN |
| RSK-2026-07-006 | Unsourced empirical claims propagate into downstream design decisions. | Governance | **Confirmed** | High | See FND-2026-07-012; claim struck from this revision. | MITIGATING |

### 12.4 Contradiction Register

| ID | Type | Description | Detected At | Resolution | Resolver |
|----|------|-------------|-------------|------------|----------|
| CNTR-2026-07-001 | EvidenceConflict | Source asserts "over 42% of unexpected cloud API billing errors" derive from unchecked non-deterministic LLM loops. No citation; bibliography empty. | Audit Rubric 3 | Claim struck from revised plan; see FND-2026-07-012. | AI Auditor |
| CNTR-2026-07-002 | SpecificationConflict | CP halting condition conflated static config (`N < 3f+1`) with runtime observation (`\|faulty\| > f`). | Audit Rubric 4 | Parenthetical removed; §9.2 step 5 rewritten. | AI Auditor |
| CNTR-2026-07-003 | SpecificationConflict | Source claims "seven validated phases"; governance protocol defines eight phases on a different axis. | Audit Rubric 2 | Explicit D1–D7 ↔ Phase1–Phase8 mapping added (§2). | AI Auditor |

### 12.5 Claim Validation Matrix

| Claim ID | Requirement | Test Case | Result | Pass/Fail |
|----------|-------------|-----------|--------|-----------|
| CLM-2026-07-001 | Deterministic compilation | Build context bundle on 3 independent environments; compare hashes | Pending execution | — |
| CLM-2026-07-002 | Deterministic execution replay | Record then replay entropy sequence; assert zero divergence | Pending execution | — |
| CLM-2026-07-003 | Reproduction operator probabilities are a valid distribution | 0.40 + 0.40 + 0.10 + 0.10 | = 1.00 | **Pass** |
| CLM-2026-07-004 | BFT constraint satisfied at bound values | N = 4, f = 1 ⇒ 4 ≥ 3(1)+1 | 4 ≥ 4 | **Pass** |
| CLM-2026-07-005 | All domain parameters bound | Enumerate §4.2 + §4.3 against every symbol used in §6, §8, §9 | 11 previously unbound, now proposed | **Conditional** — requires G3 ratification |
| CLM-2026-07-006 | Research/Execution isolation holds | Reproduce each promoted artifact from its JSON contract alone | Pending execution | — |
| CLM-2026-07-007 | Every empirical claim carries a source | Cross-check assertions against bibliography | Bibliography empty | **Fail** — FND-2026-07-011 |

### 12.6 Source Matrix

| ID | Source Type | Location | Hash | Status |
|----|-------------|----------|------|--------|
| — | — | — | — | **EMPTY** |

The source document's "Works cited" section contains no entries, and in-text reference markers were stripped during preprocessing. The Source Matrix therefore cannot be populated, and Citation Chaining (`04` § Citation Chaining) cannot form a continuous chain to prior work. See FND-2026-07-011.

### 12.7 Decision Register

| ID | Decision | Gate | Rationale | Approver | Tier | Status |
|----|----------|------|-----------|----------|------|--------|
| DEC-2026-07-010 | APPROVE | G1 | Assumptions and Unknowns populated; domain scope declared; phase mapping resolved. | AI Auditor | Tier 2 | APPROVED |
| DEC-2026-07-011 | REJECT | G2 | 11 domain parameters were unbound at intake. Proposed bindings in §4.3 are auditor recommendations, not ratifications. G2 cannot pass until Tier 1 ratifies or supplies values. | AI Auditor | Tier 2 | REJECTED |
| DEC-2026-07-012 | **PENDING-HUMAN** | G3 | Submitted for execution authorization. Two Critical findings remain outside auditor authority (FND-2026-07-011, -012). Auditor recommendation: **CONDITIONAL** — approve subject to seed-set specification and bibliography reconstruction. | *(unsigned)* | — | NOT APPROVED |

---

## 13. Blocking Findings

Thirteen findings were opened; eleven are resolved in this revision. Two remain and cannot be closed by Tier 2.

| Finding | Severity | Why the auditor cannot resolve it |
|---------|----------|-----------------------------------|
| **FND-2026-07-011** | Critical | The bibliography is empty and `\|S₀\|` is unspecified. Reconstructing citations would mean *inventing attributions*, which `03` § Continuation Guidance forbids; choosing the human-verified seed corpus is a domain decision that determines whether `C(σ) = 1.00` is achievable at all. Required from Tier 1: the seed corpus definition and the source list backing the D2–D7 architectural claims. |
| **FND-2026-07-012** | Critical | The "over 42% of cloud API billing errors" statistic has no source. I struck it rather than reproduce it — but if it is load-bearing for the D7 durable-orchestration justification, Tier 1 must either supply the citation or accept that the justification now rests on qualitative grounds. It cannot be silently retained. |

---

## 14. Revision Log

| Iteration | Version | Changes | Findings Resolved | Auditor Sig |
|-----------|---------|---------|-------------------|-------------|
| 1 | v2.0.0-rc1 | Added phase mapping (§2); supplied missing Layer-3 enforcement mechanism (§3); bound 11 domain parameters (§4.3); added isolation invariant IV-001 (§6); corrected CP halting condition (§9.2); populated Assumption, Unknown, Risk, Contradiction, Claim Validation, Decision registers (§12); struck unsourced statistic; added stopping conditions (§10). | FND-2026-07-001 … -010, -013 | `sig:auditor:iter1` |

---

## 15. Version History

| Version | Author | Timestamp | Summary | Parent | Status |
|---------|--------|-----------|---------|--------|--------|
| v1.0.0 | Research Lead | (undated in source) | Original seven-phase architecture document. | – | SUPERSEDED |
| v2.0.0-rc1 | AI Auditor | 2026-07-29 | Governance conformance revision under protocol v2.0.0. | v1.0.0 | PENDING-HUMAN |

---

## Signature Block

```
Auditor Signature (Tier 2):  sig:auditor:<computed-over-final-artifact>
Human Approver Signature (Tier 1):  ________________________________
Gate G3 Decision:            ________________________________
```

*This document does not and may not contain the string that authorizes research execution. Only Tier 1 writes it.*

---

*End of Revised Execution Plan v2.0.0-rc1*
