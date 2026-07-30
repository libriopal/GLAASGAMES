# TIER1_APPROVAL_RECORD_AMD-2026-07-002.md

**Status:** UNISSUED — awaiting Tier 1 statement
**Prepared by:** AI Auditor (Tier 2) as a form. Preparing a form is not signing it.

---

## Record

| Field | Value |
|-------|-------|
| `artifactVersion` | AMD-2026-07-002, as published in `08_DIRECTIVE_AMENDMENT_v3.0.0.md` |
| `decisionId` | DEC-2026-07-021 |
| `approvingAuthority` | Human Project Owner — Tier 1 |
| `decisionText` | *"I approve AMD-2026-07-002. Protocol v2.0.0 is superseded; v3.0.0 is active. I elect bootstrap Option B: DEC-2026-07-018, DEC-2026-07-019, and DEC-2026-07-020 are ratified as founding governance acts that could not have been governed by the mechanism they created. Scope is the signature mechanism only — no other directive, gate, parameter, or finding is altered. Research execution remains LOCKED."* |
| `timestamp` | *(to be set at issuance)* |
| `scope` | Signature/verification mechanism only. Does **not** approve: the execution plan, any parameter binding (D6), the scoring rubric (D7), or any open finding. |
| `verificationMethod` | `approval-record` |
| `sourceRecord` | This conversation, the turn in which the statement is made |

---

## Bootstrap coverage under Option B

Three entries are covered, not two:

| Entry | Act | Why it's in the bootstrap |
|-------|-----|---------------------------|
| DEC-2026-07-018 | Established the in-session approval mechanism | Recorded under the mechanism it created |
| DEC-2026-07-019 | Elected `REJECTED FOR REVISION` | Issued under that same not-yet-valid mechanism |
| **DEC-2026-07-020** | Ratified the bootstrap | Invalid under v2.0.0 (no public key), and v3.0.0 wasn't in force when drafted |

DEC-2026-07-021 — this record — is the first entry issued *after* v3.0.0 activates, and is therefore the first ordinarily valid Tier 1 approval in the protocol's history. Everything before it is a founding act.

---

## On issuance

| Item | Transition |
|------|-----------|
| AMD-2026-07-002 | PROPOSED → ACCEPTED |
| Protocol v2.0.0 | ACTIVE → SUPERSEDED |
| Protocol v3.0.0 | — → ACTIVE |
| Files 00–06 | Amended per `08_DIRECTIVE_AMENDMENT_v3.0.0.md` §4.1–4.5 |
| EXECUTION_PLAN_v2.0.0-rc1 | REJECTED FOR REVISION (unchanged) |
| Audit cycle | Restart at iteration 1 under v3.0.0 |
| Research execution | LOCKED (unchanged) |
| Open decisions | D2–D8 remain |

---

## Then what

Amendment step 5 is a re-audit, which I can run immediately — it's a conformance pass over artifacts that already exist, not new research.

Of the remaining decisions, three need nothing from outside this session and I can prepare them on request:

- **D8** — draft the negative search provision (rejection corpus, failure taxonomy, counterexample retention) for plan §6
- **D7** — the rubric is written; ratification is a yes
- **D5** — a choice between two stated models, not a research question

**D2, D3, D4** are the real work, and they're yours: a bibliography, the 42% election, and the `|S₀|` seed corpus. Those are artifacts to build, not decisions to make, and they're what actually stands between this plan and G3.
