# FARKLE — game one of three

**Status: built, oracled, audited APPROVE on round 3. Awaiting your sign-off before game two.**

---

## What the player does

Trace a path of up to six orthogonally-connected dice. The faces under that path
score as a **Farkle hand** — the real pay table, not an invented one. Triples,
straights, two triplets, three pairs, 1s and 5s.

Then the decision: **take another chain, or bank.**

Cells leave the hand as they score and **nothing replaces them until the turn
ends.** So the hand shrinks, connectivity dies, and the next chain gets harder.
Bank and the score is safe. Push and find nothing — that is a **farkle**, and the
whole turn is gone.

---

## Why it is not just match-3 with dice on it

Three games ship, and each has a different *question* at its centre.

| | the board is | the skill is | the loss is |
|---|---|---|---|
| **Farkle** | a hand you burn down | knowing when to stop | a farkle — you took one chain too many |
| Chemical | a closed system of atoms | knowing what molecules exist | — |
| Darkmatter | a physical field | — | — |

Farkle's question is **"again?"**. Nothing else in the set asks it.

---

## The two measurements the design rests on

### 1. Hand size is 16, and it was swept — not chosen

The target was not invented. It is the **actual tabletop farkle probability by
dice remaining**, brute-forced over 200,000 throws per depth with every subset
tested for a score:

```
6 dice 2.3%   5 dice 7.8%   4 dice 15.8%
3 dice 27.8%  2 dice 44.3%  1 die  66.8%
```

Sweeping the live-hand size on the grid, RMS distance from that curve:

```
hand  6  → 55.0      hand 12 → 30.5
hand  9  → 42.9      hand 16 →  4.7   ← ships
hand 10  → 39.5      hand 20 →  7.5
```

Hand size was the **only** free parameter, and nothing was fitted after the
comparison. `verify-farkle` K4 recomputes both curves on every run, so a
pay-table edit that quietly turns this into a different game fails the build.

### 2. Risk is caused by the player, not scheduled by the board

Same 2000 boards, three policies:

| policy | cells taken per step | farkle % at step 6 | RMS vs tabletop |
|---|---|---|---|
| MAXSCORE — grab the biggest | 3.02 | 86.8% | 15.2 |
| FEWEST — take the smallest scorer | 1.37 | 26.2% | 24.4 |
| **EFFICIENT — best score per cell** | 2.52 | 60.1% | **4.7** |

**The risk curve is not a property of the design. It is a consequence of the
player's policy.** The same board at the same step is 28.1% lethal to one policy
and 44.4% to another (`verify-farkle` K5).

That is the answer to the failure the auditor named the *Calculator Problem* —
"if a player can look at the risk strip and realise the EV of step 7 is always
lower than step 6, the human element will be crushed by mathematical
optimisation." There is no such schedule, because no instrument can know how
fast you intend to burn your hand.

---

## The screen, element by element

**INCOMING (top).** Two rows. Row 1 is certain — those faces are fixed by the
seed. Row 2 is fallible and washes out toward the deck as confidence drops. It
is *spatially* above the board and never drawn over it, because a forecast
rendered on top of a fact reads as a fact.

**THE LIVE HAND.** Sixteen connected dice, lit and outlined. The other twenty are
visible and pushed down into the deck. The auditor was explicit that this decides
whether the game works: *"it is an arbitrary fence unless the UI treats it as a
Hand… the distinction is between 'the board is locked' and 'this is my hand'."*

**THE CHAIN.** A ribbon threading the dice, not selection boxes.

**THE READOUT.** The combination is **named** — "Two Triplets" — and the number
is the footnote. This is the one piece of empirical guidance the optical research
supplied: signature matching measured best of four presentations tested, mapping
values onto colour measured worst.

**LEAVES THE HAND.** Three countable ticks and a word: SAFE / THIN / EXPOSED /
CRITICAL. It reports what *this chain* would leave behind — a Safety Inspector,
not a Fortune Teller. Never a percentage; no readout asks you to compare two
magnitudes.

**AT RISK vs BANKED.** The unbanked figure is legible as unbanked.

**BANK.** The only irreversible action, so the loudest thing on screen. With
nothing at risk it drops to an outline reading NOTHING AT RISK — a button that
does nothing must not look like the primary action.

---

## Modes — one executor, a config field

- **SOLO** — fixed turns, score is the bank.
- **VS** — shared seed, identical hands, **blind settlement**: neither player
  sees the other's total until both close. Otherwise the second mover knows the
  target score, which changes correct risk-taking and is an edge the first player
  never had.
- **COOP** — one board, alternating turns, **separate banks**. Cells one player
  clears are gone for the other, so cooperation is spatial: carve the board so
  both keep options.

Coop was redesigned after the auditor rejected a shared unbanked pot as a Stag
Hunt where *"the safe player will feel held hostage by the risky player… a
corrosive tension."* Nobody can lose anybody else's points now.

---

## What was cut, and why

- **Wildcards.** A wildcard whose face is a fallible claim and a preview that
  agrees exactly with the executor are mutually exclusive. The preview/executor
  identity is what stops a client showing a number the server will contradict; a
  cosmetic feature does not get to break it.
- **Hot dice as a bonus.** Continuation became the core loop instead.
- **Mid-turn refill.** It is the single rule the entire risk curve rests on.

---

## Verification

`verify-farkle` **K1–K11**, wired into `npm run verify`:

- **K1** parity — 10 hands score *and name* exactly as the source engine does
- **K2** the chain index is a bijection — 55,986 hands, 0 collisions, all round-trip
- **K3** the hand is 16 cells, connected, reproducible from the seed alone
- **K4** efficient play lands RMS 5.7 from the tabletop curve
- **K5** risk is endogenous — 44.4% vs 28.1% on identical boards
- **K6** the preview and the executor are one function
- **K7** gap / revisit / over-length / outside-hand / zero-score each rejected by name
- **K8** honest round replays at 22,700; +500 and all-bank both rejected
- **K9** coop never reduces the idle player's bank
- **K10** all four risk states reachable
- **K11** negative control — the real table farkles 253/400 at step 4, an
  all-scoring table farkles 0/400

**Performance**, 393×852 @2x at 4× CPU throttle: frame cost p99 **2.20 ms**
against a 16.67 ms budget (13.2%), **0/299 frames dropped**.

**Provenance**: the scorer is a genuine code port from
`magentadice-cyancode@8db018e`, header naming exactly what changed (one type
import). Parity with the source is the contract.

---

## Open, and honestly so

1. **Bank-aware agents have not been run against each other.** `prudentChain`
   exists but the four-agent Monte Carlo harness for this game is not written.
   The skill spread is unmeasured.
2. **The amber/cyan/magenta split has not been checked at launcher thumbnail
   size.** It is asserted, not measured.
3. **Bombs (`BOMB_STANDARD`, `BOMB_RAINBOW`) are wired in the scorer but not in
   the board.** Six-of-a-kind and straights return the trigger; nothing consumes
   it yet.
4. **No audio, no haptics, no animation.** The screen is static SVG.
