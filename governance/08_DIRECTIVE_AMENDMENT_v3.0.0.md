# 08_DIRECTIVE_AMENDMENT_v3.0.0.md

**Amendment ID:** AMD-2026-07-002
**Parent Version:** v2.0.0
**Proposed Version:** **v3.0.0** (major increment — see §1)
**Author:** AI Auditor (Tier 2)
**Status:** **PROPOSED** — steps 1–2 of `02` § Directive Amendment complete; steps 3–5 require Tier 1
**Origin:** Tier 1 Decision D0 (Signature Mechanism)

---

## 1. Why this is a major increment, not a v2.1.0 patch

D0 asks to replace public-key verification with an attributable in-session approval record. I expected to apply that under ordinary Change Control. It doesn't qualify.

The public-key requirement appears in three places, and one of them is inside an **Immutable Directive**:

| Location | Text | Class |
|----------|------|-------|
| `01` § Immutable Directives, **Directive 6** | "Tier 1 approvals require a Tier 1 signature verified against the registered Human Approver **public key**." | **IMMUTABLE** |
| `01` § Execution Constraints | "Signatures must be verified against the **public key** of the signing authority." | Ordinary |
| `02` § Evidence Standards → Verification Requirements | "Evidence must be verifiable using **publicly available keys**." | Ordinary |

Amending Directive 6 triggers `02` § Directive Amendment: contradiction sweep, impact statement, Tier 1 signature, **major version increment**, and re-audit restarting at iteration 1.

I could have argued that the public-key phrase is mere implementation detail and the directive's real substance is non-delegation — leaving the principle intact while swapping the mechanism. I'm not going to. That reading is available, it's convenient, and adopting it unilaterally would be exactly the "silently change methodology" failure the protocol prohibits. The text says public key; changing it is an amendment.

**The cost is near zero right now.** D1 elected `REJECTED FOR REVISION`, which already sends the plan back for a re-audit cycle. A directive amendment sends it to iteration 1 instead of iteration 2 — a difference of essentially nothing at this moment. Six decisions later, after remediation work has accumulated against v2.0.0, the same amendment would be expensive. This is the cheapest hour to make it.

---

## 2. Contradiction Sweep *(step 1 — complete)*

Every clause depending on public-key verification:

| ID | Dependent Clause | Effect of Amendment | Resolution |
|----|-----------------|---------------------|------------|
| CNTR-2026-07-008 | `01` Directive 6 — public-key verification of Tier 1 approvals | Mechanism replaced; non-delegation principle preserved unchanged | Replacement text §4.1 |
| CNTR-2026-07-009 | `01` § Execution Constraints — signature verification against public key | Broadened to admit attributable approval records | Replacement text §4.2 |
| CNTR-2026-07-010 | `02` § Evidence Standards — "verifiable using publicly available keys" | Broadened; hash-chain and tier-match requirements retained | Replacement text §4.3 |
| CNTR-2026-07-011 | `02` § Approval Gates → Tier 1 Gate Handling — "replaced by a Tier 1–signed entry" | No change needed; "signed" now resolves through the amended definition | None |
| CNTR-2026-07-012 | `05` § 9 Decision Register — `SigningTier` must be Tier 1 for G3/G5 | No change needed; tier attribution is mechanism-independent | None |
| CNTR-2026-07-013 | `06` integrity checklist — "verify signature against the registered public key for the claimed signing tier" | Verification step must accept approval records | Replacement text §4.4 |
| CNTR-2026-07-014 | `03` § Comparison Criteria — validate Human Approver Signature against public key | Same | Replacement text §4.5 |

**Sweep result:** seven dependent clauses, five requiring textual change, two resolving automatically. No clause is invalidated in substance — every one of them is about *attribution and tier*, and attribution survives the mechanism change intact.

---

## 3. Impact Statement *(step 2 — complete, Tier 2 signed)*

**Artifacts whose approval status this amendment invalidates:**

| Artifact | Current Status | Post-Amendment |
|----------|---------------|----------------|
| Protocol package v2.0.0 (files 00–06) | ACTIVE | SUPERSEDED by v3.0.0 |
| EXECUTION_PLAN_v2.0.0-rc1 | REJECTED FOR REVISION | Unchanged — already in revision; re-audit restarts at iteration 1 rather than 2 |
| DEC-2026-07-010 (G1 APPROVE, Tier 2) | APPROVED | Re-evaluation required under v3.0.0 |
| DEC-2026-07-011 (G2 REJECT, Tier 2) | REJECTED | Unchanged — parameters still unratified |
| DEC-2026-07-013 … -015 (Tier 2 procedural) | ACTIVE | Unchanged — no dependence on signature mechanism |
| **DEC-2026-07-018, -019 (Tier 1, D0 and D1)** | APPROVED | **See §5 — bootstrap issue** |
| All Tier 2 auditor signatures to date | Valid | Valid — auditor signing is unaffected |

No research evidence exists to invalidate. Nothing of substance is lost.

`sig:auditor:AMD-2026-07-002` — Tier 2, 2026-07-29

---

## 4. Proposed Replacement Text

### 4.1 `01` § Immutable Directives, Directive 6

> 6. **Approval Non-Delegation** – No tier may create, sign, or satisfy an approval record on behalf of a higher tier. Tier 1 approvals require an **attributable Tier 1 approval record** conforming to `02` § Evidence Standards → Approval Record Schema. An unsigned, unattributed, or `PENDING-HUMAN` entry never satisfies a Tier 1 gate.

### 4.2 `01` § Execution Constraints, signature clause

> - **Signature Verification**: Every signature or approval record must be attributable to its claimed signing authority and verifiable against the record of that authority. Cryptographic verification against a registered public key is used where keys exist; where they do not, an attributable approval record per `02` § Evidence Standards is sufficient. The auditor may attribute records only to Tier 2.

### 4.3 `02` § Evidence Standards → Verification Requirements

> - **Verification Requirements**
>   - Evidence must be verifiable by an independent party against a durable record: a public key where one exists, or an attributable approval record otherwise.
>   - Hash chains must link each evidence item to the current state fingerprint.
>   - Signing authority must match the tier claimed by the entry.
>   - Verification method (`cryptographic` | `approval-record`) must be stated on each entry.

**New subsection, `02` § Evidence Standards:**

> ### Approval Record Schema
> An attributable approval record substitutes for a cryptographic signature where keys are unavailable. It must contain, at minimum:
>
> | Field | Requirement |
> |-------|-------------|
> | `artifactVersion` | Exact version of the artifact approved |
> | `decisionId` | Decision Register ID |
> | `approvingAuthority` | Named identity and tier |
> | `decisionText` | The approval statement, verbatim |
> | `timestamp` | ISO 8601 |
> | `scope` | What the approval does and does not cover |
> | `verificationMethod` | `approval-record` |
> | `sourceRecord` | Pointer to the authoritative conversation or commit record containing the statement |
>
> A record missing any field is not attributable and does not satisfy a Tier 1 gate. Cryptographic signatures remain preferred and may be used at any time; they do not require this schema.

### 4.4 `06` integrity checklist, signature validation step

> "For each EvidenceID in activeRegisters, retrieve the artifact and verify its attribution: cryptographically against the registered public key where `verificationMethod` is `cryptographic`, or against the referenced source record where it is `approval-record`. Confirm the attributed tier matches the tier claimed by the entry."

### 4.5 `03` § Comparison Criteria, signature validation

> "Validate the Auditor Signature against the auditor key. Validate the Human Approver approval record, if present, against `02` § Evidence Standards → Approval Record Schema. Absence of the latter is expected prior to G3 and is not a finding."

---

## 5. Bootstrap Issue — requires explicit ratification

DEC-2026-07-018 established the in-session approval mechanism. It was itself recorded under that mechanism — which did not yet exist when it was made. The approval that created the standard was issued under the standard it created.

This is the same defect class as the unsigned VETO: a governance act whose validity depends on a rule not yet in force. It is not fatal and it is trivially fixable, but it should not pass silently into the chain.

Two clean resolutions, either acceptable:

☐ **A — Re-affirm.** Tier 1 re-issues D0 and D1 as approval records conforming to §4.3's schema, once v3.0.0 is in force. The originals are marked SUPERSEDED; the re-issued records are the first valid ones.

☐ **B — Ratify the bootstrap.** Tier 1 explicitly declares DEC-2026-07-018 and -019 valid as founding acts, with a Decision Register entry stating that the bootstrap was intentional. This is a legitimate move — constitutions generally cannot be ratified under their own procedures — but it must be *stated*, not assumed.

*Auditor recommendation: B, with the entry recorded. It is honest about what happened and costs one register entry rather than a re-signing cycle.*

---

## 6. Remaining Steps

| Step | Owner | Status |
|------|-------|--------|
| 1. Contradiction sweep | AI Auditor | **COMPLETE** (§2) |
| 2. Impact statement | AI Auditor | **COMPLETE** (§3) |
| 3. Tier 1 signature on this amendment | **Human Approver** | **PENDING** |
| 4. Major version increment to v3.0.0 | On signature | PENDING |
| 5. Re-audit restart at iteration 1 | AI Auditor | PENDING |

Plus §5 bootstrap election (A or B).

Until step 3, this amendment is void and v2.0.0 remains in force — which means the public-key requirement is still the operative rule and no Tier 1 gate can currently be satisfied at all.

---

*End of 08_DIRECTIVE_AMENDMENT_v3.0.0.md*
