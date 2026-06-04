import type { BlockStateValue } from "@/types/management";
import { STATE_VALUES, VALUE_TO_STATE } from "./constants";
import type { BlockState } from "./types";

export type ParsedBlockStateMessage =
  | {
      type: "block_states_snapshot";
      blocks: BlockState[];
      revision: number;
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
