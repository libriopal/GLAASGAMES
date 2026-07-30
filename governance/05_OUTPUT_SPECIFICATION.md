# 05_OUTPUT_SPECIFICATION.md

**Protocol Version:** v3.0.0

## Introduction
This document defines the **required deliverables** for any research execution run under the protocol. Each deliverable is described in terms of its **purpose**, **structure**, **required fields**, **format**, and **cross-references**. All outputs must be stored in immutable storage, signed cryptographically with the signing tier recorded, and registered in the appropriate governance registers.

All identifiers conform to **01_SYSTEM_CHARTER.md** § Identifier Grammar: `^[A-Z]{3,4}-\d{4}-\d{2}-\d{3}$`.

---

## 1. Executive Summary
### Purpose
Provide a high-level overview for stakeholders, summarizing project status, key findings, and next steps.

### Structure
- **Project Identification** – name, date range, version.
- **Overall Status** – a terminal or in-flight status defined in **02_GOVERNANCE_PROTOCOL.md** § Terminal Statuses.
- **Key Findings** – bullet list of critical outcomes (e.g., governance score, verification consistency).
- **Next Steps** – concise action items with owners.

### Required Fields
| Field | Description |
|-------|-------------|
| `ProjectName` | Human-readable name of the research effort. |
| `ReportDate` | ISO 8601 timestamp of summary creation. |
| `Version` | Protocol version (e.g., `v3.0.0`). |
| `OverallStatus` | One of `IN_PROGRESS`, `MORE RESEARCH REQUIRED`, `INCOMPLETE`, `RESEARCH COMPLETE`, `VETO`. |
| `KeyFindings` | Array of summary statements, each referencing an `EVT-` ID. |
| `NextSteps` | Array of action items; each contains `Action`, `Owner`, `DueDate`. |

### Format
- Plain text, maximum 250 words. Stored as `ExecutiveSummary.md`.
- Signed by the Human Approver; signature and signing tier embedded at the end.

### Cross-References
Links to **Audit Report** and **Governance Scorecard**; references the **Decision Register** entries that authorized the current phase.

---

## 2. Executive Assessment
### Purpose
Provide a concise evaluation of how the research meets its success criteria.

### Required Fields
| Field | Description |
|-------|-------------|
| `CriterionID` | Unique identifier (e.g., `CLM-2026-07-001`). |
| `CriterionName` | Human-readable name (e.g., "Verification Consistency"). |
| `Rating` | `PASS`, `CONDITIONAL`, or `FAIL`. |
| `EvidenceIDs` | List of `EVT-` IDs supporting the rating. |
| `Rationale` | Textual explanation. |

### Format
Markdown table, stored as `ExecutiveAssessment.md`. Each row signed with the assessor's signature and tier.

---

## 3. Audit Report
### Purpose
Document each audit cycle, including scope, findings, and resolution actions.

### Required Fields
| Field | Description |
|-------|-------------|
| `AuditID` | e.g., `AUD-2026-07-001`. |
| `Trigger` | Reason for audit (e.g., "Fingerprint mismatch"). |
| `Scope` | List of artifacts and time window audited. |
| `Findings` | Array of Finding objects per **03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md** § Findings Template. |
| `ResolutionActions` | Description of remediation steps. |
| `Auditor` | Identity and tier of the auditor. |
| `Timestamp` | ISO 8601 completion time. |
| `Signature` | Cryptographic signature of the auditor. |

### Format
JSON object stored as `AuditReport_<AuditID>.json`. Each Evidence Register entry must reference the corresponding `AuditID`.

---

## 4. Research Report
### Purpose
Provide a comprehensive narrative of research activities, methodology, and outcomes.

### Structure
Introduction · Methodology · Results · Discussion · Appendices (raw data, search logs, full evidence list).

### Required Fields
| Field | Description |
|-------|-------------|
| `ReportID` | e.g., `RPT-2026-07-001`. |
| `Phase` | One of the eight phases in **04_RESEARCH_EXECUTION_PROTOCOL.md** § Research Workflow. |
| `SearchMethod` | Description of algorithm and bound parameters. |
| `PopulationStats` | JSON object with `Generations`, `PopulationSize`, `AvgFitness`. |
| `FitnessTrends` | Array of per-generation fitness values. |
| `EvidenceIDs` | List of `EVT-` IDs generated during the phase. |
| `SearchLogID` | Reference to a **Search Log** entry (`SLOG-`), template defined in **02_GOVERNANCE_PROTOCOL.md** § Templates. |

### Format
Markdown stored as `ResearchReport_<ReportID>.md`. All numeric data must be reproducible via the recorded parameters.

### Cross-References
References **Evidence Register** and the **Search Log** template in **02_GOVERNANCE_PROTOCOL.md** § Templates. Cites **Domain Decomposition** and **Query Planning** from **04_RESEARCH_EXECUTION_PROTOCOL.md**.

---

## 5. Evidence Register
### Purpose
Immutable ledger for all evidence artifacts generated during research and governance.

### Required Fields
| Field | Description |
|-------|-------------|
| `EvidenceID` | e.g., `EVT-2026-07-001`. |
| `Type` | `Plan`, `Execution`, `Fitness`, `Validation`, or `Decision`. |
| `ArtifactHash` | SHA-256 hash of the artifact. |
| `Signature` | Cryptographic signature of the creator. |
| `SigningTier` | Tier of the signing authority. |
| `Timestamp` | ISO 8601 creation time. |
| `Verifier` | Identity that verified the artifact (optional). |
| `ArtifactPath` | Immutable storage location (e.g., IPFS CID). |

### Format
Markdown table stored as `EvidenceRegister.md`. Every **Decision Register** entry must reference one or more `EvidenceID`s.

---

## 6. Validation Matrix
### Required Fields
| Field | Description |
|-------|-------------|
| `RequirementID` | Identifier from the specification (e.g., `REQ-001`). |
| `RequirementText` | Human-readable description. |
| `VerificationMethod` | Technique used (e.g., formal verification, test). |
| `Result` | `PASS`, `FAIL`, or `INCONCLUSIVE`. |
| `EvidenceIDs` | List of `EVT-` IDs substantiating the result. |

### Format
Markdown table stored as `ValidationMatrix.md`. Signed by the validation authority. Summarized in the **Implementation Readiness Report**.

---

## 7. Coverage Matrix
### Required Fields
| Field | Description |
|-------|-------------|
| `Metric` | e.g., `SearchCoverage`, `EvidenceCompleteness`. |
| `Stage` | Lifecycle stage the row applies to. |
| `Mandatory` | `Yes`/`No` — sole input to the Required Count derivation. |
| `Achieved` | Numeric value. |
| `Target` | Threshold from **01_SYSTEM_CHARTER.md** § Parameter Bindings. |
| `Status` | `MET` or `NOT_MET`. |

### Format
Markdown table stored as `CoverageMatrix.md`. Each metric references the contributing **Evidence Register** entries.

---

## 8. Source Matrix
### Required Fields
| Field | Description |
|-------|-------------|
| `SourceID` | e.g., `SRC-2026-07-001`. |
| `SourceType` | `Repository`, `Dataset`, `ExternalTool`. |
| `Location` | Immutable reference (e.g., IPFS CID). |
| `Hash` | SHA-256 hash. |
| `LastAccessed` | ISO 8601 timestamp. |
| `Status` | `VALID`, `SUPERSEDED`, or `DEPRECATED`. |

### Format
Markdown table stored as `SourceMatrix.md`. Referenced by **Citation Chaining** in **04_RESEARCH_EXECUTION_PROTOCOL.md**.

---

## 9. Decision Register
### Required Fields
| Field | Description |
|-------|-------------|
| `DecisionID` | e.g., `DEC-2026-07-001`. |
| `Gate` | Gate identifier matching `^G[1-5]$`. |
| `Decision` | `APPROVE`, `REJECT`, `CONDITIONAL`, or `PENDING-HUMAN`. |
| `Rationale` | Explanation referencing `EVT-` IDs. |
| `Approver` | Signature or identifier; `(unsigned)` for `PENDING-HUMAN`. |
| `SigningTier` | Must match the gate's required authority. |
| `Timestamp` | ISO 8601. |
| `Status` | `APPROVED`, `NOT APPROVED`, `SUPERSEDED`, or `REJECTED`. |

### Format
Markdown table stored as `DecisionRegister.md`.

**Constraint:** For Gates G3 and G5, `SigningTier` must be Tier 1. An entry failing this check is void and triggers the Approval Delegation Attempt path in **01_SYSTEM_CHARTER.md** § Failure Handling.

---

## 10. Risk Register
### Required Fields
`RiskID` (e.g., `RSK-2026-07-001`) · `Description` · `Category` · `Probability` · `Impact` · `MitigationPlan` · `Owner` · `Status` (`OPEN`, `MITIGATING`, `RESOLVED`, `CLOSED`).

### Format
Markdown table stored as `RiskRegister.md`. Each entry reviewed and signed by the Owner.

---

## 11. Assumption Register
### Required Fields
`AssumptionID` (e.g., `ASM-2026-07-001`) · `Text` · `Source` · `VerificationMethod` · `Status` (`UNVERIFIED`, `VERIFIED`, `INVALID`).

### Format
Markdown table stored as `AssumptionRegister.md`. Each entry signed by the author.

---

## 12. Unknown Register
### Required Fields
`UnknownID` (e.g., `UNK-2026-07-001`) · `Question` · `Impact` · `InvestigationPlan` · `Status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `ABANDONED`).

### Format
Markdown table stored as `UnknownRegister.md`. Reviewed periodically.

---

## 13. Contradiction Register
### Required Fields
`ContradictionID` (e.g., `CNTR-2026-07-001`) · `Type` (`FingerprintMismatch`, `SafetyViolation`, `EvidenceConflict`, `DirectiveViolation`, `ApprovalDelegation`) · `Description` · `DetectionPoint` · `EvidenceIDs` · `Resolution` · `Resolver` · `Timestamp`.

### Format
Markdown table stored as `ContradictionRegister.md`. Each entry signed by the Resolver.

A `DirectiveViolation` or `ApprovalDelegation` entry blocks all gates until resolved by Tier 1.

---

## 14. Research Debt Register
### Required Fields
`DebtID` (e.g., `DEBT-2026-07-001`) · `Description` · `Impact` · `TargetDate` · `Owner` · `Status`.

### Format
Markdown table stored as `ResearchDebtRegister.md`.

---

## 15. Reliability Scorecard
### Required Fields
`Metric` · `Value` · `Target` (from **01** § Parameter Bindings) · `Status` (`MET`/`NOT_MET`).

### Format
Markdown table stored as `ReliabilityScorecard.md`. Each metric references underlying **Evidence Register** entries.

---

## 16. Governance Scorecard
### Required Fields
`Metric` · `Value` · `Target` · `Status`.

Must include, at minimum: `EvidenceCompleteness`, `ValidationConsistency`, `RiskMitigation`, `GovernanceScore`, and the `RequiredCountDerivation` evidence ID.

### Format
Markdown table stored as `GovernanceScorecard.md`. The **Implementation Readiness Report** requires all governance metrics to be `MET`.

---

## 17. Implementation Readiness Report
### Required Fields
| Field | Description |
|-------|-------------|
| `CandidateID` | e.g., `CAND-2026-07-001`. |
| `Criteria` | Array of `{CriterionName, Requirement, VerificationResult, EvidenceIDs}`. |
| `OverallStatus` | `READY` or `NOT_READY`. |
| `Approver` | Signature of the approving authority. |
| `SigningTier` | Must be Tier 1 for `READY`. |
| `Timestamp` | ISO 8601 approval time. |

### Format
Markdown stored as `ImplementationReadiness_<CandidateID>.md`. References **Validation Matrix**, **Evidence Register**, **Decision Register**, and both scorecards.

---

## 18. Recommendations
### Required Fields
`RecID` (e.g., `REC-2026-07-001`) · `Description` · `Priority` (`HIGH`/`MEDIUM`/`LOW`) · `Owner` · `DueDate`.

### Format
Markdown table stored as `Recommendations.md`. Signed by the Owner upon acceptance.

---

## 19. Open Questions
### Required Fields
`QuestionID` (e.g., `OQ-2026-07-001`) · `Question` · `Impact` · `InvestigationPlan` · `Status`.

### Format
Markdown table stored as `OpenQuestions.md`. Reviewed periodically; may be promoted to the **Research Debt Register**.

---

## 20. Version History
### Required Fields
`Version` · `Author` · `Timestamp` · `ChangeSummary` · `ParentVersion` · `Status` (`ACTIVE`, `SUPERSEDED`, `DEPRECATED`).

### Format
Markdown table stored as `VersionHistory.md`. Each entry signed by the Author. Amendments to IMMUTABLE directives must show a major version increment per **02_GOVERNANCE_PROTOCOL.md** § Directive Amendment.

---

### Storage and Signature Requirements
- All output files reside in a dedicated directory (e.g., `/outputs/<ProjectName>/`).
- Each file is signed; the signature and **signing tier** are stored alongside the file.
- The **Evidence Register** must contain an entry for each output file, linking the file's hash to its signature and storage location.
- Files requiring a Tier 1 approval record (Executive Summary, Implementation Readiness Report with `READY`, G3/G5 Decision Register entries) may not be finalized by the AI Auditor.

### Evidence Directory Integrity *(MIN-2026-07-001)*
Every artifact placed in the evidence or output directory must have a corresponding Evidence Register entry carrying: `ArtifactID`, `filename`, `version`, `creationTimestamp`, `author` and tier, `sourceRecord`, `hash`, and `lifecycleStatus`. An artifact present on disk without a register entry is an **orphan** and must be quarantined pending attribution — it may not be cited, promoted, or treated as evidence. This check is required because the output directory persists across regenerated responses while the conversation record may not.

---

*End of 05_OUTPUT_SPECIFICATION.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to 06_SESSION_STATE.md.**
