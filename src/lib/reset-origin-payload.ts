import type { JsonObject } from "@/types/management"

export interface ResetOriginPayload {
  pose_x: number
  pose_y: number
  pose_z: number
  pose_yaw_deg: number
}

export const RESET_ORIGIN_SESSION_STORAGE_KEY =
  "management.resetOrigin.lastPayload.v1"

export const DEFAULT_RESET_ORIGIN_PAYLOAD = {
  pose_x: 0,
  pose_y: 0,
  pose_z: 0,
  pose_yaw_deg: 0,
} satisfies ResetOriginPayload

type ResetOriginSessionReader = Pick<Storage, "getItem">
type ResetOriginSessionWriter = Pick<Storage, "setItem">

export function readResetOriginSessionPayload(
  storage: ResetOriginSessionReader | null = getResetOriginSessionStorage(),
): ResetOriginPayload {
  if (!storage) {
    return { ...DEFAULT_RESET_ORIGIN_PAYLOAD }
  }

  try {
    const raw = storage.getItem(RESET_ORIGIN_SESSION_STORAGE_KEY)

    if (raw === null) {
      return { ...DEFAULT_RESET_ORIGIN_PAYLOAD }
    }

    const value = JSON.parse(raw) as unknown

    return isResetOriginPayload(value)
      ? value
      : { ...DEFAULT_RESET_ORIGIN_PAYLOAD }
  } catch {
    return { ...DEFAULT_RESET_ORIGIN_PAYLOAD }
  }
}

export function writeResetOriginSessionPayload(
  payload: ResetOriginPayload,
  storage: ResetOriginSessionWriter | null = getResetOriginSessionStorage(),
) {
  if (!storage || !isResetOriginPayload(payload)) {
    return
  }

  try {
    storage.setItem(RESET_ORIGIN_SESSION_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Browser storage may be unavailable in private or locked-down contexts.
  }
}

export function toResetOriginJsonPayload(
  payload: ResetOriginPayload,
): JsonObject {
  return {
    pose_x: payload.pose_x,
    pose_y: payload.pose_y,
    pose_z: payload.pose_z,
    pose_yaw_deg: payload.pose_yaw_deg,
  }
}

function getResetOriginSessionStorage() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function isResetOriginPayload(value: unknown): value is ResetOriginPayload {
  return (
    isRecord(value) &&
    isFiniteNumber(value.pose_x) &&
    isFiniteNumber(value.pose_y) &&
    isFiniteNumber(value.pose_z) &&
    isFiniteNumber(value.pose_yaw_deg)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
