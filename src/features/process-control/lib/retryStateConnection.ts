export const RETRY_STATE_RECONNECT_DELAY_MS = 1000;

export function getRetryStateReconnectDelayMs({
  hasOpened,
  usedInitialFastRetry,
}: {
  hasOpened: boolean;
  usedInitialFastRetry: boolean;
}) {
  return !hasOpened && !usedInitialFastRetry
    ? 0
    : RETRY_STATE_RECONNECT_DELAY_MS;
}
