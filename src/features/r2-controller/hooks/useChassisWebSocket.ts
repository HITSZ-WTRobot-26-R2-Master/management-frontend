import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ChassisStateSnapshot,
  ControllerConfig,
  ServerMessage,
} from "@/features/r2-controller/types/controller"

const DEFAULT_RECONNECT_MS = 3000

export interface ChassisWebSocketState {
  connected: boolean
  state: ChassisStateSnapshot | null
  config: ControllerConfig | null
  error: string | null
}

export function useChassisWebSocket(wsUrl: string | null) {
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState<ChassisStateSnapshot | null>(null)
  const [config, setConfig] = useState<ControllerConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!wsUrl) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        setError(null)
      }

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data as string)
          if (msg.type === "chassis_state") {
            setState(msg.data)
          } else if (msg.type === "config") {
            setConfig(msg.data)
          }
        } catch {
          // 忽略解析错误
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        reconnectTimerRef.current = setTimeout(connect, DEFAULT_RECONNECT_MS)
      }

      ws.onerror = () => {
        setConnected(false)
      }
    } catch (e) {
      setError(String(e))
      reconnectTimerRef.current = setTimeout(connect, DEFAULT_RECONNECT_MS)
    }
  }, [wsUrl])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null // 避免自动重连
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const sendCommand = useCallback((cmd: number, data: number[]) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify({ type: "command", cmd, data }))
      return true
    } catch {
      return false
    }
  }, [])

  return {
    connected,
    state,
    config,
    error,
    sendCommand,
  } as const
}
