// game/economy/types.ts — §6 (07_CLAUDE_CODE_HANDOFF_V6.md)

export interface Account {
  id: string;
  ageVerified21Plus: boolean;
  selfExcluded: boolean;
  selfExclusionStartedAt?: string;
  selfExclusionTermDays?: number | 'indefinite';
  selfExclusionCoolingOffUntil?: string;
}

export interface PurchaseCatalogItem {
  sku: string;
  grants: 'pdx' | 'inGameItem' | 'roleUnlock' | 'voidcrystalStake';
}

export interface StakeRelease {
  stakeId: string;
  principal: number;
  payout: number; // must equal principal — no bonus (Tier 1, R6Q2)
}

export interface SessionUXConfig {
  hasDarkPatterns: boolean;
  hasLossFraming: boolean;
  hasArtificialScarcityTimer: boolean;
  hasStreakPunishment: boolean;
  sessionEndIsGraceful: boolean;
}

export interface AccountMessage {
  accountId: string;
  messageType: string;
  content: string;
  promptsReversal: boolean; // set by the message-composition layer
}
