// families/genome/types.ts — W1 (07_CLAUDE_CODE_HANDOFF_V6.md §2.1)

/** Structural loci — these carry the phenotype. Offspring MUST differ on ≥1. */
export interface StructuralLoci {
  topology:
    | 'open-grid'
    | 'contested-centre'
    | 'lanes'
    | 'shared-single-board'
    | 'parallel-mirrored';

  interactionVerb:
    | 'drag-chain'
    | 'keep-reroll'
    | 'swap-adjacent'
    | 'place-tile'
    | 'draft-and-buy'
    | 'sort-to-dock';

  targeting:
    | 'self-only'
    | 'all-opponents'
    | 'single-opponent'
    | 'occupant-only'
    | 'asymmetric-by-position';

  winCondition:
    | 'score-race'
    | 'attrition'
    | 'survival'
    | 'objective-clear'
    | 'plural'; // two orthogonal paths — the KoT property

  dilemmaShape:
    | 'push-or-bank'
    | 'stay-or-yield'
    | 'commit-or-reroll'
    | 'invest-or-cash'
    | 'strike-or-hold';

  inSessionMutation: 'none' | 'power-cards' | 'escalating-blind' | 'relic-acquisition';
}

/** Economy loci */
export interface EconomyLoci {
  hasDraftEconomy: boolean; // Balatro-class meta-layer, breedable
  hasStaking: boolean; // 21+ only; invisible to under-21 and self-excluded
}

export type Branch = 'A' | 'B' | 'C' | 'D' | 'E';

export type SpectrumBand = 'matter' | 'ir' | 'uv' | 'cyan' | 'voidshard';

export interface SoundscapeGenes {
  tonalCentre: number; // Hz
  bandVoicing: Record<SpectrumBand, string>;
  emotionalContour: 'rising' | 'cyclical' | 'resolving' | 'suspended';
}

/** Expression loci — heritable and mutable. NOT a skin. */
export interface ExpressionLoci {
  palette: string[]; // cyan-clue >12-colour spectrum system
  motifKeywords: string[]; // from /data corpus
  characterArchetype: string; // OUR OWN characters
  namingGrammar: string; // rules that generate OUR OWN names
  soundscape: SoundscapeGenes;
  narrativeFrame: string; // what the game is ABOUT — theme coherence
}

/** Scalars — SECONDARY MODIFIERS ONLY. Cannot carry the phenotype alone. */
export interface ScalarModifiers {
  boardWidth: number;
  boardHeight: number;
  chainLengthMin: number;
  hazardDensity: number;
  targetScore: number;
}

export type FamilyName =
  | 'push-or-bank'
  | 'read-the-board'
  | 'commit-or-reroll'
  | 'invest-or-cash'
  | 'strike-or-hold';

export interface Genome {
  id: string;
  lineage: string[]; // parent ids
  structural: StructuralLoci;
  economy: EconomyLoci;
  branch: Branch;
  expression: ExpressionLoci;
  scalars: ScalarModifiers;
  family: FamilyName;
}

/** §2.3 — the five families and the judgment they elicit. Read-only reference table. */
export const FAMILY_TABLE: Record<
  FamilyName,
  { judgment: string; primaryVerb: StructuralLoci['interactionVerb']; lineage: string }
> = {
  'push-or-bank': {
    judgment: "Do I risk what I've accumulated for more?",
    primaryVerb: 'drag-chain',
    lineage: 'Farkle / FAR_NZY — sovereign identity',
  },
  'read-the-board': {
    judgment: 'Where is value hiding, what opens if I move here?',
    primaryVerb: 'swap-adjacent',
    lineage: 'match-3 / cluster grids',
  },
  'commit-or-reroll': {
    judgment: 'Lock this in, or spend a chance improving it?',
    primaryVerb: 'keep-reroll',
    lineage: 'Yahtzee-class, KoT dice phase',
  },
  'invest-or-cash': {
    judgment: 'Buy engine now, or take points now?',
    primaryVerb: 'draft-and-buy',
    lineage: 'Balatro-class engine builders',
  },
  'strike-or-hold': {
    judgment: 'Take the contested space, or wait and survive?',
    primaryVerb: 'place-tile',
    lineage: 'King of Tokyo — identity target',
  },
};

/**
 * A contested state: a decision point where competent play genuinely disagrees
 * (top-two expected-value gap is small across a bot committee — §4.3).
 * Defined here (not in foundry/) so W1's novelty gate has no forward dependency
 * on W4's harvester.
 */
export interface ContestedState {
  sessionId: string;
  turnIndex: number;
  boardStateHash: string;
  topTwoEvGap: number;
  candidateMoves: string[];
}

/** Deterministic identity for a contested state, used to detect novelty (§2.2). */
export function stateSignature(state: ContestedState): string {
  const moves = [...state.candidateMoves].sort().join('|');
  return `${state.boardStateHash}::${moves}`;
}

/** Round-trip check: every locus must survive JSON serialization unchanged (W1 gate). */
export function roundTripsThroughJson(genome: Genome): boolean {
  const copy = JSON.parse(JSON.stringify(genome)) as Genome;
  return JSON.stringify(copy) === JSON.stringify(genome);
}
