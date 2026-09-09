# Next steps, round two

Items 1–5 of `next-steps.md` are done, audited, revised to approval, and green.
This is the next protocol run, and the first row of the new list is a
**calendar** constraint that no amount of engineering shortens.

---

## What changed, and what the auditor made me change

| | Before | After |
|---|---|---|
| Gating checks | 17 | **19** |
| Oracles proven able to fail | 11 of 43 | **11 curated + 19 coverage-probed** |
| Persistence / onboarding / a11y | none | all three, with negative controls |
| Inference value (learner vs model-off) | −1.1% | **+3.4%** |
| Same, on scrambled structure | — | **−0.1%, inside the noise band** |

**The independent auditor rejected the first version of item 1**, and was right:

> *"The 'skill' is actually overfitting. The modeling strategy's performance
> falls significantly below the greedy baseline when the structure is scrambled,
> proving the advantage is a fragile exploitation of a specific topology rather
> than a robust, generalizable strategic proficiency."*

Three revisions followed, each of which the measurements forced:

1. **Confidence gating.** The learner committed to its model on any evidence.
   Now it needs four observations and a 60% majority, or it falls back.
2. **A corrected baseline.** Under the new rule the banked cell's own face does
   not determine the payout, so the old baseline was spending its decision on an
   irrelevant number and the comparison measured that, not inference. The
   baseline is now the same policy with its model switched off — the two differ
   in exactly one respect.
3. **Apophenia in the instrument.** At two observations the learner formed models
   out of *noise*: 7 wins, 38 losses on scrambled boards, a spread of 31 against
   a noise band of 13 — a real penalty, and exactly what the auditor conditioned
   its approval on. At four observations that becomes 0–2 of 2 decided boards,
   spread 2 against a band of 3.

Re-audited: **"Yes, the overfitting objection is answered."**

**And the mutation harness caught me relaxing a gate.** Splitting E2 into a
correctness floor and a design target let the payout-reversion mutant *survive* —
the learner still cleared 2% by ordinary noise. A statistical edge is the wrong
instrument for a yes-or-no question, so **E6 now asserts the rule on a single
turn**: two boards identical except the fed cell's face must score differently.
Deterministic; it cannot be passed by luck.

### The design target that is still unmet, stated plainly

Inference is worth **3.4%** against the **5%** I set in advance. I did not lower
the bar. It is reported on every run and it is item 3 below.

Diagnosis, so it is actionable: the model is worth a near-constant **~2.4 points
per round** at 12, 16 and 20 turns — lengthening the round makes the percentage
*fall* (4.3 → 3.0 → 2.7). The edge is bounded by how often knowing the target
changes which cell you would pick, and with one cell charged per turn the
highest-charge cell usually dominates anyway.

---

## The new distribution

| p | Next step |
|---|---|
| **0.22** | **Google Play closed testing: 12 testers, 14 continuous days** |
| 0.16 | Raise inference above the 5% target by charging more cells per turn |
| 0.12 | Audio and haptics, budgeted against "anticipation before the commit" |
| 0.10 | Settings screen (motion, sound, text size) |
| 0.09 | Mid-round error recovery — never lose a round without saving its bundle |
| 0.08 | The 4D board render in slice mode |
| 0.07 | Real-device frame pacing, battery, thermal |
| 0.06 | Postgres in CI for the 9 checks that cannot run |
| 0.05 | Promote coverage-probed oracles into curated mutations |
| 0.04 | Branch protection |
| 0.03 | Multiplayer transport |
| **0.02** | **The 12 closed testers ARE the playtest — one activity, two gates** |

---

## The tail, and why it reorders the list

Row one is a hard external gate: a **personal** Google Play developer account
created after 13 November 2023 cannot publish to production until it has run a
closed test with **12 testers for 14 continuous days**. Organisation accounts are
exempt. Nothing in this repository accounts for it, and it is the
longest-lead item on the project by a wide margin — **14 days of calendar that no
amount of engineering shortens**.

The tail row is what makes it more than a chore. The games-user-research
literature puts the sample sizes at **6 players to discover problems, 12 to
understand and define them, 100 for reliable data**. Google requires 12. The
number Google demands is exactly the number the research says is needed to
understand players.

> **So the compliance gate and the missing playtest are the same activity.** The
> 12 closed testers are the first humans ever to play this game, and their
> sessions answer the question no oracle here can: whether 3.4% of measurable
> inference value is *felt* as skill by a person.

That is why it is item 1 and why it starts immediately: everything else on this
list improves a game that cannot ship for at least a fortnight regardless.

---

## The ordered list

1. **Start closed testing.** 12 testers, 14 days. Instrument the build first
   (item 2) so the fortnight produces data instead of only elapsing.
2. **Instrument the round for playtest telemetry — on-device only.** No INTERNET
   permission, so it cannot phone home and must not start: a local session log
   the tester can export and send deliberately. Record per-turn decisions so the
   learner's model can be run against a *human's* choices.
3. **Raise inference to the 5% target.** The diagnosis says how: charge more
   than one cell per turn so several candidates are live and knowing the target
   actually changes the pick. It moves the rules hash and needs its own oracle.
4. **Audio and haptics**, under the item-4 rule from `fourd-as-the-board.md`:
   anticipation before the commit, instant resolution after.
5. **Settings**, which is where 4 and the accessibility work become the player's
   choice rather than mine.
6. **Mid-round error recovery** — an exception must never lose a round without
   saving its bundle.
7. **The 4D board render**, slice mode, per `fourd-as-the-board.md`.
8. **Real-device frame pacing and battery.**
9. **Postgres in CI**; **promote coverage-probed oracles to curated**; **branch
   protection**; **multiplayer transport.**

---

## The handover prompt

```
Reference the current goal and EINCOL.md and follow the protocol exactly.

Read design/next-steps-2.md first. Two things in it are not negotiable context:
verify-learnable's E2 design target of 5% is UNMET at 3.4% and must not be
lowered, and Google Play closed testing is a 14-day calendar gate that starts
the moment a build is uploaded.

Work items 1 through 4 in that order. Do not start an item until the one before
it is green and committed.

1. Prepare and start closed testing. Produce the upload-ready artifact and a
   tester-facing note saying what to look for. Do not fabricate any part of the
   Play Console flow you cannot actually perform — state plainly which steps
   need the human and stop there.

2. Instrument the round for playtest telemetry, ON DEVICE ONLY. The app has no
   INTERNET permission and must keep none: a local session log the tester
   exports deliberately. Record per-turn decisions so the regional learner in
   verify-learnable can be replayed against a HUMAN's choices — that comparison
   is the first real answer to whether the inference is felt as skill. Prove it
   with an oracle that a session survives a crash and that nothing is
   transmitted.

3. Raise inference above the 5% design target. The diagnosis is in
   next-steps-2.md: charge more than one cell per turn so several candidates are
   live and knowing the target changes the pick. Success is verify-learnable E2
   clearing 5% with E4 and E5 still holding and E6 still deterministic. It moves
   the rules hash — regenerate it and add a curated mutation.

4. Audio and haptics. The rule from fourd-as-the-board.md is binding:
   anticipation BEFORE the commit, instant resolution after. No animation may
   delay the display of an outcome that is already decided; add a check for it.

Constraints that are not negotiable:
- Every new check must be SEEN TO FAIL before you believe it passes. Add it to
  verify-oracles.ts and watch the harness catch it.
- If splitting or relaxing any gate lets a previously-caught mutant survive,
  that is a defect in the split, not in the harness. Assert the property
  directly instead, the way E6 does.
- npm run verify:engine green and verify-apk passing on BOTH variants before
  each commit.
- Do not weaken an existing oracle to accommodate a change. If L1x, V1, P1, A5
  or E6 fires, the code is wrong, not the check.
- Send the result to the independent auditor (tools/loop/audit.py --ask, one
  sharp question, no reasoning attached) and revise until it approves or names
  an objection you can show is wrong.
- Report what the evaluator found that you did not, and what remains open.
```

---

## Honest limits

- No human has played this game. Every number here comes from policies, and the
  gap between "a measurable edge exists" and "a person feels skilful" is exactly
  what items 1 and 2 exist to close.
- E5's significance test is a paired sign test, which is the right shape for
  paired data but weak at n=2 decided boards. It says the penalty is not
  distinguishable from parity; it does not prove parity.
- The coverage prober is weaker than curated mutation and the file says so. 19
  oracles are coverage-probed, not assertion-strength tested.
