import { useAtomValue } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  AUTH_REQUIRED_ERROR,
  buildMasterControlPoseWebSocketUrl,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
  isMasterControlPoseWebSocketMessage,
} from "@/lib/management-api"
import {
  authTokenAtom,
  baseUrlAtom,
  managementApiClientAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  ConnectionStatus,
  MasterControlPoseSnapshot,
} from "@/types/management"

export type MasterControlPoseStreamStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "fallback"
  | "error"

export interface MasterControlPoseStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: MasterControlPoseSnapshot | null
  status: MasterControlPoseStreamStatus
}

export function useMasterControlPoseStream(): MasterControlPoseStreamState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const hasToken = hasManagementAuthToken(token)
  const fallbackInFlightRef = useRef(false)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [state, setState] = useState<MasterControlPoseStreamState>({
    error: null,
    lastMessageAt: null,
    refresh: () => undefined,
    snapshot: null,
    status: "auth_required",
  })
  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1)
  }, [])

  useEffect(() => {
    setState((current) => ({
      ...current,
      refresh,
    }))
  }, [refresh])

  useEffect(() => {
    if (!hasToken) {
      setState((current) => ({
        ...current,
        error: AUTH_REQUIRED_ERROR,
        lastMessageAt: null,
        snapshot: null,
        status: "auth_required",
      }))
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let fallbackController: AbortController | null = null

    const refreshFallback = async () => {
      if (fallbackInFlightRef.current) {
        return
      }

      const controller = new AbortController()
      fallbackController = controller
      fallbackInFlightRef.current = true

      try {
        const snapshot = await client.getMasterControlPose(controller.signal)

        if (disposed) {
          return
        }

        setState((current) => ({
          ...current,
          error: null,
          lastMessageAt: new Date().toISOString(),
          snapshot,
          status: "fallback",
        }))
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        setState((current) => ({
          ...current,
          error: getApiError(error),
          status: "error",
        }))
      } finally {
        if (fallbackController === controller) {
          fallbackController = null
        }
        fallbackInFlightRef.current = false
      }
    }

    try {
      socket = new WebSocket(buildMasterControlPoseWebSocketUrl(baseUrl, token))
      setState((current) => ({
        ...current,
        error: null,
        status: "connecting",
      }))
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getApiError(error),
        status: "error",
      }))
      void refreshFallback()
      return () => {
        disposed = true
        fallbackController?.abort()
      }
    }

    socket.addEventListener("open", () => {
      if (disposed) {
        return
      }

      setState((current) => ({
        ...current,
        error: null,
        status: "live",
      }))
    })

    socket.addEventListener("message", (message) => {
      if (disposed) {
        return
      }

      const parsed = parseMasterControlPoseSocketMessage(message.data)
      if (!parsed) {
        return
      }

      if (parsed.type === "master_control_pose_snapshot") {
        setState((current) => ({
          ...current,
          error: null,
          lastMessageAt: parsed.time,
          snapshot: parsed.snapshot,
          status: "live",
        }))
        return
      }

      setState((current) => ({
        ...current,
        error: {
          code: parsed.code,
          message: parsed.message,
        },
        lastMessageAt: parsed.time,
        status: "error",
      }))
    })

    socket.addEventListener("close", () => {
      socket = null
      if (!disposed) {
        void refreshFallback()
      }
    })

    socket.addEventListener("error", () => {
      socket?.close()
    })

    return () => {
      disposed = true
      fallbackController?.abort()
      socket?.close()
    }
  }, [baseUrl, client, hasToken, refreshIndex, token])

  return {
    ...state,
    refresh,
  }
}

function parseMasterControlPoseSocketMessage(data: unknown) {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown
    return isMasterControlPoseWebSocketMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function masterControlPoseConnectionStatus(
  status: MasterControlPoseStreamStatus,
): ConnectionStatus {
  switch (status) {
    case "auth_required":
      return "auth_required"
    case "connecting":
      return "stream_connecting"
    case "live":
      return "live"
    case "fallback":
      return "fallback"
    case "error":
      return "error"
  }
}
