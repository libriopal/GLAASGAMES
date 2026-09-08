# The Lens — blueprint for approval

**Status: AWAITING HUMAN APPROVAL AT THE VERIFY GATE.**
No design item is written and no code is changed. This is the output of the
Research and Audit halves only, per the loop approved in `PLAN.md`.

Reference: `libriopal/glassbox_labs` @ `9cdcffd` (branch
`claude/scite-mcp-deep-research-x8b8l2`; there is no `main`), read against
`libriopal/GLAASGAMES` @ `84b5559`.

---

## 1. Three facts that change the shape of the task

Before anything else, because each one contradicts a reasonable assumption in
the brief, and building on the assumption would waste the work.

### 1.1 There is no visual design in the origin repo

I inventoried every file. Glassbox_Labs contains no renderer, no HTML, no CSS,
no colour tokens, no layout, no component library — **no user-facing surface of
any kind.** It is 60 TypeScript and Markdown files of governance protocol,
genome/expression pipeline, telemetry, fitness, gates, a Delphi corpus and
economy rules.

So "maintain the sovereign origin repo's visual design" cannot mean matching a
style that exists. It has to mean something better, and the repo does supply
it: GLASSBOX is a **disclosure discipline**, not a palette. The name is the
thesis — show the box. `LAW 3` voids any gate result whose provenance is not
the real engine. The anti-fabrication rule makes model recall inadmissible.
Nothing in the package may sign its own approval.

**The visual design language is therefore derived, and it is this: the interface
may compress, but it may never conceal, and every number it shows must be
traceable to something that was actually computed.** Everything in §4 follows
from that sentence, and §4.4 makes it machine-checkable rather than aspirational.

### 1.2 The origin repo already decided the real-money question

`game/economy/types.ts`:

```ts
export interface StakeRelease {
  stakeId: string;
  principal: number;
  payout: number; // must equal principal — no bonus (Tier 1, R6Q2)
}
```

and `game/economy/rules.ts:88`:

```ts
/** At release: principal returned at 100% — NO BONUS (Tier 1, R6Q2). The ~2% bonus was removed. */
export function verifyNoStakeBonus(release: StakeRelease): boolean {
  return release.payout === release.principal;
}
```

A standing Tier 1 decision says a stake returns exactly what went in. **That is
not a wager.** There is no prize, no expected gain, and nothing won — it is a
refundable commitment bond, and its entire function is to make walking away
cost something. I cannot sign or reverse a Tier 1 decision, so §7 builds on it
rather than around it, and §7.3 states plainly what changes if you want
otherwise.

### 1.3 What was missing was never the evaluator — it was the engine

This is the direct comparison you asked for.

| | Glassbox_Labs | GLAASGAMES |
|---|---|---|
| Genome, expression pipeline | ✅ | — |
| Telemetry capture, fitness, gates, breeder | ✅ | — |
| Delphi human-judgment corpus | ✅ | — |
| Economy / anti-manipulation rules | ✅ | inherited |
| Governance protocol, Tier gates | ✅ | inherited |
| **A simulation that actually runs** | ❌ | ✅ |
| **A renderer** | ❌ | ✅ (two) |
| **Input, host loop, fixed timestep** | ❌ | ✅ |
| **GPU execution, proven bit-identical** | ❌ | ✅ |
| **Replay verification** | ❌ | ✅ |
| **A shippable artifact** | ❌ | ✅ (APK/AAB) |

Glassbox is a **foundry that breeds and grades game designs**. GLAASGAMES is a
**deterministic engine that can run one**. They have never been connected, and
the origin repo says so about itself, in `foundry/gates/kot-calibration.ts`:

> the session and judgment-aggregate fixtures below stand in for a live
> bot-vs-bot lab match … Real telemetry/corpus data replaces these fixtures once
> W3-W5 have run against an actual deployed build

Meanwhile `LAW 3` voids any gate result whose provenance is not the real engine.
So the foundry is currently calibrating **the gate code** against fixtures,
because no real engine exists to feed it. **GLAASGAMES is that engine.** The
single highest-value change available in this whole system is not a new feature;
it is the wire between them. §5 is that wire.

---

## 2. The central problem, stated exactly

The lens must show a 4D state on a 2D surface. An independent auditor, given the
architecture and no code, put the objection in its strongest form:

> The strongest argument is the mathematical impossibility of an injective
> mapping from ℝ⁴ to ℝ². Dimensionality reduction necessitates information loss,
> meaning distinct 4D states will inevitably map to identical 2D coordinates.
> This misleads the player during **false proximity events**: when an entity and
> a target share the same 2D projection but possess divergent w values, the
> player will perceive an accessible target that is actually unreachable.

This is correct and it is not fixable by better art. Any *projection* collides.

**The resolution is to stop trying to be state-complete and to be
decision-complete instead.** The lens does not owe the player the state. It owes
the player enough to choose correctly. Formally:

> For any two world states A and B, if the optimal action in A differs from the
> optimal action in B, the lens must render A and B distinguishably.

That is a weaker requirement than injectivity — and unlike injectivity it is
*achievable*, because the space of decision-relevant distinctions is far smaller
than the state space. It is also **falsifiable and machine-checkable**, which is
what makes it a design I am willing to put a gate on. §4.4.

---

## 3. What the research says

### 3.1 The channel budget is four, not seven

Cowan's review across verbal and non-verbal, visual and auditory, single and
dual task converges on a focus-of-attention capacity of about **four chunks**,
not Miller's seven — and visual-array experiments isolating simple features like
colour or orientation show a hard limit near four. The pre-attentive system runs
roughly four to five largely independent channels over *separable* dimensions
(colour, orientation, motion, position); *integral* dimensions compete for the
same capacity. (Cowan 2001, *The magical number 4*; Journal of Cognition
10.5334/joc.387 for the modern re-analysis.)

**Design consequence:** the lens gets a budget of **four simultaneous channels**,
and they must be separable ones. This is the hard constraint that decides §4.
A fifth channel does not add information; it degrades the other four.

### 3.2 Uncertainty must be framed as frequency, not probability

This is the strongest evidence in the whole review, and it governs the entire
forecasting surface. Frequency framing ("5 out of 100") is understood where
probability framing ("5%") is not. Quantile dotplots and hypothetical outcome
plots beat interval plots, density plots and violin plots on recall, on
probability estimation and on real incentivised decisions. (Kay et al. 2016;
Hullman et al. 2015; Fernandes et al. CHI 2018; Kale et al. 2018, 2020;
summarised in Padilla, Kay & Hullman 2022, *Uncertainty Visualization*.
Frequency formats trace to Gigerenzer & Hoffrage 1995.)

That literature also names the failure mode I must design against:
**deterministic construal error** — given the chance, people collapse an
uncertain display into a single certain reading. A Monte Carlo forecast drawn as
one smooth band will be read as a promise.

**Design consequence:** the forecast is never a line and never a band. It is
**countable outcomes** — discrete dots, each one a real simulated run. §5.2.

### 3.3 Direct 4D perception is real but weak, variable, and a bad thing to require

People can measurably improve at 4D tasks with practice — rotation, hypercube
navigation, judging inherently 4D properties — and cross-sectional and
projection training both help, with dimensional anchoring (Hinton's coloured
cubes) aiding intuition. But a 2020 review notes the studies are small, mostly
college samples, show wide inter-subject variability, and struggle to exclude
strategies that solve the task *without* 4D representation at all.

**This supports your premise and I am taking it as settled: the design must not
require 4D perception.** Direct 4D remains available as an opt-in expert view,
because the evidence says some people genuinely acquire it — but nothing that
matters may depend on it.

### 3.4 Shared music synchronises affect — it does not simply feel nicer

Hyperscanning work on friend dyads found joint listening raised interpersonal
neural synchrony and made continuous pleasure ratings more *similar* between
partners; physiological and behavioural synchrony predicts group cohesion and
performance. (Curzel et al., *Cortex* 2026, S0010945226000547; Nature *Sci Rep*
10.1038/s41598-020-65670-1.)

**The honest caveat, which I am keeping:** that study found joint listening did
**not** increase pleasure in general. The effect is on *alignment*, not on
enjoyment. So the music feature's claim is "you can feel what your partner is
feeling", not "the music makes it better" — and §6.3 is scoped to the claim the
evidence supports.

### 3.5 Play policy on real money is restrictive and specific

Real-money gambling, games and contests are prohibited on Google Play **except**
for apps that are licensed and separately Google-approved: free to download, no
Play Billing for the money flow, adult rating, hard age-gating, and geo-gating
to exactly the jurisdictions the licence covers. Incorrect geo-gating is a named
common violation. (Play Console policy 9877032 and 13381106.)

**This is why §1.2 matters so much.** A principal-return commitment bond is not
a contest with a prize and does not enter that policy. Adding a payout does, and
it changes the product from "an app you can ship" to "a licensed operator in
each jurisdiction you serve."

---

## 4. The lens

### 4.1 What it is

A **2D plan view** — the xz plane, seen from above, the way a map is. Not a
perspective camera, not an orbit. Flat, stable, and readable at a glance on a
phone held in one hand.

The other two dimensions of the world do not vanish. They become the two
channels a plan view has spare.

### 4.2 The four channels

| Channel | Carries | Why this pairing |
|---|---|---|
| **Position (x, z)** | the two axes you steer in | Position is the strongest visual channel; it should carry the thing you act on most directly. |
| **Ring** — a concentric halo whose radius grows with \|Δw\| | separation along w between you and that entity | Size is separable from colour and from position, and a ring reads as "distance to close" rather than as a property of the object. **This is the anti-false-proximity channel** and it exists specifically to answer §2. |
| **Elevation shadow** — a soft offset shadow, displaced by Δy | height above or below you | Shadows are the one depth cue that survives a flat view without adding a third position axis, and people read them without instruction. |
| **Value** — brightness, not hue | reachability *now*: can you close this gap before it closes on you | Brightness is pre-attentive and orderable. Hue is not orderable and is unusable for ~8% of men, so it never carries a magnitude here. |

That is four. There is no fifth, and the design's chief discipline is refusing
to add one. Kind (player, target, drifter) is carried by **shape**, which is a
categorical channel and does not compete with the four magnitudes.

### 4.3 What happens to hue

The current WebGPU renderer encodes w as hue. That was the right first move —
it made w visible at all — but it is wrong under this design for two reasons the
research names: hue is not orderable, so it cannot express "how far", and it
excludes red-green colour-blind players from the one mechanic the game is about.

Hue is demoted to identity and team, where categorical is what is wanted.

### 4.4 The oracle: action-discriminability

This is the check that makes §2's claim real rather than rhetorical, and it is
the single most important new obligation in this blueprint.

> **Obligation L1.** Sample N pairs of world states. For each pair, compute the
> optimal action under the rules (the engine is deterministic, so this is
> decidable by search over the action set for a bounded horizon). Where the
> optimal actions differ, assert that the two rendered lens outputs differ by
> more than a stated perceptual threshold, measured over the four channels.
>
> **Negative control.** A deliberately lossy lens — one that drops the ring
> channel, so w-separation becomes invisible — must FAIL this check. If it
> passes, the check is measuring nothing.

The reported metric is the **false-proximity rate**: the fraction of sampled
pairs that demand different actions but render indistinguishably. The design
target is zero; the honest expectation is a small non-zero number, and *that
number belongs in the HUD's About screen*, because §1.1 says the interface may
compress but never conceal, and a lens that hides its own error rate is
concealing the most important thing about itself.

**The horizon problem, and why L1 alone is not enough.** I put this obligation
to the auditor and it found the hole:

> The verification is vulnerable to **horizon effects** caused by the bounded
> search. The test passes if the map distinguishes states by the *locally*
> optimal actions found within the search depth, even where those states require
> different *globally* optimal actions the map fails to distinguish. This bites
> when optimal strategy depends on consequences that manifest beyond the
> lookahead.

That is right, and it would let a lens certify itself while hiding exactly the
long-range information that makes a 4D world hard. "Optimal" is only ever
optimal-within-H, and a single H silently defines away the question.

So the horizon becomes a measured variable rather than a hidden assumption:

> **Obligation L1b.** Report the false-proximity rate as a function of search
> horizon H, swept over at least a decade of H. The rate must not rise
> materially between H and 2H; if it does, the lens is horizon-limited and L1's
> result at H is not yet valid — the finding is that the check has not converged,
> not that the lens has passed.
>
> **Negative control.** A lens that omits a feature whose consequence only
> appears late — say, one that renders w-velocity not at all — must show a rate
> that climbs with H. If its curve is flat, the sweep is not measuring horizon
> sensitivity and L1b proves nothing.

The published number is then the rate **and** the horizon it converged at, since
a fidelity figure without its horizon is the same kind of claim as a digest
without the run that produced it.

I know of no shipped game that publishes this number. That is the proven-value
argument for the whole approach: not that a 2D view of 4D is novel, but that its
**fidelity is measured and disclosed** instead of asserted.

---

## 5. The 4D core as the forecasting backend

The 4D state is not decoration once the lens flattens it. It is what makes the
forecast worth having.

### 5.1 Why 4D earns its place

A 3D world's near-future is legible by eye; forecasting it adds nothing. A 4D
world's is not — the w axis makes "what will be reachable in three seconds"
genuinely hard, because reachability moves in a direction the player cannot see
directly. **The forecast is therefore not a convenience layered on the game; it
is the reason the fourth dimension is fun rather than merely confusing.** The
skill the game teaches is reading a forecast of a space you cannot perceive.

### 5.2 Monte Carlo, drawn as countable outcomes

Each tick the engine has spare frame budget, it advances **k cheap rollouts** of
the current state under a small set of candidate player policies, using the same
integer kernel — so every rollout is exactly reproducible and costs no floating
point.

The result is drawn as a **quantile dotplot**: 20 dots, each an actual rollout,
positioned by outcome. Not a band, not a percentage. Per §3.2 this is the form
that survives contact with a human, and it structurally resists deterministic
construal because there is nothing continuous to mistake for a promise.

> **Obligation F1.** The forecast is reproducible: same state, same seed, same
> dots. **Negative control:** perturbing the state by one Q16.16 unit in w must
> move at least one dot.
>
> **Obligation F2.** Calibration. Over a recorded session, outcomes must fall
> inside the forecast's stated interval at the stated rate — if the dots say 15
> of 20, roughly 75% of the time it should happen. A forecast that is confidently
> wrong is worse than none, and this is the check that catches it.

### 5.3 The wire to the foundry — the highest-value change in this document

Per §1.3, the foundry grades designs it cannot run, using fixtures it openly
labels as stand-ins, under a law that voids stand-in provenance. Closing that is
worth more than any visual feature.

`foundry/telemetry/capture.ts` already defines `SessionRecord`, `TurnRecord` and
`captureAtMarginFlaggedStates`. The engine already produces verified replays.
**The bridge is an adapter that turns a verified replay into a `SessionRecord`
with real `GateProvenance` — `modelIdentity` = the actual engine, `commitSha` =
the build that produced it, `isStandIn: false` earned rather than asserted.**

Then, for the first time: breed a design → run it in the real engine → capture
real telemetry → score it against the real gates → and the `isStandIn: false`
in the provenance is *true*. That is the complete loop the origin repo was
built for and has never once executed.

> **Obligation B1.** A gate result carrying `isStandIn: false` must be traceable
> to a replay that verifies. **Negative control:** a fabricated `SessionRecord`
> not backed by a verifying replay must be rejected by the adapter, not merely
> flagged.

---

## 6. The connected systems

### 6.1 Skill mastery

Skill here is forecast-reading, so mastery is measured as **the gap between the
player's revealed choice and the rollout-optimal choice**, narrowing over time.
This is computed from replays that already verify, so it needs no new trusted
input. It also gives the Delphi corpus something real to rate: contested states
where the player and the search disagree are exactly the states worth putting to
human raters.

### 6.2 Multiplayer, and the exploit that shapes it

The second audit named the strongest exploit against this design:

> Information leakage (map hacking). The client computes the full simulation
> state locally, so all "hidden" data is resident in client memory. To close it
> you need server-side interest management, so the client's local simulation is
> intentionally incomplete.

This is correct and it forces a choice. Server-authoritative interest management
would break everything that makes this project what it is — offline play, no
INTERNET permission, deterministic local execution, the whole Data Safety
position.

**So the design takes the other branch, and it is the right one: the lens
compresses for comprehension and never for concealment.** Nothing the lens omits
is secret. Any player may open the expert 4D view (§3.3) and see everything;
the lens is an ergonomic aid, not an information advantage. A "map hack" against
this design reveals a button the game already ships.

Competitive integrity then rests entirely on execution and forecast-reading
under a shared clock — which is exactly where a game about reading a
4D forecast wants its difficulty to live. Symmetric information is also, not
coincidentally, what GLASSBOX means.

- **Competitive:** same daily seed, same world, asynchronous, ranked by
  verified replay. No live connection needed, so it works offline and ships.
- **Cooperative:** two players, one world, complementary lenses — one sees the
  w-ring channel at higher fidelity, the other the elevation channel. Neither
  can solve it alone, and the coupling is *perceptual* rather than informational,
  so it survives §6.2's rule.

### 6.3 Music as a shared emotional channel

Generated from game state, deterministically, from the same integer state that
drives everything else — so two players in the same world hear the same music,
and a replay reproduces its audio exactly.

The claim is precisely §3.4's and no larger: **shared music aligns affect between
people.** Mapping, kept to the four-channel discipline: tempo from time
pressure, harmonic tension from forecast variance, register from w-position,
and a consonance that resolves when partners' states converge. In co-op, hearing
your partner's tension *is* the coordination channel — which is why this is a
mechanic and not a soundtrack.

> **Obligation M1.** Music is a pure function of game state: same replay, same
> audio buffer, bit-identical. **Negative control:** a one-tick state change must
> change the buffer.

Accessibility: every musical cue is duplicated visually, because a mechanic
delivered only through audio excludes deaf players from the mechanic.

### 6.4 Stakes

Per §1.2, a stake is a **commitment bond**: you post it before a ranked run and
it returns at exactly 100% when the run completes, whatever the result. It buys
nothing, wins nothing, and is not at risk from losing — it is at risk only from
abandoning. It makes attention costly to withdraw, which is the only honest
reason to have it.

The existing machinery — `ageVerified21Plus`, `selfExcluded`, cooling-off,
`verifyNoStakeBonus`, the dark-pattern ban — carries over unchanged and stays
enforced by `verify:economy`.

---

## 7. Governance and legal — read this before approving

### 7.1 Where I stand

I have kept the design inside the standing Tier 1 decision (payout = principal).
Under that decision this is not gambling: no prize, no expected gain, nothing
won. It does not enter Play's real-money policy.

### 7.2 What I have not done and cannot

I cannot sign a Tier 1 gate, write `APPROVED FOR RESEARCH EXECUTION`, or clear
any of this as legally compliant. I am not a lawyer and this is not legal
advice.

### 7.3 If you want actual prize payouts, say so now

It is a different product, and the honest cost is:

- Play permits it only for licensed, separately Google-approved apps: free to
  download, no Play Billing for the money flow, adult content rating, hard
  age-gating, and geo-gating to exactly the licensed jurisdictions. Incorrect
  geo-gating is a named common violation.
- A licence is needed **per jurisdiction**, and the skill-versus-chance test
  that decides whether you need a gambling licence at all varies by
  jurisdiction and is decided on the facts of the specific game.
- It reverses a standing Tier 1 decision in your own repo, which is your call
  to make and not mine.
- It would require competent gaming-law counsel before a line of code.

**My recommendation is to keep principal-return.** It preserves the ship path we
just built, keeps the Data Safety declaration true, and — the part I think
actually matters — a game whose stakes cannot pay out is one whose competitive
integrity nobody has a financial motive to attack.

---

## 8. The new verification phase

Every obligation above, with the oracle that decides it. Each carries a negative
control, per the rule that an oracle unseen to fail is decoration.

| Id | Obligation | Oracle | Negative control |
|---|---|---|---|
| L1 | The lens is action-discriminable | `verify-lens` | a ring-less lens must fail |
| L1b | The discriminability result has converged in search horizon | `verify-lens` | a lens omitting a late-consequence feature must show a rate rising with H |
| L2 | Four channels, no fifth | `verify-lens` | a planted fifth channel must fail |
| L3 | No magnitude rides on hue | `verify-lens` | hue-encoded w must fail |
| F1 | Forecast is reproducible | `verify-forecast` | 1-unit w change must move a dot |
| F2 | Forecast is calibrated | `verify-forecast` | a deliberately biased forecast must fail |
| B1 | Gate provenance is earned | `verify-bridge` | a fabricated session must be rejected |
| M1 | Music is a pure function of state | `verify-music` | 1-tick change must change the buffer |
| S1 | Stake pays principal, never more | `verify:economy` (exists) | a bonus must fail |
| A1 | Every audio cue has a visual twin | `verify-a11y` | a planted audio-only cue must fail |

Plus everything already green: determinism `0xfc60aadd`, GPU parity
`0x1f3865c0`, replay, daily, controls, i32-wrapping contract, permission
allowlist.

---

## 9. Sequence

Ordered by irreversibility — cheapest-to-redo first, and each increment gated on
its own oracles before the next begins.

1. **The bridge** (§5.3). Highest value, no visual risk, and it makes the
   origin repo's own loop executable for the first time.
2. **The lens** (§4) with `verify-lens`. The false-proximity rate is a number we
   do not yet have, and everything downstream depends on it.
3. **The forecast** (§5.2) with calibration.
4. **Skill mastery** (§6.1) — falls out of 1–3 nearly free.
5. **Music** (§6.3).
6. **Multiplayer** (§6.2) — async competitive first, co-op second.

Stakes (§6.4) need no new work under §7.1.

## 10. What I would cut

Offered because a plan that recommends everything is not a plan.

- **Direct 4D expert view** — keep, but it is the first thing to cut if it costs
  anything; §3.3 says almost nobody will use it well.
- **Co-op complementary lenses** (§6.2) is the most speculative idea here. It has
  no supporting literature, only a clean argument. Treat it as an experiment
  with a kill criterion, not a commitment.
- **Music** is scoped to what §3.4 actually supports. If you want it to "make
  the game feel better", that is not what the evidence says it does, and I would
  rather build the alignment claim honestly than the pleasure claim loosely.

---

## 11. The decision at this gate

1. **Approve** — §4 lens, §5 forecast and bridge, §6 systems, sequence in §9.
2. **Approve with changes** — name what moves, what is cut.
3. **Reject** — name which part is wrong and it goes back to Research.

And one answer I need explicitly, because it changes the product rather than the
plan:

> **Do stakes stay principal-return (§6.4, recommended), or do you want real
> prize payouts (§7.3)?** I have built the entire blueprint on the first. The
> second is legitimate but it is a different company, and I would not start it
> without counsel.
