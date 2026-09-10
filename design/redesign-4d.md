# The Fourth Axis — a redesign of everything the player sees

**Status:** Tier 2 design, candidate distribution. Nothing here is approved.
**Constraint:** the backend does not move. Not one rule, payout, digest or oracle.

---

## §0 · The cue, in measured material

Four facts from the code, not from memory. Everything below is built on them.

**F1 — the engine is a real 4D engine, not a marketing word.** `engine/math/rotor4.ts`
carries six rotation planes (`PLANE_XY`, `XZ`, `XW`, `YZ`, `YW`, `ZW`,
`PLANE_COUNT = 6`), an `Orientation4` of six angles, `integrateOrientation`,
`projectTo3D`, and `sliceTo3D`. `engine/math/vec4.ts` carries `wedge4`, which
returns the six-component bivector of the plane spanned by two vectors.

**F2 — every cell already has a fourth coordinate.** `board.ts` line 27:
`OFFSET_W = 4  // HIDDEN: Q16.16 position on the fourth axis`, written by
`lattice-gen.ts` line 114 as `toFixed(draw(64) - 32)` — a value in [−32, +31]
per cell. It exists. It is generated every round. Almost nothing reads it.

**F3 — THE REFUTATION THAT GOVERNS THIS ENTIRE DOCUMENT.** `web/lattice-gl.ts`,
lines 28–40:

> "The first design put the HIDDEN LINKS at w != 0 and relied on the slice gate
> (`abs(r4.w - u_sliceW) > u_sliceThickness` discards) to keep them invisible
> until the reveal swept w. It is elegant and it is WRONG... `w` is depth and
> nothing else. Security stays where it is."

A client-side slice gate is not security: the client holds the secret and merely
declines to draw it. **The fourth axis may carry public meaning as beautifully as
it likes, and may never carry secret information.** Every candidate below is
tested against this first, and three of them die on it.

**F4 — a coincidence worth building on.** `PLANE_COUNT` is 6. The dice have six
faces. `wedge4` returns 6 components; `Orientation4` holds 6 angles. The same
number keeps appearing because the same structure keeps appearing.

---

## §1 · The distribution — fourteen candidates

EINCOL asks for a spread with honest weights rather than one favourite dressed as
inevitability. Probability here means: *if the shipped redesign is judged good in
six months, how likely is it that this idea is load-bearing in it?*

| # | Candidate | P | Verdict |
|---|---|---|---|
| C1 | ~~Six planes, six faces~~ — face *n* rotates in plane *n* | 0.75 -> **0.00** | **REFUTED §6** |
| C2 | **The trail is a bivector** — belief drawn as an oriented disc | 0.55 | **CORE** |
| C3 | **Uncertainty has thickness** — band smeared along w | 0.70 -> 0.30 | **legibility trap, audit §6** |
| C4 | **Charge lifts a cell toward you** — w carries charge, publicly | 0.60 | strong |
| C5 | **Settlement is one rotation** — board turns through XW into results | 0.45 | strong |
| C6 | **Stagnation flattens the world** — dead board collapses to w=0 | 0.40 | strong |
| C7 | **The beacon anchors the world's depth** | 0.35 | keep |
| C8 | **Tilt-to-parallax** — gyroscope drives the YW plane | 0.30 | keep |
| C9 | **The heat lobby is a 4D cloud** — stake is w, cohort is a volume | 0.25 | thin |
| C10 | **Precognition ghosts at another depth** | 0.20 | thin |
| C11 | **Regions lean** — each region gets its own `Orientation4` | 0.15 | **tail -> mode of C2** |
| C15 | **The anchor** — a fixed shadow at each token's rest position | — | **REQUIRED by audit, and it works** |
| C12 | **The reveal sweeps a slice through w** | 0.10 | **tail** |
| C13 | **Links live at w ≠ 0, hidden by the slice gate** | 0.00 | **DEAD (F3)** |
| C14 | **w encodes the payout multiplier before the reveal** | 0.00 | **DEAD (F3)** |

---

## §2 · The three that carry it

### C1 — Six planes, six faces  *(P 0.75)*

A die face is currently a count of pips. It stays a count of pips — `verify-tokens`
P1–P9 proves a player recovers the value in greyscale at the narrowest phone, and
that is not being given up. **What is added is a second, redundant channel: face
*n* rotates its token in rotation plane *n*.**

A 1 turns in XY — flat, in the plane of the screen, the most familiar motion
there is. A 6 turns in ZW — a rotation with no 3D analogue at all, which reads as
the token turning *inside out* rather than turning around. Between them the
motion gets progressively stranger, and strangeness is monotone in face value.

Why this is worth doing rather than clever: **a player learns to read the board
peripherally.** Pips must be foveated — you look at a cell to count it. Motion is
detected across the whole visual field at once. A board of 36 cells becomes
scannable in one glance instead of thirty-six.

It is also honest to the mathematics. These are not six arbitrary animations; they
are the six planes of rotation that exist in four dimensions, and there are
exactly six because that is how many independent planes R⁴ has. The game's tokens
would be doing the only six things a 4D object can do.

*Risk, stated up front:* motion is an accessibility hazard. `prefers-reduced-motion`
must collapse this channel entirely to static pips, and the game must remain fully
playable with it off — which it is, because pips are the primary channel and this
is redundant by construction.

### C2 — The trail is a bivector  *(P 0.55)*

The player watches charge move from a banked cell to another cell. Two cells, two
positions in R⁴ — and `wedge4(a, b)` returns the bivector of the plane those two
points span, as six numbers. `Orientation4` is also six numbers.

So the player's accumulated evidence is **literally, not metaphorically, an
orientation.** Every observation wedges into a running sum; the sum is rendered as
an oriented disc floating over the board — its tilt is what the player has learned,
its size is how much they have learned.

This replaces a UI that does not exist. There is currently no way to see what you
have inferred; the trail is a thing you remember or lose. Making belief a visible
object is the difference between a puzzle you play and a puzzle you can *reason
about out loud*.

**It cannot leak the answer**, and this is the load-bearing check: the disc is
computed only from observations the player has already witnessed on screen. It is
a rendering of the player's own memory, not of the lattice. A wrong belief draws a
wrong disc — which is the point, and which `verify-cartographer` C5's blind-baseline
structure already knows how to score.

### C3 — Uncertainty has thickness  *(P 0.70)*

`heat.ts` `liveProjection` returns `{p10, p90}` — a band, never a point — and the
duty-of-care rules say a point value "reads as owed money" while a band "reads as a
projection."

Currently that band would be two numbers and a bar. Instead: **render it as extent
along w.** A confident projection is a thin bright sheet. An uncertain one is a
smeared volume you can see through. As a heat fills and the estimate tightens, the
volume visibly condenses.

This is the single most defensible use of the axis in the whole document, because
the fourth dimension is doing something a third could not: the band is already
occupying x (value) and y (probability), and thickness in a *fourth* direction is
the honest place to put "and we are not sure." Nothing is hidden — the numbers stay
on screen — but the shape of the uncertainty is felt rather than read.

---

## §3 · Working the tail

EINCOL says the tail is where the information is. Two candidates sit at 0.15 and
0.10 and both taught me something by failing.

**C11 — regions lean.** Give each of the four regions its own `Orientation4` so
the board visibly breaks into four differently-tilted quadrants. Beautiful, and
**it leaks.** The region's prevailing flow is exactly the secret the player is
trying to infer; rendering it as a tilt hands it over. The salvage is real though:
render the lean of the player's *believed* region flow, from C2's accumulated
wedges. Then a confidently wrong player sees a confidently wrong board — which is
the most interesting failure state this game could have. **C11 does not die; it
becomes a mode of C2.**

**C12 — the reveal sweeps a slice.** `sliceTo3D` exists and a w-sweep at round end
would be gorgeous. The trap is F3: if the client can sweep, the client has the
links. It survives *only* if the links arrive from the server at reveal time and
the sweep is animation over already-public data. That is a transport question, not
a render question, and `net/heat-server.ts` `receipt` already publishes exactly
that payload at exactly that moment. **C12 is legal, but only downstream of the
receipt** — and stating that is the whole finding.

---

## §4 · Falsifying my own claim

The claim this document makes is: *the fourth axis can carry half or more of the
user-facing design.* Here is the strongest case against it.

**The projection is degenerate for a flat board.** `projectTo3D` divides by
`(viewerW − w)`. Cells sit near w = 0 and the board is a plane. If every cell has
w ≈ 0, the 4D projection reduces to a uniform scale — mathematically 4D, visually
nothing. C1, C3 and C4 all rely on *pushing cells apart in w*, and if the design
does that too much the board stops reading as a grid, which is the one thing a
puzzle board must do. **The axis is only free where the game is not already using
the plane.**

**Motion as a value channel may be unreadable in aggregate — MEASURED, AND C1 WAS
FALSIFIED AS WRITTEN.** The test: trace where each pip lands over a full rotation
in each plane, and take the pairwise RMS distance between those motion signatures.

For a FLAT token the six planes collapse to four:

    closest pair XZ/XW — RMS 0.0097 token widths = 0.46 px at a 48 px token
    YZ/YW the same, at 0.010

The mechanism is exact and, in hindsight, obvious. A flat token's pips sit at
z = 0 and w = 0. Rotating x *into z* and rotating x *into w* do the same thing to
the visible x and y, because the token has no extent in either axis for them to
rotate into. Six planes, four distinguishable classes: {XY}, {XZ,XW}, {YZ,YW},
{ZW}. **C1 as originally stated is dead.**

The falsification also handed over the repair. Give the pip cluster depth — emboss
each pip a fixed distance in z and w — and the planes separate linearly:

    emboss 0.00  ->  0.46 px   dead
    emboss 0.08  ->  2.53 px   visible at a glance
    emboss 0.16  ->  5.00 px   confidently readable
    emboss 0.24  ->  7.50 px

**C1 survives with a precondition it did not have before: the pip cluster must
carry at least 0.16 token widths of depth in z and w.** That is now a spec, not a
hope, and it came from the check that killed the original claim.

It is also safe. At rest the orientation is identity, so a static token is
byte-identical to the one shipping today and `verify-tokens` P1-P9 keeps holding
on the primary pip channel. The motion channel is strictly additive.

**Honest ceiling.** Counting generously — board tokens (C1), the belief disc (C2),
the projection band (C3), charge lift (C4), settlement (C5) — the fourth axis
touches perhaps 55–60% of the pixels a player looks at. Claiming much more than
that would mean putting w into typography and layout, where it has no business
being. **"Half or more" is achievable and roughly the honest maximum.**

---

## §5 · What does not change

Not one line of: `lattice/round.ts`, `lattice/board.ts`, `lattice/lattice-gen.ts`,
`game/economy/*`, `net/heat-server.ts`, `foundry/*`, or any `engine/verify/*`
oracle. The rules hash does not move. `verify-ruleset` R7 would catch it if it did.

This is a redesign of the surface only, and the surface is allowed to be
completely new precisely because the thing underneath it is pinned.


---

## §6 · C1 is dead, and the measurement that killed it

C1 was the headline of this document at P 0.75. It is now 0.00. Three probes took
it apart, and each one was necessary.

**X-4D1 — six planes are four.** Traced pairwise over a full rotation, a FLAT
token separates XZ from XW by 0.46 px at 48 px. YZ/YW likewise. The mechanism:
pips at z = 0 and w = 0 have no extent for those planes to rotate into. C1 was
falsified and then REPAIRED by embossing the cluster 0.16 token widths into z and
w, which restored separation to 5.00 px. At that point C1 looked saved.

**X-4D2 — two faces have no channel at all.** Rendered and measured against the
REAL per-face pip layouts rather than the single test cluster X-4D1 used:

    face 1 (XY)  displacement 0.000 at every phase
    face 6 (ZW)  displacement 0.032 max, under the 0.04 glance threshold
    faces 2-5    0.29 to 0.47 — strong

Face 1's single pip sits AT THE ORIGIN, so no rotation about the centre can move
it, in any plane. Face 6's ZW plane never touches x or y. My first probe used one
pip cluster for all six planes and therefore could not see this: **the measurement
and the design disagreed about what was being measured, and I did not notice
until I rendered it.**

**X-4D3 — the planes are not interchangeable.** Scoring every face against every
plane for displacement AND pip occlusion:

    XY is the best occlusion-free plane for FIVE of the six faces
    ZW yields ~0.02 for every face — dead across the board
    every non-XY plane merges pips on faces 4, 5 and 6

There is no assignment of six planes to six faces that gives every face a readable
signature without merging its pips. **The six rotation planes have wildly
different visual budgets and are not six channels.**

### What that means, said plainly

`PLANE_COUNT` being 6 and a die having 6 faces is NUMEROLOGY. I built a headline
candidate on a coincidence of integers and weighted it higher than anything else
in the distribution. The elegance was real; the design was not.

The deeper error is worth more than the finding. `verify-tokens` P1-P9 already
proves a player recovers the face value from pips alone, in greyscale, at the
narrowest phone. **A redundant motion channel for face value is solving a solved
problem.** The fourth axis is scarce and it was being spent on the one quantity
this interface already communicates perfectly.

### What survives, and is stronger for it

- **C15, the anchor** — the audit's note, and the single best idea in the cycle.
  Independent of plane choice, it is what makes any 4D motion readable at all.
- **C4, charge as depth** — charge has no spatial encoding today. Real work.
- **C2, belief as a bivector** — the player's inference has NO representation
  today. This is the largest genuine gap in the interface.
- **Embossing** — survives as the precondition for any w-touching rotation.

The rule the cycle produces: **spend the fourth axis on what is not already
encoded.** Face value is encoded. Charge is half-encoded. Belief and uncertainty
are not encoded at all, and that is where the axis belongs.

`design/4d-sheet.png` is kept as the evidence, not as a proposal. It is a picture
of a refuted design, and the two dead rows are visible in it.
