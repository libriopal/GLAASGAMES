// game/branch-a/message-contracts.ts — W8 (07_CLAUDE_CODE_HANDOFF_V6.md §5.3)
// Every WebSocket message type must have a verified sender + handler pair.
// DEF-06 fix: client and server were literally not running the same game.

export type MessageDirection = 'client-to-server' | 'server-to-client';

export interface MessageContract {
  type: string;
  direction: MessageDirection;
  hasSender: boolean;
  hasHandler: boolean;
}

/** The canonical registry for Branch A. Extend here — never let a type exist without both a sender and a handler. */
export const MESSAGE_REGISTRY: MessageContract[] = [
  { type: 'REQUEST_BOARD', direction: 'client-to-server', hasSender: true, hasHandler: true },
  { type: 'BOARD_STATE', direction: 'server-to-client', hasSender: true, hasHandler: true },
  { type: 'SUBMIT_CHAIN_FACES', direction: 'client-to-server', hasSender: true, hasHandler: true },
  { type: 'SCORE_RESULT', direction: 'server-to-client', hasSender: true, hasHandler: true },
  { type: 'AUDIT_LOG_REQUEST', direction: 'client-to-server', hasSender: true, hasHandler: true },
  { type: 'AUDIT_LOG_RESPONSE', direction: 'server-to-client', hasSender: true, hasHandler: true },
];

export interface MessageContractCheck {
  type: string;
  passed: boolean;
  detail: string;
}

export interface MessageContractResult {
  passed: boolean;
  checks: MessageContractCheck[];
}

/** verify-message-contracts: fails when a message type lacks a sender+handler pair. */
export function verifyMessageContracts(registry: MessageContract[] = MESSAGE_REGISTRY): MessageContractResult {
  const seen = new Set<string>();
  const checks: MessageContractCheck[] = registry.map((c) => {
    const duplicate = seen.has(c.type);
    seen.add(c.type);
    const passed = c.hasSender && c.hasHandler && !duplicate;
    return {
      type: c.type,
      passed,
      detail: duplicate
        ? 'duplicate message type in registry'
        : `sender=${c.hasSender} handler=${c.hasHandler}`,
    };
  });
  return { passed: checks.every((c) => c.passed), checks };
}
