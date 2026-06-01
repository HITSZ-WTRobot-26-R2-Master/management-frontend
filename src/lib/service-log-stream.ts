import type {
  ServiceLogErrorMessage,
  ServiceLogLineMessage,
  ServiceLogOpenedMessage,
  ServiceLogStreamEndedMessage,
  ServiceLogWebSocketMessage,
} from "@/types/management"

export const DEFAULT_SERVICE_LOG_TAIL = 1000
export const MAX_REQUESTED_SERVICE_LOG_TAIL = 1000

export function normalizeServiceLogTail(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SERVICE_LOG_TAIL
  }

  return Math.min(
    MAX_REQUESTED_SERVICE_LOG_TAIL,
    Math.max(1, Math.round(value)),
  )
}

export function normalizeServiceLogBufferLimit(
  value: number,
  fallback = DEFAULT_SERVICE_LOG_TAIL,
): number {
  if (!Number.isFinite(value)) {
    return Number.isFinite(fallback)
      ? normalizeServiceLogBufferLimit(fallback)
      : DEFAULT_SERVICE_LOG_TAIL
  }

  return Math.max(1, Math.round(value))
}

export function trimServiceLogLines(lines: string[], limit: number) {
  const normalizedLimit = normalizeServiceLogBufferLimit(limit)

  if (lines.length <= normalizedLimit) {
    return lines
  }

  return lines.slice(lines.length - normalizedLimit)
}

export function appendBoundedServiceLogLine(
  lines: string[],
  line: string,
  limit: number,
) {
  return trimServiceLogLines([...lines, line], limit)
}

export function parseServiceLogWebSocketMessage(
  data: unknown,
): ServiceLogWebSocketMessage | null {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown
    return isServiceLogWebSocketMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isServiceLogWebSocketMessage(
  value: unknown,
): value is ServiceLogWebSocketMessage {
  if (!isRecord(value) || !isString(value.type)) {
    return false
  }

  if (value.type === "service_log_opened") {
    return isServiceLogOpenedMessage(value)
  }

  if (value.type === "service_log_line") {
    return isServiceLogLineMessage(value)
  }

  if (value.type === "service_log_error") {
    return isServiceLogErrorMessage(value)
  }

  if (value.type === "service_log_stream_ended") {
    return isServiceLogStreamEndedMessage(value)
  }

  return false
}

export function isServiceLogOpenedMessage(
  value: unknown,
): value is ServiceLogOpenedMessage {
  return (
    isRecord(value) &&
    value.type === "service_log_opened" &&
    isString(value.service) &&
    isString(value.container_name) &&
    isNumber(value.tail) &&
    isBoolean(value.stdout) &&
    isBoolean(value.stderr) &&
    isBoolean(value.timestamps) &&
    isString(value.time)
  )
}

export function isServiceLogLineMessage(
  value: unknown,
): value is ServiceLogLineMessage {
  return (
    isRecord(value) &&
    value.type === "service_log_line" &&
    isString(value.service) &&
    isString(value.container_name) &&
    isString(value.stream) &&
    isString(value.line) &&
    isString(value.time)
  )
}

export function isServiceLogErrorMessage(
  value: unknown,
): value is ServiceLogErrorMessage {
  return (
    isRecord(value) &&
    value.type === "service_log_error" &&
    isString(value.service) &&
    isOptionalString(value.container_name) &&
    isString(value.code) &&
    isString(value.message) &&
    isString(value.time)
  )
}

export function isServiceLogStreamEndedMessage(
  value: unknown,
): value is ServiceLogStreamEndedMessage {
  return (
    isRecord(value) &&
    value.type === "service_log_stream_ended" &&
    isString(value.service) &&
    isString(value.container_name) &&
    isString(value.reason) &&
    isString(value.time)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}
