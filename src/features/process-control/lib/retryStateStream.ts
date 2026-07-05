import type { RetryType, RetryStateParams } from "@/types/management";

const RETRY_TYPE_VALUES: RetryType[] = [
  "retry_take_spear",
  "retry_merlin",
  "retry_combat",
];

export type ParsedRetryStateMessage =
  | {
      type: "retry_state_snapshot";
      active_retry_type: RetryType;
      params: RetryStateParams;
      revision: number;
    }
  | {
      type: "retry_state_error";
      code: string;
      message: string;
    };

export function parseRetryStateMessage(
  data: unknown,
): ParsedRetryStateMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (
      parsed.type === "retry_state_error" &&
      typeof parsed.code === "string" &&
      typeof parsed.message === "string"
    ) {
      return {
        type: "retry_state_error",
        code: parsed.code,
        message: parsed.message,
      };
    }

    if (parsed.type === "retry_state_snapshot") {
      const snapshot = parsed.snapshot;
      if (
        !isRecord(snapshot) ||
        !RETRY_TYPE_VALUES.includes(snapshot.active_retry_type as RetryType) ||
        typeof snapshot.revision !== "number" ||
        !Number.isInteger(snapshot.revision)
      ) {
        return null;
      }

      return {
        type: "retry_state_snapshot",
        active_retry_type: snapshot.active_retry_type as RetryType,
        params: isRecord(snapshot.params)
          ? (snapshot.params as RetryStateParams)
          : {},
        revision: snapshot.revision,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
