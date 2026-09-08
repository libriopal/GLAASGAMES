# The Hidden Axis — blueprint v3

**Status: AWAITING HUMAN APPROVAL AT THE VERIFY GATE.**
No design item written, no code changed. Research and audit halves only.

Sources: `GLAASGAMES @ 4b16042` · `glassbox_labs @ 9cdcffd` ·
`magentadice-cyancode @ 8db018e` + submodules `FAR_NZY`, `adabt-core` ·
the `data/` image corpus (1,115 jpeg + 13 png concept frames).

**Your instructions, applied:** OWC decision **deferred** to the ABC question in
§7 — I make no recommendation there and ask nothing of you elsewhere. Legality
and staking follow the **Glassbox_Labs** path (principal-return bond), **not**
AMOE sweepstakes. §6 is the adaptation you asked for, with the invention shown
rather than asserted. BrightData: noted as handled, dropped.

---

## 1. What the images told me

I read the concept corpus before designing, because you said the pattern was in
it. Three frames carry it.

**`data/mp981pc1oj760u.jpeg`** — a Gothic stained-glass window beside a root/
tendril network. The window is a **2D grid of discrete coloured cells**. The
network beside it is **continuous, branching, and not a grid at all**. Two
representations of one thing: the lattice you play on, and the structure
underneath it.

**`data/Firefly_Flux_…dice specimens….png`** — three tokens as individually lit
**volumetric specimens**: a d6 with glowing facet sigils, a geode, a bio-bomb.
Each is unmistakably a 3D object. Behind them, flowing curves — field lines.

**`data/1778879125672.png`** — the running build. A 2D grid of cells; each cell
holds a die face or an orb rendered with bevel, rim-light and internal depth;
behind the grid, energy veins; below it, a beat window with chord markers.

**The pattern, stated plainly:** *objects are volumetric, the board is flat, and
the structure connecting them is invisible.* That is not three design choices.
It is one architecture with three layers, and it maps exactly onto a 4D engine.

---

## 2. The rendering stack

Four layers. Each is a real thing the engine computes; none is decoration.

```
  4D world state          hidden           the truth
        │                                  (x, y, z, w) per token
        │  per-token R⁴ rotation
        ▼
  pseudo-3D token         visible          the specimen: facets, rim-light,
        │                                  internal glow — the die you see
        │  snapped to lattice
        ▼
  2D grid cell            visible          the game: rows and columns
        │
        │  aggregate
        ▼
  2D overall view         visible          the board, and the veins behind it
```

### 2.1 How a 4D engine draws a 3D die on a 2D board

The engine already does every step; nothing here is new mathematics.

- A token's **grid position** is `(x, y)`, quantised to the lattice. This is the
  game. Nothing about play is continuous.
- `z` is **maturity** — how near the cell is to resolving. It never moves the
  token off its cell; it drives *how the token looks*: depth of bevel, intensity
  of internal light, the "about to happen" read.
- `w` is **hidden**. §3.
- Each token is drawn by taking its 4D position through the existing chain —
  `orientationToMatrix` over the six R⁴ planes, then to 3D, then to screen —
  but with the **translation clamped to the cell** and only the **rotation** free.

That last clause is the whole trick, and it is why this is not a gimmick: **a
4D rotation of a cube produces a sequence of 3D shadows that a 3D rotation
cannot.** Faces appear from nowhere and fold away — the tesseract's cross-section
behaviour. Applied to a die sitting still in its cell, that reads as a *specimen
turning in a case*: volumetric, alive, impossible to mistake for a sprite. The
`xw` and `yw` dials — the two with no 3D analogue — are precisely what makes the
facet sigils in the concept art possible.

The die never leaves its square. The game stays a 2D grid. The die looks 3D
because it is being rotated in 4D and sliced.

### 2.2 What the 2D overall view is for

The board view is not a camera. It is the **bandwidth constriction**, and it is
deliberate: it is the interface that admits `(x, y)` and the *consequences* of
`z` and `w`, and nothing else. §4 is why that constriction is the game.

The veins behind the grid — the root network from the stained-glass frame — are
the **only** rendering of `w`, and they are rendered as *field*, never as value:
flow, brightness, direction of travel. You can see that something is happening
along the hidden axis. You cannot read what.

---

## 3. The hidden axis, and how it survives an attacker

`w` carries the **lineage of the unresolved** — which cells are being fed by
what, which cascades are latent, which rolls are already determined but not yet
shown. It is the state that makes forecasting a skill rather than a readout.

Hidden information on a client the player controls is the hardest problem in
this design, and it needs three layers. I put it to the auditor twice.

**Layer 1 — commit–reveal, so the house cannot steer it.**
Before a round, publish `H = hash(w-lineage seed)`. During play the client
observes only consequences. After the round the seed is revealed and anyone can
recompute the entire 4D evolution and check it against `H`. This is exactly
FAR_NZY's `csprng.ts` — SHA-256/HMAC commit–reveal, server seed plus client
seed — doing the job it was built for.

**Layer 2 — replay verification, so the player cannot fake an outcome.**
The auditor's finding on layer 1:

> The strongest attack is local code or memory manipulation. Because the game
> runs offline on the player's own device, the player has total control over the
> execution environment and can bypass the commit–reveal entirely by modifying
> the game logic to force a winning outcome. This bites whenever the player has
> administrative or root access.

Correct, and commit–reveal cannot fix it — it constrains the operator, not the
player. What fixes it is already built: **a submitted result is not a score, it
is a replay, and it counts only when recomputed by a verifier the player does
not control.** A patched client can draw anything it likes locally; it cannot
manufacture an input stream that reproduces a false outcome under the real
rules, because the rules are integer and deterministic and the recomputation is
not run on their machine.

**Layer 3 — the two fairness models compose.**
Commit–reveal proves *unpredictability*. Replay proves *reproducibility*.
Neither alone is enough; together the player can verify the operator did not
steer the hidden axis **and** the operator can verify the player did not forge
the result. That symmetry is the integrity claim of the whole product, and
neither repo could make it alone.

> **Obligation H1.** The revealed seed reproduces the round's `w` evolution and
> matches the published commitment. **Negative control:** a seed altered by one
> bit must fail the commitment check.
>
> **Obligation H2.** `w` is not derivable from the pre-round client bundle. A
> static analysis asserts no path from shipped data to `w` before reveal.
> **Negative control:** a build that leaks the seed into the bundle must fail.
>
> **Obligation R1.** The seed enters the simulation as integer bits, never as a
> float — `nextFloat()` is float64-shaped and is exactly what the kernel's
> i32-wrapping contract exists to catch. **Negative control:** a float injected
> anywhere in the path must fail.

### 3.1 The cost I am not hiding

Layer 2 needs a verifier the player does not control, which means **ranked and
bonded play requires connectivity.** The APK we shipped requests no INTERNET
permission at all, and that is load-bearing for its Data Safety declaration.

The split I recommend: **solo and the daily stay exactly as they are** — offline,
permissionless, verifiable locally by anyone. **Ranked and bonded competition is
a separate surface** that requires the network and declares it honestly. Do not
add INTERNET to the offline build to serve a mode it does not have.

---

## 4. Bandwidth constriction is the skill ceiling

This is the part I want to argue for, because it is the reason the architecture
is worth building rather than merely coherent.

The player sees `(x, y)` and the consequences of `z`. They do not see `w`. But
`w` is not random — it is a lineage, evolving under fixed integer rules from a
seed that was committed before the round. So **`w` is inferable**, and the
accuracy of that inference is the skill.

That gives a skill ceiling with three properties I could not get any other way:

1. **It is deep.** Inferring a hidden deterministic process from partial
   observation is the same shape as reading a tell in poker, except the ground
   truth exists and is checkable after the fact.
2. **It is fair.** Every player gets the identical constriction. The information
   is not hidden from *some* players; it is hidden from *the client*, and the
   commitment proves it was hidden from the operator too.
3. **It is not exploitable.** There is nothing to hack, because the thing a
   cheater would want to read is not on their device (H2) and the outcome they
   would want to forge does not survive recomputation (layer 2).

**Compare with the alternative.** Hiding information by simply *not sending it*
to a client that could compute it — the design my earlier blueprint drifted
toward — is not hidden at all; it is one memory read away. That is the exploit
the auditor named in the last pass, and it is why this blueprint moves the
hidden axis behind a cryptographic commitment instead of behind a UI decision.

---

## 5. Forecasting over the unrevealed

The forecast is not a prediction of the future. It is **the distribution of
hidden states consistent with what you have seen so far** — Monte Carlo over the
unrevealed `w` lineages that match every observation to date.

Early in a round that distribution is wide. Every observation narrows it. The
player's job is to act well while it is still wide, and mastery is doing that
earlier than other people.

Drawn per the evidence and not otherwise: **20 discrete dots, each an actual
rollout** — a quantile dotplot. Never a band, never a percentage. Frequency
framing is understood where probability framing is not (Kay et al. 2016;
Fernandes et al. CHI 2018; Hullman et al. 2015; Kale et al. 2018/2020; Padilla,
Kay & Hullman 2022; Gigerenzer & Hoffrage 1995), and a continuous band invites
**deterministic construal error** — the documented tendency to read an uncertain
display as a certain one. Twenty countable dots structurally resist that,
because there is nothing smooth to mistake for a promise.

FAR_NZY's `monteCarlo.ts` already exists and is sacred-core; this is a consumer
of it, not a replacement.

> **Obligation F1.** Same state, same seed, same dots. **Negative control:** a
> one-unit change in `w` must move at least one dot.
>
> **Obligation F2.** Calibration: over a recorded session, outcomes fall inside
> the stated interval at the stated rate. **Negative control:** a deliberately
> biased forecast must fail. *A confidently wrong forecast is worse than none.*

---

## 6. The bond, adapted — the invention, shown

You asked for the principal-return bond to *play* as close to 1:1 with the AMOE
sweepstakes path as possible, while the strict rules stay true underneath, and
for the invention to be verbose rather than asserted. This section is that work.

### 6.1 What had to be reconciled

**What the sweepstakes frame gives a player**, from your own concept art —
"ROLL. HACK. WIN. TOGETHER.", "Play free. Win big. Real prizes, no purchase
necessary", a jackpot, a prize pool, live tournaments:

1. It costs nothing to play.
2. There is real upside.
3. Money may be spent, and spending does not buy odds.
4. There is a moment of consequence.

**What the Glassbox bond gives**, from `game/economy/rules.ts:88` —
`payout === principal`, "the ~2% bonus was removed (Tier 1, R6Q2)":

1. Post a stake, receive exactly it back.
2. No upside from the stake.
3. Nothing at risk.

Overlap on (1) and (3). **The gap is upside** — item 2 on one list, absent from
the other. Everything below is the work of closing that gap without touching
`payout === principal`.

### 6.2 The move: split the flows that a sweepstakes fuses

A sweepstakes fuses **entry** and **prize** into one economy: purchases fund the
pool, AMOE exists so the pool is not *only* funded by purchases. The fusion is
what creates the legal problem, and AMOE is the patch.

**Do not patch it. Unfuse it.**

- **The bond is a commitment device, not an entry fee.** It is posted, it is
  locked for the run, and it returns at 100% — win, lose or abandon. It buys no
  odds, no prize, no advantage. It buys *a cohort*: the bonded ladder, where
  everyone has locked capital and nobody is idly abandoning.
- **The prize is skill-ranked and funded from outside the bonds entirely.** Not
  one unit of prize value may originate from a stake. Fund it from treasury,
  sponsorship, or cosmetic revenue — sources whose payers are not the competitor
  pool and whose payment buys no odds.

That is the whole invention. It is one sentence — *the money that commits and
the money that rewards must never be the same money* — and everything else
follows.

### 6.3 What the player experiences

| The sweepstakes frame | The bond, adapted | Same? |
|---|---|---|
| Play free | Play free — the bond is optional, and unbonded ladders exist | **yes** |
| Real prizes | Real prizes, skill-ranked, treasury-funded | **yes** |
| Purchase doesn't improve odds | Bond cannot improve odds — asserted by oracle, not policy | **yes, and stronger** |
| A moment of consequence | Your capital is locked while you play | **yes** |
| Jackpot can grow without bound | Prize pool is bounded by external funding | **no — see §6.5** |

Four of five at 1:1. The fifth is a real difference and I am not going to
disguise it.

### 6.4 Proven value — why the adaptation is *better*, not merely equivalent

Five properties, each of which is a consequence of the structure rather than a
promise in a document.

**1. It removes two elements of the gambling test, where AMOE removes one.**
Gambling requires consideration **and** chance **and** prize together; removing
any one suffices. AMOE removes consideration by offering a free route alongside
a paid one. This removes consideration *by construction* — a fully refunded bond
is not something of value wagered, because nothing is at risk — **and** removes
chance, because the prize is ranked on skill. Two independent removals rather
than one patch.

**2. Every player is on the free path. There is no second path to police.**
An AMOE's greatest operational risk is that the free route is technically
present but practically discouraged — which is precisely the deceptive-practices
exposure. Here there is no paid route to the prize at all, so there is nothing
to discourage and nothing to audit for parity.

**3. The loss-chasing surface is zero, structurally.**
This is the one I would defend hardest. Loss-chasing — betting more to recover
what was lost — is the primary harm vector in gambling, and every responsible-
gaming control in the industry is a *mitigation* layered on a mechanic that
still permits it. **A stake that cannot be lost cannot be chased.** Not
"discouraged". Cannot. `verifyNoStakeBonus` is a two-line function that makes
the harm mechanically unreachable, and it is already written and already tested.
This is the strongest anti-exploitation claim in the entire system and it comes
free with the Tier 1 decision you already made.

**4. It keeps the ship path we built.**
Not a real-money gambling app: no licensing, no per-jurisdiction geo-gating, no
adult rating, no removal from Play Billing, normal distribution. Play's
real-money policy is not engaged because there is no wager and no chance-based
prize.

**5. It is honest under your own governance.**
`3libras/the_audit.md`: *"Economic trust is infrastructure… all systems must
reinforce trust. Not short-term extraction."* An unlosable bond and an
externally-funded prize is that sentence implemented rather than quoted.

### 6.5 The cost, stated plainly

**Prize pools are bounded by external funding.** A sweepstakes jackpot can grow
with purchases; this one cannot, because that is the exact coupling being
severed. If your model requires an unbounded jackpot fed by players, this
adaptation does not deliver it and no amount of design will make it — that
requires the AMOE structure, which you have directed away from.

What you get instead is a prize pool you can state honestly in advance, which is
a different and in some ways better product.

### 6.6 The oracles

> **S1.** `payout === principal`, always. *(exists: `verifyNoStakeBonus`)*
> **Negative control:** any bonus must fail.
>
> **S2.** No prize value traces to a bond. A funding-provenance check walks every
> prize award to its source. **Negative control:** a prize funded from the bond
> pool must fail.
>
> **S3.** Bonded and unbonded cohorts have statistically indistinguishable odds
> and prize expectation per unit of skill. **Negative control:** a build giving
> bonded players any edge must fail.
>
> **S4.** No loss-framing, no dark patterns, no scarcity timer, no streak
> punishment, graceful session end. *(exists: `verifyAntiManipulation`)*

---

## 7. The OWC — the ABC question, deferred as you asked

I am not recommending. Here is the question, explained enough to answer.

**What the OWC is.** `design/OpportunityWeightController.md`: it reads board
state and, when `playerBanked < leaderBanked * 0.7`, raises draw weights —
`wildBoostPct` and `cascadeEnablerBoostPct` up to +10, `blockerBoostPct` up to
+5. Its design note says explicitly that it grants *"strategic comeback
opportunities (not guaranteed rewards)"*, which is a real and meaningful
distinction: the player still has to convert.

**Why it is contested.** Three separate lines, which is why this needs your
decision and not mine:
- *Legal.* `LEGAL.md` rests partly on skill predominance. An independent
  auditor, unprompted, called a hidden chance-adjuster exposure to deceptive
  practices — though note that ground is one of three, and you have now directed
  the design away from the sweepstakes framing that made it load-bearing.
- *Empirical.* Dynamic difficulty adjustment is what my earlier research pass
  **falsified** — a pre-registered study found no effect of challenge–skill
  balance on enjoyment. The OWC's stated benefit is the one the evidence does
  not support.
- *Governance.* `3libras/the_audit.md` requires all systems to reinforce trust.
  An undisclosed probability adjustment is concealment by construction.

**Why it might still be right.** Dead boards are a real failure and the authors
observed it directly. I have no evidence they were wrong about the problem —
only about the fix being invisible.

---

> ### The question
>
> **A. Disclose and bound it.** The OWC stays. When it fires, the player is told
> — a visible marker in the UI — and its magnitude is written into the replay.
> A ceiling is set, and `verify-skill-dominance` proves on every build that skill
> remains the dominant factor with it live.
> *Gain:* dead boards fixed; trust intact; the legal claim becomes a number.
> *Cost:* some of the invisible smoothing is lost — players will see the help.
>
> **B. Remove it; fix dead boards in the rules instead.** No hidden adjuster at
> all. Address stagnation through mechanics every player can see and reason
> about — board-refresh rules, visible catalysts, an explicit comeback mechanic
> that is *part of the game* rather than part of the shuffle.
> *Gain:* the cleanest possible integrity story; nothing to disclose because
> nothing is hidden; strongest skill-predominance position.
> *Cost:* real design work, and the rules-level fix may be less effective than
> the weighting was.
>
> **C. Keep it as-is, undisclosed.** The OWC continues to adjust probabilities
> silently.
> *Gain:* smoothest felt experience; no work; no visible "you are being helped".
> *Cost:* runs against your own governance law, the research, and the audit. If
> you choose this I will implement it, and I will record the decision as yours,
> because I cannot honestly present it as consistent with `the_audit.md`.
>
> **My commitment either way:** whichever you pick, `verify-skill-dominance`
> (§8, O1) gets built. Under A and C it measures a risk; under B it proves the
> risk is absent. It is worth having in all three worlds.

---

## 8. The verification phase

| Id | Obligation | Oracle | Negative control |
|---|---|---|---|
| H1 | Revealed seed reproduces `w` and matches the commitment | `verify-commit` | one-bit seed change must fail |
| H2 | `w` not derivable from the pre-round bundle | `verify-commit` | a leaked seed must fail |
| R1 | Seed enters as integer bits, never float | `verify-seed` | injected float must fail |
| V1 | Tokens read as volumetric; board stays a lattice | `verify-lens` | a token off its cell must fail |
| V2 | Four channels, no fifth; no magnitude on hue | `verify-lens` | a planted fifth must fail |
| V3 | `w` rendered as field only, never as a readable value | `verify-lens` | a numeric `w` readout must fail |
| F1 | Forecast reproducible | `verify-forecast` | 1-unit `w` change moves a dot |
| F2 | Forecast calibrated | `verify-forecast` | a biased forecast must fail |
| O1 | Skill remains the dominant factor | `verify-skill-dominance` | an excessive OWC must drop correlation below threshold |
| S1 | `payout === principal` | `verify:economy` *(exists)* | any bonus must fail |
| S2 | No prize value traces to a bond | `verify-funding` | bond-funded prize must fail |
| S3 | Bonded cohort has no edge | `verify-funding` | any edge must fail |
| S4 | No dark patterns | `verify:economy` *(exists)* | planted pattern must fail |
| B1 | Gate provenance earned, via `IEventStore.v1` | `verify-bridge` | fabricated session rejected |
| M1 | Music deterministic from state | `verify-music` | 1-tick change alters sequence |
| A1 | Every audio cue has a visual twin | `verify-a11y` | audio-only cue must fail |

Already green: determinism `0xfc60aadd`, GPU parity `0x1f3865c0`, replay, daily,
controls, i32 wrapping, permission allowlist.

## 9. Sequence

1. **H1/H2/R1 — the hidden axis and its commitment.** Everything else is built
   on it, and it is the part that must be right before anyone stakes anything.
2. **V1–V3 — the token renderer.** Re-target the existing 4D chain to
   cell-clamped rotation. The board is a lattice; the dice turn in 4D.
3. **O1 — skill dominance.** Built regardless of the §7 answer.
4. **F1/F2 — forecasting over the unrevealed.**
5. **S2/S3 — funding provenance**, once there is a prize to fund.
6. **B1 — the bridge** to the foundry via `IEventStore.v1`.
7. **M1/A1 — adopt AMIS.** Integrate; do not rebuild.
8. **Ranked/bonded surface** with its own connectivity declaration (§3.1).

## 10. The decision at this gate

1. **Approve** — §2 rendering stack, §3 hidden axis, §5 forecasting, §6 bond
   adaptation, sequence in §9.
2. **Approve with changes** — name what moves or is cut.
3. **Reject** — name what is wrong; back to Research.

Plus **§7: A, B or C.**

I cannot sign a Tier 1 gate, write `APPROVED FOR RESEARCH EXECUTION`, or clear
any of this as legally compliant. `LEGAL.md` says on its own face that counsel
should be engaged, and §6 changes the structure enough that it should be
re-reviewed rather than assumed to inherit the old analysis.
