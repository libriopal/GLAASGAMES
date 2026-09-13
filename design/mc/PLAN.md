# The Monte Carlo engineering method — approved, for games two and three

Both plans were submitted to the independent auditor **before any compute was
spent**, and revised until approval. This file is the approved state plus the
refinements the approving audits themselves supplied.

| plan | rounds | verdict | what the audit changed |
|---|---|---|---|
| `chem-mc-plan` | r1 → r2 | **APPROVE** | fold-over for aliasing; hard assertions; parsimony rule; oracle rejection rate; pilot promoted to a stage |
| `dark-mc-plan` | r1 → r2 → r3 | **APPROVE** | the three-way war; diversity over rejection; blind-readout control; screensaver detector; **the math exploit** |

---

## The six stages, which do not change between games

**Stage 0 · Instrument validation.** Negative controls *watched failing*, before
any design question. A broken instrument **halts the run** — it is not marked
void. The audit's wording: *"Do not rely on a human to mark a cell VOID; make the
instrument incapable of lying."*

**Stage 1 · Screening** at resolution V or better.
**Stage 2 · Full factorial** on the survivors.
**Stage 3 · Confirmation** on *disjoint* seeds — a configuration that wins on the
seeds it was selected on and not on fresh ones was fitted to noise.
**Stage 4 · Exploit sweep.**
**Stage 5 · Population and dual constraint** on the same 15 personas, so all
three games are comparable on one instrument.

---

## Pre-registered acceptance — declared before the run, and not moved

| gate | chemical | darkmatter |
|---|---|---|
| AGENCY FLOOR | ≥ 25% | ≥ 25% |
| SIGNAL UTILITY | ≥ 50% | ≥ 50% |
| SEED SHARE | ≤ 35% | ≤ 35% (as ATTRIBUTION) |
| THROUGHPUT | 2.0 – 8.0 | — |
| DOMINATED | false | false |
| LYAPUNOV | — | bounded |
| REPLAY DIVERGENCE | 0 | 0, bitwise |
| REJECTION RATE | — | 1–20%, *defect detector only* |

**If nothing clears the bar, that is reported as a finding.** The bar does not
move. For Chemical the declared fallback is: *chemistry is a recognition game
with a ~4% planning margin, and it says so on the tin.*

---

## Ten standing instructions

The first eight were proposed with the plan; #2 was replaced by the audit, and
#9–#10 come from the game-three rounds.

1. **Pre-register** thresholds and the stopping rule before compute.
2. **The instrument asserts and halts.** *(replaced the original "mark it void")*
3. **Declare the compute budget and the degradation path** up front — sacrifice
   replicates before power.
4. **Hold seeds fixed across cells**; report paired deltas.
5. **Flag zero-variance responses** as suspected vacuous measurements.
6. **Record the losing configurations**, not only the winner.
7. **A human approver, not me**, signs any threshold change or governance
   finding.
8. **Reproducible from (seed, config) alone.** A hidden stream is a blocker.
9. **Remedies are ordered in advance**, so the one that flatters the result is
   not chosen after seeing it.
10. **Metrics must not depend on my own labels** — diversity is tested for
    discontinuity, not counted by the names I gave things.

---

## What the audits caught that I would have shipped

- **The fold-over does not work.** The approved chemical plan promised a
  resolution-IV fraction plus its fold-over would give resolution V. The design's
  own self-check returned **4**. A fold-over reverses every sign, so an
  even-length defining word is unchanged by it — folding promotes III to IV and
  does nothing to IV. Replaced with a genuine resolution-V design, then cut to
  six factors at **resolution VI** under the budget rule.
- **The math exploit.** *"N1–N7 check the game's fairness, but they do not check
  if the fixed-point arithmetic itself creates non-physical attractors."* Every
  one of the seven controls would have passed a rounding-error energy leak: it is
  deterministic, it replays bitwise, it is not chaotic, it is attributable, and
  the player really does cause it. Answered with round-to-nearest-even (so the
  error is zero-mean rather than signed), **N8** testing conserved quantities for
  *directional* drift rather than magnitude, and a **glitch-hunter** adversary.
- **Rejection rate measures solvability, not diversity.** *"A generator could be
  healthy by your metric while producing 100% of its seeds within a narrow,
  boring band."* Demoted to a defect detector; **solution-space variance** is the
  health metric.
- **Goodhart's law**, named as the residual risk on the chemical plan: no metric
  here measures fun. The visual gate and human playtest stay the arbiter.

## Refinements adopted from the approving audits

- The glitch-hunter maximises **directional drift in *any* conserved quantity** —
  energy, linear momentum, angular momentum — not energy alone. *"An agent
  optimizing for energy might miss an exploit that pumps angular momentum."*
- A **fourth Lyapunov remedy, cheaper than all three of mine**: increase the
  softening constant ε. It smooths the potential well and lowers sensitivity to
  small positional changes, and it is computationally free because the term is
  already computed. Remedy order becomes: **ε, horizon, body count, damping
  last** — damping last because it is in direct conflict with the requirement
  that the system have momentum of its own.
- **N6 gates on the median persona**, not the mean or the best: *"Gating on the
  mean allows a small group of high-performing personas to mask a game that is
  unplayable for the majority."*
