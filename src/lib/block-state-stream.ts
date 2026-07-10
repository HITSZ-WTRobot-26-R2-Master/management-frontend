import type {
  BlockState,
  BlockStatesColor,
  BlockStateValue,
  MatchType,
} from "@/types/management"

const STATE_VALUES = {
  unknown: 0,
  null: 1,
  r1: 2,
  r2: 3,
  fake: 4,
} satisfies Record<BlockState, BlockStateValue>

const VALUE_TO_STATE = {
  0: "unknown",
  1: "null",
  2: "r1",
  3: "r2",
  4: "fake",
} satisfies Record<BlockStateValue, BlockState>

export type ParsedBlockStateMessage =
  | {
      type: "block_states_snapshot"
      blocks: BlockState[]
      revision: number
      color: BlockStatesColor
      matchType: MatchType
    }
  | {
      type: "block_states_error"
      code: string
      message: string
    }

export function blockStateToValue(state: BlockState): BlockStateValue {
  return STATE_VALUES[state]
}

export function parseBlockStateMessage(
  data: unknown,
): ParsedBlockStateMessage | null {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(data)
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null
    }

    if (parsed.type === "block_states_snapshot") {
      const snapshot = parsed.snapshot
      if (
        !isRecord(snapshot) ||
        !isBlockStateValueArray(snapshot.states) ||
        typeof snapshot.revision !== "number" ||
        !Number.isInteger(snapshot.revision)
      ) {
        return null
      }

      return {
        type: "block_states_snapshot",
        blocks: snapshot.states.map(blockStateValueToState),
        revision: snapshot.revision,
        color: isValidColor(snapshot.color) ? snapshot.color : "blue",
        matchType: isValidMatchType(snapshot.match_type)
          ? snapshot.match_type
          : "competition_full",
      }
    }

    if (
      parsed.type === "block_states_error" &&
      typeof parsed.code === "string" &&
      typeof parsed.message === "string"
    ) {
      return {
        type: "block_states_error",
        code: parsed.code,
        message: parsed.message,
      }
    }

    return null
  } catch {
    return null
  }
}

export function serializeBlockStatesUpdate(
  blocks: BlockState[],
  color: BlockStatesColor,
  matchType: MatchType,
): string {
  return JSON.stringify({
    states: blocks.map(blockStateToValue),
    color,
    match_type: matchType,
  })
}

function isValidColor(value: unknown): value is BlockStatesColor {
  return value === "blue" || value === "red"
}

function isValidMatchType(value: unknown): value is MatchType {
  return (
    value === "martial_merlin" ||
    value === "combat_only_middle" ||
    value === "combat_only_top" ||
    value === "competition_full"
  )
}

function blockStateValueToState(value: BlockStateValue): BlockState {
  return VALUE_TO_STATE[value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isBlockStateValue(value: unknown): value is BlockStateValue {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4
  )
}

function isBlockStateValueArray(value: unknown): value is BlockStateValue[] {
  return (
    Array.isArray(value) &&
    value.length === 12 &&
    value.every(isBlockStateValue)
  )
}
