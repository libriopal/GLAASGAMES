# 03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md

**Protocol Version:** v3.0.0

## Purpose
Provide explicit instructions for the auditor (Claude) to audit, revise, and prepare an attached execution-plan PDF for approval. The directive enforces a strict audit-revision loop until zero Critical Findings remain, at which point the plan is submitted to the Human Approver at Gate G3. Research execution remains **prohibited** until a Tier 1–signed **APPROVED FOR RESEARCH EXECUTION** decision is recorded.

## Scope
- Applies to any execution-plan PDF supplied alongside this directive.
- Covers all required sections defined in **02_GOVERNANCE_PROTOCOL.md**.
- Does not introduce domain-specific assumptions; the attached PDF defines the research domain and binds all domain-scoped parameters listed in **01_SYSTEM_CHARTER.md** § Parameter Bindings.

## Responsibilities
| Role | Responsibility |
|------|----------------|
| **AI Auditor** | Load the PDF, perform audits, identify deficiencies, rewrite the plan, compare revisions, iterate until no Critical Findings remain, sign with the auditor key, and submit to G3. **May not issue the approval itself.** |
| **Human Approver** | Evaluate at Gate G3 and Gate G5; apply the Tier 1 signature out-of-band; may reject any plan that does not meet the rubric. |
| **Automated Executor** | Validate that the revised plan's evidence IDs exist in the appropriate registers and conform to the identifier grammar; flag any remaining contradictions. |

## Procedure Overview
1. **Load PDF** – Read the attached execution-plan PDF into the context.
2. **Audit** – Apply the *Audit Rubric* to evaluate governance, structural, evidence, validation, and dependency aspects.
3. **Identify Deficiencies** – Populate the *Findings Template* for each issue discovered.
4. **Rewrite** – Produce a revised plan that addresses all findings, using templates from **02_GOVERNANCE_PROTOCOL.md** where needed.
5. **Compare** – Generate a diff between the original and revised versions; verify that all identified deficiencies are resolved and no regressions introduced.
6. **Iterate** – If any Critical Findings remain, repeat steps 2–5 with an incremented version number.
7. **Submit** – When zero Critical Findings remain, sign with the auditor key, create a `PENDING-HUMAN` Decision Register entry for G3, and submit to the Human Approver. **Stop here.** The status string **APPROVED FOR RESEARCH EXECUTION** is written only by Tier 1.

## Audit Rubric
The audit evaluates five dimensions. Each dimension has defined criteria and severity levels.

### 1. Governance Deficiencies
| Criterion | Required Element | Failure Indicator | Severity |
|-----------|------------------|-------------------|----------|
| Presence of **Decision Register** entries for each gate | Gate decisions documented with correct signing tier | Missing gate entry, or Tier 1 gate signed by Tier 2 | Critical |
| **Evidence Register** completeness | Evidence IDs linked to decisions; ratio ≥ `EVIDENCE_COMPLETENESS_THRESHOLD` | Below threshold | Major |
| **Version History** integrity | Sequential versioning, no gaps | Non-sequential or missing versions | Minor |

### 2. Structural Deficiencies
| Criterion | Required Element | Failure Indicator | Severity |
|-----------|------------------|-------------------|----------|
| All required sections of **02_GOVERNANCE_PROTOCOL.md** present and correctly ordered: Governance Lifecycle, Audit Methodology, Approval Gates, Revision Methodology, Governance Scoring, Evidence Standards, Validation Methodology, Traceability, Risk Management, Change Control, Directive Amendment, Rollback Procedures, Completion Criteria, Terminal Statuses, Templates | All fifteen named sections | Missing section | Critical |
| Consistent naming convention for IDs | IDs match `^[A-Z]{3,4}-\d{4}-\d{2}-\d{3}$` per **01** § Identifier Grammar | Non-conforming ID | Minor |
| Proper **Assumption** and **Unknown** population | At least one substantive entry each | Empty register or example rows only | Major |
| Domain parameters bound | `BENCHMARK_THRESHOLD`, `COMPLEXITY_THRESHOLD`, `DIVERSITY_THRESHOLD`, `MAX_GENERATIONS`, `FITNESS_PLATEAU_WINDOW` assigned by the plan | Any unbound | Critical |

### 3. Evidence Deficiencies
| Criterion | Required Element | Failure Indicator | Severity |
|-----------|------------------|-------------------|----------|
| Each evidence item has hash, signature, signing tier, timestamp | Full metadata present | Missing field | Critical |
| Evidence IDs referenced in **Decision Register** | Bidirectional linkage | Unreferenced ID | Major |
| Execution logs cover entire execution window | Continuous log coverage across the declared window | Gaps in log | Minor |

### 4. Validation Deficiencies
| Criterion | Required Element | Failure Indicator | Severity |
|-----------|------------------|-------------------|----------|
| Validation results meet bound thresholds | Threshold compliance against **01** § Parameter Bindings | Below threshold | Critical |
| All **Claim Validation** entries satisfied | No open claims | Open claim | Major |
| Required Count derivation recorded | Evidence entry documenting stage, rows, integer | Missing derivation | Major |

### 5. Dependency Deficiencies
| Criterion | Required Element | Failure Indicator | Severity |
|-----------|------------------|-------------------|----------|
| References to **02_GOVERNANCE_PROTOCOL.md** | Explicit citations | Missing citation | Minor |
| Prerequisite artifacts listed | Dependencies enumerated | Unlisted dependency | Major |
| Compatibility with current protocol version | Version match against **v3.0.0** | Version mismatch | Critical |

## Findings Template
| Finding ID | Category | Description | Severity | Reference (Section/Line) | Suggested Fix |
|------------|----------|-------------|----------|--------------------------|---------------|
| FND-2026-07-001 | Governance | Gate G4 missing decision entry. | Critical | 4.2.3 | Add Decision Register entry DEC-2026-07-042 for G4. |
| FND-2026-07-002 | Structural | Terminal Statuses section absent. | Critical | 5 | Insert section per **02_GOVERNANCE_PROTOCOL.md** template. |
| FND-2026-07-003 | Evidence | Evidence EVT-2026-07-045 missing signing tier. | Major | 3.1.4 | Record signing tier and re-verify signature. |

*All Critical findings must be resolved before the plan may be submitted to Gate G3.*

## Rewrite Protocol
1. **Create a Working Copy** – Duplicate the original; do not modify the original.
2. **Populate Missing Registers** – Use the templates from **02_GOVERNANCE_PROTOCOL.md**:
   - **Assumption Register** – Minimum one substantive entry.
   - **Unknown Register** – Minimum one substantive entry.
   - **Evidence Register** – Add entries for any missing IDs, with signing tier recorded.
   - **Decision Register** – The AI Auditor may create and sign entries **only for gates whose Authority is Tier 2 (G1, G2, G4)**. For Tier 1 gates (G3, G5), insert a placeholder with `Decision: PENDING-HUMAN`, `Approver: (unsigned)`. A `PENDING-HUMAN` entry evaluates as NOT APPROVED at every gate check and cannot satisfy the unlock condition in **04_RESEARCH_EXECUTION_PROTOCOL.md**.
   - **Risk Register** – Record any newly identified risks.
3. **Update Version Number** – Increment the version (e.g., `v1.2.0 → v1.3.0`).
4. **Insert Required Sections** – Ensure all named sections of **02** enumerated in § Audit Rubric 2 are present and correctly ordered.
5. **Add Audit Trail** – Append a *Revision Log* section documenting each iteration (see Revision Log Template).
6. **Sign the Document** – The AI Auditor computes a signature over the revised artifact using the **auditor's** private key and embeds it as the `Auditor Signature` block. A second, separate `Human Approver Signature` block is left empty; it is applied out-of-band by Tier 1 and recorded as an independent Evidence Register entry of type `Decision Evidence`. The auditor never holds, requests, or simulates the Human Approver's key.

## Comparison Criteria
- **Diff Generation** – Use a deterministic diff tool to compare original and revised versions.
- **Finding Resolution Verification** – For each Finding ID, confirm the issue is absent in the diff.
- **Regression Check** – Confirm no previously resolved finding has reappeared and no new Critical finding has been introduced.
- **Version Increment** – Verify version number incremented exactly once per iteration.
- **Evidence Linkage** – Ensure every **Decision Register** entry references a valid **Evidence Register** ID.
- **Signature Validation** – Validate the `Auditor Signature` against the auditor key. Validate the Human Approver approval record, if present, against **02** § Evidence Standards → Approval Record Schema. Absence of the latter is expected prior to G3 and is not a finding.

## Iteration Control
- **Loop Condition** – Continue rewriting while **Critical Findings** count > 0.
- **Versioning** – Each iteration must increase the version number.
- **Revision Log** – Record each iteration in the *Revision Log* section of the plan.
- **Iteration Ceiling** – If Critical Findings persist after five iterations without net reduction, halt and issue `MORE RESEARCH REQUIRED` or `INCOMPLETE` per **02** § Terminal Statuses rather than continuing indefinitely.

### Revision Log Template
| Iteration | Timestamp | Version | Changes Made | Findings Resolved | Auditor Signature |
|-----------|-----------|---------|--------------|-------------------|-------------------|
| 1 | 2026-07-12T09:00:00Z | v1.2.0 | Added missing Decision Register entries for G1, G2. | FND-2026-07-001, FND-2026-07-003 | `sig:abc…` |
| 2 | 2026-07-12T10:30:00Z | v1.3.0 | Inserted Terminal Statuses section; bound domain parameters. | FND-2026-07-002 | `sig:def…` |

## Prohibition Clause
> **Research execution is strictly prohibited** until a Decision Register entry at Gate G3 records the status **APPROVED FOR RESEARCH EXECUTION** with a valid Human Approver approval record conforming to **02_GOVERNANCE_PROTOCOL.md** § Evidence Standards → Approval Record Schema. The AI Auditor may not write this string, may not sign this entry, and may not treat a `PENDING-HUMAN` placeholder as satisfying it. Any attempt to invoke research operations prior to this status will be rejected by the Automated Executor and reported as a **Contradiction** in the **Contradiction Register**, triggering the Approval Delegation Attempt path in **01_SYSTEM_CHARTER.md** § Failure Handling.

## Deliverables
- **Revised Execution Plan** – Complete document with all Critical deficiencies addressed, auditor-signed, with an empty Human Approver Signature block.
- **Audit Report (Markdown)** – Structured report containing the audit rubric results, findings table, and resolution summary.
- **Revision Log (Markdown)** – Chronological record of each iteration per the Revision Log Template.
- **G3 Submission Record** – Decision Register entry with `Decision: PENDING-HUMAN`, listing the evidence supporting approval and any CONDITIONAL recommendations.

## Continuation Guidance
- If the attached PDF is missing, corrupted, or unreadable, immediately report the issue and halt processing with status `INCOMPLETE`.
- If any required template cannot be populated due to missing data, document the gap as an **Unknown** entry and request clarification from the Human Approver, identifying which protocol requirement cannot be satisfied without it.
- Upon reaching zero Critical Findings, output the **Audit Report**, **Revision Log**, **Revised Execution Plan**, and **G3 Submission Record** in a single response, clearly labeling each artifact, and stop.

---

*End of 03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to 04_RESEARCH_EXECUTION_PROTOCOL.md.**
