import type { BlockStateValue } from "@/types/management";
import { STATE_VALUES, VALUE_TO_STATE } from "./constants";
import type { BlockState, MatchType, SystemMode } from "./types";

export type ParsedBlockStateMessage =
  | {
      type: "block_states_snapshot";
      blocks: BlockState[];
      revision: number;
      color: SystemMode["color"];
      matchType: MatchType;
    }
  | {
      type: "block_states_error";
      code: string;
      message: string;
    };

export function blockStateToValue(state: BlockState): BlockStateValue {
  return STATE_VALUES[state] as BlockStateValue;
}

export function parseBlockStateMessage(data: unknown): ParsedBlockStateMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "block_states_snapshot") {
      const snapshot = parsed.snapshot;
      if (
        !isRecord(snapshot) ||
        !isBlockStateValueArray(snapshot.states) ||
        typeof snapshot.revision !== "number" ||
        !Number.isInteger(snapshot.revision)
      ) {
        return null;
      }

      return {
        type: "block_states_snapshot",
        blocks: snapshot.states.map(blockStateValueToState),
        revision: snapshot.revision,
        color: isValidColor(snapshot.color) ? snapshot.color : "blue",
        matchType: isValidMatchType(snapshot.match_type) ? snapshot.match_type : "arena",
      };
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
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function serializeBlockStatesUpdate(
  blocks: BlockState[],
  color: SystemMode["color"],
  matchType: MatchType,
): string {
  return JSON.stringify({
    states: blocks.map(blockStateToValue),
    color,
    match_type: matchType,
  });
}

function isValidColor(value: unknown): value is SystemMode["color"] {
  return value === "blue" || value === "red";
}

function isValidMatchType(value: unknown): value is MatchType {
  return (
    value === "skill_zone1" ||
    value === "skill_zone3_mid" ||
    value === "skill_zone3_top" ||
    value === "arena"
  );
}

function blockStateValueToState(value: BlockStateValue): BlockState {
  return VALUE_TO_STATE[value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlockStateValueArray(value: unknown): value is BlockStateValue[] {
  return (
    Array.isArray(value) &&
    value.length === 12 &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 4)
  );
}
