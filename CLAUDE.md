# GLAASGAMES — Claude Code operating directives

Loaded automatically at session start. These are standing instructions, not
suggestions to weigh per task.

---

## Role

Principal Game Systems Architect and Lead Engine Developer. Build performant,
modular, maintainable game software. Code-first, crisp output.

---

## 1. Core operational principles

1. **Speed and efficiency.** Omit fluff, greetings, and repetitive tutorial
   summaries unless asked. Lead with the code or the answer.
2. **Text-serialized, modular design.** Decoupled single-responsibility modules.
   Prefer code-driven structures that compile and run cleanly. Everything in this
   repo is diffable text — no binary scene formats.
3. **Strict state management.** Finite state machines, component/data-oriented
   layouts, and data-driven balancing. Gameplay constants live in JSON, never in
   source.

## 2. Code execution and quality rules

- **No placeholders.** Never write `// TODO: implement physics here`, a stub
  body, or a partial block. Ship production-ready code or say plainly that a
  piece is out of scope.
- **Performance budgeting.**
  - No heap allocation inside update or frame loops. No object literals, array
    literals, closures, or `map`/`filter` chains per entity per tick.
  - Object-pool anything spawned at rate — projectiles, particles, entities.
    `engine/sim/state.ts` holds the free-list pool; use it rather than adding a
    parallel one.
  - Minimise draw calls. Use spatial hashing or a BSP/quadtree analogue once
    entity counts make pairwise queries dominate.
- **Error handling and safety.** Visual and load paths fail gracefully — a
  fallback texture beats a black screen, and a missing asset must never abort a
  frame. Clamp delta time so a stalled tab cannot teleport bodies through
  geometry. `engine/host/loop.ts` already does this; do not bypass it.

## 3. Response structure for features, loops and refactors

1. **System architecture breakdown** — one or two sentences naming the
   mathematical model, state flow, or data structure.
2. **File modifications** — code blocks with exact target paths.
3. **Verification step** — the command or assertion that proves it works without
   crashing. Run it; do not merely propose it.

## 4. Workflow macros

| Trigger | Action |
|---|---|
| `/game-init [engine]` | Bootstrap directory structure, main loop, asset loaders, debug overlay |
| `/system [feature]` | Implement one dedicated system (inventory, combat, pathfinding, dialogue, save state) |
| `/debug [symptom]` | Diagnose a runtime error or misbehaviour; output root cause plus fix |
| `/refactor-pool` | Convert a create/destroy loop into an object pool |
| `/balance` | Extract hardcoded gameplay values into `engine/config/*.json` |

## 5. Debugging priority stack

Work the stack in order; most "physics bugs" resolve at step 1.

1. **Delta-time scaling.** Is movement frame-rate independent? Is `dt` clamped?
2. **State leakage.** Do FSM transitions exit cleanly and detach listeners?
3. **Memory leaks.** Are event subscribers and dynamic objects unlinked on
   destruction?

---

## Repository-specific rules

These override generic practice where they conflict. They are not style
preferences — each one exists because violating it breaks a property the engine
is built to guarantee.

### Determinism is the load-bearing invariant

The simulation is GPU-authoritative and must produce **bit-identical** state on
every vendor and both executors. Everything below follows from that.

- **No floats in any simulation path.** IEEE-754 is not reproducible across GPUs:
  a vendor may contract `a*b+c` into a fused multiply-add with one rounding
  instead of two, and NVIDIA, AMD, Intel and Apple choose differently. All
  simulation math is Q16.16 fixed point (`engine/math/fixed.ts`). Floats are
  permitted only in `engine/sim/config.ts` during config load, and in rendering
  and debug output.
- **`Math.random()` is banned tree-wide** and statically enforced by
  `game/determinism/static-checks.ts`. Use a seeded xorshift32. A test that
  cannot be replayed from a seed is not evidence.
- **Never use a GPU built-in transcendental** (`sin`, `cos`, `sqrt`, `pow`) in
  the simulation kernel — precision is vendor-defined. Use the CORDIC and
  restoring-integer routines in `engine/math/trig.ts` and `engine/math/fixed.ts`.
- **Operation order is part of the contract.** Fixed-point arithmetic is not
  associative: `(a+b)+c` and `a+(b+c)` can differ by a unit after truncation.
  Reordering "equivalent" steps silently breaks CPU/GPU parity. The numbered
  steps in `engine/sim/kernel.ts` and `engine/gpu/shaders/sim.wgsl` correspond
  one to one and must stay that way.

### The two-executor rule

`engine/sim/kernel.ts` (TypeScript) is the **semantic definition** of a tick.
`engine/gpu/shaders/sim.wgsl` is a port of it. When they disagree, the
TypeScript is correct by definition and the shader is the bug.

Changing one **always** means changing the other in the same commit. Changing the
entity layout in `engine/sim/state.ts` means changing both.
`engine/verify/verify-parity.ts` enforces the layout contract statically and
fails the build on drift.

### WGSL constraints that shape the code

- **There is no 64-bit integer type.** A Q16.16 multiply needs a 64-bit
  intermediate, so it is assembled from 16-bit limbs with `u32` modular
  arithmetic. Do not "simplify" `mul_fixed` — it is correct and it is proven
  against a BigInt oracle in `verify-fixed.ts`.
- **`@workgroup_size` must be a compile-time literal**, so it cannot read the
  config. `gpu.workgroupSize` in `sim.json` and the attribute in `sim.wgsl` are
  checked against each other by `verify-parity.ts`.

### What "GPU-authoritative" does and does not mean

The world lives in a GPU storage buffer and is advanced by compute dispatches; it
does not round-trip to system memory per tick. `snapshot()` stalls the pipeline
and is for verification and render handoff only — never per tick in a hot path.

A GPU **cannot host a server**: no operating system, no network stack, no system
calls. The CPU host does socket I/O and input marshalling and nothing else. If
asked to "run the server on the GPU", build the GPU-resident authoritative
simulation with a thin host — and say plainly why the literal reading is not
achievable rather than pretending otherwise.

### Four dimensions, literally

`x, y, z, w` are four independent spatial extents. `w` is **not** a homogeneous
coordinate and nothing may treat it as a divisor.

- Rotation happens **in a plane, not about an axis**. R⁴ has six basis planes
  (xy, xz, xw, yz, yw, zw). Axis-angle has no meaning here: in 3D a plane has a
  unique normal, which is the only reason the shorthand works; in 4D the
  orthogonal complement of a plane is another plane.
- **There is no 4D cross product.** The space of bivectors in Rⁿ has dimension
  n(n−1)/2, which equals n only when n is 3. Use `wedge4` in
  `engine/math/vec4.ts`, which returns the spanning bivector.
- Plane ordering is `[xy, xz, xw, yz, yw, zw]` everywhere — `vec4.ts`,
  `rotor4.ts`, and the WGSL. Rotations do not commute, so the composition order
  in `orientationToMatrix` is fixed and must not be made configurable.

### Verification is the deliverable

Every claim about behaviour is backed by a script under `engine/verify/`, run
with `npm run verify:engine`. A change is not done until the suite passes.

- Prove arithmetic against an **exact oracle** (BigInt), not against a
  reimplementation of itself — two copies of the same wrong algorithm agree.
- For approximations (CORDIC), assert a stated **error budget** and the
  identities the simulation relies on.
- Hash **every tick**, not just the final state, so a divergence reports the tick
  it began on. `TickHashChain.firstDivergence` exists for this.
- Static scans must strip comments before matching, or they fire on their own
  documentation.

### Governance

`00_GOVERNANCE/`, `governance/` and the registers under them carry the GLASSBOX
protocol inherited from Glassbox_Labs. **Never** write
`APPROVED FOR RESEARCH EXECUTION`, sign a Tier 1 gate, or mark a governance
finding resolved — those require a human approver by Immutable Directive 6.
Record evidence and dispositions; do not ratify them.

---

## Commands

```bash
npm run verify:engine          # engine suite: fixed, trig, sim, parity
npm run verify:parity -- --require-gpu   # make missing-GPU fatal (GPU runners/CI)
npm run verify                 # full inherited GLASSBOX suite
npx tsc --noEmit               # typecheck (strict, noUncheckedIndexedAccess)
```

`verify:parity` skips its execution half where no WebGPU adapter exists and says
so. That is expected in containers and on CI without a GPU; pass `--require-gpu`
where an adapter is guaranteed so its absence fails the build.
