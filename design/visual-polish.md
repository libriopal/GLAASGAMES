# The visual polish pass, and the thing it turned out to be about

Run under `EINCOL.md`. The cue was one question: **where does this screen fail
to look like a game a person would keep on their phone, in a way an oracle
could catch?**

---

## Step 1 — what was actually measured

Not remembered. The shipped bundle was loaded in a 393×852 viewport, played
four turns, and inspected:

| | Before |
|---|---|
| Document height | **1059px in an 852px viewport** |
| Distinct font families on screen | **1** — `ui-monospace`, everywhere |
| Non-text graphics anywhere on the board | **0** |
| DOM elements | 92 |
| Cell against ground | `#141b26` on `#080c12` |

The first row is the one that matters and it is not a matter of taste: on a
first run the board's buttons were **below the fold**, and the how-to panel
occupied the opening screen. The games-user-research literature on first
sessions is consistent that this is where the churn is.

## Step 2 — the distribution

| p | Candidate |
|---|---|
| 0.24 | 100% monospace — reads as a developer tool |
| 0.20 | Board and actions below the fold |
| 0.16 | Cells nearly invisible against the ground |
| 0.12 | Nothing ever depicts the link — the premise is invisible |
| 0.10 | No juice: no squash, no particle, no lasting mark |
| 0.08 | The proof panel is developer-facing hashes |
| **0.06** | **The screen is built for a reader: zero non-text graphics in 92 elements** |
| **0.04** | No identity — nothing recognisable in a gallery of screenshots |

## Step 3 — the tail

Row one is a font swap. The **p=0.06** row subsumes rows 1, 3, 4 and 5: they are
all symptoms of a screen made entirely of text nodes. Borrowing structure from
cartography — *a map is legible because the relationships between places are
drawn, not just their labels* — this board drew only labels.

## Step 4 — the claim, and its falsification

First formulation: *"evidence vanishes each turn, so a human cannot do the
inference the game measures."* **False, and the board says so:** charge badges
persist. Corrected:

> The board shows current state but never the player's **observation history**.
> The association between a bank and the charge it caused — the only thing that
> discloses the lattice — must be held in the player's head across 12 turns. The
> learner in `verify-learnable` is scored with perfect recall of exactly that
> association. The human was given none.

## Step 5 — the evaluator, three rounds of it

An independent model rejected the fix — an **observation trail**, a bar drawn on
a banked cell's edge showing where its charge was seen to go — and kept
rejecting it, correctly, until the argument became a measurement.

**Round 1.** *"You are leaking the topology by converting transient feedback
into permanent geometric data… this replaces the inference engine with a trivial
graph-completion task."* It conceded no new information is disclosed and named
the condition under which the objection bites.

**Round 2.** So the condition was measured, not argued. A `recall` policy —
model-off baseline plus exactly the trail's contents — and a `clairvoyant`
policy handed the whole lattice, as a ceiling:

| Policy | vs model-off baseline |
|---|---|
| Regional learner (E2) | +4.2% |
| **Trail (perfect recall of witnessed links)** | **+6.3%** |
| Clairvoyant — the entire lattice, played perfectly | **+54.4%** |

The trail claims **12% of the value of knowing everything**, leaving 88%
unclaimed. It also **clears the 5% design target** that three earlier attempts
missed — a target still unmet at 4.2% by the learner E2 measures.

**This falsified my own gate.** E7 first asserted `recall <= learner`, reasoning
the learner "sees everything the trail sees and generalises on top of it". The
measurement fired: 6.3% > 4.2%. The premise was wrong — the two do not nest. The
learner trades exactness for **reach** (and is confidently wrong about the 1 link
in 4 that opposes its region's flow); recall trades reach for **exactness**.

**Round 3.** The auditor held, and sharpened: *"your data quantifies utility,
whereas my objection concerns the cognitive mode… a mechanic can offload the
mental burden without requiring the player to perform the inference."* That is a
distinction a score delta cannot make — but a decomposition can:

| | vs model-off baseline |
|---|---|
| Recall alone | +6.3% |
| Regional deduction alone | +4.2% |
| **Both, as one valuation** | **+7.3%** |

If the memory had absorbed the deductive work, the pair would score like the
better component alone. It does not: deduction stays productive **on top of**
the memory. The witnessed links are an input to inference, not a replacement.

**Two broken instruments were found on the way, and both looked like findings.**
The first hybrid read `lastBanked` *after* the learner had overwritten it, so its
memory never filled and it scored exactly like the learner — which reads as
"they do not compound". The second arbitrated between two policies' answers
against a flat 3.5 expected face and scored **3.4%, below both its own
components** — a worse player, not a result. A hybrid that loses to both its
parts is an arbitration bug.

---

## What shipped

- **Type.** Adobe's font service, asked for screen-ready clarity at this size,
  returns **Roboto** (David Berlow, Christian Robertson). It is also the Android
  system font, so it costs zero bytes and needs no network — which matters for
  an app with no `INTERNET` permission. Monospace is kept for the hashes alone,
  where equal character cells are the requirement rather than a mood.
- **Above the fold.** Masthead to one row, how-to to three lines, proof panel
  folded into a `<details>`. **852px of content in an 852px viewport, with the
  tutorial still up.**
- **The trail** — the first drawn, non-text element the board has ever had.
- **Tabular figures** on the counters, so the score does not shift as it climbs.
- The narrow-phone regression `verify-devices` caught immediately: three
  unbreakable labels overflow a 320px screen by 35px, so the action row wraps
  there rather than shrinking a 48px touch target.

`verify-surface` S1–S6 holds all of it, including the confinement claim that the
trail can contain **exactly** the pairs the player witnessed — never more (a
leak) and never fewer (a trail that forgets).

**Round 4, scoped to the shipped change.** With cognitive mode set aside as
unreachable offline, the auditor named one concrete technical objection: the
charge travels two steps, so a bounce should draw a second bar for a single
player-caused charge and break the equality S4 asserts.

It was wrong, and it was still worth acting on. `observed` is keyed by the
banked cell, so a source carries at most one bar; and a two-step walk on a grid
**cannot end cardinally adjacent to its start** — two steps preserve the parity
of (row + column), cardinal adjacency flips it — so the onward hop is excluded
by the adjacency test rather than by luck. Neither fact was asserted anywhere.
Both now are: **S7** requires real multi-cell propagations to appear in the logs
(so the filter is exercised rather than merely present), requires none of them to
land adjacent to their source, and requires no cell to carry two bars. Measured:
*7 multi-cell propagations, 0 adjacent, 0 doubled.* If a later rule change makes
the charge travel three steps, or links diagonal, S7 fails instead of the trail
quietly drawing a link nobody saw.

## Still open

- **No human has played this.** Every number here is a policy. E8 says memory
  and deduction compound *for a machine*; whether a person experiences the trail
  as support or as a solved puzzle is what the twelve closed testers answer.
- The auditor never withdrew its objection in principle, and its final position
  is recorded rather than smoothed over: a measurement of utility is not a
  measurement of cognitive mode. E8 is the closest available proxy, not the
  thing itself.
- E2 still reports the 5% target unmet at 4.2%, because it measures the regional
  learner. The target is now cleared by the policy the shipped screen supports,
  and both numbers are printed rather than one replacing the other.
