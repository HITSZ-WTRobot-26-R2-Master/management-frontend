import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import {
  AUTH_REQUIRED_ERROR,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
} from "@/lib/management-api"
import {
  isServiceNotFoundError,
  removeStaleServiceStatus,
} from "@/lib/service-not-found-recovery"
import {
  authTokenAtom,
  baseUrlAtom,
  latestErrorAtom,
  managementApiClientAtom,
  selectedServiceNameAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  RestartResponse,
  ServiceLogsResponse,
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

export interface SelectedServiceDiagnosticsState {
  detail: RequestState<ServiceStatus>
  logs: RequestState<ServiceLogsResponse>
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

export function useSelectedServiceDiagnostics(
  serviceName: string | null,
  logOptions: ServiceLogOptions,
  onServiceNotFound: () => void,
): SelectedServiceDiagnosticsState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const client = useAtomValue(managementApiClientAtom)
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
  const [logs, setLogs] =
    useState<RequestState<ServiceLogsResponse>>(initialRequestState)
  const [stats, setStats] =
    useState<RequestState<ServiceStats>>(initialRequestState)
  const [restart, setRestart] = useState<RestartState>(initialRestartState)

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
    setLogs(initialRequestState)
    setStats(initialRequestState)
    setRestart(initialRestartState)
  }, [serviceName])

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
      setLogs(initialRequestState)
      return
    }

    if (!hasToken) {
      setLogs({
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

    setLogs((current) => ({
      ...current,
      error: null,
      loading: current.loadedAt === null,
      refreshing: current.loadedAt !== null,
    }))

    async function loadLogs() {
      try {
        const response = await client.getServiceLogs(selectedServiceName, {
          tail: logOptions.tail,
          stdout: logOptions.stdout,
          stderr: logOptions.stderr,
          timestamps: logOptions.timestamps,
          signal: controller.signal,
        })

        if (disposed) {
          return
        }

        setLogs({
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
        setLogs((current) => ({
          ...current,
          error: apiError,
          loading: false,
          refreshing: false,
        }))
      }
    }

    void loadLogs()

    return () => {
      disposed = true
      controller.abort()
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
