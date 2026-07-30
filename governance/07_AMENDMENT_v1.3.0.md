# 07_AMENDMENT_v1.3.0.md

**Amendment ID:** AMD-2026-07-001
**Parent Version:** v1.2.0
**New Version:** v1.3.0
**Author:** AI Auditor (Tier 2)
**Status:** PROPOSED — requires Human Approver signature per 02 § Change Control
**Resolves:** F001–F015 (see `FINDINGS_REGISTER.md`)

> This amendment is issued as a patch rather than a set of overwritten files because 02 § Change Control and 01 § Execution Constraints ("No Dynamic Modification") require that approved artifacts be immutable and superseded only through a versioned, traceable revision. Silently rewriting 00–06 in place would itself be a governance violation.
>
> **Application order:** A1 → A12, sequentially. Each amendment is a literal find/replace or insertion. After applying all twelve, mark v1.2.0 SUPERSEDED in Version History and re-run the audit as iteration 2.

---

## A1 — Bind all parameters *(resolves F003)*

**Target:** `01_SYSTEM_CHARTER.md`
**Action:** INSERT new section immediately after § Approval Requirements.

### Parameter Bindings
All parameters below are normative. Any parameter referenced elsewhere in the protocol but absent from this table is **unbound**; an unbound parameter causes automatic rejection at G2 and may not be assigned an ad-hoc value at evaluation time.

| Parameter | Default | Min | Max | Unit | Bound At |
|-----------|---------|-----|-----|------|----------|
| `EVIDENCE_COMPLETENESS_THRESHOLD` | 95 | 80 | 100 | % | Governance Setup |
| `VALIDATION_CONSISTENCY_THRESHOLD` | 0.98 | 0.90 | 1.00 | ratio | Governance Setup |
| `RISK_MITIGATION_THRESHOLD` | 90 | 75 | 100 | % | Governance Setup |
| `GOVERNANCE_SCORE_THRESHOLD` | 90 | 70 | 100 | weighted | Governance Setup |
| `SEARCH_COVERAGE_THRESHOLD` | 80 | 50 | 100 | % | Governance Setup |
| `VERIFICATION_COVERAGE_THRESHOLD` | 100 | 95 | 100 | % | Governance Setup |
| `BENCHMARK_THRESHOLD` | — | — | — | domain | **Execution Plan** |
| `COMPLEXITY_THRESHOLD` | — | — | — | domain | **Execution Plan** |
| `DIVERSITY_THRESHOLD` | — | — | — | domain | **Execution Plan** |
| `MAX_GENERATIONS` | — | — | — | domain | **Execution Plan** |
| `FITNESS_PLATEAU_WINDOW` | — | — | — | domain | **Execution Plan** |

Parameters marked **Execution Plan** are domain-scoped and must be bound by the attached execution plan, not by this charter — per Immutable Directive 5. An execution plan that fails to bind them fails G1.

**Governance Score weighting** (sums to 1.00):
`0.40 × EvidenceCompleteness + 0.35 × ValidationConsistency + 0.25 × RiskMitigation`

---

## A2 — Correct gate sequence and identifiers *(resolves F005, F006)*

**Target:** `02_GOVERNANCE_PROTOCOL.md` § Approval Gates
**Action:** REPLACE the entire gate table.

| Gate ID | Gate Name | Lifecycle Position | Authority | Criteria | Outcome Options |
|---------|-----------|--------------------|-----------|----------|-----------------|
| **G1** | Preliminary Review | Initiation exit | AI Auditor (Tier 2) | All Assumption and Unknown entries documented; initial Evidence draft present; domain parameters bound by execution plan. | APPROVE, REQUEST REVISION, REJECT |
| **G2** | Preparation Verification | Planning exit | AI Auditor (Tier 2) | Preparation complete; every parameter bound per 01 § Parameter Bindings and within min/max. | APPROVE, REJECT |
| **G3** | Execution Authorization | Pre-Execution | **Human Approver (Tier 1)** | Governance parameters satisfied; evidence completeness ≥ `EVIDENCE_COMPLETENESS_THRESHOLD`; no open Critical findings. | APPROVE, CONDITIONAL, REJECT |
| **G4** | Validation Consistency | Validation exit | AI Auditor (Tier 2) | Validation results meet configured thresholds; all Claim Validation entries satisfied. | APPROVE, REJECT |
| **G5** | Final Acceptance | Closure exit | **Human Approver (Tier 1)** | All prior gates passed; deliverables complete per 05. | APPROVE, REJECT |

Gate identifiers must match `^G[1-5]$`.

**Consequential edits:** in `03` and `06`, every reference to "G3" as a validation gate becomes G4; every reference to "G4" as execution authorization becomes G3. The `gateStatus` map in 06 retains keys G1–G5 with the new meanings.

---

## A3 — Close the self-approval loop *(resolves F001)*

**Target:** `03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md` § Rewrite Protocol, step 2
**Action:** REPLACE the sub-bullet "**Decision Register** – Add entries for each gate that lacks approval." with:

> - **Decision Register** – The AI Auditor may create and sign entries **only for gates whose Authority is Tier 2 (G1, G2, G4)**. For Tier 1 gates (G3, G5), the auditor inserts a placeholder entry with `Decision: PENDING-HUMAN`, `Approver: (unsigned)`. A `PENDING-HUMAN` entry evaluates as NOT APPROVED at every gate check and cannot satisfy the unlock condition in `04_RESEARCH_EXECUTION_PROTOCOL.md`.

**Also INSERT** into `01_SYSTEM_CHARTER.md` § Immutable Directives as Directive 6:

> 6. **Approval Non-Delegation** – No tier may create, sign, or satisfy an approval record on behalf of a higher tier. Tier 1 approvals require a Tier 1 signature verified against the registered Human Approver public key.

---

## A4 — Fix the signing instruction *(resolves F002)*

**Target:** `03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md` § Rewrite Protocol, step 6
**Action:** REPLACE with:

> 6. **Sign the Document** – The AI Auditor computes a signature over the revised artifact using the **auditor's** private key and embeds it as the `Auditor Signature` block. A second, separate `Human Approver Signature` block is left empty. It is applied out-of-band by Tier 1 and recorded as an independent Evidence Register entry of type `Decision Evidence`. The auditor never holds, requests, or simulates the Human Approver's key.

**Consequential edit:** `03` § Comparison Criteria — "Validate the appended signature against the Human Approver's public key" becomes "Validate the Auditor Signature against the auditor public key; validate the Human Approver Signature, if present, against the Human Approver public key. Absence of the latter is expected prior to G3."

---

## A5 — Remove domain leakage *(resolves F007)*

**Target A:** `03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md` § Audit Rubric 3, row 3
**Action:** REPLACE "Entropy logs cover entire execution window / Continuous log coverage / Gaps in log" with:

> | Execution logs cover entire execution window | Continuous log coverage across the declared window | Gaps in log | Minor |

**Target B:** `06_SESSION_STATE.md` § resumeInstructions, step 4 (both schema and sample instance)
**Action:** REPLACE with:

> "4. Re-initialize the appropriate domain (Research or Execution) using the initialization parameters recorded in the Parameter Record."

Any entropy-, seed-, or RNG-specific requirement belongs in the execution plan, which is the sole location where domain assumptions are permitted.

---

## A6 — Establish a single normative phase list *(resolves F004)*

**Target:** `01_SYSTEM_CHARTER.md`
**Action:** INSERT after § Operational Modes:

### Phase Definitions
The normative phase list for all execution is defined in `04_RESEARCH_EXECUTION_PROTOCOL.md` § Research Workflow. It comprises **eight** phases:

`Phase1 Specification` · `Phase2 DomainDecomposition` · `Phase3 SearchInitialization` · `Phase4 IterativeSearch` · `Phase5 EvidenceCollection` · `Phase6 ContradictionSearch` · `Phase7 Validation` · `Phase8 Promotion`

No other document may define, renumber, or abbreviate this list.

**Consequential edits:**
- `06` § completedPhases — replace "Phase definitions in 01_SYSTEM_CHARTER.md (Sections 1-7)" with "Phase definitions in 01_SYSTEM_CHARTER.md § Phase Definitions (8 phases, normative source 04 § Research Workflow)."
- `06` sample instance — `pendingPhases` becomes `["Phase5","Phase6","Phase7","Phase8"]`.
- `MASTER_PROMPT.md` — delete all references to "seven phases."

---

## A7 — Define terminal statuses *(resolves F009)*

**Target:** `02_GOVERNANCE_PROTOCOL.md`
**Action:** INSERT new section after § Completion Criteria.

### Terminal Statuses

| Status | Issuing Authority | Entry Criteria | Required Register Entry | Resumable |
|--------|-------------------|----------------|-------------------------|-----------|
| `APPROVED FOR RESEARCH EXECUTION` | Human Approver | G3 APPROVE; zero open Critical findings. | Decision Register, Tier 1 signed | N/A — unlocks 04 |
| `RESEARCH COMPLETE` | Human Approver | G5 APPROVE; all 05 deliverables produced and signed. | Decision Register, status COMPLETE | No |
| `MORE RESEARCH REQUIRED` | AI Auditor | Stopping condition met but Governance Score below threshold, or Coverage below threshold. | Decision Register + Unknown Register entries for each gap | Yes |
| `INCOMPLETE` | AI Auditor | Session halted by resource exhaustion, interruption, or missing input. Distinguished from MORE RESEARCH REQUIRED by *external* cause. | Session State with `currentPhase` set | Yes |
| `VETO` | **Human Approver only** | Immutable Directive violation, unresolvable contradiction, or safety halt. | Contradiction Register + Decision Register, Tier 1 signed | No — requires new session and new plan |

`VETO` may not be issued by the AI Auditor. An auditor that detects veto-grade conditions issues `INCOMPLETE` and escalates to Tier 1.

---

## A8 — Define Required Count *(resolves F010)*

**Target:** `02_GOVERNANCE_PROTOCOL.md` § Governance Scoring
**Action:** APPEND beneath the metrics table:

> **Required Count derivation:** For a given lifecycle stage, Required Count equals the number of Coverage Matrix rows flagged `Mandatory` for that stage. The derivation (stage, row IDs, resulting integer) must be recorded as an Evidence Register entry of type `Validation Evidence` at the time of scoring. Required Count may not be adjusted after evidence collection for the stage has begun.

---

## A9 — Add directive amendment procedure *(resolves F011)*

**Target:** `02_GOVERNANCE_PROTOCOL.md`
**Action:** INSERT new section after § Change Control.

### Directive Amendment
Amending an IMMUTABLE directive in `01_SYSTEM_CHARTER.md` requires, in order:

1. **Contradiction sweep** — enumerate every protocol clause that depends on the directive; record each as a Contradiction Register entry with resolution plan.
2. **Impact statement** — signed by the AI Auditor, listing every artifact whose approval status the amendment invalidates.
3. **Tier 1 signature** — Human Approver only; no delegation, no conditional approval.
4. **Major version increment** — `vX.y.z → v(X+1).0.0`. All prior approvals are marked SUPERSEDED and must be re-obtained.
5. **Re-audit** — the full audit cycle in `03` restarts at iteration 1 against the new charter.

Ordinary § Change Control procedures are insufficient for directive amendment and must not be substituted.

---

## A10 — Normalize identifier grammar *(resolves F012, F015)*

**Target:** `01_SYSTEM_CHARTER.md`
**Action:** INSERT after § Quality Standards.

### Identifier Grammar
All register identifiers conform to `^[A-Z]{3,4}-\d{4}-\d{2}-\d{3}$` — prefix, year, month, sequence.

| Register | Prefix | Example |
|----------|--------|---------|
| Assumption | `ASM` | `ASM-2026-07-001` |
| Unknown | `UNK` | `UNK-2026-07-001` |
| Evidence | `EVT` | `EVT-2026-07-001` |
| Decision | `DEC` | `DEC-2026-07-001` |
| Risk | `RSK` | `RSK-2026-07-001` |
| Contradiction | `CNTR` | `CNTR-2026-07-001` |
| Source | `SRC` | `SRC-2026-07-001` |
| Research Debt | `DEBT` | `DEBT-2026-07-001` |
| Claim Validation | `CLM` | `CLM-2026-07-001` |
| Search Log | `SLOG` | `SLOG-2026-07-001` |
| Audit Report | `AUD` | `AUD-2026-07-001` |
| Finding | `FND` | `FND-2026-07-001` |

**Consequential edit:** regenerate every example row in `02` § Templates and `06` § Sample Session State to conform. This eliminates the `D001` collision between the Decision and Research Debt registers.

---

## A11 — Resolve dangling references *(resolves F013, F014)*

| Location | Current | Replacement |
|----------|---------|-------------|
| `03` § Audit Rubric 2, row 1 | "All required sections per 02_GOVERNANCE_PROTOCOL.md — Sections 1-7 present" | "All required sections per 02 present: Governance Lifecycle, Audit Methodology, Approval Gates, Revision Methodology, Governance Scoring, Evidence Standards, Validation Methodology, Traceability, Risk Management, Change Control, Directive Amendment, Rollback Procedures, Completion Criteria, Terminal Statuses, Templates" |
| `03` § Rewrite Protocol, step 4 | "Ensure Sections 1-7 of 02 are present and correctly ordered" | "Ensure all named sections of 02 enumerated in § Audit Rubric 2 are present and correctly ordered" |
| `05` § 4 Cross-References | "Reference to **Search Log** entry (see **04_RESEARCH_EXECUTION_PROTOCOL.md**)" | "Reference to **Search Log** entry (see **02_GOVERNANCE_PROTOCOL.md** § Templates)" |

---

## A12 — Reconcile MASTER_PROMPT definition *(resolves F008)*

**Target A:** `00_README.md` § Document Map, final row
**Action:** REPLACE with:

> | **MASTER_PROMPT.md** | Standalone session directive. Invokes files 00–06 as attachments alongside the execution-plan PDF; is **not** a concatenation of them. |

**Target B:** `00_README.md` § Execution Flow, phase H
**Action:** DELETE phase H entirely. **Target C:** § Usage Instructions step 6 — replace "Generate MASTER_PROMPT.md by concatenating all files" with "Attach MASTER_PROMPT.md together with files 00–06 and the execution-plan PDF."

**Target D:** `00_README.md` § Assembly Instructions — retain, but scope it explicitly to producing the optional reference document `MASTER_PROTOCOL.md`, which has no operational role.

---

## Version History Entry

| Version | Author | Timestamp | Change Summary | Parent Version | Status |
|---------|--------|-----------|----------------|----------------|--------|
| v1.3.0 | AI Auditor | 2026-07-29 | Amendment AMD-2026-07-001: bound all parameters; corrected gate sequence and IDs; closed self-approval loop; removed domain leakage; established normative phase list; defined terminal statuses; added directive amendment procedure; normalized ID grammar. | v1.2.0 | PROPOSED |

**Blocking:** A3 adds an Immutable Directive and A5 corrects a violation of one. Under A9 (which this amendment itself introduces), both require a Tier 1 signature and a major version increment. If you accept that reading, this package should ship as **v2.0.0**, not v1.3.0 — that is a Human Approver decision, not mine.

---

*End of 07_AMENDMENT_v1.3.0.md*
