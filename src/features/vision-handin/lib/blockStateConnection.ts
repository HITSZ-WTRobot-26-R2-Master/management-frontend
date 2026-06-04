export const BLOCK_STATE_RECONNECT_DELAY_MS = 1000;

export function getBlockStateReconnectDelayMs({
  hasOpened,
  usedInitialFastRetry,
}: {
  hasOpened: boolean;
  usedInitialFastRetry: boolean;
}) {
  return !hasOpened && !usedInitialFastRetry ? 0 : BLOCK_STATE_RECONNECT_DELAY_MS;
}
