# 06_SESSION_STATE.md

**Protocol Version:** v3.0.0

## Purpose
Define a **reusable, machine-readable template** for tracking the state of a multi-session execution of the protocol. The template captures progress through the **eight** phases defined in **04_RESEARCH_EXECUTION_PROTOCOL.md** § Research Workflow, current operational context, active governance artifacts, and the steps required to safely resume or verify the session.

---

## Session State Schema
All fields are **required** unless otherwise noted.

```json
{
  "sessionId": "UUID",
  "protocolVersion": "v3.0.0",
  "timestamp": "ISO8601",
  "completedPhases": ["Phase1", "Phase2"],
  "currentPhase": "Phase3",
  "pendingPhases": ["Phase4", "Phase5", "Phase6", "Phase7", "Phase8"],
  "approvalStatus": {
    "executionPlan": "APPROVED|PENDING|REJECTED",
    "gateStatus": {
      "G1": "PASS",
      "G2": "PASS",
      "G3": "PENDING-HUMAN",
      "G4": "NOT_EVALUATED",
      "G5": "NOT_EVALUATED"
    },
    "gateAuthority": {
      "G1": "Tier2",
      "G2": "Tier2",
      "G3": "Tier1",
      "G4": "Tier2",
      "G5": "Tier1"
    }
  },
  "activeRegisters": {
    "EvidenceRegister": ["EVT-2026-07-001", "EVT-2026-07-002"],
    "DecisionRegister": ["DEC-2026-07-001"],
    "RiskRegister": ["RSK-2026-07-001"],
    "ContradictionRegister": [],
    "ResearchDebtRegister": ["DEBT-2026-07-001"]
  },
  "parameterRecord": {
    "evidenceId": "EVT-2026-07-003",
    "boundAt": "2026-07-12T08:00:00Z",
    "allParametersBound": true
  },
  "outstandingFindings": [
    {
      "findingId": "FND-2026-07-001",
      "category": "Governance",
      "severity": "Critical",
      "description": "Missing Decision Register entry for Gate G4.",
      "reference": "AUD-2026-07-001",
      "status": "OPEN"
    }
  ],
  "revisionHistory": [
    {
      "revisionId": "REV-2026-07-001",
      "timestamp": "2026-07-12T09:00:00Z",
      "author": "Human Approver",
      "signingTier": "Tier1",
      "changeSummary": "Added missing Decision Register entries for G1 and G2.",
      "parentVersion": "v1.1.0",
      "signature": "sig:abc123"
    }
  ],
  "executionPermissions": {
    "researchAllowed": false,
    "executionAllowed": false,
    "auditAllowed": true,
    "recoveryAllowed": true
  },
  "terminalStatus": null,
  "continuationChecklist": [
    "Verify that all completed phases have corresponding Decision Register entries.",
    "Confirm that the current phase's prerequisites are satisfied.",
    "Ensure no Critical findings remain in outstandingFindings.",
    "Verify every parameter is bound per 01_SYSTEM_CHARTER.md § Parameter Bindings and within min/max.",
    "Validate cryptographic signatures AND signing tiers on all active registers.",
    "Confirm no Tier 1 gate carries a Tier 2 signature (Directive 6).",
    "Check that the session state itself is signed and stored immutably."
  ],
  "resumeInstructions": [
    "1. Load the latest session state from immutable storage.",
    "2. Verify integrity using the Integrity Verification Checklist.",
    "3. Set executionPermissions.researchAllowed to true only if a Gate G3 Decision Register entry exists with Decision=APPROVE and SigningTier=Tier1. A PENDING-HUMAN entry never satisfies this condition.",
    "4. Re-initialize the appropriate domain (Research or Execution) using the initialization parameters recorded in the Parameter Record.",
    "5. Resume execution from the currentPhase state, replaying any logged steps up to the failure point.",
    "6. Update the session state after each successful transition."
  ],
  "integrityVerificationChecklist": [
    {
      "step": "Verify session state hash",
      "method": "Compute SHA-256 of the JSON document; compare to stored hash in Evidence Register.",
      "expected": "Match"
    },
    {
      "step": "Validate signatures and tiers on active registers",
      "method": "For each EvidenceID in activeRegisters, retrieve the artifact and verify its attribution: cryptographically against the registered public key where verificationMethod is cryptographic, or against the referenced sourceRecord where it is approval-record. Confirm the attributed tier matches the tier claimed by the entry.",
      "expected": "All records attributable; all tiers match claimed authority"
    },
    {
      "step": "Check phase consistency",
      "method": "Ensure completedPhases ∪ {currentPhase} ∪ pendingPhases = {Phase1…Phase8} exactly, with no duplicates, and that ordering respects the sequence in 04_RESEARCH_EXECUTION_PROTOCOL.md § Research Workflow.",
      "expected": "Consistent"
    },
    {
      "step": "Confirm parameter bindings",
      "method": "Verify parameterRecord.allParametersBound is true and every parameter in 01_SYSTEM_CHARTER.md § Parameter Bindings has a value within min/max.",
      "expected": "All bound and in range"
    },
    {
      "step": "Confirm approval status and authority",
      "method": "Verify approvalStatus.executionPlan is APPROVED and the underlying G3 entry carries SigningTier=Tier1 before allowing research execution.",
      "expected": "APPROVED, Tier1"
    },
    {
      "step": "Validate revision chain",
      "method": "Walk revisionHistory backwards; each entry's signature must verify against the previous entry's hash.",
      "expected": "Chain intact"
    }
  ]
}
```

---

## Field Definitions

### completedPhases
- **Description**: Phase identifiers that have been fully executed and closed.
- **Format**: Array of strings, ordered chronologically.
- **Reference**: **01_SYSTEM_CHARTER.md** § Phase Definitions; normative source **04_RESEARCH_EXECUTION_PROTOCOL.md** § Research Workflow (eight phases).

### currentPhase
- **Description**: The phase currently being executed or the point at which execution halted.
- **Format**: Single string matching a phase identifier from the normative eight.

### pendingPhases
- **Description**: Phases yet to be executed, in order.

### approvalStatus
- `executionPlan`: Overall approval state (`APPROVED`, `PENDING`, `REJECTED`).
- `gateStatus`: Mapping of `G1`–`G5` to `PASS`, `FAIL`, `PENDING-HUMAN`, or `NOT_EVALUATED`.
- `gateAuthority`: Fixed mapping of each gate to its required signing tier. G3 and G5 are Tier1 and may not be overridden.

### activeRegisters
- Lists of register IDs currently open. All IDs conform to **01_SYSTEM_CHARTER.md** § Identifier Grammar.

### parameterRecord
- Reference to the Evidence Register entry recording the one-time binding of all parameters at Governance Setup, plus a boolean assertion that the binding is complete. A session with `allParametersBound: false` cannot pass Gate G2.

### outstandingFindings
- Each finding includes `findingId` (`FND-` prefix), `category`, `severity`, `description`, `reference`, and `status` (`OPEN`, `IN_PROGRESS`, `RESOLVED`).

### revisionHistory
- Each entry contains `revisionId`, `timestamp`, `author`, `signingTier`, `changeSummary`, `parentVersion`, and `signature`.

### executionPermissions
- Boolean flags for `researchAllowed`, `executionAllowed`, `auditAllowed`, `recoveryAllowed`. `researchAllowed` may be set true only by the condition in `resumeInstructions` step 3.

### terminalStatus
- `null` while in flight; otherwise one of the values in **02_GOVERNANCE_PROTOCOL.md** § Terminal Statuses. Setting `VETO` requires a Tier 1 signature on the accompanying Decision Register entry.

### continuationChecklist
- Verification steps required before the session can be resumed. Executed by the operator or automated script before following `resumeInstructions`.

### integrityVerificationChecklist
- Formal verification steps ensuring the session state has not been tampered with and remains consistent with the protocol.

---

## Sample Session State Instance
State after completing Phase 4, with G3 authorization already granted.

```json
{
  "sessionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "protocolVersion": "v3.0.0",
  "timestamp": "2026-07-13T08:45:00Z",
  "completedPhases": ["Phase1", "Phase2", "Phase3", "Phase4"],
  "currentPhase": "Phase5",
  "pendingPhases": ["Phase6", "Phase7", "Phase8"],
  "approvalStatus": {
    "executionPlan": "APPROVED",
    "gateStatus": {
      "G1": "PASS",
      "G2": "PASS",
      "G3": "PASS",
      "G4": "NOT_EVALUATED",
      "G5": "NOT_EVALUATED"
    },
    "gateAuthority": {
      "G1": "Tier2",
      "G2": "Tier2",
      "G3": "Tier1",
      "G4": "Tier2",
      "G5": "Tier1"
    }
  },
  "activeRegisters": {
    "EvidenceRegister": ["EVT-2026-07-001", "EVT-2026-07-002", "EVT-2026-07-003"],
    "DecisionRegister": ["DEC-2026-07-001"],
    "RiskRegister": ["RSK-2026-07-001"],
    "ContradictionRegister": [],
    "ResearchDebtRegister": ["DEBT-2026-07-001"]
  },
  "parameterRecord": {
    "evidenceId": "EVT-2026-07-003",
    "boundAt": "2026-07-12T08:00:00Z",
    "allParametersBound": true
  },
  "outstandingFindings": [],
  "revisionHistory": [
    {
      "revisionId": "REV-2026-07-001",
      "timestamp": "2026-07-12T09:00:00Z",
      "author": "Human Approver",
      "signingTier": "Tier1",
      "changeSummary": "Granted G3 execution authorization.",
      "parentVersion": "v1.1.0",
      "signature": "sig:abc123"
    }
  ],
  "executionPermissions": {
    "researchAllowed": true,
    "executionAllowed": false,
    "auditAllowed": true,
    "recoveryAllowed": true
  },
  "terminalStatus": null,
  "continuationChecklist": [
    "Verify that all completed phases have corresponding Decision Register entries.",
    "Confirm that the current phase's prerequisites are satisfied.",
    "Ensure no Critical findings remain in outstandingFindings.",
    "Verify every parameter is bound per 01_SYSTEM_CHARTER.md § Parameter Bindings and within min/max.",
    "Validate cryptographic signatures AND signing tiers on all active registers.",
    "Confirm no Tier 1 gate carries a Tier 2 signature (Directive 6).",
    "Check that the session state itself is signed and stored immutably."
  ],
  "resumeInstructions": [
    "1. Load the latest session state from immutable storage.",
    "2. Verify integrity using the Integrity Verification Checklist.",
    "3. Set executionPermissions.researchAllowed to true only if a Gate G3 Decision Register entry exists with Decision=APPROVE and SigningTier=Tier1. A PENDING-HUMAN entry never satisfies this condition.",
    "4. Re-initialize the appropriate domain (Research or Execution) using the initialization parameters recorded in the Parameter Record.",
    "5. Resume execution from the currentPhase state, replaying any logged steps up to the failure point.",
    "6. Update the session state after each successful transition."
  ],
  "integrityVerificationChecklist": [
    {
      "step": "Verify session state hash",
      "method": "Compute SHA-256 of the JSON document; compare to stored hash in Evidence Register.",
      "expected": "Match"
    },
    {
      "step": "Validate signatures and tiers on active registers",
      "method": "For each EvidenceID in activeRegisters, retrieve the artifact and verify its attribution: cryptographically against the registered public key where verificationMethod is cryptographic, or against the referenced sourceRecord where it is approval-record. Confirm the attributed tier matches the tier claimed by the entry.",
      "expected": "All records attributable; all tiers match claimed authority"
    },
    {
      "step": "Check phase consistency",
      "method": "Ensure completedPhases ∪ {currentPhase} ∪ pendingPhases = {Phase1…Phase8} exactly, with no duplicates, and that ordering respects the sequence in 04_RESEARCH_EXECUTION_PROTOCOL.md § Research Workflow.",
      "expected": "Consistent"
    },
    {
      "step": "Confirm parameter bindings",
      "method": "Verify parameterRecord.allParametersBound is true and every parameter in 01_SYSTEM_CHARTER.md § Parameter Bindings has a value within min/max.",
      "expected": "All bound and in range"
    },
    {
      "step": "Confirm approval status and authority",
      "method": "Verify approvalStatus.executionPlan is APPROVED and the underlying G3 entry carries SigningTier=Tier1 before allowing research execution.",
      "expected": "APPROVED, Tier1"
    },
    {
      "step": "Validate revision chain",
      "method": "Walk revisionHistory backwards; each entry's signature must verify against the previous entry's hash.",
      "expected": "Chain intact"
    }
  ]
}
```

---

## Usage Guidelines
1. **Persistence** – Store the session state JSON in immutable storage (e.g., IPFS, Merkle-backed DB) and record its hash in the **Evidence Register**.
2. **Signing** – The entire JSON document must be signed with the current operator's private key; the signature and signing tier stored alongside.
3. **Versioning** – Each update appends a new entry to `revisionHistory` and increments a logical version identifier.
4. **Concurrency** – Conflicting modifications by multiple operators are resolved by requiring a new Human Approver signature and updating `revisionHistory` accordingly.
5. **Permission Escalation** – `researchAllowed` and `executionAllowed` may never be set true by an automated process on the basis of a `PENDING-HUMAN` entry. Doing so is a Directive 6 violation.

---

*End of 06_SESSION_STATE.md*

---

**Ready for next file.**

**Respond with `Continue` to proceed to MASTER_PROMPT.md.**
