# The development loop — plan for approval

**Status: AWAITING HUMAN APPROVAL AT THE VERIFY GATE.**
Nothing in the Design or Code sections has been started. This document is the
output of the Research and Audit halves only, which is what the plan was asked
to be built from.

I am the architect. The auditor is a different model on a different vendor's
inference stack, called directly over the Cloudflare Workers AI API
(`@cf/google/gemma-4-26b-a4b-it`). Every audit exchange is a recorded request
and response, so each finding below traces to a transcript rather than to my
own summary of one.

---

## 1. What was asked

A self-sustaining loop with this ordering:

    RESEARCH -> AUDIT -> VERIFY -> DESIGN -> CODE

with the human in the loop at Verify. The research was asked to agree, "to some
extent," with that ordering. It partly does and partly does not, and the part
that does not is the more useful half.

---

## 2. What the research actually supports

**Supported: a knowledge-grounding step before a build step.**
Hevner's three-cycle view of design science research puts the Rigor Cycle —
grounding in the existing knowledge base — as a precondition of the Design
Cycle, which builds and evaluates the artifact, while the Relevance Cycle
supplies requirements and acceptance criteria from the problem environment.
(Hevner 2007, *A Three Cycle View of Design Science Research*, Scandinavian
Journal of Information Systems 19(2).) This supports Research before Design.

**Supported: an inspection step distinct from a testing step.**
Kollanus & Koskinen's survey of 153 inspection papers across 1980–2008 concludes
that "the surveyed research provides clear evidence that inspections generally
benefit software development and quality assurance."
(DOI 10.2174/1874107x00903010015.)

**Contested, and reported as contested.** Winkler, Biffl & Faderl ran a
controlled experiment on usage-based reading inspection versus inspection-based
testing and found "no significant advantages ... regarding defect detection
performance," with the two sessions of the study returning contradictory
results. (DOI 10.1007/978-3-642-13792-1_4.) Inspection is worth doing; the claim
that it beats testing is not established.

**Supported: the auditor must not be the author.**
The agentic-reliability literature is consistent that a model critiquing its own
output reproduces its own reasoning: LLMs largely cannot correct their own
reasoning without external information, and naive self-critique can degrade
performance. Reliability comes from an *external signal* — deterministic
re-execution, tool-grounded checks, or a genuinely separate critic — not from a
model judging itself. (Huang et al., and the verification-gap surveys,
e.g. arXiv 2608.05179, arXiv 2607.17044.) This is the single strongest research
result behind this plan, and it is why the auditor here runs on someone else's
hardware and never sees my reasoning — only my claims.

**Falsified, and withdrawn.** The obvious justification for front-loading is
Boehm's cost-of-change curve: a defect costs ~1x in requirements, 5–10x in
design, 10–20x in code, 50–200x after release (Boehm 1981, 63 projects). I am
not using it. Menzies et al. tested the delayed issue effect across 171 projects
from 2006–2014 — the largest study of the effect published — and report: "We
found no evidence for the delayed issue effect; i.e. the effort to resolve
issues in a later phase was not consistently or substantially greater than when
they were resolved soon after their introduction." (arXiv 1609.04886.) Boehm and
Basili had already revised the multiplier down to roughly 5:1 for small projects
by 2001. The authors disclose that all 171 projects used the Team Software
Process, which is a real limitation — but a null result on the largest available
sample is not something to route around because it is inconvenient.

**So the ordering is not justified by cost.** It is justified by
irreversibility, which is my own argument and is labelled as mine: research and
audit are cheap to redo and leave behind no artifact anyone must maintain; code
is expensive to redo and leaves behind an artifact that must be maintained for
as long as the project lives. The auditor challenged this too — see F3 below.

**Not supported: Verify as a one-time gate.** Nothing in the literature places a
verification step before the thing to be verified exists. What the human
approves at Verify is the *plan*, not the artifact. That is a scope decision,
not a correctness check, and this document says so rather than borrowing the
word "verify" to make a scope decision sound like a proof.

**Spec-driven development** — write the specification before the agent
implements — is the current industry framing of the same shape, and reports
reduced rework and better intent fidelity. Those reports are vendor and
practitioner claims, not controlled studies, so they are listed as corroboration
of direction, not as evidence.

---

## 3. The audit record

### Round 1 — the ordering as originally stated. Verdict: **reject.**

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| F1 | critical | "The loop validates the integrity of knowledge but fails to validate the integrity of translation." Nothing checked that Design reflects Research, or Code reflects Design; such an error would surface only at the *next* Research phase — after the code was written. | **Accepted.** Drove the inner loop in §4. |
| F2 | major | The team is one human plus AI agents, so the "independent party" may share context with the researcher. Auditor's test: the auditor must not see the researcher's intermediate reasoning. | **Accepted and implemented.** The auditor gets the artifact, never the chain of thought behind it. |
| F3 | moderate | Boehm is used to justify front-loading while the team's own Menzies evidence says the effect does not hold. "The loop may actually decrease velocity by adding process tax without the promised reduction in downstream defect costs." | **Accepted.** Boehm withdrawn entirely; see §2. |
| F4 | minor | "Machine checks are run at Verify" was an empty placeholder — no check was named. | **Accepted.** The six oracles are now named in §5. |
| F5 | minor | The evidence supports the *existence* of phases, not this *sequence*. "The team is using existence-of-value arguments to justify sequence-of-operations decisions." | **Accepted.** §2 now separates the two. |

### Round 2 — the revised two-loop design. Verdict: **F1 still open.**

The auditor's answer to "name a design-to-code error that passes all six
oracles" was the one I did not want and should have seen: **omission**. If the
design says implement undo and the code does not implement undo, every oracle
still passes. The determinism digest is unchanged, parity holds, the arithmetic
and trig oracles pass, the render check draws, governance is clean — because
each of those falsifies *wrong* behaviour and none of them detects *absent*
behaviour. F1 is therefore not closed by attaching oracles alone.

Its other three answers:

- **(b)** What stays correlated across two vendors' models: **training data.**
  Cross-vendor diversity is real but partial. Two models trained on overlapping
  public corpora share blind spots, so the auditor is a check on my reasoning,
  not on the state of the world.
- **(c)** The irreversibility argument is **not sound** as stated — it asserts
  code is expensive to redo without measuring it, which is structurally the same
  move Boehm's curve made.
- **(d)** "No oracle, no design" forbids **qualitative design** — anything about
  feel, legibility or comprehension. The wall is real and needs a named path.
- **(e)** The first step to be skipped after three increments is **Audit and
  Verify** — the human-gated outer steps, because they are the ones with a
  waiting cost and no immediate artifact.

Everything in §4 that is not already in §2 exists because of one of these.

---

## 4. The loop, as it stands after audit

Two nested loops, not one.

    OUTER — per increment of scope. Slow. The human is in it.

      RESEARCH -> AUDIT -> VERIFY (human) -> DESIGN -> CODE
         ^                                              |
         +-------------------- feedback ----------------+

    INNER — per change. Fast. Mechanical. No human.

      obligation -> negative control -> oracle -> code -> oracle passes

**Every design item is a named falsifiable obligation.** It carries an id, a
one-sentence claim, the executable check that decides it, and the value that
check must produce.

**Every obligation carries a negative control, and this is the fix for F1.** An
oracle is not accepted into the suite until it has been observed to *fail* on a
build with the feature deliberately removed or broken. An oracle that has never
failed is not evidence; it is decoration. This is what converts the suite from a
detector of wrong behaviour into a detector of absent behaviour, and it is the
only thing that closes the omission gap the auditor found. It costs one extra
run per obligation.

Two of the existing checks earned their place exactly this way and are the
precedent: the render check caught a quad-sizing error that filled 100% of the
frame on its very first execution, and the four-corner regression test was
written after an i32 overflow made the farthest targets collect themselves.

**Against (c) — irreversibility is measured, not asserted.** Each increment
records the wall-clock time spent in Research+Audit and the time spent fixing
defects found after Code. If after five increments the front half costs more
than it saves, the front half shrinks. The claim that front-loading pays is
itself an obligation with an oracle, and the oracle is the project's own log.

**Against (d) — the qualitative wall has a named path.** Design items that
cannot carry a machine oracle (does the fourth dimension read as a place rather
than a slider? is the control scheme legible in ten seconds?) are marked
`QUALITATIVE` and are decided by the human at the Verify gate, on a recorded
build, with the question written down before the build is shown. They are never
smuggled past by inventing a proxy metric — a proxy for fun is a worse lie than
an open unknown.

**Against (e) — the outer loop must survive its own boredom.** Audit is the step
that gets skipped, so it is made cheap rather than virtuous: it is one scripted
call with a recorded transcript, and an increment without an audit transcript
does not reach the Verify gate. There is no honour system.

**Against (b) — the auditor is not the top of the stack.** Because the two
models share training data, the deterministic oracles outrank the auditor. Where
a digest and the auditor disagree, the digest wins. The auditor's job is to
attack my *reasoning*; the oracles' job is to report the *world*.

---

## 5. The oracles that already exist

These are working checks in this repository, not proposals. Values are the
current measured ones.

| Oracle | What it decides | Current value |
|---|---|---|
| `verify-sim` | simulation determinism, 2000 ticks × 400 entities reduced to an FNV-1a hash chain | `0xfc60aadd` |
| `verify-parity` | the WGSL kernel executed on software Vulkan in CI, bit-compared per tick against the TypeScript reference | `0x1f3865c0` |
| `verify-fixed` | Q16.16 multiply/divide/sqrt against exact BigInt arithmetic | exact |
| `verify-trig` | CORDIC output against an error budget | ≤24 Q16.16 units |
| `verify-render` | `render.wgsl` draws to an offscreen texture and pixels are inspected; `--require-gpu` makes a missing adapter a failure, not a skip | draws |
| `verify-economy` | build fails on dark patterns, loss-framing, artificial scarcity timers, streak-punishment, or non-graceful session end | zero violations |

Plus `verify:no-secrets` and `verify:no-prod-credentials-local`.

The digests are the reason this loop can work at all with one human. They are
the external signal the reliability literature says self-critique lacks — and
unlike the auditor, they do not share my training data.

---

## 6. The work queue, sequenced but not designed

Nothing here has been designed or coded. Each carries the obligation it would
have to satisfy, so the Verify gate is a decision about real scope.

**Increment 1 — replay verification.** A seeded run records its input stream;
replaying the seed and inputs must reproduce the digest exactly. *Obligation:* a
recorded run replays to an identical chained digest; the negative control is a
one-tick input perturbation, which must change it. *Why first:* it is the
foundation for the fairness claim, and it is the cheapest increment that
exercises the whole loop end to end, including the negative control discipline.

**Increment 2 — the control rework** (carried over from the touch/HCI research,
still unapproved): edge insets ≥32dp so the controls do not collide with the
Android back gesture, which owns both screen edges and cannot be excluded from
the web; a floating thumbstick anchored where the thumb lands rather than fixed
pads, for the 49% of one-handed users; targets ≥60dp. *Obligation:* every
interactive target's computed rect clears the minimum and the edge inset, tested
headlessly across a phone viewport matrix. *QUALITATIVE:* whether the scheme is
legible without instruction — human decides.

**Increment 3 — the retention loop, on the terms this repo allows.** The
governance suite machine-bans the standard mobile retention playbook, so
retention here is deterministic replay-verified seeded runs — a fixed daily
seed everyone plays, with a verifiable result — resting on the self-determination
finding that survived falsification (autonomy and competence predict enjoyment
*and* future play) rather than on the challenge–skill/DDA finding that did not
(pre-registered null, Royal Society Open Science). *Obligation:* the economy
check passes with zero violations and the daily seed's digest is reproducible by
a third party.

**Increment 4 — real-silicon parity.** CI proves the shader against lavapipe,
which is software. It does not prove cross-vendor agreement on real GPUs. Run
the same parity command in Chrome on the phone and record the digest. *This is a
measurement that has never been taken and it is the largest remaining unknown in
the engine.*

---

## 7. Credentials — status, stated plainly

- The Tavily key from the attached file and the Cloudflare account ID and token
  are in `$HOME/.env`, mode 600, outside the repository. They are read by the
  tooling and never printed.
- `.gitignore:10` covers `.openclaude/settings.json`; only the template is
  tracked. `git log --all -S` finds no Cloudflare token anywhere in history.
  Exposure of that token remains transcript-only, as it was when I flagged it.
- You declined to revoke the Cloudflare token and I have used it as instructed.
  That decision stands as yours. It is a live credential that has appeared in
  chat transcripts, and rotating it after this work is done costs you nothing.

---

## 8. The decision at the Verify gate

I am asking for one of:

1. **Approve** — the loop as stated in §4, and increments 1–4 in that order.
2. **Approve with changes** — name the increment order you want, or strike one.
3. **Reject** — say which part of §4 is wrong and it goes back to Research.

I have not signed this gate and cannot. Until you answer, no design item is
written and no code is changed.

One thing I would flag before you decide: increment 4 is the only item that can
tell us something we cannot currently know, and it is sequenced last. If you
would rather learn early whether the engine's central premise — bit-identical
across vendors — actually holds on real hardware, move it to first. It is a
measurement, not a build, and it would cost an afternoon.
