# The board as light

Run under `EINCOL.md`. The cue: **what one change makes this board look like the
corpus it was measured from, and stay a playable, provable game?**

---

## Step 1 — the material, measured

The palette came from a corpus of generated images. Every one of them ships with
the prompt that made it, in `data/*.info.json`, and **nobody had ever read
them.** 1116 prompts, 1115 images at 768×768, 373MB.

Counted:

| term | n | | term | n |
|---|---|---|---|---|
| neural | 596 | | glowing | 301 |
| magenta | 539 | | **lattice** | **295** |
| skeletal | 468 | | pulsing | 271 |
| **tiles** | **382** | | **board** | **271** |
| synaptic | 380 | | gothic | 269 |
| filigree | 332 | | bio-mechanical | 254 |
| translucent | 323 | | cyber-gothic | 231 |
| cathedral | 312 | | amber | 202 |

**The corpus is 1116 independent descriptions of this game's own board** — a
glowing lattice of translucent tiles threaded with synaptic filigree, in
magenta and amber on obsidian — and the shipped screen rendered none of it. It
rendered numbers in boxes.

Also measured: `web/gl2-renderer.ts`, 325 lines, an instanced R⁴ quad renderer
with project/slice modes, driving the engine demo and nothing else. The game was
pure DOM. Two engines, no contact.

Research constraints, from the literature rather than taste: on a phone the
binding cost is **fill rate and overdraw, not draw calls**; additive blending
avoids the read-modify-write; a full-screen post-process is the thing to avoid;
and WCAG 2.3.1 puts the photosensitive safe harbour at **three flashes per
second**.

## Step 2 — the distribution

| p | Candidate |
|---|---|
| 0.22 | A particle field behind the grid as a backdrop |
| 0.18 | Render the cells themselves in GL |
| 0.14 | Particle burst on bank, along the observed link |
| 0.12 | Bloom to get the "glowing filigree" look |
| 0.10 | Import the corpus jpegs as textures |
| 0.09 | Animate charge as a synaptic pulse |
| **0.08** | **The `w` axis IS the hidden layer — put the links in R⁴ and sweep the slice at reveal** |
| **0.07** | The board is lit by the round's own seed |

## Step 3 — the tail, and Step 4 — killing it

Row one is decoration: overdraw for no meaning. The **p=0.08** tail row is
beautiful — the 4D engine already has a hidden fourth dimension with a slice
gate, and the game already has a hidden lattice. Map one onto the other, and the
reveal becomes a w-sweep.

**I wrote the claim down and it did not survive the writing:**

> *"Putting the hidden links at w≠0 and slicing at w=0 makes the leak
> structurally impossible."*

**False.** A shader discard is a *rendering* policy, not confinement. The
instance buffer would still hold every link position — one line in devtools —
and a single wrong uniform (`sliceW` drifting, mode flipped to `project`) draws
the entire hidden lattice. Worse, it moves the leak *out of the DOM*, where the
existing A5 check looks, and into a pixel buffer no oracle inspected.

Corrected, and this is what shipped:

> **The links are never uploaded to the GPU before the reveal.** `w` is depth
> and parallax — the pseudo-3D — and nothing else. Security stays where it
> already was: `session.links()` throws.

## Step 5 — the evaluator, and what it cost

### The two holes this feature opened

Adding a canvas created two gaps that **twenty-three existing oracles could not
see**, and both were found rather than assumed:

**The leak moved off the DOM.** `verify-app` A5 searches the document for link
markers — complete while the board was DOM, blind to a canvas. So `G2` does not
look at the screen at all: it hooks `bufferSubData` before any app code runs and
reads *what was actually submitted to the GPU*, requiring every thread instance
to lie on a link the player personally witnessed. Measured: **264 uploads, 7135
thread instances, all on the 7 witnessed links, 0 unwitnessed.**

**The contrast claim was pinned to tokens.** `verify-theme` T3 holds seven colour
pairings to APCA floors — every one a pair of *tokens*. With translucent tiles
and light behind them, the background a digit is read against is no longer a
token. **G3 caught a real regression in this very feature on its first honest
run:**

| tile interior | APCA |
|---|---|
| without the glow | `rgb(19,25,35)` → 95.2 |
| with the glow, tiles at 80% | `rgb(45,55,71)` → **89.5** |
| floor | **90** |

The board had become unreadable by this project's own standard while T3 went on
passing. Tiles went to 88% and the under-tile glow was dimmed; now **92.5**.

### What the auditor took away

I claimed G2 was *strictly stronger* than inspecting the rendered image, because
"the GPU cannot draw what was never uploaded." The objection, and it is right:

> *"A cheat can upload only the witnessed link data and use a fragment shader to
> procedurally render unwitnessed links from those legitimate coordinates.
> Because the shader calculates it on-chip, no additional bufferSubData call is
> triggered."*

So G2 is **not** strictly stronger — it is stronger against the leak that
actually happens and blind to one that derives structure on-chip. Two
instruments with different blind spots. **G8** closes that side by enumerating
every channel into the shader: 5 active uniforms, all scalar, 0 samplers, 0
textures. A shader cannot derive what it has no way to receive.

### Three of my own instruments were wrong

- **G1 read the GL canvas with `toDataURL` and always saw black** — a WebGL
  buffer is cleared after compositing. Fixed by measuring the *composited*
  screenshot, which is also what the player sees, and by making G1 an A/B
  against the layer's own absence rather than a threshold.
- **G3 sampled a band down the inside of each cell and read back the INK token
  exactly**, identical with and without the glow: it was measuring the *digit*
  and scoring ink against itself. Corners are the one part a centred glyph
  cannot reach.
- **My flash counter counted transitions, but WCAG defines a flash as a pair of
  opposing changes** — every rate was doubled.

### The safety number is derived, not chosen

`LUMA_RATE_LIMIT` began at 1.6 and G4b measured it passing **6.1 flashes/s at
13% amplitude** — over the harbour, because a swing of 10% or more counts. The
bound that makes the hazard unreachable: a flash at exactly 3/s has a 167ms
half-cycle, so brightness must not move 10% of full scale in that time.
`0.10 / 0.167 = 0.6`. Anything oscillating faster than three times a second now
moves less than 10% and is not a flash at all, whatever drives it. Measured:
a square wave in, **0.00 flashes/s, swing 0.05** out.

And the mutation harness earned its keep twice: deleting the limiter **survived**
end-to-end, correctly — under ordinary play the target brightness never
oscillates, so a limiter on a steady signal is invisible from outside. That is a
fact about the test. The guard was extracted into `web/ratelimit.ts` and is now
fed the 12.5Hz hazard directly.

---

## What shipped

One draw call. Additive blending, no read-modify-write. A hard cap of 1400
instances. No bloom pass, no second render target, no full-screen post-process —
the glow is per-instance radial falloff, one texture-free fragment each.

- **Tiles** burn cyan with charge and sit amber when plain: the board's state,
  read as light.
- **Synaptic filigree** threads the links the player has witnessed — the same
  confinement as the DOM trail, now drawn.
- **Sparks** travel from a banked cell to the cell that lit up.
- **A cathedral wash** — nine large, dim, slowly swaying instances far back in
  `w`, for the volume the corpus describes 312 times.
- **Per-instance drift in `w`** with a phase offset, so every element breathes
  toward the eye at its own rate. That is what makes a flat grid read as solid.
- **A y-w rotation** — the 4D engine's move applied to a 2D board.
- **Seed-derived light**: every round lit differently and *reproducibly*, from
  the same commitment that fixes the dice.

## Still open

- **The tilt is fixed at 0.16 radians and does not respond to the device.** A
  gyroscope parallax would be the obvious next thing and would need a
  permission this app does not have.
- **No real GPU has run this.** The measurements are SwiftShader in headless
  Chromium; frame pacing and thermals on a real phone remain unmeasured, and
  `verify-devices` cannot see them either.
- **G8 enumerates channels at one instant.** A program that swapped shaders
  between frames would need a different check.
- The corpus's own images are still unused as *textures* — only their language
  and their measured pixels have been mined.
