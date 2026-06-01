import { useAtomValue, useSetAtom } from "jotai"
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  AUTH_REQUIRED_ERROR,
  buildServiceLogWebSocketUrl,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
} from "@/lib/management-api"
import {
  appendBoundedServiceLogLine,
  DEFAULT_SERVICE_LOG_TAIL,
  normalizeServiceLogBufferLimit,
  parseServiceLogWebSocketMessage,
  trimServiceLogLines,
} from "@/lib/service-log-stream"
import {
  isServiceNotFoundError,
  removeStaleServiceStatus,
} from "@/lib/service-not-found-recovery"
import {
  authTokenAtom,
  baseUrlAtom,
  connectionStateAtom,
  latestErrorAtom,
  managementApiClientAtom,
  selectedServiceNameAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  RestartResponse,
  ServiceLogsResponse,
  ServiceLogWebSocketMessage,
  ServiceStats,
  ServiceStatus,
} from "@/types/management"

export interface ServiceLogOptions {
  tail: number
  stdout: boolean
  stderr: boolean
  timestamps: boolean
}

interface RequestState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  refreshing: boolean
  loadedAt: string | null
}

interface RestartState {
  error: ApiError | null
  response: RestartResponse | null
  submitting: boolean
}

export type ServiceLogStreamStatus =
  | "idle"
  | "auth_required"
  | "connecting"
  | "live"
  | "fallback"
  | "ended"
  | "error"

export interface ServiceLogsState extends RequestState<ServiceLogsResponse> {
  acceptedTail: number
  endedAt: string | null
  lastLineAt: string | null
  openedAt: string | null
  requestedTail: number
  status: ServiceLogStreamStatus
  streamReason: string | null
}

export interface SelectedServiceDiagnosticsState {
  detail: RequestState<ServiceStatus>
  logs: ServiceLogsState
  stats: RequestState<ServiceStats>
  restart: RestartState
  refreshDetail: () => void
  refreshLogs: () => void
  refreshStats: () => void
  restartHard: (reason: string) => Promise<RestartResponse | null>
}

const initialRequestState = {
  data: null,
  error: null,
  loading: false,
  refreshing: false,
  loadedAt: null,
} satisfies RequestState<unknown>

const initialRestartState = {
  error: null,
  response: null,
  submitting: false,
} satisfies RestartState

const initialLogsState = {
  ...initialRequestState,
  acceptedTail: DEFAULT_SERVICE_LOG_TAIL,
  endedAt: null,
  lastLineAt: null,
  openedAt: null,
  requestedTail: DEFAULT_SERVICE_LOG_TAIL,
  status: "idle",
  streamReason: null,
} satisfies ServiceLogsState

export function useSelectedServiceDiagnostics(
  serviceName: string | null,
  logOptions: ServiceLogOptions,
  onServiceNotFound: () => void,
): SelectedServiceDiagnosticsState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const client = useAtomValue(managementApiClientAtom)
  const connectionStatus = useAtomValue(connectionStateAtom).status
  const token = useAtomValue(authTokenAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const setSelectedServiceName = useSetAtom(selectedServiceNameAtom)
  const setServiceStatuses = useSetAtom(serviceStatusesAtom)
  const hasToken = hasManagementAuthToken(token)
  const [detailRefreshIndex, setDetailRefreshIndex] = useState(0)
  const [logsRefreshIndex, setLogsRefreshIndex] = useState(0)
  const [statsRefreshIndex, setStatsRefreshIndex] = useState(0)
  const [detail, setDetail] =
    useState<RequestState<ServiceStatus>>(initialRequestState)
  const [logs, setLogs] = useState<ServiceLogsState>(initialLogsState)
  const [stats, setStats] =
    useState<RequestState<ServiceStats>>(initialRequestState)
  const [restart, setRestart] = useState<RestartState>(initialRestartState)
  const autoRetryKeyRef = useRef<string | null>(null)

  const refreshDetail = useCallback(() => {
    setDetailRefreshIndex((current) => current + 1)
  }, [])

  const refreshLogs = useCallback(() => {
    setLogsRefreshIndex((current) => current + 1)
  }, [])

  const refreshStats = useCallback(() => {
    setStatsRefreshIndex((current) => current + 1)
  }, [])

  const handleServiceNotFound = useCallback(
    (apiError: ApiError, staleServiceName: string) => {
      if (!isServiceNotFoundError(apiError)) {
        return
      }

      setSelectedServiceName((current) =>
        current === staleServiceName ? "" : current,
      )
      setServiceStatuses((current) =>
        removeStaleServiceStatus(current, staleServiceName),
      )
      onServiceNotFound()
    },
    [onServiceNotFound, setSelectedServiceName, setServiceStatuses],
  )

  const restartHard = useCallback(
    async (reason: string) => {
      if (!serviceName) {
        return null
      }

      if (!hasToken) {
        setRestart({
          error: AUTH_REQUIRED_ERROR,
          response: null,
          submitting: false,
        })
        setLatestError(AUTH_REQUIRED_ERROR)
        return null
      }

      const controller = new AbortController()

      setRestart((current) => ({
        ...current,
        error: null,
        submitting: true,
      }))

      try {
        const trimmedReason = reason.trim()
        const response = await client.restartService(
          serviceName,
          {
            mode: "hard",
            confirm: true,
            ...(trimmedReason.length > 0 ? { reason: trimmedReason } : {}),
          },
          controller.signal,
        )

        setRestart({
          error: null,
          response,
          submitting: false,
        })
        setLatestError(null)
        setDetailRefreshIndex((current) => current + 1)
        setStatsRefreshIndex((current) => current + 1)

        return response
      } catch (error) {
        if (isAbortError(error)) {
          return null
        }

        const apiError = getApiError(error)
        handleServiceNotFound(apiError, serviceName)
        setRestart({
          error: apiError,
          response: null,
          submitting: false,
        })
        setLatestError(apiError)

        return null
      }
    },
    [client, handleServiceNotFound, hasToken, serviceName, setLatestError],
  )

  useEffect(() => {
    setDetail(initialRequestState)
    setLogs(initialLogsState)
    setStats(initialRequestState)
    setRestart(initialRestartState)
    autoRetryKeyRef.current = null
  }, [serviceName])

  useEffect(() => {
    if (!serviceName || !hasToken || !isRecoverableConnection(connectionStatus)) {
      return
    }

    const retryTargets = [
      detail.error?.code === "request_failed" &&
        !detail.loading &&
        !detail.refreshing
        ? "detail"
        : null,
      logs.error?.code === "request_failed" && !logs.loading && !logs.refreshing
        ? "logs"
        : null,
      stats.error?.code === "request_failed" &&
        !stats.loading &&
        !stats.refreshing
        ? "stats"
        : null,
    ].filter((target): target is string => target !== null)

    if (retryTargets.length === 0) {
      return
    }

    const retryKey = [
      baseUrl,
      token,
      serviceName,
      connectionStatus,
      detail.loadedAt ?? "never",
      logs.loadedAt ?? "never",
      stats.loadedAt ?? "never",
      retryTargets.join(","),
    ].join("|")

    if (autoRetryKeyRef.current === retryKey) {
      return
    }

    autoRetryKeyRef.current = retryKey

    if (retryTargets.includes("detail")) {
      setDetailRefreshIndex((current) => current + 1)
    }
    if (retryTargets.includes("logs")) {
      setLogsRefreshIndex((current) => current + 1)
    }
    if (retryTargets.includes("stats")) {
      setStatsRefreshIndex((current) => current + 1)
    }
  }, [
    baseUrl,
    connectionStatus,
    detail.error?.code,
    detail.loadedAt,
    detail.loading,
    detail.refreshing,
    hasToken,
    logs.error?.code,
    logs.loadedAt,
    logs.loading,
    logs.refreshing,
    serviceName,
    stats.error?.code,
    stats.loadedAt,
    stats.loading,
    stats.refreshing,
    token,
  ])

  useEffect(() => {
    if (!serviceName) {
      setDetail(initialRequestState)
      return
    }

    if (!hasToken) {
      setDetail({
        data: null,
        error: AUTH_REQUIRED_ERROR,
        loading: false,
        refreshing: false,
        loadedAt: null,
      })
      return
    }

    const selectedServiceName = serviceName
    const controller = new AbortController()
    let disposed = false

    setDetail((current) => ({
      ...current,
      error: null,
      loading: current.loadedAt === null,
      refreshing: current.loadedAt !== null,
    }))

    async function loadDetail() {
      try {
        const service = await client.getServiceStatus(
          selectedServiceName,
          controller.signal,
        )

        if (disposed) {
          return
        }

        setServiceStatuses((current) =>
          replaceServiceStatus(current, service),
        )
        setLatestError(null)
        setDetail({
          data: service,
          error: null,
          loading: false,
          refreshing: false,
          loadedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        handleServiceNotFound(apiError, selectedServiceName)
        setLatestError(apiError)
        setDetail((current) => ({
          ...current,
          error: apiError,
          loading: false,
          refreshing: false,
        }))
      }
    }

    void loadDetail()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    client,
    baseUrl,
    detailRefreshIndex,
    handleServiceNotFound,
    hasToken,
    serviceName,
    setLatestError,
    setServiceStatuses,
    token,
  ])

  useEffect(() => {
    if (!serviceName) {
      setLogs(initialLogsState)
      return
    }

    if (!hasToken) {
      setLogs({
        ...initialLogsState,
        acceptedTail: logOptions.tail,
        requestedTail: logOptions.tail,
        status: "auth_required",
        error: AUTH_REQUIRED_ERROR,
      })
      return
    }

    const selectedServiceName = serviceName
    let socket: WebSocket | null = null
    let fallbackController: AbortController | null = null
    let disposed = false
    let socketOpened = false
    let terminalMessageSeen = false
    const requestedTail = logOptions.tail

    setLogs((current) => ({
      ...current,
      acceptedTail: requestedTail,
      data: current.data
        ? {
            ...current.data,
            tail: requestedTail,
            lines: trimServiceLogLines(current.data.lines, requestedTail),
          }
        : null,
      endedAt: null,
      error: null,
      lastLineAt: null,
      loading: current.loadedAt === null,
      openedAt: null,
      refreshing: current.loadedAt !== null,
      requestedTail,
      status: "connecting",
      streamReason: null,
    }))

    const loadRestFallback = async () => {
      const controller = new AbortController()
      fallbackController = controller

      try {
        const response = await client.getServiceLogs(selectedServiceName, {
          tail: requestedTail,
          stdout: logOptions.stdout,
          stderr: logOptions.stderr,
          timestamps: logOptions.timestamps,
          signal: controller.signal,
        })

        if (disposed) {
          return
        }

        setLogs({
          acceptedTail: response.tail,
          data: response,
          endedAt: null,
          error: null,
          lastLineAt: null,
          loading: false,
          loadedAt: new Date().toISOString(),
          openedAt: null,
          refreshing: false,
          requestedTail,
          status: "fallback",
          streamReason: "实时日志连接不可用，已加载一次 REST 日志结果。",
        })
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        handleServiceNotFound(apiError, selectedServiceName)
        setLatestError(apiError)
        setLogs((current) => ({
          ...current,
          error: apiError,
          loading: false,
          refreshing: false,
          status: apiError.code === "auth_required" ? "auth_required" : "error",
          streamReason: "服务日志实时连接失败，REST 回退也未成功。",
        }))
      } finally {
        if (fallbackController === controller) {
          fallbackController = null
        }
      }
    }

    function connectLogs() {
      let url: string

      try {
        url = buildServiceLogWebSocketUrl(baseUrl, token, selectedServiceName, {
          tail: requestedTail,
          stdout: logOptions.stdout,
          stderr: logOptions.stderr,
          timestamps: logOptions.timestamps,
        })
      } catch (error) {
        const apiError = getApiError(error)
        setLatestError(apiError)
        setLogs((current) => ({
          ...current,
          error: apiError,
          loading: false,
          refreshing: false,
          status: "error",
          streamReason: "无法构造服务日志实时连接地址。",
        }))
        return
      }

      try {
        socket = new WebSocket(url)
      } catch {
        setLogs((current) => ({
          ...current,
          loading: current.loadedAt === null,
          refreshing: current.loadedAt !== null,
          status: "fallback",
          streamReason: "浏览器无法打开服务日志实时连接，正在尝试一次 REST 回退。",
        }))
        void loadRestFallback()
        return
      }

      socket.addEventListener("open", () => {
        if (disposed) {
          return
        }

        socketOpened = true
        setLogs((current) => ({
          ...current,
          error: null,
          loading: current.loadedAt === null,
          refreshing: current.loadedAt !== null,
          status: "connecting",
          streamReason: "实时连接已建立，等待后端确认日志元数据。",
        }))
      })

      socket.addEventListener("message", (message) => {
        if (disposed) {
          return
        }

        const parsed = parseServiceLogWebSocketMessage(message.data)
        if (!parsed) {
          return
        }

        applyServiceLogMessage(parsed, {
          fallbackTail: requestedTail,
          handleServiceNotFound: (apiError) =>
            handleServiceNotFound(apiError, selectedServiceName),
          setLatestError,
          setLogs,
        })

        if (
          parsed.type === "service_log_error" ||
          parsed.type === "service_log_stream_ended"
        ) {
          terminalMessageSeen = true
        }
      })

      socket.addEventListener("close", () => {
        socket = null

        if (disposed || terminalMessageSeen) {
          return
        }

        if (!socketOpened) {
          setLogs((current) => ({
            ...current,
            loading: current.loadedAt === null,
            refreshing: current.loadedAt !== null,
            status: "fallback",
            streamReason: "服务日志实时连接被关闭，正在尝试一次 REST 回退。",
          }))
          void loadRestFallback()
          return
        }

        setLogs((current) => ({
          ...current,
          endedAt: new Date().toISOString(),
          loading: false,
          refreshing: false,
          status: "ended",
          streamReason: "服务日志实时连接已关闭，可手动重新连接。",
        }))
      })

      socket.addEventListener("error", () => {
        socket?.close()
      })
    }

    connectLogs()

    return () => {
      disposed = true
      fallbackController?.abort()
      socket?.close()
    }
  }, [
    client,
    baseUrl,
    logOptions.stderr,
    logOptions.stdout,
    logOptions.tail,
    logOptions.timestamps,
    logsRefreshIndex,
    serviceName,
    hasToken,
    handleServiceNotFound,
    setLatestError,
    token,
  ])

  useEffect(() => {
    if (!serviceName) {
      setStats(initialRequestState)
      return
    }

    if (!hasToken) {
      setStats({
        data: null,
        error: AUTH_REQUIRED_ERROR,
        loading: false,
        refreshing: false,
        loadedAt: null,
      })
      return
    }

    const selectedServiceName = serviceName
    const controller = new AbortController()
    let disposed = false

    setStats((current) => ({
      ...current,
      error: null,
      loading: current.loadedAt === null,
      refreshing: current.loadedAt !== null,
    }))

    async function loadStats() {
      try {
        const response = await client.getServiceStats(
          selectedServiceName,
          controller.signal,
        )

        if (disposed) {
          return
        }

        setStats({
          data: response,
          error: null,
          loading: false,
          refreshing: false,
          loadedAt: new Date().toISOString(),
        })
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        handleServiceNotFound(apiError, selectedServiceName)
        setStats((current) => ({
          ...current,
          error: apiError,
          loading: false,
          refreshing: false,
        }))
      }
    }

    void loadStats()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    client,
    baseUrl,
    handleServiceNotFound,
    hasToken,
    serviceName,
    statsRefreshIndex,
    token,
  ])

  return {
    detail,
    logs,
    stats,
    restart,
    refreshDetail,
    refreshLogs,
    refreshStats,
    restartHard,
  }
}

function replaceServiceStatus(
  services: ServiceStatus[],
  nextService: ServiceStatus,
): ServiceStatus[] {
  const existingIndex = services.findIndex(
    (service) => service.service_name === nextService.service_name,
  )

  if (existingIndex === -1) {
    return [nextService, ...services]
  }

  return services.map((service, index) =>
    index === existingIndex ? nextService : service,
  )
}

function isRecoverableConnection(status: string) {
  return status === "connected" || status === "fallback" || status === "live"
}

interface ApplyServiceLogMessageContext {
  fallbackTail: number
  handleServiceNotFound: (error: ApiError) => void
  setLatestError: (error: ApiError | null) => void
  setLogs: Dispatch<SetStateAction<ServiceLogsState>>
}

function applyServiceLogMessage(
  message: ServiceLogWebSocketMessage,
  {
    fallbackTail,
    handleServiceNotFound,
    setLatestError,
    setLogs,
  }: ApplyServiceLogMessageContext,
) {
  if (message.type === "service_log_opened") {
    const acceptedTail = normalizeServiceLogBufferLimit(
      message.tail,
      fallbackTail,
    )
    const openedAt = message.time || new Date().toISOString()

    setLatestError(null)
    setLogs((current) => ({
      ...current,
      acceptedTail,
      data: {
        service: message.service,
        container_name: message.container_name,
        tail: acceptedTail,
        lines: trimServiceLogLines(current.data?.lines ?? [], acceptedTail),
      },
      endedAt: null,
      error: null,
      lastLineAt: null,
      loadedAt: openedAt,
      loading: false,
      openedAt,
      refreshing: false,
      status: "live",
      streamReason: null,
    }))
    return
  }

  if (message.type === "service_log_line") {
    const lineAt = message.time || new Date().toISOString()

    setLogs((current) => {
      const acceptedTail = normalizeServiceLogBufferLimit(
        current.acceptedTail,
        fallbackTail,
      )

      return {
        ...current,
        acceptedTail,
        data: {
          service: current.data?.service ?? message.service,
          container_name: current.data?.container_name ?? message.container_name,
          tail: acceptedTail,
          lines: appendBoundedServiceLogLine(
            current.data?.lines ?? [],
            message.line,
            acceptedTail,
          ),
        },
        error: null,
        lastLineAt: lineAt,
        loadedAt: current.loadedAt ?? lineAt,
        loading: false,
        refreshing: false,
        status: "live",
        streamReason: null,
      }
    })
    return
  }

  if (message.type === "service_log_error") {
    const apiError: ApiError = {
      code: message.code,
      message: message.message,
    }
    const endedAt = message.time || new Date().toISOString()

    handleServiceNotFound(apiError)
    setLatestError(apiError)
    setLogs((current) => ({
      ...current,
      endedAt,
      error: apiError,
      loading: false,
      refreshing: false,
      status: apiError.code === "auth_required" ? "auth_required" : "error",
      streamReason: "后端报告服务日志流错误，已停止实时追加。",
    }))
    return
  }

  const endedAt = message.time || new Date().toISOString()

  setLogs((current) => ({
    ...current,
    endedAt,
    loading: false,
    refreshing: false,
    status: "ended",
    streamReason: message.reason,
  }))
}
