// families/provenance/types.ts — W2 (07_CLAUDE_CODE_HANDOFF_V6.md §3.1)
// Mechanics-only inheritance — the IP rule. Every baseline emits one of these.

export interface ProvenanceNote {
  baselineId: string;
  mechanicTaken: string; // e.g. "contested-space occupancy with asymmetric targeting"
  sourceLineage: string; // e.g. "King of Tokyo (Garfield, 2011)"
  expressionNotTaken: string; // e.g. "no monsters, no Tokyo, no art, no names, no trade dress"
  expressionInvented: {
    names: string[];
    characters: string[];
    palette: string[];
    narrativeFrame: string;
  };
  prohibitionCheck: {
    diceIconography: false;
    pokerIconography: false;
    casinoIconography: false;
  };
}

export function makeProvenanceNote(
  input: Omit<ProvenanceNote, 'prohibitionCheck'>,
): ProvenanceNote {
  return {
    ...input,
    prohibitionCheck: { diceIconography: false, pokerIconography: false, casinoIconography: false },
  };
}

/** verify-provenance-notes: fails when a baseline lacks its mechanic/expression provenance note. */
export function verifyProvenanceNoteComplete(note: ProvenanceNote): boolean {
  return (
    note.baselineId.length > 0 &&
    note.mechanicTaken.length > 0 &&
    note.sourceLineage.length > 0 &&
    note.expressionNotTaken.length > 0 &&
    note.expressionInvented.names.length > 0 &&
    note.expressionInvented.characters.length > 0 &&
    note.expressionInvented.palette.length > 0 &&
    note.expressionInvented.narrativeFrame.length > 0 &&
    note.prohibitionCheck.diceIconography === false &&
    note.prohibitionCheck.pokerIconography === false &&
    note.prohibitionCheck.casinoIconography === false
  );
}
