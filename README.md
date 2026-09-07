# GLAASGAMES

GPU-authoritative 4D game engine, built on the GLASSBOX genome-driven foundry.

Seeded from [`libriopal/Glassbox_Labs`](https://github.com/libriopal/Glassbox_Labs)
with its full commit history; the governance package, foundry and genome families
below are inherited unchanged. The `engine/` tree is new.

## The engine

Four independent spatial dimensions (`x, y, z, w` — `w` is a real extent, not a
homogeneous coordinate), simulated in Q16.16 fixed point, advanced by WGSL
compute shaders against state that lives in VRAM.

**Why fixed point.** IEEE-754 is not reproducible across GPU vendors: an
implementation may contract `a*b+c` into a fused multiply-add with one rounding
instead of two, and NVIDIA, AMD, Intel and Apple choose differently. Integer
arithmetic in WGSL is exact everywhere. This extends the `Q x 1000` scoring
discipline already in `game/determinism/` into the spatial domain.

**One rule set, two executors.** `engine/sim/kernel.ts` is the semantic
definition of a tick; `engine/gpu/shaders/sim.wgsl` is a port of it. A verify
pass runs both from one seed and compares per-tick hash chains, so the GPU path
is proven rather than assumed — and a divergence names the tick it began on.

| Path | Role |
|---|---|
| `engine/math/fixed.ts` | Q16.16 scalars; limb-based multiply (WGSL has no i64) |
| `engine/math/trig.ts` | CORDIC sin/cos — shift-and-add only, no vendor libm |
| `engine/math/vec4.ts` | 4D vectors; `wedge4` in place of the nonexistent 4D cross product |
| `engine/math/rotor4.ts` | Rotation in six planes, not about axes; 4D→3D project and slice |
| `engine/sim/state.ts` | Entity layout + free-list pool; the CPU/GPU memory contract |
| `engine/sim/kernel.ts` | Reference tick — the semantic definition |
| `engine/gpu/shaders/sim.wgsl` | GPU kernel, integer-only, step-for-step identical |
| `engine/gpu/device.ts` | Device acquisition; GPU-resident world, no per-tick round-trip |
| `engine/host/loop.ts` | Fixed timestep with spiral-of-death guard |
| `engine/config/sim.json` | All gameplay constants; no balance value lives in source |

**On "running the server on the GPU":** a GPU cannot host a server — no OS, no
network stack, no syscalls. What this provides is the achievable form: the
authoritative world lives in GPU memory and is advanced by GPU kernels, with a
thin CPU host doing only socket I/O and input marshalling. The same WGSL runs
under Node (via Dawn) and in the browser, so server and client execute one
kernel rather than two implementations kept in agreement by hand.

```bash
npm run verify:engine        # fixed, trig, sim, parity
npm run verify               # typecheck + engine + full inherited GLASSBOX suite
npm run verify:parity -- --require-gpu    # make a missing adapter fatal
```

`verify:parity` proves the CPU/GPU layout contract statically anywhere, and runs
real execution parity where a WebGPU adapter exists — it reports a skip, loudly,
where none does.

**GPU parity is proven, and verifying it costs nothing.** The WGSL kernel has
been executed against the reference executor and matched bit for bit: 600 ticks
x 1024 entities, chained digest `0x77f11d60`. No GPU was rented —
`.github/workflows/gpu-parity.yml` runs Mesa lavapipe, a software Vulkan device,
on GitHub's standard runners, under Deno's native WebGPU. `npm run verify:gpu`
does the same locally, installing lavapipe if the machine has no adapter.

That proves the port is correct. It does not prove cross-vendor agreement on
real silicon: the integer-only design argues vendor divergence cannot arise, but
that argument is not a measurement. Run `npm run verify:gpu` on a real GPU to
measure it.

## Getting started on Android

    git clone https://github.com/libriopal/GLAASGAMES.git
    cd GLAASGAMES && bash CHOAS66.SH

`CHOAS66.SH` is idempotent and does the whole bootstrap: packages, credentials,
config generation, endpoint smoke test, on-device verification. Then paste
`ORDER66.md` into OpenClaude as its first message.

---

# Inherited: GLASSBOX Governance Package & Scite Deep-Research Deliverables

This repository holds the **GLASSBOX governance package (v3.0.0)** and the Tier 2 **Scite deep-research** evidence artifacts produced against it.

## What this is

The GLASSBOX protocol governs the audit and execution of a deterministic, genetically-evolvable
TypeScript game architecture. Under it, an **AI Auditor (Tier 2)** may audit and generate evidence,
but the eight-phase research workflow stays **LOCKED** until a **Human Approver (Tier 1)** records
`APPROVED FOR RESEARCH EXECUTION` at Gate **G3**. The session was halted `INCOMPLETE` on 2026-07-29
with two open Critical findings that "require evidence, not review":

- **FND-2026-07-011** — the D2 bibliography (nine blocked source slots) + the `|S₀|` seed corpus (D4).
- **FND-2026-07-012** — the unsourced "over 42%" cloud-billing statistic (D3).

Both were blocked by the **anti-fabrication rule** (model recall is inadmissible). Scite MCP deep
research resolves exactly that: it returns **real, DOI-addressable, retraction-screened** sources.

## Deep-research deliverables (all Tier 2; research remains LOCKED)

| File | Purpose |
|------|---------|
| `governance/AUD-2026-07-005_EVIDENCE_ACQUISITION_RECORD.md` | Populates the 9 source slots with 12 admissible sources; dispositions FND-011 (bibliography) and FND-012 (42% → downgrade). |
| `governance/AUD-2026-07-006_IMPLEMENTATION_EVIDENCE_DOSSIER.md` | Grounds the `game-autobuild-kit` blueprint in admissible sources; module→evidence map; governance-gated build sequence. |
| `governance/SourceMatrix.md` | Populated Source Matrix, `SRC-2026-07-001…016` (DOIs). |
| `governance/EvidenceRegister.md` | Evidence entries `EVT-2026-07-004…008`. |
| `governance/SESSION_STATE_2026-07-30.md` | Resumption state: evidence supplied for D2/D3; research still LOCKED; G3 PENDING-HUMAN. |
| `governance/00_…`–`08_…`, `MASTER_PROMPT.md`, audit/decision records | The v3.0.0 governance package (baseline context, unchanged). |

## What remains for Tier 1 (the Human Approver)

1. **Ratify D2** — the bibliography in `SourceMatrix.md`.
2. **Elect D3** — Option B (downgrade the "42%" claim to qualitative) is recommended; the figure has no admissible source.
3. **Supply D4** — the `|S₀|` human-verified seed corpus (or relax `VALIDATION_CONSISTENCY_THRESHOLD` to 0.98).
4. **Gate G3** — only a Tier 1 signature unlocks research execution / the Design-Execution build.

Nothing here writes `APPROVED FOR RESEARCH EXECUTION` or signs a Tier 1 gate — by design (Immutable Directive 6).
