# The imagination protocol, and the one thing it found

> The reusable, project-independent form of this protocol is **[`EINCOL.md`](../EINCOL.md)**
> at the repository root. This document is the session that produced it.

You asked for two things: research into how an LLM is actually made to explore,
and then the use of that research on myself, to find something real about the
sovereignty of this project's source of truth. The analogy you gave was
Einstein's — carry the problem into the chaotic dreamscape, keep a sane logical
mind at the moment of waking.

This document is the record. It is short on enthusiasm because the finding is
checkable, and a checkable finding does not need to be sold.

---

## 1. What the literature says, including the part that contradicts the ask

**The dream analogy is literally correct, and the mechanism is not drift.**

Lacaux et al. (Science Advances, 2021) put people in N1 — the twilight at sleep
onset — with a maths problem containing a hidden rule. Fifteen seconds in N1
*tripled* the rate of insight versus staying awake. A 2023 replication using
targeted dream incubation (auditory cues seeding a specific theme at sleep
onset) corroborated it and found greater *associative divergence* afterwards.

So your intuition is supported by direct evidence. But the same literature is
specific about *why*, and the reason kills the naive reading. N1 is described as
**semilucid**: "freely watch the mind wander **while maintaining a logical
ability to identify creative sparks**." The insight does not come from the
wandering. It comes from wandering *with the evaluator still on*.

And the incubation literature is harsher still. A 2025 study
(*Brain Sciences* 15:595) ran mind-wandering incubation against divergent and
convergent tasks and found **no significant effect of mind wandering on
divergent thinking**, with "conscious reflection during incubation more
beneficial than uncontrolled drifting." Divergent and convergent performance
did not even correlate — they are separate faculties.

> **The falsification:** "let the mind drift and brilliance falls out" is not
> supported. What is supported is: *load a specific problem first, widen the
> associative field, keep a sober evaluator running the whole time.* Three
> distinct steps. Drop the first and you get noise; drop the third and you get
> confident nonsense.

**The LLM literature converges on exactly the same shape, from the other side.**

- *Mode collapse.* RLHF-aligned models converge on a few "safe" answers. In
  research ideation, ~5% of generated domains were unique — 7-8 distinct domains
  across a whole run. The model is not short of ideas; it is short of
  *permission* to emit the unlikely ones.
- *Temperature does not fix it.* Temperature reshapes an already-collapsed
  distribution — it adds noise inside the mode rather than reaching other modes.
  ICCC24 and follow-ups find naive temperature increases, persona prompting and
  contextualised prompting "only marginally mitigate" the limitation. OPRO and
  CoT produce **no** significant novelty gain over basic prompting.
- *Verbalized Sampling does* (arXiv 2510.01171). The cause of mode collapse is
  identified as **typicality bias in human preference data** — annotators prefer
  the familiar and fluent, so alignment sharpens toward the typical. The
  workaround is to move from an *instance-level* request to a *distribution-level*
  one: instead of "give me X", ask for *k candidates with their probabilities*.
  Measured 1.6–2.1× diversity gains, no training, no safety degradation.
- *Structural analogy is the generator of distant candidates.* Cross-domain
  analogical guidance is reported to amplify LLM performance up to 10× on
  problems where autonomous performance is near-floor. Distance is not achieved
  by asking for weirdness; it is achieved by importing a *relational structure*
  from a field that is genuinely elsewhere.
- *And the evaluator must be external.* Si, Yang & Hashimoto (arXiv 2409.04109,
  100+ NLP researchers) found LLM-generated ideas rated **more novel** than
  expert ideas (5.64 vs 4.84, p<0.05) but **less feasible** — and, decisively,
  that models judging their own ideas were *less reliable than human reviewers*.

Both literatures, from psychology and from ML, say the same sentence: **widen
the generator, never the judge.**

---

## 2. The protocol I actually ran

1. **Load the cue.** Not "be creative." One named target: *where is the source of
   truth in this repo not sovereign?* Targeted incubation needs a theme, or the
   dream is about nothing.
2. **Verbalize a distribution.** Enumerate candidates *with* my honest
   probability of each being the real answer, deliberately generating down into
   the tail rather than stopping at the mode.
3. **Take the tail seriously.** The mode is the typical answer, and the typical
   answer is the one alignment sharpened toward. It is usually true and never
   interesting.
4. **Attempt falsification of the tail candidate** before believing it.
5. **Hand the survivor to an evaluator I do not control** — this repo's verify
   suite and its standing rule that an oracle must be *seen to fail* before it
   is trusted.

Step 5 is the whole reason this is not drifting. The waking mind here is not my
judgement. It is `npm run verify:engine`.

### The distribution, as generated

| p | Candidate: where truth is not sovereign |
|---|---|
| 0.35 | CI can be disabled by the same party the oracles constrain |
| 0.20 | `corpus-digest.json` is a committed assertion, not a reproducible derivation |
| 0.15 | No oracle exists over the *set* of oracles; silence looks like coverage |
| 0.10 | Frame stamps prove agreement but nothing pins *when* a peer stamped |
| **0.08** | **Commit–reveal binds the seed but not the rules the seed is fed into** |
| 0.07 | Sovereignty of a *singular* truth is indistinguishable from authority |
| 0.05 | The bond's cleanliness is asserted at one point, not maintained over time |

The 0.08 row is the one that survived. Note that it was *not* my first answer —
under a single-answer prompt I would have emitted row one, which is true,
generic, and closes nothing.

---

## 3. The finding, and the falsification it survived

**First formulation (wrong, and discarded):** *every mechanism in this project
that works is a time-pinning device.* Commit–reveal pins the seed before the
player acts; replay pins the trajectory; frame stamps pin state per tick.

**I tried to break it and it broke.** Kernel↔WGSL parity is not time-pinning at
all — it is two independent executors agreeing *now*. APCA is not time-pinning —
it is an external standard. So the claim is false as stated.

**Corrected formulation, which is the actual result:**

> A truth in this system is sovereign only if it is pinned **in time** (it
> existed before the party it constrains could have chosen it) or **against a
> witness** (a second, independent thing computes it and agrees). Something
> pinned by neither is not a measurement. It is a preference wearing a
> measurement's clothes.

This is a usable classifier, so I applied it:

| Truth | Time | Witness | Verdict |
|---|---|---|---|
| Round seed | ✅ commitment | ✅ player recomputes | sovereign |
| Trajectory | ✅ recorded inputs | ✅ replay executor | sovereign |
| Frame state | ✅ per-tick chain | ✅ peer's stamp | sovereign |
| Kernel semantics | ❌ | ✅ WGSL parity | sovereign |
| Contrast floors | ❌ | ✅ APCA standard | sovereign |
| Palette / digest | ⚠️ committed once | ❌ not recomputable without the images | **weak** |
| **The rules themselves** | ❌ | ❌ | **not sovereign** |

The bottom row was empty in both columns, and it is the most load-bearing row in
the table.

### The attack that survived every existing check

```
Operator publishes H = sha256(serverSeed).      honest
Player supplies clientSeed.                     honest
Operator reveals the seed.                      honest
Player runs verifyRound against their build.    ok: true
```

…and the operator shipped player A a build with `FACE_WEIGHTS = [0,4,4,4,4,4,4]`
and player B a build with `[0,4,4,4,4,4,5]`.

Both players verify successfully. Both are certain the round was fair. They are
sitting at the same shared board having verified **two different games**, and
every oracle in this repository passes.

Commit–reveal constrains the operator's choice of *input*. It says nothing
whatever about the *function the input is fed into* — and to a dishonest
operator the function is worth far more than the seed. The mechanism the whole
staking argument rests on had a hole the exact size of its own premise.

---

## 4. What was built

`lattice/ruleset.ts` and `engine/verify/verify-ruleset.ts`.

A **rules hash** computed from the source that actually executes, published with
the seed commitment *before* the round, and recomputed independently by anyone
holding the code — pinned in both senses at once. `checkReveal` now takes the
verifier's *own* digest as a required third argument, because comparing the
commitment's claim against the reveal's claim is the operator agreeing with
itself and would always pass.

Two design decisions worth their justification:

- **The hash is semantic, not byte-level.** Comments and whitespace are stripped
  before hashing. This is the argument `frame.ts` already makes about rendering:
  two builds that differ only in prose play the same game, and a hash that
  flagged documentation commits would train everyone to ignore the alarm within
  a week. `verify-ruleset` R2 proves comments don't move it; R3 proves a loaded
  die does.
- **The rules hash is *not* folded into the seed**, though that would be a
  stronger deterrent. It would make "we disagree about the rules" and "we
  disagree about the seed" indistinguishable at the point of failure — the exact
  mistake `frame.ts` exists to avoid. Detection that names its cause was
  preferred over silent divergence. Recorded in `commit.ts` as a rejected
  alternative rather than left as a gap someone re-discovers.

**The oracle failed before it passed.** On first run R3 and R5 reported
violations — and they were right. My negative controls had perturbed the first
digit in each file, which happened to sit *inside a comment*. The raw text
changed, my setup guard passed, and the control silently tested nothing. The
hash was correct to ignore it; my guard was asking the wrong question. Fixed to
compare semantic text. That is the protocol working: the generator produced a
plausible test, the evaluator I don't control rejected it.

---

## 5. Why this is the answer to the question you asked

You asked for a careful tread across a major need for the sovereignty of the
source of truth. The need was real and it was the one thing the project had
never checked: **it could prove the dice were fair and could not prove they were
the dice everyone agreed to roll.**

For the staking architecture specifically, this is not a nicety. A
principal-return bond is defensible because the outcome distribution cannot be
steered. Before today, "cannot be steered" was true of the seed and merely
*asserted* of the rules — and an assertion by the operator is exactly what the
whole commit–reveal apparatus exists to refuse.

---

## Sources

- [Lacaux et al., Sleep onset is a creative sweet spot, *Science Advances* 2021](https://www.science.org/doi/10.1126/sciadv.abj5866)
- [Targeted dream incubation at sleep onset increases post-sleep creative performance, *Scientific Reports* 2023](https://www.nature.com/articles/s41598-023-31361-w)
- [The Role of Mind Wandering During Incubation in Divergent and Convergent Creative Thinking, *Brain Sciences* 15:595, 2025](https://www.mdpi.com/2076-3425/15/6/595)
- [Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity](https://www.alphaxiv.org/abs/2510.01171v2)
- [Si, Yang & Hashimoto, Can LLMs Generate Novel Research Ideas? A Large-Scale Human Study with 100+ NLP Researchers](https://arxiv.org/abs/2409.04109)
- [Is Temperature the Creativity Parameter of Large Language Models? ICCC24](https://computationalcreativity.net/iccc24/papers/ICCC24_paper_70.pdf)
- [Unlocking LLM Creativity in Science through Analogical Reasoning](https://arxiv.org/abs/2605.11258)
- [Diverse Prompts: Illuminating the Prompt Space of Large Language Models with MAP-Elites](https://arxiv.org/pdf/2504.14367)
