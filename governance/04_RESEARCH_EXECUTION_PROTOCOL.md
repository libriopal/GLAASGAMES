# 04_RESEARCH_EXECUTION_PROTOCOL.md

**Protocol Version:** v3.0.0

> **LOCKED** – This document is sealed and must not be used until a Decision Register entry at **Gate G3** records the status **APPROVED FOR RESEARCH EXECUTION** with a valid Human Approver (Tier 1) signature. A `PENDING-HUMAN` placeholder does not unlock this document. See **02_GOVERNANCE_PROTOCOL.md** § Approval Gates and **01_SYSTEM_CHARTER.md** Immutable Directive 6.

---

## Research Workflow
This section is the **normative source** of the phase list referenced by **01_SYSTEM_CHARTER.md** § Phase Definitions and **06_SESSION_STATE.md**. There are eight phases. No document may renumber or abbreviate them.

| Phase ID | Phase | Objective | Inputs | Outputs | Hand-off Point |
|----------|-------|-----------|--------|---------|----------------|
| `Phase1` | **Specification** | Define objectives, constraints, and evaluation criteria. | Human requirements, bound governance parameters. | Structured specification, Parameter Record. | → Phase2 |
| `Phase2` | **DomainDecomposition** | Partition the problem space into independent sub-domains. | Specification, existing artifacts. | Sub-domain definitions, mapping to generic constructs. | → Phase3 |
| `Phase3` | **SearchInitialization** | Configure search algorithm and resources. | Sub-domain definitions, domain parameters bound by the execution plan. | Initialized search configuration. | → Phase4 |
| `Phase4` | **IterativeSearch** | Execute search cycles (selection, mutation, evaluation). | Current population, fitness evaluations. | New generation, fitness logs. | → Phase5 |
| `Phase5` | **EvidenceCollection** | Capture all artifacts in governance registers. | Execution logs, fitness data, snapshots. | Populated Evidence Register, Decision Register entries. | → Phase6 |
| `Phase6` | **ContradictionSearch** | Verify no violations; discard offending candidates. | Evidence Register, safety specifications. | Filtered candidate set, Contradiction Register entries. | → Phase7 |
| `Phase7` | **Validation** | Run verification and compute rubric scores. | Filtered candidates, verification tools. | Validation Report, Governance Score, Consistency Score. | → **Gate G4** → Phase8 |
| `Phase8` | **Promotion** | Compile validated artifacts and promote to execution layer. | Validated candidates, artifact hash. | Deterministic contract, Decision Register entry. | → **Gate G5** (Tier 1) |

## Search Methodology
The search uses a generic algorithm whose parameters are bound by the execution plan, not by this protocol.

- **Population Management** – Size and diversity targets bound by the execution plan.
- **Selection** – Method declared in the execution plan (e.g., tournament, rank-based).
- **Mutation** – Operators declared in the execution plan (e.g., structural change, parameter tweak).
- **Evaluation** – Fitness computed using metrics declared in the execution plan.
- **Termination** – Stop when any condition in § Stopping Conditions is met.

Per Immutable Directive 5, this protocol declares no domain-specific mechanism. Any mechanism referenced here without a binding in the execution plan is a Critical finding at Gate G1.

## Evidence Collection
All research artifacts must be recorded in the governance registers with verifiable signatures and recorded signing tier.

| Evidence Type | Required Fields | Storage Location | Verification Method |
|---------------|-----------------|------------------|---------------------|
| **Plan Evidence** | Hash of specification, Parameter Record | `/evidence/plan/` | Hash equality, signature verification |
| **Execution Evidence** | Log entries, state fingerprints, parameter values | `/evidence/execution/` | Replay using recorded parameters |
| **Fitness Evidence** | Population ID, fitness vector, timestamp | `/evidence/fitness/` | Reproducible evaluation |
| **Validation Evidence** | Test results, verification outcomes, Required Count derivations | `/evidence/validation/` | Formal verification proof |

## Domain Decomposition
The problem space is split into orthogonal sub-domains, each mapped to generic constructs.

| Sub-Domain | Generic Construct(s) | Example Use |
|------------|----------------------|-------------|
| **Constraint** | Boolean checks, range checks | Enforce limits |
| **Objective** | Scoring functions, aggregation | Optimize fitness |
| **Safety** | Invariant checks, reachability analysis | Prevent violations |
| **Resource** | Quota checks, timing bounds | Manage usage |

Each sub-domain is represented by a separate **program sketch** to limit search complexity.

## Query Planning
Queries to the auditor (or AI assistant) are formulated iteratively.

1. **Initial Prompt** – Provide specification, Parameter Record, and target criteria.
2. **Feedback Loop** – Supply errors and fitness scores; request corrective rewrite.
3. **Constraint Refinement** – Ask for minimal modifications that preserve safety invariants.
4. **Diversity Prompt** – Request alternative implementations to avoid monoculture.

All prompts are versioned and stored in the **Evidence Register** with associated response hashes.

## Contradiction Search
- **Formal Verification** – Use verification methods bound by the execution plan to prove all execution paths satisfy specifications.
- **Reachability Analysis** – Locate inputs that trigger prohibited states; record reachable error locations.
- **Discrimination Filter** – Discard any candidate where verification reports a reachable error.
- **Documentation** – Record each discarded candidate in the **Contradiction Register** with proof hash and mitigation rationale.

## Benchmark Search
| Benchmark | Description | Fitness Metric | Target |
|-----------|-------------|----------------|--------|
| **Baseline** | Simple reference problem | Fitness score | `≥ {BENCHMARK_THRESHOLD}` |
| **Complexity** | More complex problem | Fitness score | `≥ {COMPLEXITY_THRESHOLD}` |
| **Diversity** | Measure of population variance | Variance metric | `≥ {DIVERSITY_THRESHOLD}` |

All three parameters are domain-scoped and must be bound by the execution plan per **01_SYSTEM_CHARTER.md** § Parameter Bindings. Unbound values fail Gate G1.

## Repository Search
- **Source Repositories** – Declared in the execution plan.
- **Pattern Extraction** – Identify recurrent constructs and successful strategies.
- **Integration** – Import extracted patterns as seed programs.
- **Citation** – Record each imported pattern in the **Source Matrix** with a `SRC-` identifier.

## Standards Search
- **Execution Standards** – Follow the deterministic execution model in **01_SYSTEM_CHARTER.md** § Execution Constraints.
- **Evidence Standards** – Use hash and signature verification per **02_GOVERNANCE_PROTOCOL.md** § Evidence Standards.
- **Safety Standards** – Apply verification methods bound by the execution plan.

## Citation Chaining
1. **Evidence → Decision** – Each **Decision Register** entry references supporting **Evidence Register** IDs.
2. **Decision → Artifact** – Artifacts reference the **Decision Register** entry that authorized creation.
3. **Artifact → Prior Work** – Repository imports cite **Source Matrix** entries.
4. **Chain Integrity** – Auditor verifies that all citations form a continuous chain to the initial specification.

## Validation Workflow
1. **Deterministic Verification** – Run verification using recorded parameters; confirm hash matches stored value.
2. **Formal Verification** – Execute the verification method bound by the execution plan; confirm all paths satisfy specifications.
3. **Rubric Evaluation** – Compute scores against **01** § Parameter Bindings.
4. **Gate G4** – AI Auditor records the Validation Consistency decision.
5. **Gate G5** – Human Approver records Final Acceptance with a Tier 1 signature. The auditor may only prepare a `PENDING-HUMAN` entry.

## Progress Reporting
- **Daily Report** – Summary of search progress, evidence added.
- **Weekly Report** – Cumulative metrics, any contradictions, mitigation actions.
- **Milestone Report** – Upon reaching a stopping condition; includes full validation results and readiness assessment.

All reports are stored in the **Evidence Register** and referenced in the **Decision Register**.

## Coverage Analysis
| Metric | Formula | Target |
|--------|---------|--------|
| **Search Coverage** | `(Evaluated Nodes / Total Nodes) × 100` | `≥ {SEARCH_COVERAGE_THRESHOLD}%` |
| **Evidence Completeness** | `(Evidence Count / Required Count) × 100` | `≥ {EVIDENCE_COMPLETENESS_THRESHOLD}%` |
| **Verification Coverage** | `(Verified Paths / Total Paths) × 100` | `≥ {VERIFICATION_COVERAGE_THRESHOLD}%` |

Required Count is derived per **02_GOVERNANCE_PROTOCOL.md** § Governance Scoring. Results are recorded in the **Coverage Matrix** and contribute to the **Governance Score**.

## Stopping Conditions
The search terminates when any condition is met.

- **Maximum Generations** – `MAX_GENERATIONS`, bound by the execution plan.
- **Fitness Plateau** – No improvement over `FITNESS_PLATEAU_WINDOW` generations.
- **Evidence Completeness** – All required evidence entries populated and verified.
- **Governance Score Threshold** – Score ≥ `GOVERNANCE_SCORE_THRESHOLD`.
- **Explicit Stop** – Human request documented in **Decision Register**.

On termination, issue a terminal status per **02_GOVERNANCE_PROTOCOL.md** § Terminal Statuses. A stopping condition met with sub-threshold scores yields `MORE RESEARCH REQUIRED`, not silent completion.

## Implementation-Readiness Evaluation
| Criterion | Requirement | Verification Method |
|-----------|-------------|---------------------|
| **Deterministic Compilation** | Hash matches stored value | Hash verification |
| **Verification Consistency** | ≥ `VALIDATION_CONSISTENCY_THRESHOLD` | Verification report |
| **Governance Score** | ≥ `GOVERNANCE_SCORE_THRESHOLD` | Score calculation |
| **No Unresolved Contradictions** | Contradiction Register empty for candidate | Contradiction Register query |
| **Documentation** | Complete comments and version metadata | Review in Evidence Register |
| **Approval** | Gate G5 Decision Register entry, Tier 1 signed | Signature tier verification |

Only candidates satisfying all criteria are compiled into deterministic contracts and promoted.

---

*End of 04_RESEARCH_EXECUTION_PROTOCOL.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to 05_OUTPUT_SPECIFICATION.md.**
