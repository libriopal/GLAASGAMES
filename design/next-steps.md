# Next steps, and the finding that reorders them

A run of [`EINCOL.md`](../EINCOL.md) against: *what is the highest-value next
step for GLAASGAMES?*

The tail candidate survived, was built, and **failed** — which is the result.

---

## Step 1 — measured, not remembered

| Measurement | Value |
|---|---|
| verify files | **43** |
| distinct oracles in the mutation registry | **11** |
| oracles never proven capable of failing | **32** |
| `localStorage` / persistence in the app | **0** |
| audio, haptics, settings screen, tutorial | **0, 0, 0, 0** |
| `aria-live`, `:focus` styles, `prefers-reduced-motion` | **0, 0, 0** |

The verification is thorough and the *game* is one screen with no memory, no
sound, no way to learn it, and no accessibility past colour contrast.

---

## Step 2 — the distribution, 13 candidates

| p | Next step |
|---|---|
| 0.16 | Extend the mutation registry to the 32 uncovered oracles |
| 0.14 | Persistence — a round survives the app closing |
| 0.12 | Onboarding — nobody can learn the rules from this screen |
| 0.10 | The 4D board render (change 1 of `fourd-as-the-board.md`) |
| 0.09 | Accessibility past contrast |
| 0.08 | Audio and haptics |
| 0.07 | Settings (motion, sound, text size) |
| 0.06 | Provision Postgres in CI for the 9 unproven checks |
| 0.05 | Frame pacing, battery and thermal on a real device |
| 0.04 | Multiplayer transport over the proven `FrameChain` |
| 0.03 | Branch protection, so CI is not editable by what it constrains |
| **0.03** | **No mid-round error recovery: an exception loses the round with no bundle** |
| **0.02** | **Nothing measures whether the game is playable. Every "player" ever tested is a greedy policy** |

---

## Steps 3–5 — the tail, built, and what it found

`engine/verify/verify-learnable.ts` pits three strategies against each other over
400 **paired** boards (same seed, so the comparison is strategy and not luck):

- **blind** — banks an occupied cell at random
- **charge-aware** — the greedy policy every other oracle uses
- **learner** — builds its own empirical link map from observables alone and
  plays for the chain

| Check | Result |
|---|---|
| **E1** evidence pays | charge-aware **84.6** vs blind **47.0** — **+79.8%**, winning **400/400** |
| **E2** depth | learner **85.5** vs charge-aware **84.6** — **+1.1%**, 206/400 |
| **E3** consistency | 100% of paired boards |
| **E4** negative control | real lattice **79.8%**, scrambled lattice **83.4%** — **FAILED** |

### What that means

**Watching the board pays enormously. The hidden lattice's structure contributes
nothing to that payoff.**

Scrambling every link into uniform noise does not reduce the advantage — it
slightly *increases* it. The edge comes from the scoring rule, `face × (1 +
charge)`, which pays for picking the biggest number; charge appears somewhere
regardless of where the links point.

E2 says the same thing from the other direction. A learner that explicitly
models the link map beats the naive number-picker by **1.1%**. Modelling the
thing the game is about is worth almost nothing.

So the premise the entire project rests on — *read the pattern, infer the hidden
lattice, play the chain* — **is not yet doing any work**. P1's 1.918 bits of
mutual information are real. They are simply not worth anything to a player.

### The negative control broke first, and taught us something

The original control **severed** every link. That produces NaN: with no links,
`isStagnant` reports the board dead on turn 0, the round reshuffles to its cap
and concedes, and both policies score exactly 0.

That is not a bug so much as a fact about the game — **D1's stagnation rule makes
a linkless board unplayable by construction**, so this game cannot degenerate
into pure chance even in principle. The control was rebuilt to scramble
structure while keeping the board alive, which is what P1 already does.

### Why this file is not in the gating suite

It fails, and it should keep failing until the game is fixed. But the defect is
in **game design**, not in code CI can repair, so gating on it would hold every
unrelated change hostage. It runs as `npm run verify:learnable`, a standing
diagnostic, and **must go green before the game can honestly claim to reward
inference**.

**Do not tune it green.** The fix belongs in the scoring rule: something must
pay for being *right about the structure* — for example scoring a banked cell by
the charge it **causes downstream** rather than the charge it already carries,
so that predicting where charge will land is what earns.

---

## The reordered list

The distribution's mode was "extend the mutation registry". It is still true and
it now ranks second, because a registry covering 43 oracles that all verify a
game whose central mechanic does nothing is 43 proofs about the wrong thing.

1. **Make the hidden structure worth knowing** — change the scoring rule so
   inference pays, and drive `verify-learnable` E4 green. Everything else in the
   product is downstream of whether there is a game here.
2. **Extend the mutation registry** from 11 oracles to all 43.
3. **Persistence** — a round survives the app closing.
4. **Onboarding** — the rules must be learnable in the app.
5. **Accessibility past contrast** — `aria-live` on score and turn, visible
   focus, `prefers-reduced-motion`.
6. **Audio and haptics**, budgeted against the "anticipation before the commit"
   rule.
7. **Settings**, which is where 5 and 6 become the player's choice.
8. **Mid-round error recovery** — never lose a round without saving its bundle.
9. **The 4D board render**, in slice mode, per `fourd-as-the-board.md`.
10. **Postgres in CI**, closing the 9 checks that cannot run.
11. **Real-device frame pacing and battery.**
12. **Branch protection.**
13. **Multiplayer transport.**

---

## The handover prompt

Copy this into a fresh session:

```
Reference the current goal and EINCOL.md and follow the protocol exactly.

Read design/next-steps.md first: verify-learnable currently FAILS its E4
negative control, and that failure is the finding, not a bug to tune away.

Work items 1 through 5 in that order, and do not start an item until the one
before it is green and committed:

1. Make the hidden structure worth knowing. Change the scoring rule so that
   predicting where charge LANDS is what earns, rather than banking the largest
   number already on the board. Success is verify-learnable E4 going green on
   its own terms — scrambling the lattice must measurably reduce the advantage —
   AND E2 showing the modelling learner beating the naive charge-reader by a
   margin you state in advance. This moves the rules hash, so regenerate it
   (npm run gen:rules) and add a curated mutation for the new rule.

2. Extend the mutation registry in verify-oracles.ts from 11 distinct oracles to
   all 43. Each entry needs a written argument for why the mutation changes
   behaviour. Report the survivors rather than tuning them away; a survivor is a
   candidate, not a defect.

3. Persistence: a round in progress must survive the app closing. The stored
   state has to include the commitment, so the round cannot be silently
   restarted under a fresh seed. Prove it with a browser oracle that kills the
   context mid-round and resumes.

4. Onboarding: the rules must be learnable inside the app, without wagering
   vocabulary (verify-listing P3 holds that line).

5. Accessibility past contrast: aria-live on score and turn, visible focus
   styles, and prefers-reduced-motion honoured. Extend verify-devices with a
   check per item, each with a negative control.

Constraints that are not negotiable:
- Every new check must be SEEN TO FAIL before you believe it passes; add it to
  verify-oracles.ts and watch the harness catch it.
- npm run verify:engine must be green and verify-apk must pass on both variants
  before each commit.
- Do not weaken an existing oracle to accommodate a change. If L1x, V1, P1 or A5
  fires, the code is wrong, not the check.
- Report what the evaluator found that you did not, and what remains open.
```

---

## Honest limits

- E1's +79.8% is measured against a *random* baseline. A real novice is better
  than random, so the true skill gap a player experiences is smaller than that
  number and is not measured here.
- The learner is deliberately simple. A stronger one might extract more from the
  structure and move E2 — that would be a finding about the learner, not
  necessarily about the game, and should be reported as such.
- Nothing here measures enjoyment. Learnability is measurable and was measured;
  fun was not, and no claim about it is made.
