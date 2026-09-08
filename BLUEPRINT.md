# The Unified Lattice — blueprint v4

**Status: AWAITING HUMAN APPROVAL AT THE VERIFY GATE.**
No design item written, no code changed.

This revision answers the question you left open, and the answer is derived from
your own repository rather than from my preference.

---

## 1. The OWC: **B**, and why it is not a judgement call

You asked me not to assume. Here is the chain, every link verified in source.

**1. Your architecture forbids it.** `CLAUDE.md:524-533` defines five layers,
and states that lower layers cannot be mutated by higher ones:

```
L5  ADORNMENT    — cosmetic only; observes state, never mutates it
L4  GENRE META   — post-score multipliers
L3  MODE OVERLAY — round flow + scoring frame
L2  ENERGY GATE  — Prime/Frenzy meter, Wild Scatter, round-end gates
L1  SACRED CORE  — scoreFarkle(), CSPRNG, SixPoolManager (immutable mid-match)
```

> "No genre module may modify scoring inputs, reroll the dice stream, or alter
> **face distributions in the live pool**."

**2. The OWC does exactly the forbidden thing, mid-match.**
`monteCarlo.ts:371` — the comment is literally `// ── OWC per-turn face bias ──`.
It sits **inside** `for (let turn = 0; turn < maxTurns; turn++)`, and writes
`spawnWeightAdjustments.face_1` … `face_6` every turn. `SixPoolManager` is L1 and
declared *immutable mid-match*. The effective face distribution is not immutable;
it is re-biased on every turn.

**3. And this is the part that settles it — what it steers does not exist here.**
The OWC's input is `currentRTP` against `owcTargetRTP ?? RTP_CONFIGS[mode]?.targetRTP ?? 0.92`.
It is not a comeback mechanic. It is a **Return-To-Player steerer**. The design
document says "comeback opportunity"; the implementation holds a house-edge
figure.

RTP is defined only where money is wagered: *"RTP measures the expected return on
wagered funds… it does not apply to skill-based competitions, free-entry
tournaments, or any format where no money is staked; in those cases there is no
house edge to offset and the concept of RTP is irrelevant."*

You have directed the **Glassbox_Labs** path: `payout === principal`, prizes
funded outside the stakes. **In that economy RTP ≡ 1.0 by construction.** There
is no house edge. The OWC is a controller with no setpoint — a thermostat wired
to a room that has no temperature.

**So B is not "hidden is bad".** B is: *the quantity it targets has no referent
in the economy you chose, and the mechanism it uses violates the layer law you
wrote.* A cannot rescue it, because disclosure changes visibility, not which
layer mutates, and it would disclose a number that means nothing. C compounds
both.

### 1.1 What replaces it — and the problem it actually solved

Dead boards are real. The authors observed a real failure. The industry answer
is rules-level and symmetric: **deadlock detection plus a visible reshuffle**,
with solvable-board generation (reject placements that create an immediate
match). It fixes stagnation without knowing who is behind.

Its home is already in your stack: **L2 ENERGY GATE**, which in `monteCarlo.ts`
already switches `SPAWN_WEIGHTS[energyMode]` between PRIME and FRENZY — visibly,
through the Trick Meter in your own screenshot, at a layer permitted to do it,
and identically for every player.

**Keep the OWC as an offline instrument.** `owcContributionRTP` and
`owcErrorCount` are genuinely useful *measurements* in the sandbox for finding
stagnant configurations during design. Measuring is not steering. It runs in
`sandbox-ui/`, never in a live match.

---

## 2. What the corpus says at macro scale

I re-read `data/` as an aggregate — all 1,116 prompt records — rather than image
by image. The forest is not what the trees suggested.

| Theme | Prompts | Share |
|---|---|---|
| lattice / grid / tile / board | 896 | **80.3%** |
| neural / synaptic / tendril / vein | 802 | **71.9%** |
| music / rhythm | 376 | 33.7% |
| casino / stake | 347 | 31.1% |
| psychedelic register | 238 | 21.3% |
| dimensional / hidden | 196 | 17.6% |
| truth / audit | 65 | 5.8% |
| **probability / forecast** | 60 | **5.4%** |

656 prompts contain **both** the lattice and the network. The corpus names the
structure: the **"UNIFIED LATTICE"** (40 prompts), the **"Dream-Core"** (55),
seen through *"ultra-detailed cross-section… slicing through the Dream-Core to
expose tiered modules"*. Genre names appear throughout — Horror 103, Roguelike
99, Casino 28, Metroidvania 19 — matching the 20 genre modules in
`glassbox-forest/MERGED_EXECUTION_PLAN.md`.

**This falsifies my own v3.** I built forecasting into a pillar; the corpus puts
it at 5.4%. The experience your corpus describes is *a board that is alive
underneath* — 80% lattice, 72% network, co-occurring. Forecasting is demoted to
a readout. §5 reflects that.

**And the psychedelic register is geometric, not hallucinatory:** prism 92, warp
72, fractal 66, refract 66, shift 65, fold+unfold 54, kaleidoscope 7 —
hallucination, trance and liminal appear **zero** times. That is *refraction and
folding*, which is what 4D rotation and slicing actually look like. The
psychedelia you want is not a filter. It is the geometry.

---

## 3. The architecture, corrected by audit

I was about to propose that each of the twenty genres is a different
cross-section of the 4D state. I put it to the auditor first:

> The architecture fails due to **mathematical over-constraint of the state
> space.** To ensure each 3D cross-section functions as a coherent playable
> genre, the underlying 4D structure must simultaneously satisfy the divergent
> mechanical axioms of all twenty. This bites when the requirements of one
> genre — resource scarcity essential to horror — are logically incompatible
> with another — the high-frequency reward loops of a casino — leaving a state
> space either empty or too rigid to permit agency.

Correct, and **your repo already says it was never the design.** Genre modules
are *composable layers wrapping L1*; they observe and add post-score multipliers.
They do not slice the core. The corrected stack:

```
   L1  the 4D UNIFIED LATTICE          one state, one truth, integer, deterministic
        │
        │  cross-section at the player's w        ← the LENS (one, not twenty)
        ▼
   2D grid of tiles                     the board you play
        │
        │  per-token 4D rotation, translation clamped to cell
        ▼
   volumetric dice and orbs             the specimens
        │
        │  L3/L4/L5 wrappers observe and decorate
        ▼
   twenty genre presentations           round flow, multipliers, adornment
```

**One lens, twenty wrappers.** That survives the audit and matches `CLAUDE.md`.

### 3.1 Why the dice look 3D on a flat board

A token's grid position is quantised to its cell and **clamped**; only its
**rotation** in R⁴ is free. A 4D rotation of a cube produces a sequence of 3D
shadows a 3D rotation cannot — faces arriving from nowhere and folding away. On
a die sitting still in its square that reads as *a specimen turning in a case*.
The `xw` and `yw` dials, the two with no 3D analogue, are what make the facet
sigils in your concept art possible. The die never leaves its cell. The game
stays a 2D grid.

### 3.2 The lens, validated by the only shipped 4D game

Miegakure and 4D Toys teach 4D by **restricting the view to 3D slices** and
letting the player move the slicing plane; playtesters internalised the mechanic
and could predict how objects appear in adjacent slices. Its designer's key
insight is the one I am adopting: **use "parallel worlds" as the familiar
foundation** — each slice is a world, and the fourth axis is the corridor
between them.

His caution is adopted too: *a true 3D object can look confusing seen only
through 2D slices.* So the slice is never the whole interface — the **veins**
(§4) carry what the slice excludes, as field rather than value.

---

## 4. The hidden axis, and the safeguard that matters most

`w` carries the lattice's **connectivity** — which tiles feed which, which
cascades are latent. It is rendered only as the neural veins behind the board:
flow, brightness, direction. Never a number.

**Integrity, three layers** (unchanged from v3, all still required): commit–reveal
so the operator cannot steer it; server-side replay verification so a patched
client cannot forge an outcome; and the two composing so each side can verify the
other. Ranked play therefore needs connectivity — solo and the daily stay
offline and permissionless, and I am not adding INTERNET to that build.

### 4.1 The apophenia problem, and why this is the most important oracle

Hidden structure invites pattern-seeking, and the research is pointed: **habitual
gamblers detect illusory patterns in random data more than non-gamblers do.** A
game presenting a hidden layer to infer is precisely the stimulus that exploits
that, in exactly the population most at risk.

The distinction that saves the design is sharp: **apophenia is a false positive
on randomness.** If the hidden layer is genuinely structured and genuinely
inferable, the player's pattern detection is *correct*. The harm is a hidden
layer that is noise.

So the design must **prove its structure is real**:

> **Obligation P1 — the honesty oracle.** Measure the mutual information between
> the hidden lattice and the observable consequences. It must exceed a stated
> threshold. **Negative control:** a randomised lattice must fail. Publish the
> figure.
>
> **Obligation P2 — reveal.** After every round the true lattice is shown, so a
> player learns whether their inference was right. Ground truth every round is
> the opposite of a slot machine, which never reveals.

I put P1/P2 to the auditor, which found the residual:

> The safeguard reinforces the **illusion of control**… immediate feedback
> transforms a stochastic process into a reinforcement-learning task, validating
> pattern-seeking and increasing the drive to master the structure, which is more
> addictive than pure randomness.

Half right, and the half that is wrong matters: here it is not an *illusion* of
control, because P1 proves the control is real. But the surviving half stands and
I am not going to wave it away — **a genuine skill game can also be compulsive**,
and mastery-drive is a strong hook.

The protection is not "make it skill". It is that **the financial harm vector is
structurally absent**: the bond cannot be lost, so it cannot be chased, and
`verifyAntiManipulation` already bans loss-framing, scarcity timers, streak
punishment and non-graceful session ends. The residual — compulsive mastery in a
real skill game — is the risk chess carries. It is real, it is categorically
lower than gambling, and under this economy it cannot cost the player money.

---

## 5. Forecasting, demoted to what the corpus supports

At 5.4% of the corpus, forecasting is not the experience. It is a **readout**,
and it stays small: **20 discrete dots, each an actual rollout** — a quantile
dotplot, consuming FAR_NZY's existing sacred-core `monteCarlo.ts`.

Frequency framing over probability framing is the strongest evidence in this
whole review (Kay 2016; Hullman 2015; Fernandes CHI 2018; Kale 2018/2020;
Padilla/Kay/Hullman 2022; Gigerenzer & Hoffrage 1995), and countable dots
structurally resist **deterministic construal error** — reading an uncertain
display as a certain one — because there is nothing smooth to mistake for a
promise.

---

## 6. The psychedelic goal, made real and measurable

You asked for an experience that "could open doors for a deeper and more
hardened and reliable source of truth". That is not vague — it is a described
psychological state with a literature and an instrument.

**Awe** has two appraisals: **perceived vastness**, and **need for
accommodation** — the drive to revise a mental schema that cannot absorb the
experience. It produces the "small self", and people high in dispositional awe
show **lower need for cognitive closure**: greater willingness to revise beliefs.
(Keltner & Haidt 2003; Shiota et al. 2006/2007; measured by the AWE-S scale.)

Both appraisals are available here, and neither is a trick:

- **Vastness** — one lattice underneath twenty presentations, and a hidden
  connective structure larger than any single view of it.
- **Accommodation** — a 4D structure genuinely cannot be assimilated into a 3D
  schema. The player must build a new one. Miegakure's playtests are evidence
  they can.

**And this is where your instinct about "hardened, reliable truth" is exactly
right.** Awe induced by a *trick* is manipulation and it decays on discovery.
Awe induced by a structure the player **can verify** — recompute the seed, check
the commitment, replay the run, read the published mutual information — does not
decay, because inspection confirms it instead of dissolving it.

**The determinism digest is what makes the awe honest.** That is the union of
this project's two halves, and I do not think it has been built before.

> **Obligation W1.** The vastness claim is not decorative: assert that the same
> L1 state demonstrably drives all active wrappers, and that a player can
> reproduce any presented view from the revealed seed. **Negative control:** a
> wrapper fed a different state must fail.

---

## 7. The bond — unchanged, and now better evidenced

Carried from v3 intact: the bond is a commitment device returning 100%; the
prize is skill-ranked and funded from outside the bonds entirely. *The money that
commits and the money that rewards must never be the same money.*

§1 strengthens it: because there is no wager, **RTP is undefined** — which is not
a limitation but the proof that no house edge exists to hide. The strongest
property stands: **a stake that cannot be lost cannot be chased**, and
loss-chasing is the primary harm vector in gambling. `verifyNoStakeBonus` makes
it mechanically unreachable, and you had already written it.

Cost, restated: prize pools are bounded by external funding. No unbounded
jackpot. That is the coupling being deliberately severed.

---

## 8. The verification phase

| Id | Obligation | Negative control |
|---|---|---|
| **P1** | Hidden lattice carries real mutual information with observables | a randomised lattice must fail |
| **P2** | The true lattice is revealed every round | a round without reveal must fail |
| H1 | Revealed seed reproduces `w` and matches the commitment | one-bit change must fail |
| H2 | `w` not derivable from the pre-round bundle | a leaked seed must fail |
| R1 | Seed enters as integer bits, never float | injected float must fail |
| V1 | Tokens volumetric; board stays a lattice | a token off its cell must fail |
| V2 | Four channels, no fifth; no magnitude on hue | a planted fifth must fail |
| V3 | `w` rendered as field only, never a readable value | a numeric `w` readout must fail |
| L1x | No layer mutates a lower layer; L1 immutable mid-match | a per-turn face bias must fail |
| D1 | No dead boards: deadlock detection + visible reshuffle | an unsolvable board must fail |
| W1 | One state drives all wrappers, reproducible from seed | a wrapper on a different state must fail |
| F1/F2 | Forecast reproducible and calibrated | biased forecast must fail |
| S1–S4 | `payout===principal`; no prize from bonds; no bonded edge; no dark patterns | any bonus, bond-funded prize, or edge must fail |
| B1 | Gate provenance earned via `IEventStore.v1` | fabricated session rejected |
| M1/A1 | Music deterministic from state; every cue has a visual twin | audio-only cue must fail |

**L1x is the OWC finding turned into a permanent check.** Whatever anyone builds
later, a per-turn face bias fails the build.

---

## 9. Sequence — corrected by the reality check

I asked the auditor why a project like this never ships:

> **Combinatorial explosion.** The interaction between highly specialised,
> decoupled subsystems creates a state space exceeding the developer's capacity
> for integration and verification.

That is the right answer and it changes the plan. My earlier sequence deepened
one subsystem at a time — precisely the shape that dies at integration.

**So: one vertical slice that touches every subsystem once, at minimum fidelity,
before anything is deepened.**

**Slice 0 — one board, one round, end to end.**
One 6×6 grid. One hidden lattice with a real commitment. One cross-section lens.
Dice that turn in 4D inside their cells. One music state from AMIS. One bond
posted and returned. One replay that verifies. One oracle from each family —
P1, H1, V1, L1x, S1. Nothing else.

If Slice 0 holds together, every later increment is deepening a proven seam
rather than discovering a new one. If it does not, we learn that in weeks
instead of after building twelve subsystems that have never met.

Then, in order: **L1x + D1** (the OWC replacement) · **P1/P2** to their real
thresholds · **V2/V3** channels · **F1/F2** · **W1** wrappers, two genres before
twenty · **B1** the foundry bridge · **S2/S3** funding provenance.

## 10. Residual risks, stated

- **Compulsive mastery** in a genuine skill game (§4.1). Real, lower than
  gambling, cannot cost money here. Not eliminated.
- **Prize pools are bounded** (§7). Structural.
- **Ranked needs connectivity** (§4). Solo and daily stay offline.
- **Twenty wrappers is still ambitious** even as layers. Slice 0 proves two.
- **`LEGAL.md` should be re-reviewed by counsel**, not assumed to carry over —
  §7 changes the economic structure enough that the old analysis may not apply.
  I am not counsel and this is not legal advice.

## 11. The gate

1. **Approve** — §1 answer B with the L2 replacement, §3 architecture, §4 hidden
   axis with P1/P2, §5 demoted forecasting, §6 awe, §7 bond, Slice 0 first.
2. **Approve with changes.**
3. **Reject** — name what is wrong.

**The OWC question is answered: B.** I am not asking you to choose; I am telling
you what the code and the economy require, and I have shown the derivation so you
can check it rather than trust it.

I cannot sign a Tier 1 gate or write `APPROVED FOR RESEARCH EXECUTION`.
