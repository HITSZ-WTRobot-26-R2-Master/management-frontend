import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  getSnapshotServices,
  reduceServiceStatusesForEvent,
} from "@/lib/event-reducer"
import {
  AUTH_REQUIRED_ERROR,
  buildManagementWebSocketUrl,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
  isManagementAuthError,
  isManagementEvent,
} from "@/lib/management-api"
import {
  authTokenAtom,
  baseUrlAtom,
  connectionStateAtom,
  latestErrorAtom,
  managementApiClientAtom,
  recentEventsAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  ConnectionStatus,
  ManagementEvent,
  ServiceStatus,
} from "@/types/management"

const maxRecentEvents = 200
const maxReconnectAttempts = 8
const baseReconnectDelayMs = 1_000
const maxReconnectDelayMs = 30_000

interface EventStreamState {
  error: ApiError | null
  fallbackRefreshAt: string | null
  lastEventAt: string | null
  loadedRecentAt: string | null
  refreshRecent: () => void
}

export function useEventStream(): EventStreamState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const setConnectionState = useSetAtom(connectionStateAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const setRecentEvents = useSetAtom(recentEventsAtom)
  const setServiceStatuses = useSetAtom(serviceStatusesAtom)
  const fallbackInFlightRef = useRef(false)
  const [recentRefreshIndex, setRecentRefreshIndex] = useState(0)
  const [state, setState] = useState<EventStreamState>({
    error: null,
    fallbackRefreshAt: null,
    lastEventAt: null,
    loadedRecentAt: null,
    refreshRecent: () => undefined,
  })
  const refreshRecent = useCallback(() => {
    setRecentRefreshIndex((current) => current + 1)
  }, [])
  const hasToken = hasManagementAuthToken(token)

  useEffect(() => {
    if (!hasToken) {
      setRecentEvents([])
      setState((current) => ({
        ...current,
        error: AUTH_REQUIRED_ERROR,
        loadedRecentAt: null,
        refreshRecent,
      }))
      return
    }

    const controller = new AbortController()
    let disposed = false

    setState((current) => ({
      ...current,
      error: null,
      loadedRecentAt: null,
    }))

    async function loadRecentEvents() {
      try {
        const events = await client.listRecentEvents(controller.signal)

        if (disposed) {
          return
        }

        const boundedEvents = boundEvents(events)
        const latestSnapshot = findLatestSnapshot(boundedEvents)

        setRecentEvents(boundedEvents)
        if (latestSnapshot) {
          setServiceStatuses(latestSnapshot)
        }
        setState((current) => ({
          ...current,
          error: null,
          loadedRecentAt: new Date().toISOString(),
        }))
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
        }))
      }
    }

    void loadRecentEvents()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    client,
    hasToken,
    recentRefreshIndex,
    refreshRecent,
    setLatestError,
    setRecentEvents,
    setServiceStatuses,
  ])

  useEffect(() => {
    if (!hasToken) {
      setConnectionState({
        status: "auth_required",
        checked_at: new Date().toISOString(),
        retry_attempt: 0,
        next_retry_at: null,
      })
      setLatestError(null)
      setState((current) => ({
        ...current,
        error: AUTH_REQUIRED_ERROR,
        fallbackRefreshAt: null,
        lastEventAt: null,
        refreshRecent,
      }))
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let fallbackController: AbortController | null = null
    let retryAttempt = 0

    const refreshFallback = async (): Promise<ApiError | null> => {
      if (fallbackInFlightRef.current) {
        return null
      }

      const controller = new AbortController()
      fallbackController = controller
      fallbackInFlightRef.current = true
      try {
        const services = await client.listServices(controller.signal)

        if (disposed) {
          return null
        }

        const fallbackAt = new Date().toISOString()
        setServiceStatuses(services)
        setConnectionState((current) => ({
          ...current,
          fallback_at: fallbackAt,
        }))
        setState((current) => ({
          ...current,
          fallbackRefreshAt: fallbackAt,
        }))
        return null
      } catch (error) {
        if (disposed) {
          return null
        }

        const apiError = getApiError(error)
        const checkedAt = new Date().toISOString()
        setLatestError(apiError)
        setConnectionState((current) => ({
          ...current,
          status: isManagementAuthError(apiError)
            ? getConnectionStatus(apiError)
            : current.status,
          checked_at: checkedAt,
        }))
        setState((current) => ({
          ...current,
          error: apiError,
        }))
        return apiError
      } finally {
        if (fallbackController === controller) {
          fallbackController = null
        }
        fallbackInFlightRef.current = false
      }
    }

    const scheduleReconnect = (options: { refreshFallback: boolean } = {
      refreshFallback: true,
    }) => {
      if (disposed) {
        return
      }

      if (options.refreshFallback) {
        void refreshFallback()
      }

      if (retryAttempt >= maxReconnectAttempts) {
        setConnectionState((current) => ({
          ...current,
          status: "fallback",
          checked_at: new Date().toISOString(),
          retry_attempt: retryAttempt,
          next_retry_at: null,
        }))
        return
      }

      retryAttempt += 1
      const delayMs = getReconnectDelayMs(retryAttempt)
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString()

      setConnectionState((current) => ({
        ...current,
        status: "reconnecting",
        checked_at: new Date().toISOString(),
        retry_attempt: retryAttempt,
        next_retry_at: nextRetryAt,
      }))

      reconnectTimer = window.setTimeout(() => {
        connect()
      }, delayMs)
    }

    const handleClosedBeforeOpen = async () => {
      const apiError = await refreshFallback()

      if (disposed || (apiError && isManagementAuthError(apiError))) {
        return
      }

      scheduleReconnect({ refreshFallback: false })
    }

    const connect = () => {
      if (disposed) {
        return
      }

      let socketOpened = false
      let url: string
      try {
        url = buildManagementWebSocketUrl(baseUrl, token)
      } catch (error) {
        const apiError = getApiError(error)
        setLatestError(apiError)
        setConnectionState({
          status: "error",
          checked_at: new Date().toISOString(),
        })
        setState((current) => ({
          ...current,
          error: apiError,
        }))
        void refreshFallback()
        return
      }

      setConnectionState((current) => ({
        ...current,
        status: retryAttempt > 0 ? "reconnecting" : "stream_connecting",
        checked_at: new Date().toISOString(),
        retry_attempt: retryAttempt,
      }))

      try {
        socket = new WebSocket(url)
      } catch {
        const apiError: ApiError = {
          code: "request_failed",
          message: "无法打开管理事件流",
        }
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
        }))
        scheduleReconnect()
        return
      }

      socket.addEventListener("open", () => {
        if (disposed) {
          return
        }

        socketOpened = true
        retryAttempt = 0
        setConnectionState((current) => ({
          ...current,
          status: "live",
          checked_at: new Date().toISOString(),
          retry_attempt: 0,
          next_retry_at: null,
        }))
        setState((current) => ({
          ...current,
          error: null,
        }))
      })

      socket.addEventListener("message", (message) => {
        if (disposed) {
          return
        }

        const event = parseSocketEvent(message.data)
        if (!event) {
          return
        }

        const eventAt = new Date().toISOString()
        setRecentEvents((current) => appendEvent(current, event))
        applyEventToServices(event, setServiceStatuses)
        setConnectionState((current) => ({
          ...current,
          status: "live",
          checked_at: eventAt,
          last_event_at: eventAt,
        }))
        setState((current) => ({
          ...current,
          lastEventAt: eventAt,
        }))
      })

      socket.addEventListener("close", () => {
        const closedBeforeOpen = !socketOpened
        socket = null
        if (closedBeforeOpen) {
          void handleClosedBeforeOpen()
          return
        }
        scheduleReconnect()
      })

      socket.addEventListener("error", () => {
        socket?.close()
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
      }
      fallbackController?.abort()
      socket?.close()
    }
  }, [
    baseUrl,
    client,
    hasToken,
    refreshRecent,
    setConnectionState,
    setLatestError,
    setRecentEvents,
    setServiceStatuses,
    token,
  ])

  return {
    ...state,
    refreshRecent,
  }
}

function parseSocketEvent(data: unknown): ManagementEvent | null {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown
    return isManagementEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}

function appendEvent(events: ManagementEvent[], event: ManagementEvent) {
  if (events.some((current) => current.id === event.id)) {
    return events
  }

  return boundEvents([...events, event])
}

function boundEvents(events: ManagementEvent[]) {
  return events.slice(-maxRecentEvents)
}

function applyEventToServices(
  event: ManagementEvent,
  setServiceStatuses: (update: (current: ServiceStatus[]) => ServiceStatus[]) => void,
) {
  setServiceStatuses((current) => reduceServiceStatusesForEvent(current, event))
}

function findLatestSnapshot(events: ManagementEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const services = getSnapshotServices(events[index])

    if (services) {
      return services
    }
  }

  return null
}

function getReconnectDelayMs(attempt: number) {
  const exponentialDelay = baseReconnectDelayMs * 2 ** Math.max(0, attempt - 1)
  return Math.min(maxReconnectDelayMs, exponentialDelay)
}

function getConnectionStatus(error: ApiError): ConnectionStatus {
  if (error.code === "auth_required" || error.code === "auth_invalid") {
    return error.code
  }

  return "error"
}
