# FARKLE — the 50 changes, and what the Monte Carlo engine did to them

Run under **EINCOL**. The rule that shaped this list: *widen the generator, never
the judge* — and step 5, *hand it to an evaluator you do not control.*

The harness was built **before** the list, not after, so every item below is
either measured, or explicitly marked as not.

---

## The instrument

`foundry/montecarlo/farkle-harness.ts` — seven agents, a degenerate-strategy
probe, a seed-vs-policy variance split, a per-step risk curve, and a
dual-constraint gate. Everything recomputed from seeds.

---

## What it found — four findings, two of which falsify my own work

### 1 · I was about to redesign the game around a defect in my own evaluator

The degenerate probe reported `bank-after-1` — a mindless rule — at **99.1% of
the best thoughtful agent**. That looked like the push decision was worthless.

**It was wrong.** Sweeping fixed stop depths: the flat optimum is **d2 at 20.6k**
against d1 at 18.5k. Pushing once was already worth **11%**. The mindless rule
only looked competitive because *my search agent was bad*.

Both versions kept. The first is the evidence the process is real.

### 2 · The current design is the solved game — the multiplier escapes it

The auditor's strongest objection was the *Solved Game trap*: tune it too
precisely and pushing becomes "sterile calculation". Tested on three tiers over
4000 hands:

| curve | SCRIPT (no info) | READABLE (rule on the visible signal) | CEILING (hindsight) | headroom |
|---|---|---|---|---|
| **flat — what shipped** | 2058 | 2360 | 2501 | **6.0%** |
| **×1.35** | 2778 | 4872 | 6844 | **40.5%** |
| ×1.5 | 3412 | 6549 | 10177 | 55.4% |

At flat reward, a rule printed on the screen lands within **six percent** of
hindsight-perfect. *That* is the solved game, and it was the shipping design.

`RUN_MULTIPLIER = 1.35`. `bank-after-1` falls from 99.1% → **78.3%** of best.
×1.35 over ×1.5 on the auditor's reasoning: at 1.5 the signal reads as "a
suggestion that is frequently wrong, which erodes trust"; at 1.35 the rule is
"authoritative but not absolute".

### 3 · My shipping gate was circular

I proposed gating on headroom alone. The auditor: *a better UI — one that more
accurately predicts the optimum — would be **penalised** by my own gate.*

Replaced with two constraints pulling opposite ways:

| constraint | meaning | min | now |
|---|---|---|---|
| **Signal Utility** | readable beats script — the instrument is worth reading | 50% | **74.4%** ✅ |
| **Agency Floor** | ceiling beats readable — the instrument is not a command | 25% | **40.6%** ✅ |

Sharpen the signal and utility rises while agency falls. Neither can be gamed by
degrading the other.

### 4 · The risk instrument is not a risk instrument

`HUMAN-CAL*` — a deliberate stub with an 18% error rate — **beat SEARCH-MAX,
30730 to 26609.** A stub outscoring the top rung is a defect in the instrument.
Fixing the agent's EV model to include the multiplier helped and did not close
it. Calibrating the signal against reality explains why:

| risk state | farkled next turn |
|---|---|
| 0, 1, 2 | **0.0%** — 0 of 12,403 |
| 3 | **100.0%** — 3,997 of 3,997 |

**It is binary.** Three of its four states mean the same thing. It is not
measuring risk — it is a perfect *dead-hand detector*, and HUMAN-CAL wins because
banking only at state 3 is exactly optimal.

The cause is structural: **within a turn the hand is fully visible**, so whether
a next chain exists is a *fact*, not a probability.

Which makes the screen wrong in the one way this project treats as a defect
rather than a preference — the readout is drawn in **IR**, the band for *what
might go wrong*, while reporting something already decided. **A band whose colour
lies about its content is a defect.** Left open deliberately; see below.

---

## Current measured state

```
SKILL DELTA             42.9%   (benchmark >5%)
SOLVER MARGIN            7.2%   (unbounded over bounded search)
SEED SHARE OF VARIANCE   3.3%   (96.7% of outcome is WHO PLAYS, not what was dealt)
DOMINATED                false
DUAL CONSTRAINT          PASSES
```

---

## The 50

**BALANCE (1–10)** — 1 run multiplier ×1.35 ✅built · 2 ~~chosen for the depth tie~~ superseded by headroom · 3 multiplier shown before committing ⬜ · 4 re-sweep on any pay-table change ✅documented · 5 fix the search agent ⚠️*improved, still beaten by a stub* · 6 fixed-depth rungs permanently in the ladder ✅built · 7 turns stay capped at 10 ✅ · 8 pay table untouched, parity is the contract ✅ · 9 knobs limited to hand size + multiplier, both swept ✅ · 10 every knob carries its sweep in the file ✅

**FAIRNESS (11–17)** — 11 shared seed VS ✅ · 12 blind settlement ✅ · 13 seed-share gate <15%, now 3.3% ✅measured · 14 server replays the input log ✅ · 15 commit-reveal, constant-time ✅ · 16 pari-mutuel on rank ✅ · 17 pay table + curve published ⬜

**EXPLOIT REMOVAL (18–24)** — 18 degenerate probe in CI ✅built · 19 more trivial families ⬜ · 20 trivial within 2% of best fails the build ✅gate defined · 21 illegal chain forfeits the turn ✅ · 22 no client numbers in the action type ✅ · 23 solver margin gate, 7.2% ✅ · 24 forecast stays depth-2 ✅

**GAME LOOP (25–31)** — 25 draw/trace/decide/repeat ✅ · 26 multiplier replaces hot-dice ✅ · 27 farkle loses run *and* multiplier ✅ · 28 turn summary on bank ⬜ · 29 longest run as the badge ⬜ · 30 no solo timer ✅ · 31 VS move clock ⬜

**JUICE / POP / REWARD (32–41)** — all ⬜ **unbuilt**. 32 multiplier ticks visibly and audibly · 33 rising marimba, matter band 260–520 Hz · 34 only the multiplier escalates · 35 one note per die, pitched by face — a chain is a melody · 36 bank resolves to a chord, farkle drops an octave · 37 no screen shake; scale-punch on the banked total, 120 ms · 38 spent cells collapse, not fade · 39 combo name lands on the last die · 40 haptic per die, thud on bank, silence on farkle · 41 reduced-motion keeps the audio loop

**HD POLISH (42–46)** — reclassified as **execution quality, not design**, on the auditor's finding that they are *"markers of professional execution rather than gameplay-driven necessities"*. 46 keeps a hard gate: p99 frame cost **4.7 ms** of 16.67 ms, 1/299 frames dropped ✅

**MODES (47–50)** — 47 solo ✅ · 48 VS ✅rules, ⬜clock · 49 coop shared board / separate banks ✅ · 50 pair-ranking ⬜ **unsimulated**

**ADDED BY THE AUDIT** — 51 dual-constraint gate ✅built · 52 signal utility reported alongside ✅

---

## Closed since the first draft

**The readout is now honest.** It reports **CHAINS LEFT** — how many more chains
the hand can sustain — drawn in ink as a fact, with the last block turning
matter-red on the final chain. IR is gone from it entirely and now frames only
the forecast strip, which is the one thing on screen that really is a forecast.

That change was checked for being *too* informative, because a perfectly
predictive readout is the Solved Game trap in another costume. Re-running the
dual constraint with a rule thresholded on the new signal: the best depth rule
scores **4872 — exactly tying** the best rule on the old signal, because "stop
when this is the last chain" is the same rule in both languages. Agency floor
unchanged at **40.6%**. The honest readout costs the game nothing.

The forecast rows are also swapped: **certain now sits nearest the board**, so
distance from the playfield means distance in the future.

## Open, and why each is open
1. **The search agent is still beaten by a stub.** Every balance number above is
   computed with a top rung that is not actually the top. Fixing its EV model to
   include the multiplier moved it 23894 → 24828 and did not close the gap to
   HUMAN-CAL's 30730. The remaining cause is known: the agent treats the risk
   states as probabilities 0/⅓/⅔/1 when calibration says they are 0/0/0/1.
2. **Perceptual calibration is unsettled** — the auditor's blocker: *"you have
   not proven that a human player will perceive the risk signal as a reliable
   guide."* Needs playtest telemetry that does not exist.
3. **Nothing in 32–41 exists.** No audio, no haptics, no animation.
4. **Coop pair-ranking has never been simulated.**
