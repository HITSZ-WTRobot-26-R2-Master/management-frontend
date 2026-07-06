import type { DecisionSnapshot } from "@/types/management";

export type ParsedDecisionMessage =
  | {
      type: "decision_snapshot";
      snapshot: DecisionSnapshot;
    }
  | {
      type: "decision_error";
      code: string;
      message: string;
    };

export function parseDecisionMessage(data: unknown): ParsedDecisionMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "decision_snapshot") {
      const snapshot = parsed.snapshot;
      if (!isDecisionSnapshot(snapshot)) {
        return null;
      }

      return {
        type: "decision_snapshot",
        snapshot,
      };
    }

    if (
      parsed.type === "decision_error" &&
      typeof parsed.code === "string" &&
      typeof parsed.message === "string"
    ) {
      return {
        type: "decision_error",
        code: parsed.code,
        message: parsed.message,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isDecisionSnapshot(value: unknown): value is DecisionSnapshot {
  if (
    !isRecord(value) ||
    typeof value.available !== "boolean" ||
    typeof value.topic !== "string" ||
    !(typeof value.received_at === "string" || value.received_at === null) ||
    !isDecisionActionOrder(value.action_order) ||
    !isDecisionScrollPickArray(value.scroll_picks) ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  ) {
    return false;
  }

  return true;
}

function isDecisionActionOrder(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((step) => Number.isInteger(step) && step >= 0 && step <= 12)
  );
}

function isDecisionScrollPickArray(value: unknown): value is DecisionSnapshot["scroll_picks"] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!isRecord(item)) {
        return false;
      }
      const from = item.from;
      const get = item.get;
      return (
        Number.isInteger(from) &&
        typeof from === "number" &&
        from >= 0 &&
        from <= 12 &&
        Number.isInteger(get) &&
        typeof get === "number" &&
        get >= 1 &&
        get <= 12
      );
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
