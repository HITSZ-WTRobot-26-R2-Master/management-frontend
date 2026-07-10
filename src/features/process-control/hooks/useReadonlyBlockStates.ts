import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef, useState } from "react"
import { getBlockStateReconnectDelayMs } from "@/lib/block-state-connection"
import { parseBlockStateMessage } from "@/lib/block-state-stream"
import {
  AUTH_REQUIRED_ERROR,
  buildBlockStatesWebSocketUrl,
  hasManagementAuthToken,
} from "@/lib/management-api"
import {
  allianceColorAtom,
  authTokenAtom,
  baseUrlAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  BlockStatesColor,
  MatchType,
} from "@/types/management"

export type ReadonlyBlockStatesSyncStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "reconnecting"
  | "error"

export function useReadonlyBlockStates() {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const setAllianceColor = useSetAtom(allianceColorAtom)
  const hasToken = hasManagementAuthToken(token)
  const [color, setColor] = useState<BlockStatesColor | null>(null)
  const [matchType, setMatchType] = useState<MatchType | null>(null)
  const [revision, setRevision] = useState(0)
  const [status, setStatus] =
    useState<ReadonlyBlockStatesSyncStatus>("auth_required")
  const [error, setError] = useState<ApiError | null>(AUTH_REQUIRED_ERROR)
  const reconnectTimerRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!hasToken) {
      setColor(null)
      setMatchType(null)
      setRevision(0)
      setStatus("auth_required")
      setError(AUTH_REQUIRED_ERROR)
      return
    }

    let disposed = false
    let reconnectAttempt = 0
    let hasOpened = false
    let usedInitialFastRetry = false

    function connect() {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      try {
        wsRef.current = new WebSocket(
          buildBlockStatesWebSocketUrl(baseUrl, token),
        )
        setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting")
        setError(null)
      } catch (caught) {
        setStatus("error")
        setError({
          code: "request_failed",
          message:
            caught instanceof Error
              ? caught.message
              : "无法打开块状态 WebSocket",
        })
        return
      }

      wsRef.current.onopen = () => {
        if (disposed) {
          return
        }

        reconnectAttempt = 0
        hasOpened = true
        setStatus("live")
        setError(null)
      }

      wsRef.current.onmessage = (event) => {
        const message = parseBlockStateMessage(event.data)
        if (!message || disposed) {
          return
        }

        if (message.type === "block_states_snapshot") {
          setColor(message.color)
          setAllianceColor(message.color)
          setMatchType(message.matchType)
          setRevision(message.revision)
          setStatus("live")
          setError(null)
          return
        }

        setError({
          code: message.code,
          message: message.message,
        })
      }

      wsRef.current.onclose = () => {
        wsRef.current = null
        if (disposed) {
          return
        }

        reconnectAttempt += 1
        setStatus("reconnecting")
        const reconnectDelayMs = getBlockStateReconnectDelayMs({
          hasOpened,
          usedInitialFastRetry,
        })
        if (reconnectDelayMs === 0) {
          usedInitialFastRetry = true
        }
        reconnectTimerRef.current = window.setTimeout(
          connect,
          reconnectDelayMs,
        )
      }

      wsRef.current.onerror = () => {
        wsRef.current?.close()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [baseUrl, hasToken, setAllianceColor, token])

  return {
    color,
    matchType,
    revision,
    connected: status === "live",
    status,
    error,
  }
}
