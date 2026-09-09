# Stage 1 — the digits go, and what has to survive them

## Step 1 — the cue, with its measured material

The board renders a face as text: `cell.append(String(face))` in
`web/lattice-app.ts`. Six faces, `FACE_WEIGHTS = [0,4,4,4,4,4,4]`, uniform over
1–6. The instruction is to replace every digit with an industry-standard 2D
token asset, with full flexibility to overhaul any of them later.

The allele pool committed in Stage 0 already names the tokens. Measured
frequencies over 1031 loci:

| allele | n |
|---|---|
| `dice-class badges` | 12 |
| `prismatic bomb` | 12 |
| `wild tile` | 12 |
| `wild tile rainbows` | 8 |
| `standard bomb's depleting ring` | 8 |
| `cryo-frozen dice` | 6 |
| `locked portcullis tile` | 6 |
| `wild W symbol` | 6 |
| `final shard slot` | 5 |
| **`dice charge pips`** | **3** |

85 of the 584 alleles carry token vocabulary. The corpus is not decoration for
this stage; it is the specification.

## Step 2 — the distribution

*What is the one thing that makes token assets work rather than merely look
different?*

| p | Candidate |
|---|---|
| 0.20 | Draw good art and swap it in for the digits |
| 0.15 | Build a sprite atlas so the GPU draws them cheaply |
| 0.13 | Keep the digit as a fallback for screen readers |
| 0.12 | Three states per token (idle / charged / spent) so state stays readable |
| 0.10 | Derive every token colour from the corpus palette, so it stays traceable |
| 0.09 | Make each token distinguishable by SHAPE, not only by colour |
| **0.08** | **Tail: the digit is doing three jobs — identity, MAGNITUDE, and the accessible label — and a picture replaces only the first** |
| **0.07** | **Tail: no existing oracle can see this break. `verify-learnable`'s policies read faces as integers out of the model; they would score identically on a board a human could no longer read** |
| 0.06 | Mine corpus imagery for the token textures |

## Step 3 — the tail, worked

**Row p=0.08.** `lattice/round.ts` pays
`face(fed cell) × (1 + charge)`. The face is not a label, it is a **number the
player multiplies**. Choosing a cell means comparing the magnitude of what it
feeds against what another feeds. Replace `5` with a rune and the comparison
does not get prettier — it stops existing. Six distinguishable emblems make an
identity system; the game needs a **magnitude** system.

This is why real dice use pips and have for two thousand years: a countable
quantity reads as a quantity without literacy, without colour, and at a glance.
The corpus named it — `dice charge pips` — before this document did.

**Row p=0.07, and this is why the stage needs a new oracle.** Every policy in
`verify-learnable` reads `observable[i * 3]` as an integer. None of them looks
at a pixel. A token set that destroyed magnitude readability would leave E1–E8
byte-identical, `verify-theme` green (it checks colour pairings, not shape), and
`verify-lattice-gl` G3 green (it samples contrast, not countability). **The
entire failure mode is invisible to all 25 oracles.**

## Step 4 — falsifying it before building on it

The claim is *"pips preserve magnitude where emblems do not."* Written as
something that could come back false:

> Render each of the six tokens at the smallest size the board ever uses, convert
> to greyscale, and require the face value to be recoverable **by counting
> connected components** — an algorithm that knows nothing about which token it
> is looking at. If six distinct emblems pass that test too, the claim is wrong
> and the pip constraint is decoration.

The negative control is the honest half: **a planted emblem set** — six
distinguishable non-countable glyphs — run through the same recovery. If it
passes, this whole stage's central design decision is unfounded and the cheaper
option was right. It must be seen to fail before the pip set is allowed to pass.

Second falsifier, for the colour claim: run the recovery again with every
token's hue forced identical. Magnitude must survive, because roughly 1 in 12
men cannot use hue to tell two tokens apart.

### The auditor's objection, and what it changed

Put to the independent auditor before any token was drawn, the recovery test
came back rejected — not on its result but on **what it measures**:

> *"It measures topological discreteness rather than magnitude perception. The
> oracle is vulnerable to segmentation failure: if the smallest board size
> causes pips to touch or overlap, the connected-component algorithm will
> undercount the value (a 6 becomes a 1), whereas a human can still perceive
> magnitude through visual density or gestalt pattern recognition."*

Both halves land, and they pull in opposite directions, which is what makes them
worth answering rather than absorbing:

1. **Merging makes the oracle wrong, not conservative.** A 6 whose pips touch
   reads as 1 to the counter, and the build fails on art a person could still
   read. Left alone, that is an alarm that gets switched off.
2. **Component counting is not how people read dice anyway.** Nobody counts a
   die face. They recognise the canonical pattern — 3 as a diagonal, 4 as
   corners, 6 as two columns — which is gestalt, exactly as the auditor said.

So the test is not defended, it is **split into the two things it was conflating**:

| Check | What it measures | Why it is not the other one |
|---|---|---|
| **P1 separation** | the minimum gap between any two pips, in device pixels at the smallest board size, ≥ 1px of clear ground | Turns segmentation failure from a caveat into a precondition. If P1 passes, merging *cannot* happen, so P2's count cannot be fooled by it. |
| **P2 recovery** | connected components equal the face value | Now a sound proxy, because P1 guarantees the boundaries it depends on |
| **P3 canonical layout** | the pip centres match the standard dice arrangements | The gestalt channel the auditor named. It is what a human actually reads, and it is checkable as geometry. |

P1 is measured at the smallest size the board ever renders, which
`verify-devices` already pins at 320px — so the number is taken from a
constraint that already exists rather than chosen here.

### The second rejection: geometrically discrete is not perceptually salient

Put back to the auditor, the split was rejected again, on a hole none of the
three checks touches:

> *"The strongest remaining hole is luminance/contrast. The framework still
> measures machine segmentation rather than human perception; even if P1, P2 and
> P3 pass, a human may fail to perceive the correct magnitude if the pips lack
> sufficient contrast against the background. The suite validates that the
> graphics are geometrically discrete and renderable, but not that they are
> perceptually salient."*

Correct, and the tempting reply is the wrong one. This repository already
enforces APCA everywhere — `verify-theme` T3 on every text pairing,
`verify-lattice-gl` G3 on rendered pixels, `web/theme.ts` exporting
`LC_BODY_TEXT = 90` and `LC_LARGE_UI = 75`. It would be easy to answer "already
covered" and move on.

It is not covered. **Every one of those measures a pairing that exists today.**
The pip against its own token ground is a new pairing that no oracle has ever
seen, and G3's own history is the argument: it caught a real regression in this
project's tiles at 80% opacity (|Lc| 89.5 against a floor of 90) that every
other check passed. A pairing nobody measures is a pairing that drifts.

**P4 CONTRAST**: the pip fill against the token ground it sits on, measured in
APCA on the **rendered pixels** rather than on the declared colours, against the
`LC_LARGE_UI = 75` floor — the non-text-graphic floor, because a pip is a
graphical object and not a glyph. Measured after the corpus texture is
composited under it, since the texture is the thing that can move the ground.

Its negative control is a pip fill dropped toward the ground colour until it
crosses the floor: it must fail, or P4 is decoration.

That is four checks for one claim, which is more than this stage started with
and exactly as many as the claim turned out to need. Two auditor rejections, two
checks — neither of them anything the plan asked for.

## Step 5 — the evaluator

Rung 1 (a program that breaks the thing): `verify-tokens`, with the planted
emblem set as its negative control and curated mutants of the atlas generator.
Rung 2 (execution against reality): the rendered APK, through `verify-devices`
at 320px where the tokens are smallest.
Rung 3: the independent auditor, on the design before the atlas is drawn.

## What is being built

| Token | Source allele | Magnitude? |
|---|---|---|
| faces 1–6 | `dice-class badges`, `dice charge pips` | **yes — pip count** |
| wild | `wild tile`, `wild W symbol` | no — substitutes |
| bomb | `prismatic bomb`, `standard bomb's depleting ring` | no |
| locked | `locked portcullis tile` | no |
| frozen | `cryo-frozen dice` | no |

Three states each — idle, charged, spent — as the plan requires. The pip
geometry is procedural and exact, so it can be verified; the token's ground is
corpus-mined texture, so it is traceable. Those are two different jobs and they
are kept in two different layers deliberately: a texture that drifts cannot take
the magnitude with it.

**The digit does not disappear from the accessibility tree.** `aria-label`
already reads `face ${face}`, and it stays. Replacing a digit with a picture is
a visual change; making a board unreadable to a screen reader would be a
regression, and `verify-surface` would be right to fail it.
