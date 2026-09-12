// foundry/sim/personas.ts — simulated players, grounded in real behaviour.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS EXISTS TO KILL A STUB I WROTE AND LABELLED AS ONE.
//
// The Farkle harness carries an agent called HUMAN-CAL* whose comment says it
// plainly: "the error rate and the risk threshold are NOT fitted to anything...
// this agent is a stub with its blocker named rather than a result". Its 18%
// error rate is a number I invented. It then went on to BEAT every other agent
// on the ladder, which means an invented number was setting the top of the
// scale every balance claim was measured against.
//
// The persona pool ported here replaces that invention with something that came
// from outside: fifteen behavioural profiles derived from 8,000 real
// conversations (HuggingFace WildChat plus a SaaS-sales corpus), each carrying
// OCEAN personality traits and interaction parameters.
//
// It does NOT make the agents validated models of how people play THIS game.
// Nobody has played this game. What it does is replace one number I chose with a
// distribution somebody measured, and make the remaining gap nameable: these are
// real behavioural traits mapped onto game decisions by MY mapping, and the
// mapping is the part still unvalidated. That is a smaller and more honest claim
// than the stub was making.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE POOL WAS DOUBLED AND I DEDUPED IT.
//
// The file shipped 30 entries described as 30 personas. They are 15 personas
// listed exactly twice — loop_bomber, token_stuffer, jailbreak_hunter and the
// rest each appear at index i and again at i+15, byte-identical.
//
// Left alone it would have doubled every weight uniformly, which happens to be
// harmless for a uniform sample and is NOT harmless the moment anything samples
// proportionally or counts distinct personas. It is deduped by name on import,
// and the note is recorded in the JSON so the next reader does not re-derive it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A TRAIT MAPPING RATHER THAN A SKILL SLIDER.
//
// A single "skill" parameter produces a ladder of agents that differ only in how
// often they play the same move, which measures difficulty and cannot measure
// whether a game is interesting to different kinds of player. Traits pull in
// different directions — a cautious expert and a reckless expert are both
// expert — so the population spreads across the decision space rather than along
// one axis of it. That is what makes the spread meaningful rather than a
// restatement of the error rate.

import { createRng, seedFrom, type DeterministicRng } from './prng.js';
import pool from './persona-pool.json' with { type: 'json' };

export interface Persona {
  readonly name: string;
  readonly pattern: string;
  readonly source: string;
  readonly description: string;
  readonly openness: number;
  readonly conscientiousness: number;
  readonly extraversion: number;
  readonly agreeableness: number;
  readonly neuroticism: number;
  readonly technicalSkill: number;
  readonly patienceTurns: number;
  readonly maxTurns: number;
  readonly errorTolerance: number;
  readonly creditSensitivity: number;
  readonly promptComplexity: 'simple' | 'medium' | 'complex';
  readonly domain: 'solo' | 'startup' | 'enterprise' | 'nonprofit' | 'adversarial';
}

interface Pool {
  readonly source: string;
  readonly personas: readonly Persona[];
  readonly total: number;
  readonly dedupe_note: string;
}

const POOL = pool as unknown as Pool;

export function personas(): readonly Persona[] {
  return POOL.personas;
}

export function personaSource(): string {
  return POOL.source;
}

/**
 * How a persona plays ANY of the three games.
 *
 * Game-agnostic on purpose: the same profile drives Farkle's bank decision,
 * chemistry's reaction choice and darkmatter's intervention, so a player who is
 * cautious in one is cautious in all and the three games can be compared on the
 * same population. A per-game persona set would make the comparison meaningless.
 *
 * ── EVERY FIELD NAMES THE TRAIT IT COMES FROM AND WHY ───────────────────────
 */
export interface PlayStyle {
  /**
   * Probability of taking a move other than the one it rated best.
   *
   * From CONSCIENTIOUSNESS, which is the trait that measures care and
   * deliberation. The old stub's flat 18% is now the value a mid-conscientious
   * persona happens to land near, rather than the value every agent is given.
   */
  readonly slipRate: number;
  /**
   * How much of the theoretically-best move the persona can actually find,
   * 0..1. Scales how many candidate moves it evaluates.
   *
   * From TECHNICAL SKILL, which in the source corpus ranges 0.05 to 0.80 — so
   * the population contains genuinely weak players, which a hand-built ladder
   * of "random / greedy / optimal" does not.
   */
  readonly searchDepth: number;
  /**
   * Appetite for a risky continuation, 0 = never pushes, 1 = always pushes.
   *
   * From NEUROTICISM inverted: the trait measures anxiety, so a high score is a
   * player who banks early. This is the field the run multiplier interacts with,
   * and it is why the population produces a spread of stop depths rather than
   * all converging on the mathematically optimal one.
   */
  readonly riskAppetite: number;
  /**
   * Willingness to try an unfamiliar shape over a known-good one.
   *
   * From OPENNESS. Distinct from risk: exploring an odd chain is not the same
   * decision as pushing a good one, and a game that rewards only one of them has
   * a narrower audience than one that rewards both.
   */
  readonly exploration: number;
  /** Sessions before this persona stops. From PATIENCE TURNS. */
  readonly sessionLength: number;
  /** How many bad outcomes before disengaging. From ERROR TOLERANCE. */
  readonly frustrationLimit: number;
}

export function styleOf(p: Persona): PlayStyle {
  return {
    // Conscientiousness 0..1 maps to a slip of 30%..2%. The top of that range
    // is deliberately bad: a player who misreads a third of their moves exists,
    // and a harness whose worst agent is "slightly imperfect" cannot see the
    // difference between a game that teaches and one that merely filters.
    slipRate: 0.30 - 0.28 * p.conscientiousness,
    searchDepth: p.technicalSkill,
    riskAppetite: 1 - p.neuroticism,
    exploration: p.openness,
    sessionLength: p.patienceTurns,
    frustrationLimit: p.errorTolerance,
  };
}

export interface SimPlayer {
  readonly persona: Persona;
  readonly style: PlayStyle;
  readonly rng: DeterministicRng;
}

/**
 * A deterministic player: same run seed and same persona give the same play.
 *
 * The rng is derived from (runSeed, persona name) rather than shared, so adding
 * a persona to the pool does not change how the existing ones play. Without
 * that, every measurement would shift whenever the population changed and no
 * two runs of different pool sizes could be compared.
 */
export function simPlayer(runSeed: number, p: Persona): SimPlayer {
  return {
    persona: p,
    style: styleOf(p),
    rng: createRng(seedFrom(runSeed, `persona:${p.name}`)),
  };
}

/** The whole population, at one run seed. */
export function population(runSeed: number): SimPlayer[] {
  return POOL.personas.map((p) => simPlayer(runSeed, p));
}
