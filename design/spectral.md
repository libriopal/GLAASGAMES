# The spectral layer, the forecast, and what reading four documents changed

Twenty proposed changes, put to the independent auditor before any of them were
built, and approved in one round. This records what was built, what the build
falsified, and what is still only a proposal.

Sources read directly rather than recalled: a band-law document governing IR/UV
and cyan (`doc 26` in the external corpus), **Spec 34** (the six-band optical
layer), **Spec 35** (the staking economy and the precognition grid), and
`libriopal/magentadice-cyancode` at commit `8db018e`.

---

## The spectrum, as the external corpus defines it

Twelve values, and each band is **a claim about epistemic status** rather than a
styling choice:

| Band | Meaning | Corpus hex |
|---|---|---|
| matter | what **is** | six die-face colours, `#ff2244`…`#cc44ff` |
| IR | what is **forecast** | `#ff2d55`, `#b3001b` |
| UV | what is **synthetic** — inferred, not observed | `#b026ff` |
| cyan | what the **engine reads** | `#00e5ff` |
| voidshard | the rarity floor | `#0a0410`, `#b026ff` |

The corpus records this as an open finding: an asset pipeline capped the palette
at `maxColors: 8` against the spectrum's 12, and the auditor's note is the part
worth keeping — *"collapsing the palette silently would make a band
misrepresent its content."* The cyan value is live in
`magentadice-cyancode/sandbox-ui` today, where it marks engine-derived readouts.

**This project does not adopt the hexes, and the reason is the rank argument,
not taste.** A display emits a three-vector per pixel. Six bands summed into it
is a linear map ℝ⁶→ℝ³ with a three-dimensional null space: an infinite family of
distinct states produces identical pixels, and no palette tuning fixes a rank
deficiency. Spec 34 draws the same conclusion and reserves chroma for the
visible band. Our six faces already spend the whole chroma budget, so the
forecast layer is **achromatic and distinguished by geometry**.

The one empirical support for the perceptual half is thin and is flagged as
such in the source: one human-observer study (Hogervorst, Bijl & Toet, SPIE
2007) found three-channel colour mapping the worst of four presentations, with
a citation tally of 4. The arithmetic carries the weight; the study corroborates.

---

## The falsification: a spec claimed a property our engine did not have

Spec 35 §4.2 lists four properties that "close a hole" in the forecast grid. The
fourth is:

> Row 1 is a pure function of `(seed, tickIndex)` via the counter-based RNG.

**It was not, and building on it would have shipped a lying forecast.**

`advanceTurn` drew refill faces from `state.rng`, a sequential xorshift. Draws
consumed per turn is the count of empty cells up to `config.refill` — which
depends on what the player banked — and a stagnation reshuffle rewrites all 36
cells, consuming 36 draws at once. The face arriving on turn *N* was a function
of the entire play history.

A forecast built on the stated property would have been correct until the first
reshuffle and silently wrong after it.

### The fix: index the stream by ordinal, not by turn

`lattice/draw-stream.ts` makes a face a pure function of `(seed, ordinal)`
through a Murmur3 finaliser — a bijection on u32, so distinct ordinals cannot
collide. The *n*-th face a round will ever draw is fixed before the round
starts. What play changes is only **where in the sequence we are**.

This is strictly stronger than the spec asked for, and it is what makes the two
rows honest:

- **Row 1** — the next six faces. Certain; they cannot change, and `advanceTurn`
  consumes them in this order. `verify-forecast` F4 checks this against real
  play: **1440/1440 refill faces matched the forecast across 120 rounds.**
- **Row 2** — the six after. Equally fixed in value; what is fallible is whether
  the window *reaches* them, because a reshuffle eats 36 ordinals at once and
  whether it fires depends on a board state that does not exist yet.
- **Row 3** — never. Depth is capped at two by design, not by screen space.

Row 2's uncertainty is therefore **this engine's own reshuffle rule seen from
the front**, not an imported flourish. The auditor was asked directly whether
that was "a real epistemic uncertainty, or an implementation detail dressed up
as a design virtue," and answered: real — *"the uncertainty is not in the RNG
itself, which remains deterministic, but in the mapping of the RNG stream to the
game state… a property of the player's knowledge."*

---

## Set A — ten design changes, and what happened to each

| # | Change | Status |
|---|---|---|
| A1 | 6×2 forecast strip, spatially above and never z-above | **built** |
| A2 | Row-2 confidence as washout toward the deck, never size | **built** |
| A3 | Forecast under fact in z-order everywhere | adopted as law; the strip is the only forecast surface so far |
| A4 | Magnitude on radius, confidence on washout — two carriers | **built** (confidence only; no magnitude channel exists yet) |
| A5 | Synthetic layer is visibly synthetic — hard 1px strokes, snapped values | **built** |
| A6 | No readout requires comparing two magnitudes | **built** — confidence is a countable tick, quantised to four nameable states |
| A7 | Every band recoverable without a luminance judgement | **built** — solid/dashed border and filled/outlined ticks are geometric |
| A8 | 4D rotor drives the forecast tokens | **built**, and changed on contact — see below |
| A9 | Chroma reserved | **built** — the strip introduces no saturated hue |
| A10 | Wrong forecasts visibly corrected | **revised on the auditor's objection** — see below |

### A8 changed when it met the code

The plan was a parallax plate sheared by a rotor. What shipped is better and
smaller: the strip calls `projectToken` — the board's own 4D projection — at
**phase zero**. The first draft of `forecast-strip.ts` carried its own flat pip
table, which is two grammars for one alphabet; a player who had learned the
board's five would have had to learn the strip's five separately.

Phase zero is the design, not a shortcut. At identity orientation a forecast
token is the token's **rest shape**: the board's tiles turn, the forecast's do
not. A prediction that animated would claim more than it knows.

### A10 was revised because the auditor was right

Asked which single change was most likely to make the game *worse*, the auditor
named A10:

> Showing a strikethrough for wrong forecasts introduces visual 'ghosting' and
> cognitive noise… It turns a clean forecast into a messy historical record of
> failed predictions.

Upheld. A persistent artefact in a per-turn loop is load with no reader. The
epistemic requirement — that a forecast must not silently rewrite its own
history — is met instead by the round-end reveal, which is where this project
already puts corrections and where somebody is actually looking.

---

## Set B — ten reuses, and the one the auditor rejected

Read from `magentadice-cyancode@8db018e`.

| # | Reuse | Status |
|---|---|---|
| B1 | Chain-index precomputed score table | **rejected by the auditor — see below** |
| B2 | Counter-based RNG discipline for the draw stream | **adopted** — this is the fix above |
| B3 | Commit-reveal trio with constant-time compare | already equivalent in `lattice/commit.ts`; names aligned |
| B4 | "PORTED VERBATIM — do not improve this file" provenance headers | adopted as convention |
| B5 | Sacred-core lock listing files no agent may edit | proposed; not built |
| B6 | Exhaustive-not-greedy test shape | proposed for `verify-chem` |
| B7 | Signature naming — `describeCombo` returns a name, not a number | proposed |
| B8 | Four-agent harness reporting the **spread**, not the mean | partially present; `verify-staking` already ranks five rungs |
| B9 | Human-calibrated agent as a **named blocker**, never a stub | adopted as discipline |
| B10 | Input-log-only submission; client score advisory | already built in `net/heat-server.ts` |

### B1 was a category error and the auditor caught it

> You cannot 'port' a precomputed score table from a dice engine to a chemistry
> engine; the data is domain-specific and useless. While the architectural
> pattern (encode → table → read) is transferable, calling the porting of the
> `chainIndex` itself 'reuse' is a category error. It is a pattern port, not a
> code port.

Correct, and accepted. `chainIndex.ts` encodes six dice into
`(length−1)·46656 + base6` and precomputes 279,936 scores. The *encoding* is
reusable; the *table* is about dice. Recorded here as a pattern, not a port.

### Why `csprng.ts` was not copied verbatim

It is the right architecture and it is where the counter discipline comes from.
It is not reused literally for one reason that is not taste: `crypto.subtle` is
**async**, and every function on the refill path is synchronous and called
inside a turn. Adopting it would make `advanceTurn` async and change the
signature the server verifies through.

---

## Three defects found by rendering, none by review

The pattern holds: every visual defect this project has caught was caught by
looking.

1. **The four-state confidence scale delivered three.** Mixing sRGB linearly
   gave Lc 0, 14, 49, 95. Level 1 landed *below* `LC_INVISIBLE`, so "doubtful"
   and "no claim" drew identically — and the state that vanished was the one
   saying the forecast is probably wrong. Fixed by choosing the levels in
   **contrast** and solving for the colour: Lc 0 / 34 / 58 / 82, smallest step
   23.7. Pinned by F11.

2. **Row 1 and row 2 were indistinguishable in the common case.** On a healthy
   board row 2 sits at maximum confidence, so it drew at full ink — identical to
   row 1 but for a dashed border that reads as texture at this scale. The
   certain/fallible split is the strip's entire claim and it had become
   invisible. Row 2 is now capped permanently below row 1: a confident guess is
   still a guess. Row 1 Lc 82, row 2 Lc 61. Pinned by F12.

3. **The tick strip failed its own principle.** At 6×4px on a 9px pitch the
   ticks were neither countable nor measurable — the one outcome the design had
   ruled out. Now 14×6 on an 18px pitch, with unlit slots drawn as outlines so
   the **denominator** is visible: one of three is a different claim from one,
   and a fraction whose bottom half is invisible cannot be read. Pinned by F14.

### And one defect in a test

`verify-forecast` F6 asserts confidence tracks live-link count. Its first run
reported **r = 1.000**, which was not a result. Sampled from ordinary play, every
board carried 20-plus live links, so the confidence series had zero variance and
the code's `syy === 0` escape turned an undefined correlation into a perfect
score. Fixed by sweeping the input across the whole range and **removing the
escape**: a degenerate series is now a failure. Real value: **r = 0.851** over
780 board states spanning all four levels.

---

## The 60fps requirement, measured — and the measurement's own bug

The first version of `scripts/measure-frames.mjs` timed the interval between
`requestAnimationFrame` callbacks and failed at p99 = 16.80ms against a 16.67ms
budget, reporting "61.2% of frames over budget."

**That number was not a performance result.** On a 60Hz display rAF is
vsync-locked, so the interval cannot fall below 16.67ms no matter how little work
is done — a page drawing nothing reports the same figure. It was measuring the
display, not the renderer.

Measured correctly — frame **cost** inside the callback, and **drops** at ≥1.75
refresh periods — at 4× CPU throttle, 393×852 @2x, with per-frame style, layout
and paint forced:

```
  frame cost   mean 0.87ms   p50 0.90ms   p99 1.60ms   worst 5.30ms
  budget       16.67ms — p99 uses 9.6% of it
  dropped      0/299 frames (worst interval 16.80ms)
```

Zero dropped frames, and the work fits in a tenth of the budget. The strip is
SVG rather than canvas deliberately: it changes once per turn, and spending a
draw call per frame on a static readout is how a frame budget gets eaten by
something nobody is looking at.

---

## Two anchors moved, and why that is recorded rather than silent

**`verify-montecarlo` M5** pins the shipped config's score and digest, guarding
that optional config fields stay additive. It moved because the refill changed
where faces come from — not a config extension. Re-pinned **once**, from
32/3740550746 to 46/1915249688, with the reason in the file. An anchor updated
whenever it fails guards nothing.

**`verify-staking` S1** failed after the change, reporting "return does not rise
with skill." That would be serious if true. It was not:

```
   120 heats   blind -46%  greedy -47%   ← inverted
   480 heats   blind -48%  greedy -45%   ← correct
  1200 heats   blind -48%  greedy -46%   ← correct, stable
```

The two weakest rungs sit within sampling error at 120 heats, so their order
flipped on any change that reshuffled the boards. The test was underpowered, not
the game unfair. The tempting fix — exempt the bottom two rungs, or compare with
a tolerance — would have weakened the assertion to hide the weakness. The
default is now 480 heats, which costs 2.6 seconds.

---

## What is still only a proposal

- **A3 beyond the strip.** No on-board forecast surface exists, so "forecast
  under fact" is a law with one compliant instance.
- **A4's magnitude channel.** Confidence is built; radius-as-magnitude has
  nothing to encode yet.
- **The depth cap of 2 is chosen, not demonstrated.** The auditor's answer was
  that it is a heuristic and that the way to settle it is to measure the spread
  between a bounded search agent and a greedy one at depth 2 against depth 3 —
  if the spread does not widen, the cap is justified. That has not been run.
- **B5–B8.** Proposed, unbuilt.
- **The socket budget.** Spec 34 puts its own confidence in "four bands legible
  at once without fatigue" at **0.40**, the lowest number in its table. Nothing
  here mounts more than one band, and that is deliberate.
