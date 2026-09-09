# Using the 4D engine to render the board, the forecast, and everything else

Run of [`EINCOL.md`](../EINCOL.md) against one question: *how does the 4D engine
render a 2D grid of tokens and a forecasting layer, rather than sitting beside
them as a demo?*

The answer was found by **rendering it**, not by reasoning about it, and the
renders corrected me twice.

---

## 1. What the engine actually is (measured, not remembered)

`web/gl2-renderer.ts` is an **instanced point renderer over R⁴**. Per token it
takes five floats:

```
(x, y, z, w, kind)
```

and these uniforms:

```
rot4  viewerW  sliceW  sliceThickness  mode(project|slice)
yaw   pitch    distance aspect         pointSize  wMin  wMax
```

Reading the shader is what settled the design, because **the visual grammar of a
forecast layer is already in it and unused**:

| Shader line | What it already does |
|---|---|
| `hueToRgb(0.62 - 0.62*wNorm)` | w drives **hue**, blue → red across `wMin..wMax` |
| `p3 = r4.xyz * (u_viewerW / (u_viewerW - r4.w))` | w drives **apparent size** (nearer on w = larger) |
| `if (abs(r4.w - u_sliceW) > u_sliceThickness) discard` | w drives **visibility through a window** |
| `sizeScale` by `a_kind` | 4.2× for kind 1, 2.6× for kind ≥2, 1.0× otherwise |

Three independent channels — colour, size, presence — all keyed to one number.
That is a forecast display. Nobody has to build one.

---

## 2. The distribution, and the row that survived

| p | Candidate |
|---|---|
| 0.30 | Decorative background behind the DOM board |
| 0.20 | Tokens as 4D-projected sprites — a look, not a mechanic |
| 0.15 | w drives parallax depth on the grid |
| 0.12 | Replace the DOM board with GL for performance |
| 0.10 | Slice mode as a "peek" power-up |
| **0.08** | **The forecast layer IS the projection — same geometry, different w** |
| 0.05 | A whole round is one static 4D solid; play moves the slice plane through it |

---

## 3. Falsified once, then corrected

**First formulation:** put the hidden lattice on the w axis, and the forecast
view is just a different slice of it.

**It breaks immediately.** If w carries the hidden links, then *any* w-window
shown before the reveal leaks them. That destroys the inference game, makes P1's
mutual-information figure meaningless, and fails `verify-app` A5, which searches
the DOM for link markers before the reveal.

**Corrected, and this is the design:**

> **w carries the PLAYER'S FORECAST, never the hidden truth.**
> A token's w is how strongly *you* have committed to a prediction about that
> cell. The hidden lattice stays hidden until reveal, at which point the true
> links are loaded into w and your forecast is compared against them — in the
> same space, by eye.

This is better than the version that broke. The forecast becomes a *thing in the
world with a position*, not a number in a panel. You can see your own confidence
distributed across the board, and see it be wrong.

---

## 4. What the renders proved, including the part I had backwards

I fed the 36 lattice cells into the shipped renderer as instances and drew them.
(The first attempt drew one token, because I *guessed* `ENTITY_STRIDE = 16` when
it is 12 and `OFFSET_KIND = 12` when it is 8. Measured, then it worked.)

**`project` mode displaces the grid. `slice` mode does not.**

```
project:  p3 = r4.xyz * (viewerW / (viewerW - w))   // w scales x and y too
slice:    p3 = r4.xyz                                // w only gates visibility
```

In the project render, forecast tokens bloom *off* their cells — bigger,
brighter, and no longer aligned to the lattice. That is beautiful and it violates
V1, the oracle proving a token never leaves its cell (max drift 0px).

In the slice render, the surviving tokens sit **exactly** on their grid
positions.

So the architecture is not a choice between the two. It is both, with a rule:

| View | Mode | Why |
|---|---|---|
| **The board you play on** | `slice` | cell alignment is preserved exactly; V1 still holds |
| **The forecast view** | `project` | the board blooms into depth; misalignment is the point |

The forecast view is a **gesture, not a screen** — hold to look along w, release
and the board settles back onto the lattice. The distortion is legible as
"leaving the board" rather than as a bug.

---

## 5. What the reference games contribute

| Source | Finding | Where it lands |
|---|---|---|
| **King of Tokyo** | Occupying Tokyo scores every turn, but you *cannot heal there* and everyone can hit you. A contested cell with positional cost. | Change 2 |
| **Match-3 juice** | Immediate response, impact proportional to significance, and the detail everyone forgets: the action *leaves a permanent mark*. | Change 3 |
| **Slot machines** | The near-miss is the dark pattern — drawn-out anticipation *after* the outcome is decided. The ethical inversion is anticipation *before* the commit. | Change 4 |
| **Commit–reveal in prediction games** | The scheme this project already uses for fairness is, in the prediction-game literature, the *forecasting mechanic itself*. | Changes 1 and 5 |
| **4D visualisation** | w-as-depth with size falloff is the canonical cue, and it is already implemented. | §1 |

---

## 6. Seven recommended changes

Each is traceable to a measurement or a source above, and each names what would
falsify it.

### 1. `w` becomes the forecast axis
Token instances carry `w = the player's committed confidence` for that cell.
Slice mode plays the board; project mode is the forecast view. No new shader
work — the three w channels already exist.
*Falsified if:* the reveal can be read from any pre-reveal frame. `verify-app`
A5 already tests exactly this and must keep passing.

### 2. One contested cell, borrowed from King of Tokyo
Exactly one cell scores every turn while you hold it, **cannot be recharged**,
and is visible to everyone. It is the only token pinned at `w = 0` — permanently
in focus while every forecast drifts away from it. It is the still point in a
moving picture, which is what makes the picture read.
*Falsified if:* holding it is always correct or never correct. Measure the
win-rate delta; if it is not near 50%, the cost is mispriced.

### 3. Banking leaves a mark
The match-3 literature's third principle is a *permanent* trace. A banked cell
leaves a persistent scar at low w — dim, behind the play plane, accumulating
through the round. By turn 12 the board carries a visible record of everything
you did, which doubles as your move history and costs nothing to store because
it *is* the action list the verifier replays.

### 4. Anticipation before the commit, never after
Slot machines stretch the moment *after* the outcome is fixed; that is the
near-miss, and it is the dark pattern. Invert it: charge builds visibly along w
*while you are choosing*, and once you commit the outcome resolves **instantly**
with no drawn-out reveal. All tension, no manufactured suspense.
*Falsified if:* any animation delays the display of an outcome already decided.
That is a one-line check worth adding.

### 5. The reveal is a w-sweep, not a paragraph
Today the reveal prints text. Instead, sweep `sliceW` through the lattice so the
true links materialise cell by cell, landing on top of your forecast ghosts. The
proof stops being a receipt and becomes the most spectacular five seconds in the
game — and it is the same data, displayed.

### 6. The vivid budget becomes a rendering law
`theme.ts` measures 9.2% of corpus pixels as vivid and sets a 12% ceiling that is
currently *asserted*. Drive saturation from `wMin/wMax` in the shader and measure
the actual rendered vivid fraction off the framebuffer — `verify-gl2` already
reads pixels back, so the budget becomes enforced rather than claimed. This is
the one change that makes the whole screen look like the corpus by construction.

### 7. A round is one 4D object
The radical row from the distribution. Twelve turns of a round are twelve
w-layers of a single solid. When the round ends you can rotate the whole thing —
your entire game as one shape, its links, your forecasts, your scars. It is a
new artifact for mobile: not a replay you watch but an *object you turn over*,
and it is exportable as an image because it is one static render.
*Falsified if:* the rotation is uninterpretable. Prototype before committing —
this is the highest-risk item and should be built last.

---

## 7. What is not proven

- The renders here are SwiftShader at 786², not a handset. Frame cost on a real
  phone is unmeasured, and change 7 in particular multiplies instance count by
  the turn count.
- Changes 2 and 4 alter the game's balance and legality surface. Change 2 adds a
  new scoring rule, which moves the rules hash and needs its own oracle.
- Nothing here has shipped. This is a design derived from measurements and two
  corrected mistakes, not an implemented feature.
