import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
import { getBlockStateReconnectDelayMs } from "@/lib/block-state-connection"
import { parseBlockStateMessage } from "@/lib/block-state-stream"
import {
  buildBlockStatesWebSocketUrl,
  hasManagementAuthToken,
} from "@/lib/management-api"
import {
  allianceColorAtom,
  authTokenAtom,
  baseUrlAtom,
} from "@/state/operator-shell"

export function useAllianceColorSync() {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const hasToken = hasManagementAuthToken(token)
  const setAllianceColor = useSetAtom(allianceColorAtom)
  const reconnectTimerRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!hasToken) {
      return
    }

    let disposed = false
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
      } catch {
        return
      }

      wsRef.current.onopen = () => {
        if (disposed) {
          return
        }

        hasOpened = true
      }

      wsRef.current.onmessage = (event) => {
        const message = parseBlockStateMessage(event.data)
        if (!message || disposed) {
          return
        }

        if (message.type === "block_states_snapshot") {
          setAllianceColor(message.color)
        }
      }

      wsRef.current.onclose = () => {
        wsRef.current = null
        if (disposed) {
          return
        }

        const reconnectDelayMs = getBlockStateReconnectDelayMs({
          hasOpened,
          usedInitialFastRetry,
        })
        if (reconnectDelayMs === 0) {
          usedInitialFastRetry = true
        }
        reconnectTimerRef.current = window.setTimeout(connect, reconnectDelayMs)
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
}
