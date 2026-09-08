# The Lens — blueprint v2, rebuilt against the v1 corpus

**Status: AWAITING HUMAN APPROVAL AT THE VERIFY GATE.**
No design item is written and no code is changed. Research and audit halves only.

Sources read for this revision:

| Repo | Rev | What it is |
|---|---|---|
| `libriopal/magentadice-cyancode` | `8db018e` | **v1.** The integration monorepo — 2,652 files |
| `libriopal/FAR_NZY` (submodule `core/`) | cloned | Farkle Frenzy — the actual game, 350 files |
| `libriopal/adabt-core` (submodule `dream/`) | cloned | AMIS/AGROS — the music engine, 115 files |
| `libriopal/glassbox_labs` | `9cdcffd` | The governance/foundry package |
| `libriopal/GLAASGAMES` | `f5a63d7` | The deterministic 4D engine |

---

## 0. What v1 changed, stated as a scorecard

Blueprint v1 was written without this corpus. Four of its load-bearing claims
were wrong, and one design decision it made was **forbidden** by a law it could
not see. This is that accounting, because a revision that quietly absorbs its
corrections is not showing its work.

| # | v1 claimed | v1 corpus shows | Cost had we built it |
|---|---|---|---|
| G1 | "There is no visual design in the origin repo — none." | `3libras/the_visual_layer.md`, 364 lines of binding visual law: three pillars (Biological / Industrial / Crystalline), VOIDSHARD rarity law, named scenes, motion rules. | We would have invented an identity that already existed and contradicted it. |
| G2 | "The lens is a **flat 2D plan view**." | `3libras`: **"UI PHILOSOPHY — Rule: No flat UI. Everything must feel physically integrated into the world."** | The central design decision of v1 violates the sovereign law outright. |
| G3 | "Stakes must be principal-return, or you need per-jurisdiction gambling licences." | `LEGAL.md` + `AMOE.md`: a **third path** — skill-based sweepstakes with an Alternate Method of Entry, three-element test, real case law. | We would have shipped a strictly weaker product and told you a real option didn't exist. |
| G4 | "Music from game state needs to be built (§6.3)." | `adabt-core`: AMIS, a full deterministic emotional-music runtime with a constitution, 8 canonical states, and a multiplayer sync law. | Weeks reinventing a specified, governed system. |
| G5 | "Monte Carlo forecasting needs to be built (§5.2)." | `FAR_NZY/packages/farkle-engine/src/monteCarlo.ts` and `rtpConfig.ts` — both **in the sacred core**; `sandbox-ui/` has RTP, coverage, gate-status and simulation-progress panels. | Duplicate of a locked, governed subsystem. |

**And one thing v1 could not have found, which is now the most important item in
this document: §3.** It is a live conflict between two subsystems that each look
correct alone.

---

## 1. What v1 actually is

Not a prototype. A governed production system with:

- **A real game.** FAR_NZY / Farkle Frenzy — physics-based Match-3D dice game.
  A sacred-core lock manifest (`.ff-core-lock`) names eleven files implementing
  balance, scoring and fairness that may not be modified without the full suite
  and explicit approval. Each carries a header enforcing that.
- **Provably-fair RNG.** `csprng.ts` — SHA-256 / HMAC commit-reveal, server seed
  and client seed. Casino-grade *unpredictability* fairness.
- **Monte Carlo + RTP.** `monteCarlo.ts`, `rtpConfig.ts`, both sacred.
- **A legal architecture.** Three independent grounds, each sufficient alone:
  skill predominance (dominant-factor test), no illegal consideration (AMOE),
  and an auditable prize draw. Cited to *Dept. of Legal Affairs v. Rogers*,
  *Mississippi Gaming Comm'n v. Treasured Arts*, *Pre-Paid Solutions v. Little
  Rock*, FTC 16 C.F.R. § 251. Carries a proper not-legal-advice disclaimer.
- **An event-sourced spine.** `mesh/` — `IEventStore.v1`, `ReplayEvent-Snapshot.v1`,
  hashing strategy, RNG lineage spec, event versioning, snapshot strategy.
- **A music engine with a constitution.** AMIS: gameplay state → emotional
  inference → symbolic runtime → procedural orchestration → DSP. Eight canonical
  states: Dread, Suspense, Escalation, Catastrophic Release, Mourning, Recovery,
  Silence, Ritualistic Build. DSP banned from the main thread. Tiered fidelity
  Tier 0–4 to survive Android thermal throttling.
- **A visual law.** `3libras/`.
- **A simulation sandbox UI.** RTP breakdown, coverage, gate status, parameter
  editor, AI advisor.

**The four repos are one system nobody has assembled:** v1 has the game, the
money, the law, the music and the look. Glassbox has the governance and the
breeding foundry. GLAASGAMES has the thing neither had — *an engine whose every
result is bit-reproducible and independently recomputable.*

---

## 2. The corrected lens

### 2.1 v1's law kills the flat map, and hands us something better

`3libras` forbids flat UI. It also names the scene that solves our problem:

> **VAULT CROSS-SECTION** — Requirements: side-view infrastructure, elevators,
> server traffic, reactor pulses, AI workers.

A **cross-section** is a 2D lens that is diegetic — an object in the world, not
a chart laid over it. And this is where the two halves of the system agree in a
way neither could have reached alone:

**A cross-section is a slice, and a slice does not collide.**

The v1 blueprint's central problem was the auditor's objection that no injective
map ℝ⁴→ℝ² exists, so a *projection* creates false proximity — two entities at
the same screen point, one of them unreachable in w. A **slice** answers it
differently and better: it does not squash w, it **excludes** on w. Nothing
appears in the section unless it is actually in the section. False proximity
cannot occur, because coincidence in the plane now *means* coincidence in w.

The GLAASGAMES engine already implements this. `engine/math/rotor4.ts` exports
`sliceTo3D` beside `projectTo3D`, and the renderer already has a slice mode with
`sliceThickness`. **The 4D math and the visual law independently arrived at the
same answer.** v1 called it a vault cross-section; the engine calls it slicing;
they are the same operation.

### 2.2 What the player sees

A **cross-sectional vault view**: the world cut at the player's own w, rendered
as diegetic infrastructure per the Industrial pillar — layered depth, scanlines,
reactor pulses, ambient motion. Not a map. A window into a machine.

The four-channel budget from the perception research still binds (Cowan: ~4
chunks, separable dimensions), and the slice frees a channel by removing the
need to encode w-distance for things you cannot reach:

| Channel | Carries | Pillar |
|---|---|---|
| **Position (x, y)** in the section | where it is, in the plane you are in | Industrial: infrastructure layout |
| **Approach** — a bloom that intensifies as an entity nears the section from outside | something is about to enter your w | Biological: pulsing, breathing |
| **Depth layer** — parallax offset | distance along the cut axis | Industrial: layered depth |
| **Value** — brightness | reachable now | Crystalline: resonance |

Hue carries identity, rarity and the VOIDSHARD law — categorical, per v1's
palette, never magnitude. This also fixes v1's colour-blind exclusion.

The **Approach channel is the new mechanic** and it is what makes a slice
playable rather than claustrophobic: you cannot see out of your section, but you
can see something coming. That is the 4D structure delivering tension into a 2D
surface without asking anyone to perceive 4D.

### 2.3 The oracle, corrected

The v1 obligation (action-discriminability, with the horizon sweep the third
audit forced) survives — but the slice changes what it measures. Under a
projection it measured *collisions*. Under a slice it measures **occlusion**: a
state whose optimal action depends on something outside the current section.

> **Obligation L1 (revised).** Sample state pairs; where the optimal action
> differs under bounded search, assert the rendered sections differ perceptibly.
> Report the **occlusion rate** — the fraction of decision-relevant differences
> that live entirely outside the visible section — as a function of search
> horizon H, swept a decade, and report the H at which it converges.
>
> **Negative controls.** (a) A section with the Approach channel removed must
> show a materially higher occlusion rate. (b) A zero-thickness section must
> fail outright.

The occlusion rate is the number that goes on screen, because `3libras` demands
transparency and GLASSBOX means the interface may compress but never conceal.
I know of no shipped game that publishes the fidelity of its own abstraction.

---

## 3. The conflict — read this before anything else

This is the finding that justifies the whole re-run, and it was invisible
without v1.

**`design/OpportunityWeightController.md`** specifies the OWC: it reads board
state, detects "whether the player is behind and needs a comeback opportunity",
and returns `wildBoostPct` and `cascadeEnablerBoostPct` — up to +10 each on draw
probabilities, plus `blockerBoostPct` up to +5 — triggered when
`playerBanked < leaderBanked * 0.7`. Its stated motive is that dead boards
"harm retention and skill perception".

**In fairness to its authors, the design says explicitly: "boost strategic
comeback opportunities (not guaranteed rewards)."** That distinction is real and
it matters — an opportunity a player must still convert is far closer to skill
than a handed-out win, and it is the strongest defence the OWC has. The
objection below is not that the OWC hands out victories. It is narrower, and it
survives that distinction.

**`LEGAL.md`** rests the platform's legality partly on **skill predominance**:
"Farkle outcomes are determined primarily by player decisions, not chance",
under the dominant-factor test.

I put the combination to the independent auditor without telling it which
answer I wanted:

> The strongest objection is **deceptive trade practices**. The Opportunity
> Weight Controller introduces algorithmic manipulation of chance that directly
> invalidates the skill-predominance defense. By programmatically boosting
> probabilities to engineer comeback opportunities, the operator substitutes
> player skill with a hidden, non-skill-based mechanism designed to steer
> outcomes, rendering the legal classification factually false. **This bites
> when the adjustments are significant enough to prevent skill from being the
> dominant factor under the applicable test.**

Three independent lines converge on the same place:

1. **Legal.** A hidden chance-adjuster erodes the exact ground `LEGAL.md`
   stands on — and it is one of three grounds, so the platform survives on the
   other two, but the strongest one weakens.
2. **Empirical.** Dynamic difficulty adjustment is the design idea my earlier
   research pass *falsified* — a pre-registered study found no effect of
   challenge–skill balance on enjoyment (null result). The OWC's stated benefit
   is the one the evidence does not support.
3. **Governance, and this is the sharpest.** `3libras/the_audit.md` states the
   primary governance law: *"Economic trust is infrastructure… all systems must
   reinforce trust. Not short-term extraction."* GLASSBOX means show the box.
   **An undisclosed probability adjustment is concealment by construction** —
   it violates v1's own charter before any regulator is involved.

### 3.1 What I recommend, and what would settle it

Not "delete the OWC" — dead boards are a real problem and I have no evidence the
authors were wrong about that. The objection is to it being **hidden and
unbounded**, and both are fixable:

- **Disclose it.** The boost is visible in the UI when active, and its magnitude
  is written into the replay/event stream. A disclosed comeback assist is a
  game mechanic. An undisclosed one is what the auditor described.
- **Bound it, and prove the bound.** State a maximum, then measure that skill
  still dominates with the OWC live.

> **Obligation O1 — the skill-dominance oracle.** Run bot-vs-bot populations of
> known, graded skill, OWC on and OWC off. Measure the rank correlation between
> bot skill and outcome. Assert that with OWC active it stays above a stated
> threshold, and that the *drop* from OWC-off to OWC-on is below a stated
> maximum.
>
> **Negative control.** An OWC configured to a deliberately excessive boost must
> drive the correlation below threshold. If it does not, the oracle is not
> measuring skill dominance and O1 proves nothing.

This turns the platform's central legal claim from an assertion in a document
into **a number produced by the engine on every build**. That is the highest-value
thing in this blueprint, and it exists only because v1 supplied the conflict.

---

## 4. Two fairness models, and why the system needs both

v1 and GLAASGAMES each call their RNG "provably fair" and mean different things.

| | v1 `csprng.ts` | GLAASGAMES |
|---|---|---|
| Mechanism | SHA-256/HMAC commit–reveal, server + client seed | Integer Q16.16, xorshift world-gen |
| Proves | the operator **could not have known or steered** the outcome | anyone can **recompute** the outcome exactly |
| Property | unpredictability | reproducibility |
| Async? | yes (`crypto.subtle`) | no |
| Float? | yes (`nextFloat`) | never |

Neither is sufficient. Commit–reveal proves the house did not cheat but leaves
the *result* unverifiable by a third party. Reproducibility lets anyone
recompute a run but says nothing about whether the seed was chosen adversarially.

**Together they compose, and the composition is clean** (this is my own
reasoning, labelled as mine): commit–reveal supplies the seed; the integer
kernel consumes it and produces a bit-reproducible run. The player verifies the
seed was honest *and* recomputes the outcome from it. Neither repo can make that
claim alone.

The engineering constraint is one line: **the commit–reveal output must enter
the simulation as integer bits, never as a float.** `nextFloat()` is
float64-shaped and is the exact hazard the i32-wrapping contract already guards
against in the kernel.

> **Obligation R1.** The seed pipeline is integer end to end: reveal → bytes →
> i32 → world-gen, with no float in the path. **Negative control:** a float
> injected anywhere in the pipeline must fail the check.

---

## 5. Music — adopt, do not rebuild

v1 §6.3 proposed building this. AMIS already exists, with a constitution.

Its **Law of Deterministic Emergence** ("procedural orchestration MUST derive
from synchronized seeds and bounded mutation") is the same discipline as the
engine's digest. Its **Multiplayer Sync** law — *"Hybrid Symbolic Replication:
authoritative seeds and states are replicated; orchestral decoration is local"* —
is a more mature answer than v1's, because it replicates *meaning* rather than
audio and therefore costs almost no bandwidth.

The eight canonical states — Dread, Suspense, Escalation, Catastrophic Release,
Mourning, Recovery, Silence, Ritualistic Build — are the shared emotional
channel. The research supports precisely this and no more: joint listening
raises interpersonal affective and neural synchrony (Curzel et al., *Cortex*
2026), but that study found it did **not** raise pleasure in general. The claim
is *alignment*, not enjoyment, and the blueprint keeps it that size.

> **Obligation M1.** Same replay → bit-identical emotional state sequence.
> **Negative control:** a one-tick change must change the sequence.
>
> **Obligation A1.** Every state has a visual counterpart. **Negative control:**
> a planted audio-only cue must fail. (A mechanic delivered only through audio
> excludes deaf players from the mechanic. AMIS's own tiered fidelity means some
> players legitimately run with reduced audio.)

---

## 6. Stakes — v1 supplies the third path

v1 said: principal-return, or per-jurisdiction gambling licences. `LEGAL.md`
and `AMOE.md` document a third, and it is the standard structure for this:

**Skill-based sweepstakes with an Alternate Method of Entry.** Gambling requires
consideration + chance + prize *simultaneously*; removing any one removes the
activity from the definition in most US states. A genuine free entry route
removes consideration. v1 implements it — email entry to `amoe@libriopal.com`,
"NO PURCHASE NECESSARY", purchase does not improve odds — and reports the
backend enforcement (KYC, age gate, Play Integrity, geofencing) as complete.
The official rules already void Washington and restrict to US residents 18+,
which is a fair signal that the drafting is considered rather than decorative —
Washington is the state that makes this analysis hardest.

This does not eliminate the Play problem; Play's real-money policy still governs
distribution and still wants licensing, geo-gating, adult rating and no Play
Billing on the money flow. But it changes the question from *"is this legal at
all"* to *"which jurisdictions and which store surfaces"*, which is a
commercial question with known answers.

**Three caveats I am not softening.** (a) The AMOE must be *real* — genuinely
free, genuinely equal odds, genuinely honoured; a decorative one is worse than
none and is precisely the deceptive-practices exposure §3 describes. (b) The
skill-predominance ground is the one §3 puts at risk, which is why O1 matters
beyond engineering. (c) `LEGAL.md` says on its own face that it is not legal
advice and that counsel should be engaged. I am not counsel, I am not clearing
this, and nothing here changes that.

---

## 7. The bridge, restated with v1 in it

v1's blueprint said the highest-value change was wiring GLAASGAMES's verified
replays into Glassbox's foundry, because `LAW 3` voids stand-in provenance and
no real engine existed to feed it. That still holds — and v1 makes it larger,
because v1 has `mesh/IEventStore.v1` and `ReplayEvent-Snapshot.v1` already
specified. **The event contract we needed to invent is written.**

> **Obligation B1.** A gate result carrying `isStandIn: false` traces to a
> replay that verifies, expressed as `ReplayEvent` records against
> `IEventStore.v1`. **Negative control:** a fabricated session with no verifying
> replay must be rejected by the adapter, not merely flagged.

---

## 8. The verification phase

| Id | Obligation | Oracle | Negative control |
|---|---|---|---|
| **O1** | **Skill stays the dominant factor with OWC live** | `verify-skill-dominance` | an excessive OWC must drop correlation below threshold |
| L1 | Section is action-discriminable; occlusion rate converges in H | `verify-lens` | Approach-less section must show higher occlusion; zero-thickness must fail |
| L2 | Four channels, no fifth | `verify-lens` | a planted fifth must fail |
| L3 | No magnitude on hue | `verify-lens` | hue-encoded magnitude must fail |
| L4 | No flat UI (`3libras` law) | `verify-visual-law` | a flat overlay must fail |
| R1 | Seed pipeline integer end to end | `verify-seed` | an injected float must fail |
| F1 | Forecast reproducible | `verify-forecast` | 1-unit change moves a dot |
| F2 | Forecast calibrated | `verify-forecast` | a biased forecast must fail |
| B1 | Gate provenance earned | `verify-bridge` | fabricated session rejected |
| M1 | Music deterministic from state | `verify-music` | 1-tick change alters sequence |
| A1 | Every audio cue has a visual twin | `verify-a11y` | audio-only cue must fail |
| S1 | AMOE is real and equal-odds | `verify-amoe` | an odds-advantaged paid path must fail |
| S2 | Stake pays principal, never more | `verify:economy` (exists) | a bonus must fail |

Plus what is already green: determinism `0xfc60aadd`, GPU parity `0x1f3865c0`,
replay, daily, controls, i32 wrapping, permission allowlist.

---

## 9. Sequence

Ordered by irreversibility and by risk retired per unit of work.

1. **O1, the skill-dominance oracle.** First, and not close. It is the only item
   that retires a *legal* risk, it needs no visual work, and until it exists the
   platform's central claim is undefended. §3.
2. **B1, the bridge**, now against `IEventStore.v1`. Makes the foundry's own
   loop executable for the first time.
3. **R1, the seed composition.** Small, and it unblocks everything that mixes
   the two fairness models.
4. **L1–L4, the cross-section lens.** The occlusion rate is a number we do not
   have.
5. **F1–F2, forecast** as quantile dotplots — frequency framing, per the
   research: never a band, always countable outcomes.
6. **M1/A1, adopt AMIS.** Integrate; do not rebuild.
7. **Multiplayer** — async competitive on the daily seed first, then co-op.

## 10. What I would cut

- **Direct 4D expert view.** The evidence for trained 4D perception is real but
  weak and highly variable. Keep as opt-in; cut first if it costs anything.
- **v1's co-op complementary-lens idea** — mine, from the last pass, with no
  literature behind it. AMIS's Hybrid Symbolic Replication is the better
  coupling and it is already specified. I am withdrawing my version.
- **The OWC in its current hidden form.** Not the feature — the hiddenness.

## 11. One thing to fix regardless of this gate

`README.md` in v1 says a BrightData API token was committed to git history and
should be revoked and the history scrubbed. If that has not been done, it is
independent of everything above and does not need a gate.

---

## 12. The decision at this gate

1. **Approve** — §2 cross-section lens, §3 OWC disclosure + O1, §4 seed
   composition, §5 adopt AMIS, §6 AMOE path, sequence in §9.
2. **Approve with changes** — name what moves or is cut.
3. **Reject** — name what is wrong; it returns to Research.

Two answers I need explicitly, because they change the product rather than the
plan:

> **A. The OWC.** Disclose and bound it (recommended, §3.1), remove it, or keep
> it hidden? If hidden, I need you to record that decision as yours, because it
> runs against your own governance law, the research, and the audit.
>
> **B. Stakes.** The AMOE sweepstakes path (§6, now evidenced), or the
> principal-return bond? These are different products with different counsel
> requirements. I have written §8's S1/S2 to cover either.

I cannot sign a Tier 1 gate, write `APPROVED FOR RESEARCH EXECUTION`, or clear
any of this as legally compliant.
