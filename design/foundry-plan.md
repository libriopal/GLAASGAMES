# Plan: the evolution breeding foundry, and the corpus as a gene pool

**Status: APPROVED by the independent auditor at round 4, with one binding
condition (below). Nothing in this plan is implemented yet. No asset has been generated, no Figma or Canva file created, no
code written.** That ordering is the instruction and it is also the point: the
whole plan rests on a claim about what the corpus *is*, and if that claim is
wrong every downstream task is wasted.

## The approval, and the condition attached to it

Four rounds. The auditor rejected the plan three times and each rejection
changed the design rather than the wording:

| Round | Objection | What it changed |
|---|---|---|
| 1 | **Domain mismatch** — a pass/fail suite is a filter, not a gradient; breeding on it is a random walk | Split the genome: structural loci get a real-valued gradient, expression loci are sampled and constrained, never bred |
| 2 | **Goodhart** — optimising a surrogate breeds genomes that max it while failing admission | Fitness defined only inside admission; admission rate as a halt condition; and a **held-out oracle set** excluded from selection as the detector |
| 3 | **Stagnation** — hard-zero fitness forbids tunnelling through infeasible space to reach better peaks | Split the constraints: HARD (fairness, leak, replay) never tunnelled; SOFT (targets, margins) become decaying penalties |
| 4 | **Approved** | — |

> *"The distinction resolves the stagnation objection... The plan is safe to
> implement **provided the soft penalty decay function is carefully calibrated
> to ensure a continuous, non-vanishing gradient**; if the penalty becomes too
> steep too quickly, you will inadvertently re-create the discontinuous
> landscape and the very stagnation you seek to avoid."*

**THE CONDITION IS BINDING AND IS IMPLEMENTED AS A CHECK, NOT A COMMENT.** The
soft penalty is **linear in the distance from feasibility**, never exponential
and never a step, because a linear penalty cannot vanish. `verify-foundry` will
carry a gradient-continuity check: sample the penalty across the soft boundary
and assert the finite difference is bounded away from zero everywhere in range.
**Its negative control is an exponential penalty planted on purpose, which must
fail that check** — otherwise the check is decoration and the auditor's
condition has been recorded rather than met.

---

## Step 1 — what was measured

### Glassbox_labs (`9cdcffd`), 1.5MB, 58 TypeScript files

It **already has a breeding foundry**, and GLAASGAMES does not:

| Module | LOC | What it holds |
|---|---|---|
| `families/genome/types.ts` | 153 | `Genome`, `StructuralLoci`, `EconomyLoci`, `ExpressionLoci`, `ScalarModifiers`, `Branch A–E`, `SpectrumBand`, `FamilyName`, `FAMILY_TABLE`, `ContestedState` |
| `families/genome/novelty.ts` | 54 | `evaluateNovelty` — the §2.2 admission gate |
| `families/expression/pipeline.ts` | 199 | genome → expressed artifact |
| `foundry/breeder/index.ts` | — | `BRANCH_WEIGHTS {A:3,B:2,C:2,D:3,E:1}`, `BreedingCandidate`, `W7NotPassedError` |
| `foundry/fitness/index.ts` | — | `scoreTelemetry`, `scoreJudgment`, `concordance`, `computeFitness` |
| `foundry/gates/kot-calibration.ts` | 177 | the King of Tokyo calibration artifact |
| `game-autobuild-kit/01_RESEARCH/evolution.ts` | 231 | the evolution loop |
| `corpus/delphi/` | — | judgment protocol and stats |

**A hard gate is written into the code**: `W7 BLOCKS W9 ABSOLUTELY. No breeding
run may execute until the King of Tokyo calibration artifact passes every gate.`

### The corpus, in the dimension nobody has touched

GLAASGAMES has mined the corpus twice: its **pixels** (the palette, 1129 images,
4,613,440 pixels) and its **language** (word counts, last round). Measured now,
a third thing:

| | |
|---|---|
| prompts | 1116 |
| **carrying an explicit `{allele\|allele}` grammar** | **311 (27.9%)** |
| **total loci** | **1026** |
| loci per prompt | mean **3.30**, max 8 |
| alleles per locus | mean **2.22**, max 7 |
| **distinct alleles** | **581** |
| ratings | **all 0** — no curation signal exists |
| date span | 28.2 days, 2026-05-17 → 2026-06-14 |
| dimensions | 1115 at 768×768, 1 at 512×512 |

Top alleles: `neon cyan` 45, `electric magenta` 42, `void black` 33, `obsidian`
22, `neural lattice` 21, `liquid gold` 16, **`prismatic bomb` 12**, **`wild
tile` 12**, **`dice-class badges` 12**, `locked portcullis tile` 6, `cryo-frozen
dice` 6, `neural orbs` 6, `wild W symbol` 6, `final shard slot` 5.

Prose frequencies: `dice` 628, `bomb` 151, `wild` 125, `tile` 122, `face` 47,
`gem` 41, `shard` 38.

---

## Step 2 — the distribution

*What is the one thing that makes GLAASGAMES supersede Glassbox_labs rather than
merely copy it?*

| p | Candidate |
|---|---|
| 0.20 | Port the foundry modules across and wire them to the lattice game |
| 0.16 | Build the breeding UI — a foundry screen that shows genomes |
| 0.13 | Use the corpus images as textures, so bred variants look different |
| 0.11 | Make the game's own telemetry the fitness signal |
| 0.10 | Replace the digits with token assets so expression has something to vary |
| 0.09 | Implement the KoT calibration so W7 unblocks W9 |
| **0.08** | **Tail: the corpus prompts ARE a genome — 1026 loci, 581 alleles — so the gene pool already exists and was never recognised** |
| **0.07** | **Tail: Glassbox breeds RULES and cannot verify them; GLAASGAMES has 24 oracles and a rules hash, so it can breed things it can PROVE** |
| 0.06 | Make the corpus the provenance root for bred artifacts |

---

## Step 3 — the tail

Row one is a port, and a port supersedes nothing.

**Tail p=0.08.** Glassbox defines `Genome` with `StructuralLoci`,
`ExpressionLoci` and a `FAMILY_TABLE`, and there is no gene pool to fill it
from. Meanwhile 311 corpus prompts carry 1026 loci and 581 alleles in explicit
`{a|b|c}` syntax — a population of genomes, already authored, with frequencies
that are a usable prior. **The corpus is not reference art for this system. It
is its founding population.**

**Tail p=0.07, and this is the supersession argument.** Glassbox's foundry
breeds rule-sets and scores them with `computeFitness` over telemetry and Delphi
judgment. It cannot *prove* an offspring is fair, replayable or leak-free.
GLAASGAMES can: `verify-learnable` measures whether inference pays,
`verify-ruleset` binds rules to a hash, `verify-lattice` proves the dice are
uniform, `verify-surface`/`verify-lattice-gl` prove the screen does not leak.
**The supersession is not that GLAASGAMES has a foundry too — it is that its
offspring can be admitted by measurement instead of by opinion.**

Combined into one sentence, which was the plan's thesis:

> ~~**Breed genomes drawn from the corpus's own 581-allele pool, and admit an
> offspring only when the existing oracle suite passes on it.**~~

**THE INDEPENDENT AUDITOR REJECTED THAT SENTENCE AND WAS RIGHT.** Its objection,
which is decisive and which I had not named:

> *"It fails due to domain mismatch; the oracle suite provides no fitness
> gradient. The oracles verify stochastic integrity and security — chi-square
> uniformity, buffer leaks — which are orthogonal to the quality of visual
> expression loci. They act as a stochastic FILTER rather than an evolutionary
> DRIVER, turning breeding into a random walk through prompt space rather than
> directed optimisation."*

A pass/fail check cannot rank two survivors, and evolution needs a ranking. The
plan as written would have run a random walk and called it selection.

**THE CORRECTED THESIS, and it splits the genome in two because the objection
applies to exactly one half:**

> **The structural genome is bred against a REAL-VALUED gradient the project
> already computes; the expression genome is not bred at all — it is SAMPLED
> from the corpus prior and CONSTRAINED by the oracles. Oracles are admission
> constraints everywhere and a fitness function nowhere.**

The gradient exists and is already measured. `verify-learnable` does not return
a boolean: it returns inference value as a continuous percentage over 400 paired
deterministic rounds, with a scrambled-lattice negative control and a clairvoyant
ceiling — 4.2% for the regional learner, 6.3% for recall, 7.3% for both,
against a 54.4% ceiling. That is a fitness landscape over `FACE_WEIGHTS`, round
length, charge depth and region size, and it is exactly the kind of number the
auditor says a filter cannot provide.

Expression gets no such number, so the plan stops pretending it does. Corpus
alleles are sampled against their measured frequency prior, admitted by
`evaluateNovelty`, and constrained by legibility (`verify-lattice-gl` G3,
`verify-theme`). **Selection over expression waits for the twelve closed
testers, because human judgment is the only valid signal for it and the corpus
carries none — every rating is 0.**

---

## Step 4 — falsifying the thesis, in writing

**Attack 1 — "the corpus alleles are visual, the genome is mechanical."**
Largely true and it damages the strong form. `neon cyan` is not a rule. The
thesis survives only for `ExpressionLoci`, not `StructuralLoci`. **Corrected:
the corpus founds the EXPRESSION half of the genome; the structural half must be
founded from the game's own parameter space** (`FACE_WEIGHTS`, `DEFAULT_ROUND`,
charge propagation depth, region size). Two pools, different provenance, and the
plan must say which is which everywhere.

**Attack 2 — "27.9% is not a population."** 311 prompts is small and the alleles
are unevenly used. Mitigation, stated in advance: allele frequency is a prior,
not a quota, and novelty is gated by `evaluateNovelty` rather than by count. If
the bred population collapses to the top 20 alleles, that is a measurable
failure and the plan needs a diversity floor with a negative control.

**Attack 3 — "ratings are all zero."** There is no human judgment signal in the
corpus at all. Every `scoreJudgment` input would have to come from somewhere
else — the 12 closed testers, who do not exist yet. **This is the plan's hardest
constraint and it is stated rather than hidden**: fitness is telemetry-only
until humans play, and `concordance` cannot be computed at all.

**Attack 4 — W7 blocks W9.** Glassbox's own code refuses to breed until KoT
calibration passes. Porting the breeder without porting that gate would be
importing the machinery and discarding the safety.

---

## The plan, staged, with what blocks what

### Stage 0 — the gene pool (no game changes) — **DONE**
`corpus/alleles.ts` + `verify-alleles`: parse the grammars, emit the loci and
alleles as a pinned artifact with a digest, exactly as `design/corpus-digest.json`
pins the pixels. **Negative control: a corrupted prompt must move the digest.**

**What executing it changed about the plan.** Three things, and all three came
from running a check rather than from reading the corpus again:

| Planned | Measured | Why the difference |
|---|---|---|
| 311 grammar prompts | **316** | The 311 count required a `\|` inside the braces, so it missed five prompts whose only locus is an arity-one `{...}`. Those five carry nothing else, which is exactly why they were invisible. A locus of arity one is still a locus; `verify-alleles` A1 asserts `316 − 5 = 311` so the two counts stay reconciled instead of merely differing. |
| 1026 loci / 581 alleles | **1031 / 584** | The same five. Two of the five strings repeat, so five loci add three distinct alleles. |
| the trim is harmless | **7 loci were being silently mangled** | See below. |

**The round trip is what earned its place.** The plan specified one negative
control — a corrupted prompt must move the digest — and that control passes.
It would also have passed on a broken pool. The check that actually found
something was A3, which rebuilds each prompt from its decomposed parts and
compares against the source: it failed on `mp9d4ebqw7edep`, because the parser
trimmed each alternative and seven prompts pad their pipes
(`{void black abyss | skeletal gold arches | ...}`). The pool was lossy, the
digest over it was perfectly stable, and no count, hash or reading of the corpus
would ever have said so. `Locus` now carries both views — `alleles` (trimmed,
what a genome expresses) and `raw` (what the corpus wrote, what `expand`
replays) — and the digest binds both.

**Two more checks exist because the mutation harness refused to accept the
oracle as written.** Six curated mutants of `corpus/alleles.ts`, each with a
stated behavioural consequence; all six are caught. But two of them — reading
arity-one braces as literal text, and dropping the trim — were caught *only* by
A6, the check that re-reads the corpus, so on any machine without the corpus
mounted they walked through a green run. A8 closes it: the artifact stores each
prompt's source beside its decomposition, so the parser is re-run offline
against a reference it did not just produce. Re-running the harness with the
corpus hidden then still caught 6/6.

**The auditor rejected the oracle once, and A9 is what it cost.** Asked whether
the round trip is a genuine witness, it named a hole the file did not cover:
*"the reliance on the same parser for both artifact creation and verification,
which fails to detect systematic parser errors that are consistent across the
corpus and the pinned artifact."* True — A6 and A8 both call `parsePrompt`, so a
systematically wrong parser agrees with itself everywhere. A9 is a second
implementation by a different algorithm (regex scan, not index walk), run over
the artifact and over all 1116 corpus prompts including the 800 called prose.

It was then tested the way the auditor described: the parser mutated to never
split on `|`, the artifact **regenerated** with it, and the pinned constants
**rewritten** to match — the whole system self-consistent around a pool of 1031
arity-one loci. A9 objected on 1026 of them. A1 and A3 objected too, and the
source says so; A9's claim is corroboration, not sole custody. Approved on the
second round.

**The one hole that stays open, named rather than closed.** The auditor's
remaining objection is common-mode failure from a shared *specification*: both
implementations agree on what a locus IS, so if that definition is wrong they
are wrong together. It is not a bug and no oracle can settle it, because it is a
judgment about the corpus. Its concrete instance: the five arity-one bodies are
`10k/25k/50k/100k`, `70/30`, `gold ones/steel blues/rainbow wilds` — the author
using `/` where the grammar uses `|`. Reading `/` as a second separator would add
loci and would be a guess, so they are recorded faithfully as arity one. **If
Stage 2 finds the expression pipeline wants those as real choice points, that is
a specification change and it moves the digest.**

Artifact: `design/allele-pool.json`, digest `a9854416740d…`. Regenerate with
`npm run gen:alleles`; verify with `npm run verify:alleles` (in `verify:engine`).

### Stage 1 — the token assets (the digits go)
Replace all 6 digit faces plus wild/bomb/locked/frozen with an atlas built from
corpus-named tokens. Every token has 3 states (idle / charged / spent).
**Gate: `verify-theme` APCA and `verify-lattice-gl` G3 must still pass — a token
is a background a glyph may sit on.** Figma holds the master components; Canva
generates candidate art; the atlas is a single PNG in the APK.

### Stage 2 — expression from the pool
Wire `ExpressionLoci` to the allele pool so a genome selects tokens, palette
band and filigree style. **Gate: expression must be a pure function of the
genome — same genome, same screen, provable by digest.**

### Stage 3 — structural loci from the game
`FACE_WEIGHTS`, turns, charge depth, region size become `StructuralLoci` with
declared ranges. **Gate: every candidate must move the rules hash and be
replayable.**

### Stage 4 — admission by oracle (a CONSTRAINT, not a fitness)
`foundry/admit.ts`: an offspring is admitted only if `verify-lattice`,
`verify-learnable` E1/E4/E6, `verify-ruleset` and `verify-surface` pass on it.
**Stated precisely after the audit: this is a feasibility boundary, not a
selection pressure.** It decides who may enter the population; it never decides
who wins.

### Stage 4b — the gradient (this is the selection pressure)
`foundry/gradient.ts`: rank admitted structural genomes by **inference value**
from `verify-learnable` — a continuous percentage, paired over 400 deterministic
rounds, with the scrambled control as its floor and the clairvoyant policy as
its ceiling. The design target of 5% becomes the thing evolution is climbing
toward rather than a number reported once.
**Negative control the stage must carry: breeding on a SCRAMBLED lattice must
produce no improvement across generations. If it does, the gradient is fitting
noise and the whole foundry is measuring itself.**

### Stage 4c — the Goodhart guard (added after audit round 2)
The auditor accepted the gradient and then named the next failure: **proxy-task
overfitting**.

> *"You are optimising structural loci against a surrogate metric rather than
> the ultimate objective. If the verifier's gradient is not monotonic with the
> oracle suite's success, breeding optimises for the verifier's artifacts,
> creating degenerate genomes that maximise inference value while remaining
> incapable of passing admission — decoupling the breeding driver from the
> actual goal."*

Three changes, because arguing about Goodhart is worthless and measuring it is
cheap:

1. **Fitness is defined ONLY on admitted genomes.** Not "score, then filter" —
   an inadmissible genome gets no rank at all rather than a low one, so the
   search cannot climb out of the feasible region and then be dragged back. The
   gradient exists only inside admission.
2. **Admission rate is tracked per generation, and it is a halt condition.**
   If the share of offspring passing admission falls below its founding value,
   the population is drifting toward the boundary and the run STOPS rather than
   spending a night breeding inadmissible variants.
3. **A HELD-OUT ORACLE SET, excluded from selection.** This is the actual
   detector. Selection uses E2 inference value alone. E4 (scrambled control),
   E5 (robustness under noise) and E6 (the deterministic single-turn rule
   assertion) are **never** part of the gradient and are evaluated only
   afterwards. If selected genomes improve on E2 while degrading on the held-out
   three, that IS Goodhart, observed rather than debated, and the run is void.
   *The threshold is stated in advance: any held-out regression at all, on a
   generation whose E2 improved, halts the foundry.*

### Stage 4d — hard versus soft constraints (added after audit round 3)
The auditor accepted the held-out set and named the next flaw:

> *"Search stagnation caused by a discontinuous fitness landscape. Assigning
> zero fitness to inadmissible offspring and halting on admission drops
> eliminates the ability to TUNNEL through inadmissible space to reach distant,
> superior feasible peaks — causing the search to stall or trigger a
> false-positive halt during necessary exploratory phases."*

The objection is right about the mechanism and it exposed that Stage 4c had
treated every constraint as the same kind of thing. They are not, and the
distinction is the fix:

**HARD constraints — no tunnelling, ever, and this is not a search limitation.**
Uniform dice (`verify-lattice` L1y), no pre-reveal leak (A5, S4, G2), and
deterministic replay (`verify-ruleset`, N1/N2). The auditor's premise — that a
superior feasible peak may lie beyond the excursion — is **false by
construction** here. A genome with a loaded die is not a waypoint toward a
better game; it is a different and defective product, and there is no peak on
the far side of fraud worth reaching. Infeasible on a hard constraint means not
a candidate, permanently.

**SOFT constraints — tunnelling is legitimate and is now permitted.** The 5%
inference design target, stagnation and reshuffle rates, legibility margin above
the APCA floor. These become a **penalty that decays with distance from
feasibility** rather than a hard zero, so the landscape is continuous across
them and a genome may dip below a target on its way somewhere better.

**The halt condition is corrected too**, because the auditor is right that a raw
admission-rate drop fires during healthy exploration:

- it triggers only on **HARD** infeasibility, never soft;
- it requires a **sustained** decline — three consecutive generations below the
  founding rate — rather than a single dip;
- and an **elite archive** keeps the best feasible genome found so far, so a
  halt or a bad excursion can never lose ground already earned.

### Stage 5 — the breeder
Port `BRANCH_WEIGHTS` and `evaluateNovelty`. **Port `W7NotPassedError` WITH
them**, retargeted at Stage 4. `computeFitness` is ported but its
`scoreJudgment` and `concordance` paths stay DISABLED and loudly so, because
their input does not exist until humans play — wiring them to a placeholder
would be inventing the data this plan exists to avoid inventing.

### Stage 6 — the foundry screen
A UI showing genome, parentage, fitness and which oracles admitted it.

---

## ~30 user-facing visual changes proposed

**Tokens (the digits go).** 1 six dice-class token faces · 2 `wild tile` ·
3 `prismatic bomb` · 4 `rainbow bomb` with hue-cycle · 5 `locked portcullis
tile` · 6 `cryo-frozen dice` · 7 `dice shards` for spent cells · 8 `neural orb`
for charged · 9 three states per token · 10 token pickup animation ·
11 charge as a token halo, replacing the `+n` badge.

**Surfaces.** 12 corpus-derived seamless ground texture · 13 per-tile face
texture · 14 `neural cathedral arches` framing the board · 15 board-edge
vignette · 16 `bone-like UI frames` on panels · 17 spectrum-band tint per round
(`matter/ir/uv/cyan/voidshard`).

**Motion and reveal.** 18 the reveal as a w-sweep · 19 round-end as one rotatable
4D object · 20 filigree thickness scaled by charge · 21 spark trails that leave
a scar · 22 reshuffle as a visible board event.

**Chrome.** 23 score as a token counter · 24 turn as a spent-token track ·
25 proof panel as a wax seal / sigil · 26 sound toggle as an icon ·
27 a settings screen · 28 onboarding as three visual panels, no prose ·
29 the foundry screen · 30 a genome card showing parentage and admitting oracles.

## ~28 corpus dimensions to mine, beyond language and pixels

1 wildcard loci (1026) · 2 allele pool (581) · 3 locus arity distribution ·
4 genome-length distribution · 5 allele co-occurrence graph (linkage) ·
6 allele frequency as sampling prior · 7 temporal order across 28.2 days ·
8 session clustering by date gaps (generations) · 9 template families sharing a
skeleton (siblings) · 10 ratings — **all zero, a measured absence** ·
11 dimension outliers · 12 per-image dominant colour · 13 per-image palette
cluster → family assignment · 14 edge density → texture roughness ·
15 symmetry score → tile suitability · 16 edge-wrap continuity → seamless
tileability · 17 background separability → croppable to a token ·
18 saliency centroid → auto-crop centre · 19 luminance histogram → survives a
dark theme · 20 per-image vivid fraction against the 12% budget · 21 perceptual
hash → near-duplicate detection in the gene pool · 22 crop candidates at
64/128/256px · 23 filename-prefix batches · 24 the 14 `.png` files vs 1115
`.jpeg` — different provenance · 25 prompt sentence structure, not just words ·
26 negative-space maps → where a glyph stays legible · 27 per-image APCA against
`INK` · 28 image↔prompt alignment (requires vision; flagged as expensive).

---

## What this plan does NOT claim

- It does not claim the corpus founds the structural genome. Attack 1 killed
  that; expression only.
- It does not claim fitness can be computed. `scoreJudgment` and `concordance`
  have no input until humans play, and saying otherwise would be inventing data.
- It does not claim breeding can start. W7's descendant gate blocks Stage 5
  until Stage 4 admission passes.
