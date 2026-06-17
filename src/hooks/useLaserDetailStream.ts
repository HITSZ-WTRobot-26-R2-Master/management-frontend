import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import {
  buildLaserDetailWebSocketUrl,
  getApiError,
  hasManagementAuthToken,
  parseLaserDetailSocketMessage,
} from "@/lib/management-api"
import { baseUrlAtom, authTokenAtom } from "@/state/operator-shell"
import type { ApiError, LaserStatusSnapshot } from "@/types/management"

export type LaserDetailStreamStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "error"

export interface LaserDetailStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  snapshot: LaserStatusSnapshot | null
  status: LaserDetailStreamStatus
}

export function useLaserDetailStream({
  enabled,
}: {
  enabled: boolean
}): LaserDetailStreamState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const hasToken = hasManagementAuthToken(token)
  const [state, setState] = useState<LaserDetailStreamState>({
    error: null,
    lastMessageAt: null,
    snapshot: null,
    status: "auth_required",
  })

  useEffect(() => {
    if (!enabled || !hasToken) {
      setState({
        error: hasToken ? null : { code: "auth_required", message: "需要认证" },
        lastMessageAt: null,
        snapshot: null,
        status: hasToken ? "connecting" : "auth_required",
      })
      return
    }

    let disposed = false
    let socket: WebSocket | null = null

    const connect = () => {
      if (disposed) return

      let url: string
      try {
        url = buildLaserDetailWebSocketUrl(baseUrl, token)
      } catch (error) {
        const apiError = getApiError(error)
        setState({
          error: apiError,
          lastMessageAt: null,
          snapshot: null,
          status: "error",
        })
        return
      }

      try {
        socket = new WebSocket(url)
      } catch {
        setState({
          error: { code: "request_failed", message: "无法打开 laser 详情流" },
          lastMessageAt: null,
          snapshot: null,
          status: "error",
        })
        return
      }

      socket.addEventListener("open", () => {
        if (disposed) return
        setState((prev) => ({
          ...prev,
          error: null,
          status: "live",
        }))
      })

      socket.addEventListener("message", (event) => {
        if (disposed) return
        const parsed = parseLaserDetailSocketMessage(event.data)
        if (!parsed) return

        if (parsed.type === "laser_detail_snapshot") {
          setState({
            error: null,
            lastMessageAt: parsed.time,
            snapshot: parsed.snapshot,
            status: "live",
          })
        } else if (parsed.type === "laser_detail_error") {
          setState({
            error: { code: parsed.code, message: parsed.message },
            lastMessageAt: parsed.time,
            snapshot: null,
            status: "error",
          })
        }
      })

      socket.addEventListener("close", () => {
        socket = null
        if (!disposed) {
          setTimeout(() => {
            if (!disposed) connect()
          }, 1000)
        }
      })

      socket.addEventListener("error", () => {
        socket?.close()
      })
    }

    connect()

    return () => {
      disposed = true
      socket?.close()
    }
  }, [enabled, hasToken, baseUrl, token])

  return { ...state }
}
