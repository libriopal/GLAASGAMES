// foundry/harvest/margin.ts — W4 (07_CLAUDE_CODE_HANDOFF_V6.md §4.3)
// Query-by-Committee. MARGIN (top-2 EV gap) outperformed other disagreement
// measures on 3 of 4 strategies (10.1007/11871842_68). Human friction is the
// SECONDARY confirmation signal.

import type { SessionRecord, TurnRecord } from '../types.ts';
import type { ContestedState } from '../../families/genome/types.ts';
import type { TelemetrySignals } from '../telemetry/types.ts';
import { DEFAULT_MARGIN_THRESHOLD } from '../telemetry/capture.ts';

export interface BotAgent {
  id: string;
  /** Returns one expected-value estimate per candidate move, same order as turn.candidateMoves. */
  evaluate(turn: TurnRecord, session: SessionRecord): number[];
}

function topTwoGap(evs: number[]): number | null {
  if (evs.length < 2) return null;
  const sorted = [...evs].sort((a, b) => b - a);
  const best = sorted[0]!;
  const second = sorted[1]!;
  const spread = Math.max(Math.abs(best), Math.abs(second), 1e-9);
  return Math.abs(best - second) / spread; // normalized gap, comparable across families
}

function committeeMargin(turn: TurnRecord, session: SessionRecord, ensemble: BotAgent[]): number | null {
  const gaps = ensemble
    .map((bot) => topTwoGap(bot.evaluate(turn, session)))
    .filter((g): g is number => g !== null);
  if (gaps.length === 0) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length; // committee-mean margin
}

/**
 * A state is contested when the committee-mean top-two EV gap is small.
 * Friction (a human reconsidered their choice) can pull in a borderline turn
 * that margin alone put just outside the threshold — but friction alone can
 * never admit a turn the committee found decisively one-sided.
 */
export function harvestContestedStates(
  session: SessionRecord,
  ensemble: BotAgent[],
  frictionSignals: TelemetrySignals[],
  marginThreshold: number = DEFAULT_MARGIN_THRESHOLD,
): ContestedState[] {
  if (ensemble.length === 0) throw new Error('harvestContestedStates requires a non-empty bot ensemble');

  const frictionByTurn = new Map(session.turns.map((t, i) => [t.turnIndex, frictionSignals[i]]));
  const borderlineMultiplier = 1.5;

  const results: ContestedState[] = [];
  for (const turn of session.turns) {
    const margin = committeeMargin(turn, session, ensemble);
    if (margin === null) continue;

    const withinPrimary = margin <= marginThreshold;
    const friction = frictionByTurn.get(turn.turnIndex);
    const withinBorderlineWithFriction =
      !withinPrimary && margin <= marginThreshold * borderlineMultiplier && (friction?.selectionFrictionCount ?? 0) > 0;

    if (withinPrimary || withinBorderlineWithFriction) {
      results.push({
        sessionId: session.sessionId,
        turnIndex: turn.turnIndex,
        boardStateHash: turn.boardStateHashBefore,
        topTwoEvGap: margin,
        candidateMoves: [...turn.candidateMoves],
      });
    }
  }
  return results;
}
