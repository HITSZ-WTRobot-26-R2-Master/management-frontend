import type { BlockStatesColor, MatchType } from "@/types/management"

export const RETRY_TAKE_SPEAR_INDEX_OPTIONS = [1, 2, 3, 4, 5, 6]

const RED_MARTIAL_MERLIN_SPEAR_INDICES = [1, 2, 3]
const BLUE_MARTIAL_MERLIN_SPEAR_INDICES = [4, 5, 6]

export type RetrySpearIndexContext = {
  color: BlockStatesColor | null
  matchType: MatchType | null
}

export function getAllowedRetrySpearIndices({
  color,
  matchType,
}: RetrySpearIndexContext): number[] {
  if (matchType !== "martial_merlin") {
    return RETRY_TAKE_SPEAR_INDEX_OPTIONS
  }

  if (color === "red") {
    return RED_MARTIAL_MERLIN_SPEAR_INDICES
  }

  if (color === "blue") {
    return BLUE_MARTIAL_MERLIN_SPEAR_INDICES
  }

  return RETRY_TAKE_SPEAR_INDEX_OPTIONS
}

export function isRetrySpearIndexAllowed(
  spearIndex: number,
  context: RetrySpearIndexContext,
) {
  return getAllowedRetrySpearIndices(context).includes(spearIndex)
}

export function resolveRetrySpearIndex(
  spearIndex: number,
  context: RetrySpearIndexContext,
) {
  const allowedIndices = getAllowedRetrySpearIndices(context)
  return allowedIndices.includes(spearIndex)
    ? spearIndex
    : allowedIndices[0] ?? 1
}
