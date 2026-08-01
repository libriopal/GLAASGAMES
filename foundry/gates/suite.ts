// foundry/gates/suite.ts — W7 (07_CLAUDE_CODE_HANDOFF_V6.md §4.5, §4.6, §6.4)

import type { SessionRecord } from '../types.ts';
import type { Genome } from '../../families/genome/types.ts';
import type { GeneratedExpression } from '../../families/expression/pipeline.ts';
import { scanForProhibitedIconography, verifyBandHonesty } from '../../families/expression/pipeline.ts';
import type { BandRender } from '../../families/expression/pipeline.ts';
import type { FitnessResult, GateProvenance } from '../fitness/types.ts';

// --- §4.5 gates -------------------------------------------------------------

/** GATE: fraction of turns losing accumulated-but-unsecured value (Farkle: bust; KoT: damage while holding centre). */
export function setbackFrequency(session: SessionRecord): number {
  const atRisk = session.turns.filter((t) => t.valueAtRiskBefore > 0);
  if (atRisk.length === 0) return 0;
  const setbacks = atRisk.filter((t) => t.valueLostThisTurn > 0);
  return setbacks.length / atRisk.length;
}

/** DIAGNOSTIC: expected value lost per turn ÷ value at risk. Continuous, comparable across families. */
export function setbackPressure(session: SessionRecord): number {
  const atRisk = session.turns.filter((t) => t.valueAtRiskBefore > 0);
  if (atRisk.length === 0) return 0;
  const pressures = atRisk.map((t) => t.valueLostThisTurn / t.valueAtRiskBefore);
  return pressures.reduce((a, b) => a + b, 0) / pressures.length;
}

// --- §4.6 provenance ---------------------------------------------------------

/** Any gate result without valid provenance is VOID — not reported, not stored, not used in selection. */
export function isValidProvenance(p: GateProvenance): boolean {
  return (
    typeof p.modelIdentity === 'string' &&
    p.modelIdentity.length > 0 &&
    typeof p.commitSha === 'string' &&
    p.commitSha.length > 0 &&
    p.isStandIn === false &&
    typeof p.timestamp === 'string' &&
    !Number.isNaN(Date.parse(p.timestamp))
  );
}

// --- §6.4 Experience Conformance Criterion (DEF-02 fix) --------------------

export interface RoleVisibility {
  role: string;
  uvVisible: boolean;
  irVisible: boolean;
}

export interface ExperienceConformanceInput {
  genome: Genome;
  branchGovernsMatchmaking: boolean; // (a)
  roleVisibilities: RoleVisibility[]; // (b) — must differ across roles
  bandRenders: BandRender[]; // (c)
}

export interface ExperienceConformanceResult {
  passed: boolean;
  a_branchGovernsMatchmaking: boolean;
  b_roleGatesInformation: boolean;
  c_bandCarriesTrueContent: boolean;
  d_definingInteractionPresent: boolean;
  reason: string;
}

/** An experiment is not "playable" until it demonstrates all of (a)-(d), regardless of gate scores. */
export function checkExperienceConformance(input: ExperienceConformanceInput): ExperienceConformanceResult {
  const a = input.branchGovernsMatchmaking;

  const visibilitySignatures = new Set(
    input.roleVisibilities.map((r) => `${r.uvVisible}:${r.irVisible}`),
  );
  const b = input.roleVisibilities.length > 1 && visibilitySignatures.size > 1;

  const c = verifyBandHonesty(input.bandRenders).passed;

  // (d) for a contested-centre / asymmetric-targeting family: an opponent and a contested
  // centre must be present — self-only targeting or an isolated dice→action lookup fails this.
  const d =
    input.genome.structural.topology === 'contested-centre' &&
    input.genome.structural.targeting !== 'self-only' &&
    input.genome.structural.dilemmaShape === 'stay-or-yield';

  const passed = a && b && c && d;
  return {
    passed,
    a_branchGovernsMatchmaking: a,
    b_roleGatesInformation: b,
    c_bandCarriesTrueContent: c,
    d_definingInteractionPresent: d,
    reason: passed
      ? 'all of (a)-(d) demonstrated'
      : `failed: ${[!a && 'a', !b && 'b', !c && 'c', !d && 'd'].filter(Boolean).join(', ')}`,
  };
}

// --- gate suite aggregation --------------------------------------------------

export interface GateCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface GateSuiteInput {
  genome: Genome;
  session: SessionRecord;
  expression: GeneratedExpression;
  provenance: GateProvenance;
  fitness: FitnessResult;
  conformance: ExperienceConformanceInput;
}

export interface GateSuiteResult {
  passed: boolean;
  checks: GateCheck[];
}

export function runGateSuite(input: GateSuiteInput): GateSuiteResult {
  const checks: GateCheck[] = [];

  checks.push({
    name: 'gate-provenance',
    passed: isValidProvenance(input.provenance),
    detail: `model=${input.provenance.modelIdentity} commit=${input.provenance.commitSha} isStandIn=${input.provenance.isStandIn}`,
  });

  const freq = setbackFrequency(input.session);
  checks.push({
    name: 'setback-frequency-in-range',
    passed: freq > 0 && freq < 1,
    detail: `setbackFrequency=${freq.toFixed(3)} (0 = never risk realized, 1 = always — neither is a real dilemma)`,
  });

  const prohibition = scanForProhibitedIconography(
    `${input.expression.narrativeFrame} ${input.expression.motifKeywords.join(' ')} ${input.expression.characterArchetype}`,
  );
  checks.push({
    name: 'expression-prohibition',
    passed: prohibition.clean,
    detail: prohibition.clean ? 'no prohibited iconography' : JSON.stringify(prohibition.hits),
  });

  const conformance = checkExperienceConformance(input.conformance);
  checks.push({ name: 'experience-conformance', passed: conformance.passed, detail: conformance.reason });

  checks.push({
    name: 'fitness-nonzero',
    passed: input.fitness.fitness > 0,
    detail: `fitness=${input.fitness.fitness.toFixed(4)}`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}
