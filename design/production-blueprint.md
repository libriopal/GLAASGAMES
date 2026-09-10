# GLAASGAMES — the road to a production application

Status: **APPROVED by independent audit at round 2.** Residual risk named by the auditor was then closed rather than accepted — see AUDIT ROUND 2. Every number below was read out of the tree at
`main@b55d68c` on 2026-09-10. Nothing is summarised from memory.

---

## Step 1 — the cue, and what was measured

**Cue:** *What is the single highest-value next step toward a complete
production application?*

| Measured | Value |
|---|---|
| tracked files | 310 (137 TypeScript) |
| verify oracles | **53** — 30 in `engine/verify`, 23 elsewhere |
| `engine/verify` | **10,436 lines** |
| `lattice` + `web` (the game) | 1,898 + 4,123 = **6,021 lines** |
| `game`+`foundry`+`families`+`core`+`game-autobuild-kit`+`00_GOVERNANCE` | **7,173 lines** |
| npm scripts | 69 |
| imports from the governance stack into anything that ships | **0** |
| imports from the shipped game into the governance stack | **0** |
| trees present in the APK | `lattice`, `web`, `engine/*`, `design` — and nothing else |
| economy / age-gate / purchase code in the shipped app | **0 occurrences** (the only `age` is a GLSL particle attribute) |
| `docs/PRIVACY.md` | **absent** |
| CI | `gpu-parity.yml` — typecheck + `verify:engine`, on real silicon |
| `versionCode` | 1 |

**The verification apparatus is 1.7× the size of the game it verifies.** That is
not automatically wrong — this project's whole thesis is that proof is the
product — but it is the first thing a reader should be told, because it sets the
scale of everything below.

---

## Step 2 — the distribution

| p | Candidate |
|---|---|
| 0.22 | Finish the breeding foundry, Stages 3–6 (the plan already in flight) |
| 0.16 | Finish the EINCOL handoff — R4 mutation reach, R6 checklist |
| 0.13 | Ship the lattice game: it is already a signed APK that passes `verify-apk` |
| 0.11 | Build the economy UI, so the governance layer has a subject |
| 0.10 | Production hardening: crash capture, update path, privacy policy, store assets |
| 0.09 | Fuse the halves — make the lattice game the game the foundry breeds |
| **0.08** | **Tail: the repository is TWO DISJOINT PRODUCTS and nobody has said which one is "the production application". Every row above is incoherent until that is answered.** |
| **0.07** | **Tail: 23 oracles, a governance register and a whole EINCOL handoff verify a system with no runtime, no UI and no user. In this project's own vocabulary that is pinned-in-time-with-no-witness, at the largest scale in the repo.** |
| 0.04 | Real-money settlement (blocked on E29 legal counsel regardless) |

---

## Step 3 — working the tail

Row 1 is the mode answer: it is what I was doing when asked, and continuing it
answers no question that was not already open.

**Tail p=0.08.** `git ls-files` and two grep sweeps establish it and there is no
interpretation left over: **zero** imports cross between the shipped game
(`lattice`, `web`, `engine`, `android`) and the governance/foundry stack
(`game`, `foundry`, `families`, `core`, `game-autobuild-kit`, `00_GOVERNANCE`),
in either direction. The APK contains the first set and none of the second.

**Tail p=0.07 corroborates it from the other end.** `verify-suite`'s 18 §9
checks — age gating, self-exclusion, anti-manipulation, ledger, EDI boundary,
stand-in provenance — all run against fixtures constructed in the test file, for
code that no user can reach. R3 in the EINCOL handoff found "no render path for
the economy" and treated it as a local defect. It is not local. It is what the
whole of System B looks like from inside.

---

## Step 4 — falsifying my own claim, in writing

**Claim v1:** *The repo is two disjoint products, and System B's verification is
vacuous because System B does not ship.*

**Attacked, and it broke.** `game-autobuild-kit` is, by its name and its
contents, a BUILD-TIME toolchain: the EDI gate moves artifacts "from the Research
Domain into the Execution Domain", which is a compile-time boundary. A build tool
has no UI and needs none. "Does not ship" is therefore not a defect for most of
System B, and v1 was about to condemn a design decision as a bug.

**Claim v2, corrected, and the one I stand behind:**

> **The build-time half is fine as a build-time half. But the COMPLIANCE AND
> ECONOMY layer inside it — age verification, self-exclusion, wallet visibility,
> stake settlement, the double-entry ledger — describes RUNTIME, PLAYER-FACING
> behaviour, and it has been written into the half that can never face a player.
> The game that ships has no economy; the economy that is verified has no game.**

And that has one consequence that is not a matter of taste:

### The finding: a regulatory declaration whose witness is not in the product

`engine/verify/verify-listing.ts` P4:

```ts
const economy = read('game/economy/rules.ts');
const enforced = /lootBox|loot_box|scarcity|streak|selfExclu/i.test(economy);
ok(enforced, 'P4: docs claim the no-gambling rating is machine-enforced, but ...');
console.log('  P4 rating: the no-gambling answer is backed by rules in game/economy/rules.ts');
```

`docs/PLAY-SUBMISSION.md` tells the submitter to answer the IARC questionnaire
"no gambling, no purchases, no ads", and P4 exists to stop that from being a
remembered claim. It greps a file for five words and passes.

**`game/economy/rules.ts` is not in the APK.** It is not imported by anything in
the APK. The no-gambling answer given to Google Play is "machine-enforced" by a
file the shipped machine never loads. P4 is simultaneously the **vocabulary
proxy** (it matches words, not behaviour) and the **missing witness** (it reads a
file that is not the artifact) — the two failure modes this repository is best in
the world at catching — and it is sitting on the one claim with a regulator on
the other end of it.

This is not an argument for more verification. The repo has 53 oracles. It is an
argument that the highest-value next step is to point a few of them at the thing
that actually ships.

---

## Step 5 — the evaluator

Rung 1 for every measurement above: `git ls-files`, `grep`, `find` over the real
tree, commands recorded inline. Rung 3 (a critic I do not control) for the plan
itself and for each step — the loop this document is the input to.

---

# The plan

Ordered by value, not by comfort. Each step states its gate and the perturbation
that must be **seen to fail** before it is called done — this repo's own rule.

### P0 — NAME THE PRODUCT  *(Tier-1 election — not mine to decide)*

Two coherent products are in this repo and they do not touch. Until one is named
as *the* application, "production ready" has no truth value.

- **(a) GLAAS Lattice** — the shipped game. Playable, signed, 27 oracles, no
  economy, lowest IARC bracket. Closest to done.
- **(b) GLAASGAMES Foundry** — the breeding foundry that generates games. Has a
  governance stack, an EDI boundary and a compliance layer; has no runtime.
- **(c) Both, fused** — the foundry breeds variants of the lattice game and
  ships them. The most valuable and by far the most expensive.

#### AUDIT — and the audit reversed this step

Put to the independent auditor as an adversarial question — *is declining to
resolve this a discipline or an evasion?* — the answer was **discipline**, with
one named condition:

> *"It becomes an evasion if the agent possesses sufficient telemetry or metadata
> to resolve the ambiguity with high confidence, yet chooses to defer the
> decision to minimize its own logical complexity or risk."*

**Applied honestly to myself, that condition is met, so this step was wrong as
drafted.** The product owner has already stated the answer, in this project's own
instruction record: *"the goal is to build GLAASGAMES as the superseding
application to Glassbox_labs"*, with the breeding foundry as the thing being
built and the lattice game as its subject. That is answer **(c), fused** — and it
is not a decision I need to ask for, it is one I was told and then re-opened
because branching was cheaper than committing.

**P0 is therefore RESOLVED, not deferred: (c) fused.** GLAASGAMES is the
application; the foundry breeds variants; the lattice game is the first genome it
expresses and the proof the pipeline produces something playable.

**What remains genuinely open is narrower, and it is a real election:**

> **P0′ — release sequencing.** Does GLAAS Lattice ship to the Play Store as a
> standalone v1 while the foundry matures behind it, or does nothing ship until
> the foundry can produce a release on its own?

This one I will not decide, and the auditor's condition does not apply to it: it
turns on appetite for a public v1, store-review latency and whether early player
telemetry is wanted before the foundry has a fitness signal — none of which is in
the tree. Both answers keep P1–P3 correct.

**Gate:** P0′ answered in `BLUEPRINT.md`, signed and dated. P0 itself needs no
gate; it is recorded above.

---

### P1 — Make the compliance claim true of the artifact  *(no election needed)*

The IARC no-gambling declaration must be witnessed by **the APK**, not by an
unshipped source file.

- Rewrite `verify-listing` P4 to assert over the **built asset tree**: no
  economy, purchase, wallet, stake or ads code is present in `dist/`. Today that
  is trivially true, which is exactly why it is worth pinning — it converts an
  unbacked claim into a measured one, and it becomes load-bearing the moment
  anyone adds an economy.
- Keep the source-side grep as a *second* check with an honest name; do not
  delete it, and do not let it keep the sentence it cannot support.

**Gate:** P4 fails when a file matching the economy vocabulary is planted in the
staged asset tree.
**Negative control:** plant `dist/economy-stub.js` containing `selfExclusion`;
P4 must exit non-zero. Remove it; exit 0.
**Why first:** it is the only item on this list with a regulator on the other
end, and it is roughly an afternoon.

#### AUDIT ROUND 1 — the objection, and what it changed

An independent auditor's strongest objection to this plan was aimed here:

> *"P1 is a category error: it attempts to validate a relationship that does not
> exist at runtime… Fixing the grep check merely creates a 'successful'
> verification of a disconnected system, providing a false sense of compliance
> while the runtime game remains unmanaged. This objection bites if the plan does
> not include a task to architecturally integrate the economy/compliance logic
> into the runtime APK."*

**Half of that lands and the conclusion is inverted, and the difference is the
whole point of P1.**

What lands: as first written, P1 did not say what happens when the two regimes
change over, and could be read as declaring compliance permanently solved by a
grep. That was a real ambiguity and it is fixed below.

What is inverted: the auditor assumes the compliance logic *belongs* in the
runtime and that the plan's job is to put it there. But **a game with no economy
does not need an age gate — it needs proof that it has no economy.** The IARC
answer is "no gambling, no purchases, no ads". Integrating a wallet and a
self-exclusion register into an app that today has neither, so that they can then
be gated, would *manufacture* the regulated surface and then guard it. That is
not compliance work; it is the risk.

**So P1 is not an answer, it is a TRIPWIRE, and it is stated as two regimes:**

- **Regime 1 (today).** The APK contains no economy. The compliance claim is a
  claim of ABSENCE, and absence is the strongest thing a check of this kind can
  witness: it is checkable against the exact bytes that ship, with no
  interpretation. P1 pins it.
- **Regime 2 (the moment an economy ships).** P1's absence assertion **fails by
  construction** — it cannot be quietly satisfied by a system that has grown an
  economy. That red gate is the trigger that requires the runtime gate, the
  render-path recorder from R3, and a re-answered IARC questionnaire, at exactly
  the moment those become necessary and not one release before.

The auditor's scenario — "runtime game remains unmanaged" — is therefore the one
state P1 makes impossible to reach silently. An economy cannot arrive in the APK
without turning a check red.

**What P1 must NOT be allowed to become:** a check that passes because it looks
in the wrong place. That is the defect it exists to repair, and the negative
control above is what stops it recurring: the planted stub must be found *in the
staged asset tree*, which is the artifact, not in a source file that may or may
not be part of it.

#### AUDIT ROUND 2 — APPROVED, and the residual risk closed by measurement

> *"APPROVED. The tripwire mechanism resolves the objection by linking the
> detection of regulated features to the mandatory deployment of runtime
> controls. The strongest residual risk is **dynamic code or asset loading**. The
> check bites if the economy logic is fetched from a remote server or loaded via
> an obfuscated script engine at runtime; such logic would not exist in the
> 'built asset tree' during the static scan, allowing the absence assertion to
> pass falsely while a regulated economy operates at runtime."*

The objection is exactly right about static scans in general, and it is the kind
of hole worth accepting and writing down. **In this application it is already
closed, and by something stronger than a check.**

`android/app/src/main/AndroidManifest.xml` declares exactly one permission:

```
<uses-permission android:name="android.permission.VIBRATE" />
```

**There is no `INTERNET` permission.** An Android app without it cannot open a
socket — this is enforced by the platform, not by our code, our conventions, or
our review process. Remote fetching of economy logic is not "unlikely"; it is
unavailable. The `fetch()` calls that do exist in `web/` resolve to local asset
paths (`./engine/config/sim.json`) inside the WebView and never leave the device.

Two existing oracles already hold the line from the other side:
`verify-playlog` **L5** requires zero transmission attempts of any kind and is
seen to fail against a planted `fetch`; **L7** — itself an auditor finding —
closes the native-bridge channel L5 cannot observe. The manifest is held to an
allowlist so a new permission cannot appear quietly.

So the residual risk is recorded as **CLOSED, by OS permission plus two oracles**,
rather than accepted. The honest caveat that remains is narrow: this argument is
specific to the Android artifact. A future web or desktop build has no
permission model to lean on, and P1's static scan would there be exactly as weak
as the auditor says. **If a non-Android target is ever added, this risk reopens
and needs a different instrument.** That is written here so it is inherited
rather than rediscovered.

---

### P2 — Finish the EINCOL handoff: R4 and R6

- **R4 — mutation reach.** `engine/verify/mutate.ts` reaches exactly one tree
  (`lattice/ruleset`). The four money/legal trees have never had an oracle seen
  to fail. Generalise `targets`, add the Tier-1 curated mutants, keep Tier 2
  reported-only.
- **R6 — blocked.** Its subject `handoff_p2/08_VERIFY_CHECKLIST.md` does not
  exist at the cited commit (DISAGREEMENT-0 in `FINDINGS.md`). Locate the real
  checklist or declare it absent; do not synthesise one to have something to
  edit.
- `core/store` is a declared target with no curated mutant, so
  `assertEveryTargetHasCuratedMutant` will fail. **That failure is correct.**
  Write `M-STORE-1` or record it open; deleting the target to go green is the
  F001 self-approval loop.

**Gate:** every Tier-1 mutant seen caught, each by its named oracle.
**Negative control:** `M-NULL-1`, a comment-only mutation, must SURVIVE and fail
the build as an uncaught Tier-1 mutant.

---

### P3 — Production hardening of whatever ships  *(correct under all of P0)*

Measured gaps in the shipped app:

| Gap | Evidence |
|---|---|
| no privacy policy | `docs/PRIVACY.md` absent; Play requires a URL |
| no crash capture | 5 `try`/`onerror` sites in `lattice-app.ts`; a `fatal()` panel in `app.ts`; nothing records a crash that already happened |
| `versionCode = 1` | no release/rollback story |
| CI runs `verify:engine` only | the other 23 oracles and `verify:apk` are not in CI |

**Gate:** CI runs the full gate including `verify:apk` on both variants.
**Negative control:** break one oracle; CI must go red. (This is NEG-CONTROL-0's
argument applied to the pipeline rather than the suite.)

---

### P4 — The fork, now narrowed by P0 = (c) fused; sequencing waits on P0′.

- **If (a) Lattice:** closed testing → IARC → store assets → release. Most of
  `docs/CLOSED-TESTING.md` is already written.
- **If (b) Foundry:** the foundry needs a runtime before its compliance layer
  means anything. Stages 3–6 of `design/foundry-plan.md`, then a foundry screen,
  then the economy attaches to *that*.
- **If (c) Fused:** P4b first, then the structural-loci work whose gate — "every
  candidate must move the rules hash" — is **currently unsatisfiable** and needs
  the fix in P5.

---

### P5 — The commitment does not bind the round parameters  *(measured, unreported until now)*

`commit()` publishes `rulesHash`, which `computeRules()` derives from the
semantic text of seven source files. `RoundConfig` (`turns`, `refill`) is a
runtime argument that touches none of them. Proven:

```
game A  turns=12 refill=4  score: 60
game B  turns=6  refill=1  score: 30
same rulesHash published for both: 2f2c472898d7aad4
```

Two demonstrably different games, one identical commitment. Latent today
(only `DEFAULT_ROUND` is ever passed) and load-bearing the moment anything varies
config — a daily challenge, or the foundry. `ruleset.ts` argues at length that
committing a seed without committing the rules proves nothing; this is the same
gap one level down.

**Fix:** bind the config into the published hash, symmetric with Stage 0's
`poolDigest`, which binds input *and* output.
**Gate:** two configs, same code → different published hash; and save-resume
refuses a save made under different parameters.
**Negative control:** revert the binding; the two-config test must go green
again, which is the failure.

---

### P6 — Retire or relocate the unwitnessed compliance layer  *(needs P0)*

If P0 says the economy is not shipping in this release, then `verify-suite`'s
age-gate, self-exclusion, ledger and settlement checks should say so — marked
as governing an unshipped subsystem, so a reader cannot mistake 18 green checks
for 18 protected users. If P0 says it *is* shipping, R3's recorder finally gets
its render path and the gap closes properly.

**Gate:** no §9 check claims to protect a user of a system with no users.

---

## What is open, and stays open

- **P0** — a human election. Unresolved by design.
- **E29 / E-P2.1 / E-P2.2** — Tier-1 elections from the prior handoff, untouched.
- **R6** — blocked on a missing file, not on effort.
- **`core/store` Tier-1 mutant** — open; the red gate is correct.
- **Rung 3 on this document** — the point of the next step.
