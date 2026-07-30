# 02_GOVERNANCE_PROTOCOL.md

**Protocol Version:** v3.0.0

## Governance Lifecycle
The governance lifecycle defines the sequential stages through which all protocol artifacts progress from conception to closure. Each stage has explicit entry and exit criteria, documented evidence requirements, and audit obligations.

| Lifecycle Stage | Description | Entry Criteria | Exit Criteria | Exit Gate | Primary Audit Artefact |
|-----------------|-------------|----------------|---------------|-----------|------------------------|
| **Initiation** | Creation of a new artifact (e.g., execution plan, audit specification). | Formal request filed in the **Decision Register** with a unique identifier. | All required **Assumption** and **Unknown** entries populated; initial **Evidence Register** draft completed; domain parameters bound by execution plan. | **G1** | Initiation Evidence Package (request form, assumptions, unknowns). |
| **Planning** | Detailed design and preparation. | Successful exit from Initiation; governance parameters bound per **01** § Parameter Bindings. | Deterministic preparation succeeds; every parameter bound and within min/max. | **G2** | Prepared artifact, Parameter Record. |
| **Authorization** | Human authorization to execute. | Planning exit. | Tier 1–signed decision recorded. | **G3** | Decision Register entry with Human Approver signature. |
| **Execution** | Actual activity (audit or execution). | **G3** = APPROVED. | All **Evidence** entries recorded; no unresolved **Contradiction** entries. | — | Execution Log, Parameter Record, State Fingerprints. |
| **Validation** | Independent verification of outcomes. | Execution exit; **Validation Methodology** applied. | Validation results meet bound thresholds; all **Claim Validation** entries satisfied. | **G4** | Validation Report, Coverage Matrix. |
| **Closure** | Formal acceptance and archival. | Validation exit; **Completion Criteria** met. | Final **Decision Register** entry marked COMPLETE; artifact archived. | **G5** | Final Deliverable Package, Version History entry. |

### Governance Lifecycle Flow
```
Initiation ─G1─→ Planning ─G2─→ Authorization ─G3─→ Execution ──→ Validation ─G4─→ Closure ─G5─→ ARCHIVED
                                    (Tier 1)                                              (Tier 1)
```
Each gate is defined in *Approval Gates*. Transitioning between stages requires successful completion of the preceding gate. Gates G3 and G5 cannot be satisfied by any automated tier.

## Audit Methodology
Audit activities are triggered automatically by state changes, threshold breaches, or explicit request. Audits follow a defined process to ensure consistency and reproducibility.

1. **Audit Trigger Identification**
   - Automated Auditor monitors: state divergence, plan status change, evidence register modification.
   - Human request documented in **Decision Register**.

2. **Audit Scope Definition**
   - **Artifact Scope**: All related documents.
   - **Temporal Scope**: From the most recent verified checkpoint to the current step.
   - **Component Scope**: Audit layer, execution layer, evidence layer.

3. **Evidence Collection**
   - Pull immutable evidence from registers and logs.
   - Verify signatures and hash chains.
   - Record collected items in **Audit Evidence Set** with timestamps.

4. **Audit Execution**
   - Re-run verification using recorded parameters if logs are available.
   - Compare generated fingerprints with stored values.
   - Identify any **Contradiction** entries.
   - Verify no Directive 6 delegation attempt has occurred: every Tier 1 gate entry must carry a Tier 1 signature.

5. **Audit Reporting**
   - Produce **Audit Report** containing findings, contradictions, and recommendations.
   - Sign report with the **auditor's** signature.

6. **Audit Closure**
   - If no contradictions: mark audit as **PASSED** in **Decision Register**.
   - If contradictions exist: create **Contradiction Register** entries and trigger **Rollback Procedures**.

## Approval Gates
Approval gates are decision points that enforce quality and safety before proceeding to the next stage.

| Gate ID | Gate Name | Lifecycle Position | Authority | Criteria | Outcome Options |
|---------|-----------|--------------------|-----------|----------|-----------------|
| **G1** | Preliminary Review | Initiation exit | AI Auditor (Tier 2) | All Assumption and Unknown entries documented; initial Evidence draft present; domain parameters bound by execution plan; no obvious inconsistencies. | APPROVE, REQUEST REVISION, REJECT |
| **G2** | Preparation Verification | Planning exit | AI Auditor (Tier 2) | Preparation complete; every parameter bound per **01** § Parameter Bindings and within min/max. | APPROVE, REJECT |
| **G3** | Execution Authorization | Pre-Execution | **Human Approver (Tier 1)** | Governance parameters satisfied; evidence completeness ≥ `EVIDENCE_COMPLETENESS_THRESHOLD`; zero open Critical findings. | APPROVE, CONDITIONAL, REJECT |
| **G4** | Validation Consistency | Validation exit | AI Auditor (Tier 2) | Validation results meet bound thresholds; all Claim Validation entries satisfied. | APPROVE, REJECT |
| **G5** | Final Acceptance | Closure exit | **Human Approver (Tier 1)** | All prior gates passed; deliverables complete per **05_OUTPUT_SPECIFICATION.md**. | APPROVE, REJECT |

Gate identifiers must match `^G[1-5]$`.

### Gate Process
1. Submit gate request with supporting artifacts.
2. Gate Authority evaluates against criteria.
3. Record decision in **Decision Register** with justification and the signature of the evaluating authority.
4. If APPROVE or CONDITIONAL, proceed; otherwise, remediate and re-submit.

### Tier 1 Gate Handling
For G3 and G5, the AI Auditor may prepare but not decide. It creates a Decision Register entry with `Decision: PENDING-HUMAN` and `Approver: (unsigned)`. Such an entry:

- evaluates as **NOT APPROVED** at every gate check;
- cannot satisfy the unlock condition in **04_RESEARCH_EXECUTION_PROTOCOL.md**;
- must be replaced — not amended — by a Tier 1–signed entry, with both entries retained in the register.

Any attempt to auto-populate a Tier 1 approval is a Directive 6 violation and triggers the Approval Delegation Attempt path in **01** § Failure Handling.

## Revision Methodology
All protocol artifacts are version-controlled and immutable once approved. Revisions follow a structured workflow to preserve auditability.

1. **Revision Request** – Documented in **Decision Register** with change description and impact analysis. Assigned a new **Version Identifier** (e.g., `v2.1.3`).
2. **Impact Assessment** – Identify all dependent artifacts. Update **Coverage Matrix** to reflect changed components.
3. **Draft Revision** – Create new artifact version in isolated workspace. Run full verification against bound parameters.
4. **Review Cycle** – Submit draft to relevant gate authorities. Record review comments in **Evidence Register**.
5. **Approval** – Upon successful gate passage, mark original version as **SUPERSEDED** and archive new version. Update **Version History** with author, timestamp, and rationale.

Revisions that touch an IMMUTABLE directive must instead follow § Directive Amendment.

## Governance Scoring
A numeric score quantifies the quality and readiness of artifacts. Scores are computed from parameters bound in **01** § Parameter Bindings.

| Metric | Parameter | Formula | Target Threshold |
|--------|-----------|---------|------------------|
| **Evidence Completeness** | `EVIDENCE_COMPLETENESS_THRESHOLD` | `(Evidence Count / Required Count) × 100` | `≥ {EVIDENCE_COMPLETENESS_THRESHOLD}%` |
| **Validation Consistency** | `VALIDATION_CONSISTENCY_THRESHOLD` | Consistency score per validation | `≥ {VALIDATION_CONSISTENCY_THRESHOLD}` |
| **Risk Mitigation** | `RISK_MITIGATION_THRESHOLD` | `(Mitigated Risks / Total Risks) × 100` | `≥ {RISK_MITIGATION_THRESHOLD}%` |
| **Governance Score** | `GOVERNANCE_SCORE_THRESHOLD` | `0.40 × EC + 0.35 × (VC × 100) + 0.25 × RM` | `≥ {GOVERNANCE_SCORE_THRESHOLD}` |

**Required Count derivation:** For a given lifecycle stage, Required Count equals the number of Coverage Matrix rows flagged `Mandatory` for that stage. The derivation — stage, contributing row IDs, resulting integer — must be recorded as an Evidence Register entry of type `Validation Evidence` at the time of scoring. Required Count may not be adjusted after evidence collection for the stage has begun; doing so invalidates every score computed under the prior denominator.

Score calculations are recorded in **Evidence Register** entries and used to determine gate outcomes.

## Evidence Standards
Evidence must be **immutable**, **verifiable**, and **cryptographically signed**.

- **Types of Evidence**
  - *Plan Evidence*: Hash of execution plan, Parameter Record.
  - *Execution Evidence*: Log entries, state fingerprints, parameter values.
  - *Validation Evidence*: Test results, verification outcomes, Required Count derivations.
  - *Decision Evidence*: Gate decisions, justification text, approver signature.

- **Collection Requirements**
  - Each evidence item must include: unique ID conforming to **01** § Identifier Grammar, timestamp, creator, signature, and hash of content.
  - Evidence must be stored in immutable storage; hash must be recorded in **Evidence Register**.

- **Verification Requirements**
  - Evidence must be verifiable by an independent party against a durable record: a public key where one exists, or an attributable approval record otherwise.
  - Hash chains must link each evidence item to the current state fingerprint.
  - Signing authority must match the tier claimed by the entry.
  - Verification method (`cryptographic` | `approval-record`) must be stated on each entry.

### Approval Record Schema
An attributable approval record substitutes for a cryptographic signature where keys are unavailable.

| Field | Requirement |
|-------|-------------|
| `artifactVersion` | Exact version of the artifact approved |
| `decisionId` | Decision Register ID |
| `approvingAuthority` | Named identity and tier |
| `decisionText` | The approval statement, verbatim |
| `timestamp` | ISO 8601 |
| `scope` | What the approval does and does not cover |
| `verificationMethod` | `approval-record` |
| `sourceRecord` | Pointer to the authoritative conversation or commit record containing the statement |

A record missing any field is not attributable and does not satisfy a Tier 1 gate. Cryptographic signatures remain preferred, may be used at any time, and do not require this schema.

**Founding-act exception (closed).** DEC-2026-07-018 through DEC-2026-07-021 are ratified founding acts issued before this schema existed. Per DEC-2026-07-021, no decision after DEC-2026-07-021 may invoke founding-act status.

## Validation Methodology
1. **Specification Alignment** – Map each requirement to a **Claim Validation** entry. Define test cases that exercise the requirement.
2. **Test Execution** – Run verification using recorded parameters for reproducibility. Capture outputs and compare against expected values.
3. **Formal Verification** – For safety-critical rules, use formal verification methods to prove all execution paths satisfy specifications. Record proof artifacts in **Evidence Register**.
4. **Score Calculation** – Compute scores per bound thresholds. Flag any discrepancies as **Contradiction** entries.
5. **Validation Report** – Summarize results, list failures, recommend remediation. Sign with validator signature.

## Traceability
- **Evidence → Decision** – Each **Decision Register** entry references the **Evidence Register** IDs that support it.
- **Decision → Artifact** – Artifacts reference the **Decision Register** entry that authorized creation.
- **Artifact → Execution** – Execution logs reference the artifact version and parameters used.
- **Audit Trail** – A hash-linked log records the sequence of all register modifications, including the signing tier of each entry.

## Risk Management
| Risk Category | Description | Assessment Method | Mitigation Strategy |
|---------------|-------------|-------------------|---------------------|
| **Technical Risk** | Unbound or out-of-range parameters, verification failures. | Static analysis, test coverage. | Enforce **01** § Parameter Bindings; automated checks at G2. |
| **Operational Risk** | Resource exhaustion, timing issues. | Load testing, monitoring. | Persist state; adjust resources; issue `INCOMPLETE` rather than degrading rigor. |
| **Human Risk** | Incorrect register entries, approval errors. | Peer review, audit cycles. | Multi-approver gates; audit logs. |
| **Governance Risk** | Delegation of Tier 1 approval; silent methodology change. | Signature tier check on every gate entry. | Directive 6 enforcement; halt on violation. |

- **Risk Register** captures each risk with ID, severity, probability, impact, mitigation status, and responsible party.

## Change Control
1. **Change Request Submission** – Complete **Change Request Form** with description, impact analysis, and proposed revision. Assign unique **Change ID**.
2. **Impact Assessment** – Update **Coverage Matrix**. Evaluate effect on bound parameters.
3. **Approval Process** – Route request through relevant gates. Record decision in **Decision Register**.
4. **Implementation** – Apply revision in isolated environment; run full verification. Upon success, archive new version and mark old version as superseded.
5. **Post-Implementation Review** – Verify no existing evidence is invalidated. Update **Research Debt Register** if change introduces new debt.

Change Control is insufficient for amending IMMUTABLE directives. Use § Directive Amendment.

## Directive Amendment
Amending an IMMUTABLE directive in **01_SYSTEM_CHARTER.md** requires, in order:

1. **Contradiction sweep** – Enumerate every protocol clause that depends on the directive; record each as a Contradiction Register entry with a resolution plan.
2. **Impact statement** – Signed by the AI Auditor, listing every artifact whose approval status the amendment invalidates.
3. **Tier 1 signature** – Human Approver only. No delegation. No conditional approval.
4. **Major version increment** – `vX.y.z → v(X+1).0.0`. All prior approvals are marked SUPERSEDED and must be re-obtained.
5. **Re-audit** – The full audit cycle in **03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md** restarts at iteration 1 against the new charter.

An amendment that fails any step is void, and any work performed under it is discarded.

## Rollback Procedures
1. **Detection** – Automated Auditor identifies a **Contradiction** entry or fingerprint mismatch.
2. **Immediate Halt** – Suspend all state transitions. Isolate any component that contributed to the contradiction.
3. **Checkpoint Retrieval** – Locate the most recent verified checkpoint.
4. **State Restoration** – Load checkpoint into a fresh execution environment. Re-initialize using the initialization parameters recorded in the checkpoint's Parameter Record.
5. **Verification** – Replay execution to the point of failure. Confirm restoration succeeds without divergence.
6. **Resolution** – If replay diverges, declare a critical failure and trigger safety halt, escalating to Tier 1 for `VETO` determination. If replay succeeds, classify as transient and resume normal execution.

## Completion Criteria
- **Initiation Complete** – All Assumption and Unknown entries documented; initial Evidence draft submitted and signed; domain parameters bound.
- **Planning Complete** – Preparation succeeds; every parameter bound and in range.
- **Authorization Complete** – G3 Decision Register entry present with valid Tier 1 signature.
- **Execution Complete** – All required evidence recorded; no unresolved Contradiction entries.
- **Validation Complete** – All Claim Validation entries satisfied; scores meet bound thresholds.
- **Closure Complete** – Final Decision Register entry marked COMPLETE; artifact archived with full version history.

## Terminal Statuses
A session concludes only with one of the following.

| Status | Issuing Authority | Entry Criteria | Required Register Entry | Resumable |
|--------|-------------------|----------------|-------------------------|-----------|
| `APPROVED FOR RESEARCH EXECUTION` | Human Approver | G3 APPROVE; zero open Critical findings. | Decision Register, Tier 1 signed | N/A — unlocks **04** |
| `RESEARCH COMPLETE` | Human Approver | G5 APPROVE; all **05** deliverables produced and signed. | Decision Register, status COMPLETE | No |
| `MORE RESEARCH REQUIRED` | AI Auditor | Stopping condition met, but Governance Score or Coverage below bound threshold. | Decision Register + Unknown Register entry per gap | Yes |
| `INCOMPLETE` | AI Auditor | Session halted by resource exhaustion, interruption, or missing input. Distinguished from `MORE RESEARCH REQUIRED` by *external* cause. | Session State with `currentPhase` set | Yes |
| `VETO` | **Human Approver only** | Immutable Directive violation, unresolvable contradiction, or safety halt. | Contradiction Register + Decision Register, Tier 1 signed | No — requires new session and new plan |

`VETO` may not be issued by the AI Auditor. An auditor detecting veto-grade conditions issues `INCOMPLETE`, records the condition in the Contradiction Register, and escalates to Tier 1.

---

## Templates

All example rows conform to **01_SYSTEM_CHARTER.md** § Identifier Grammar.

### Assumption Register
| ID | Assumption | Source | Verification Method | Status | Last Updated |
|----|------------|--------|---------------------|--------|--------------|
| ASM-2026-07-001 | All parameters are bound and within declared ranges. | Governance Setup | Parameter validation at G2 | VERIFIED | 2026-07-15 |

### Unknown Register
| ID | Unknown Question | Impact Assessment | Resolution Plan | Status | Owner |
|----|------------------|-------------------|-----------------|--------|-------|
| UNK-2026-07-001 | Effect of a new parameter binding on runtime performance. | Medium | Run controlled experiment; record results as Validation Evidence. | OPEN | Research Lead |

### Evidence Register
| ID | Evidence Type | Artifact ID | Hash | Signature | Signing Tier | Timestamp | Verifier |
|----|---------------|-------------|------|-----------|--------------|-----------|----------|
| EVT-2026-07-001 | Plan Evidence | ExecPlan-v1.0 | `sha256:abc…` | `sig:xyz…` | Tier 2 | 2026-07-12T08:30:00Z | AI Auditor |

### Decision Register
| ID | Decision | Gate | Rationale | Approver | Signing Tier | Timestamp | Status |
|----|----------|------|-----------|----------|--------------|-----------|--------|
| DEC-2026-07-001 | APPROVE – Execution Plan | G3 | All thresholds met; evidence complete (EVT-2026-07-001). | Human Approver | Tier 1 | 2026-07-13T14:00:00Z | APPROVED |
| DEC-2026-07-002 | PENDING-HUMAN – Final Acceptance | G5 | Auditor-prepared placeholder; awaiting Tier 1 signature. | (unsigned) | — | 2026-07-13T14:05:00Z | NOT APPROVED |

### Risk Register
| ID | Risk | Category | Probability | Impact | Mitigation | Owner | Status |
|----|------|----------|-------------|--------|------------|-------|--------|
| RSK-2026-07-001 | Parameter bound out of declared range | Technical | Medium | High | Re-bind within range; re-run scoring | Research Lead | MITIGATING |

### Contradiction Register
| ID | Contradiction Type | Description | Detected At | Evidence IDs | Resolution | Resolver | Timestamp |
|----|--------------------|-------------|-------------|--------------|------------|----------|-----------|
| CNTR-2026-07-001 | FingerprintMismatch | Computed `abc…` vs stored `def…` | 2026-07-14T09:15:00Z | EVT-2026-07-042, EVT-2026-07-043 | Rollback to checkpoint | AI Auditor | 2026-07-14T09:20:00Z |

### Coverage Matrix
| Component | Stage | Mandatory | Covered By | Evidence IDs | Verification Method | Coverage % |
|-----------|-------|-----------|------------|--------------|---------------------|------------|
| Execution Plan | Planning | Yes | Plan Evidence | EVT-2026-07-001, EVT-2026-07-002 | Hash verification | 100% |
| Parameter Record | Planning | Yes | Parameter Record | EVT-2026-07-003 | Range check | 100% |

The `Mandatory` column is the sole input to the Required Count derivation in § Governance Scoring.

### Source Matrix
| Source ID | Source Type | Location | Hash | Last Accessed | Status |
|-----------|-------------|----------|------|---------------|--------|
| SRC-2026-07-001 | Execution Log | `/logs/2026-07-12/run123.jsonl` | `sha256:ghi…` | 2026-07-13 | VALID |
| SRC-2026-07-002 | Parameter Record | `/params/execPlan.json` | `sha256:jkl…` | 2026-07-12 | VALID |

### Claim Validation Matrix
| Claim ID | Requirement | Test Case | Result | Pass/Fail | Evidence ID |
|----------|-------------|-----------|--------|-----------|-------------|
| CLM-2026-07-001 | Deterministic execution | Replay with same parameters | Identical state | Pass | EVT-2026-07-045 |
| CLM-2026-07-002 | Parameter bounds | Range check against **01** § Parameter Bindings | Within limits | Pass | EVT-2026-07-003 |

### Search Log
| Timestamp | Operation | Parameters | Result | Fitness | Parameter Set | Log ID |
|-----------|-----------|------------|--------|---------|---------------|--------|
| 2026-07-12T10:00:00Z | Parameter binding | `EVIDENCE_COMPLETENESS_THRESHOLD=95` | Success | N/A | ExecPlan-v1.0 | SLOG-2026-07-001 |

### Version History
| Version | Author | Timestamp | Change Summary | Parent Version | Status |
|---------|--------|-----------|----------------|----------------|--------|
| v1.0.0 | Protocol Designer | 2026-04-01 | Initial release | – | SUPERSEDED |
| v1.1.0 | Research Lead | 2026-04-08 | Added configurable thresholds | v1.0.0 | SUPERSEDED |
| v1.2.0 | Human Approver | 2026-04-13 | Approved for execution | v1.1.0 | SUPERSEDED |
| v2.0.0 | AI Auditor / Human Approver | 2026-07-29 | AMD-2026-07-001: bound parameters; corrected gate sequence; closed self-approval loop; added Directive 6; removed domain leakage; normative phase list; terminal statuses; directive amendment procedure; ID grammar. | v1.2.0 | SUPERSEDED |
| v3.0.0 | Human Approver (DEC-2026-07-021) | 2026-07-29T16:00:00-04:00 | AMD-2026-07-002: Directive 6 amended — public-key verification replaced by attributable Approval Record Schema; tier non-delegation preserved unchanged. Founding-act exception closed at DEC-2026-07-021. MIN-2026-07-001 evidence-directory integrity check added. | v2.0.0 | ACTIVE |

### Research Debt Register
| ID | Debt Description | Impact | Resolution Target | Owner | Status |
|----|------------------|--------|-------------------|-------|--------|
| DEBT-2026-07-001 | Unvalidated parameter interaction between scoring weights | Medium | Run full verification; document findings | Research Lead | OPEN |
| DEBT-2026-07-002 | Legacy v1.2.0 identifiers not migrated in archived artifacts | Low | Update documentation; archive old values | Engineering Lead | IN_PROGRESS |

---

*End of 02_GOVERNANCE_PROTOCOL.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to 03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md.**
