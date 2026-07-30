# 00_README.md

**Protocol Version:** v3.0.0
**Supersedes:** v2.0.0 (AMD-2026-07-002); v1.2.0 (AMD-2026-07-001)

## Assembly Instructions
The operational package is **not** a concatenation. Files 00–06 and `MASTER_PROMPT.md` are supplied to the auditor as separate attachments alongside the execution-plan PDF.

An optional single-document reference copy (`MASTER_PROTOCOL.md`) may be produced by concatenating 00–06 in numeric order. This copy has **no operational role**; it exists for human reading and offline review only. Do not use it as the governing input.

- **Concatenation Method (reference copy only)**: `cat 00_README.md 01_SYSTEM_CHARTER.md … > MASTER_PROTOCOL.md`
- **No Modification**: Do not alter the content of any individual file when producing the reference copy.
- **Validation**: Verify that each top-level heading (`#`) appears exactly once per file and that internal cross-references remain valid.

## Document Map
| File | Purpose |
|------|---------|
| **00_README.md** | Overview, assembly instructions, and continuation guidance. |
| **01_SYSTEM_CHARTER.md** | Auditor identity, mission, authority hierarchy, immutable directives, phase definitions, identifier grammar, parameter bindings, operational modes, governance philosophy, quality standards, approval requirements, failure handling, execution constraints. |
| **02_GOVERNANCE_PROTOCOL.md** | Governance lifecycle, audit methodology, approval gates, revision methodology, governance scoring, evidence standards, validation methodology, traceability, risk management, change control, directive amendment, rollback procedures, completion criteria, terminal statuses; templates for registers and matrices. |
| **03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md** | Instructions for the auditor to audit, identify deficiencies, rewrite, and iterate an attached execution-plan PDF until it reaches **APPROVED FOR RESEARCH EXECUTION**. |
| **04_RESEARCH_EXECUTION_PROTOCOL.md** | Locked research workflow; normative source of the eight-phase list; becomes active only after explicit Tier 1 approval recorded at Gate G3. |
| **05_OUTPUT_SPECIFICATION.md** | Required deliverables for any research execution run (Executive Summary, Audit Report, Evidence Register, etc.). |
| **06_SESSION_STATE.md** | Continuation state template for multi-session execution; includes completed phases, pending items, approval status, active registers, and resume instructions. |
| **MASTER_PROMPT.md** | Standalone session directive. Invokes files 00–06 as attachments alongside the execution-plan PDF; is **not** a concatenation of them. |

## Purpose
This protocol package provides a **complete, production-ready governance and execution framework** for auditing and executing deterministic, replicable systems. It enforces strict separation between the audit/execution governance layer and the research content layer, ensuring that the auditor operates on a generic protocol without assuming domain-specific details. The framework supports:

- **Audit-First Governance**: All actions are governed by an audit process that validates evidence before execution.
- **Bound Parameters**: Every governance threshold has a declared default, minimum, and maximum in **01_SYSTEM_CHARTER.md** § Parameter Bindings. Domain-scoped parameters are bound by the execution plan.
- **Approval Non-Delegation**: No tier may satisfy an approval record on behalf of a higher tier.
- **Deterministic Execution**: Once approved, execution follows a deterministic state machine replication model.
- **Reproducible Workflows**: All steps are logged, signed, and verifiable.

## Usage Instructions
1. **Distribute the Package**
   - Supply files 00–06, `MASTER_PROMPT.md`, and the execution-plan PDF as attachments in a single session.
   - Optionally produce `MASTER_PROTOCOL.md` as a human-readable reference copy.

2. **Review Governance Foundations**
   - Read **01_SYSTEM_CHARTER.md** and **02_GOVERNANCE_PROTOCOL.md** to understand authority, approval processes, and compliance requirements.
   - Confirm every parameter in § Parameter Bindings is bound and within range. Unbound parameters fail G2.
   - Ensure all participants acknowledge the charter's immutable directives.

3. **Audit the Execution Plan**
   - Use **03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md** to instruct the auditor to audit the attached execution-plan PDF.
   - Iterate the rewrite cycle until no Critical Findings remain.
   - The auditor may sign Tier 2 gate decisions (G1, G2, G4) only. Gates G3 and G5 require a Human Approver signature applied out-of-band.

4. **Unlock and Execute Research**
   - Research unlocks only when a Tier 1–signed Decision Register entry records **APPROVED FOR RESEARCH EXECUTION** at Gate G3.
   - Follow the workflow in **04_RESEARCH_EXECUTION_PROTOCOL.md**, recording state in **06_SESSION_STATE.md**.

5. **Generate Deliverables**
   - Produce all outputs specified in **05_OUTPUT_SPECIFICATION.md**.
   - Populate the registers and matrices referenced in **02_GOVERNANCE_PROTOCOL.md** with actual evidence and decisions.

6. **Close the Session**
   - Conclude only with a terminal status defined in **02_GOVERNANCE_PROTOCOL.md** § Terminal Statuses.

## Dependency Order
- **00_README.md** – No dependencies.
- **01_SYSTEM_CHARTER.md** – Prerequisite for all subsequent files; sole source of parameter bindings, identifier grammar, and phase list reference.
- **02_GOVERNANCE_PROTOCOL.md** – Depends on charter definitions; provides gates, terminal statuses, and templates used throughout.
- **03_EXECUTION_PLAN_REWRITE_DIRECTIVE.md** – Requires governance definitions to identify deficiencies.
- **04_RESEARCH_EXECUTION_PROTOCOL.md** – Normative phase list; locked until G3 approval is recorded.
- **05_OUTPUT_SPECIFICATION.md** – Depends on all preceding files to define required outputs.
- **06_SESSION_STATE.md** – Used during execution; references registers defined in **02** and phases defined in **04**.
- **MASTER_PROMPT.md** – Session directive; references all files, does not contain them.

## Execution Flow
| Phase | Action | Input | Output |
|-------|--------|-------|--------|
| **A – Distribution** | Attach package | Individual `.md` files + PDF | Session context |
| **B – Charter Review** | Approve charter; bind parameters | `01_SYSTEM_CHARTER.md` | Signed approval record, Parameter Record |
| **C – Governance Setup** | Populate registers | `02_GOVERNANCE_PROTOCOL.md` templates | Empty registers ready for evidence |
| **D – Execution-Plan Audit** | Run rewrite directive | Execution-plan PDF + `03` | Revised plan, zero Critical Findings |
| **E – G3 Authorization** | Human Approver signs | Revised plan, Evidence Register | **APPROVED FOR RESEARCH EXECUTION** |
| **F – Research Execution** | Follow `04` | Approved plan, registers | Research results, evidence |
| **G – Deliverable Generation** | Produce outputs per spec | Research results, registers | All deliverables in `05` |
| **H – State Capture & Closure** | Update session state; issue terminal status | Current progress | Updated `06`, Decision Register closure entry |

## Continuation Guidance
- **If generation stops** at any point, respond with the single word **`Continue`**.
- The assistant will **resume exactly where it left off**, continuing with the next required file or section. Do not restart completed work.
- **Integrity Verification**: After each file or artifact is generated, verify that:
  - All required sections are present.
  - Headings follow the hierarchy (`#` for file title, `##` for major sections, `###` for subsections).
  - Cross-references use the correct file name (e.g., *see 02_GOVERNANCE_PROTOCOL.md*).
  - All identifiers conform to the grammar in **01_SYSTEM_CHARTER.md** § Identifier Grammar.
- **Do not** edit previously generated files unless explicitly instructed to rewrite a specific section. Corrections to approved artifacts proceed through **02** § Change Control or § Directive Amendment.

---

*End of 00_README.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to 01_SYSTEM_CHARTER.md.**
