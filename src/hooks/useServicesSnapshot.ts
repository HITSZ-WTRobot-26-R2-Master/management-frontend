import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import {
  AUTH_REQUIRED_ERROR,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
  isManagementAuthError,
} from "@/lib/management-api"
import {
  authTokenAtom,
  connectionStateAtom,
  latestErrorAtom,
  managementApiClientAtom,
  serviceDefinitionsAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  ApiErrorCode,
  ConnectionStatus,
  ServiceDefinition,
} from "@/types/management"

interface ServicesSnapshotState {
  loading: boolean
  refreshing: boolean
  error: ApiError | null
  definitionsError: ApiError | null
  lastLoadedAt: string | null
  refresh: () => void
}

export function useServicesSnapshot(): ServicesSnapshotState {
  const client = useAtomValue(managementApiClientAtom)
  const token = useAtomValue(authTokenAtom)
  const setServiceStatuses = useSetAtom(serviceStatusesAtom)
  const setServiceDefinitions = useSetAtom(serviceDefinitionsAtom)
  const setConnectionState = useSetAtom(connectionStateAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [state, setState] = useState<Omit<ServicesSnapshotState, "refresh">>({
    loading: true,
    refreshing: false,
    error: null,
    definitionsError: null,
    lastLoadedAt: null,
  })

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1)
  }, [])
  const hasToken = hasManagementAuthToken(token)

  useEffect(() => {
    if (!hasToken) {
      setServiceStatuses([])
      setServiceDefinitions([])
      setLatestError(null)
      setConnectionState(toConnectionState("auth_required"))
      setState({
        loading: false,
        refreshing: false,
        error: AUTH_REQUIRED_ERROR,
        definitionsError: null,
        lastLoadedAt: null,
      })
      return
    }

    const controller = new AbortController()
    let disposed = false

    setState((current) => ({
      ...current,
      loading: current.lastLoadedAt === null,
      refreshing: current.lastLoadedAt !== null,
      error: null,
    }))
    setConnectionState((current) => {
      if (
        current.status === "live" ||
        current.status === "stream_connecting" ||
        current.status === "reconnecting" ||
        current.status === "fallback"
      ) {
        return current
      }

      return {
        status: "checking",
        checked_at: null,
      }
    })

    async function loadSnapshot() {
      const [dashboardResult, definitionsResult] = await Promise.allSettled([
        client.getDashboard(controller.signal),
        client.listServiceDefinitions(controller.signal),
      ])

      if (disposed) {
        return
      }

      if (dashboardResult.status === "rejected") {
        if (isAbortError(dashboardResult.reason)) {
          return
        }

        const apiError = getApiError(dashboardResult.reason)
        setServiceStatuses([])
        setServiceDefinitions([])
        setLatestError(apiError)
        setConnectionState(toConnectionState(getConnectionStatus(apiError)))
        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: apiError,
        }))
        return
      }

      if (dashboardResult.value.type === "dashboard_error") {
        const apiError = {
          code: dashboardResult.value.code as ApiErrorCode,
          message: dashboardResult.value.message,
        }
        setServiceStatuses([])
        setServiceDefinitions([])
        setLatestError(apiError)
        setConnectionState(toConnectionState(getConnectionStatus(apiError)))
        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: apiError,
        }))
        return
      }

      const nextDefinitions = resolveDefinitions(definitionsResult)
      const definitionsError =
        definitionsResult.status === "rejected" &&
        !isAbortError(definitionsResult.reason)
          ? getApiError(definitionsResult.reason)
          : null
      const loadedAt = new Date().toISOString()

      setServiceStatuses(dashboardResult.value.snapshot.services)
      setServiceDefinitions(nextDefinitions)
      setLatestError(null)
      setConnectionState((current) => {
        if (
          current.status === "live" ||
          current.status === "stream_connecting" ||
          current.status === "reconnecting" ||
          current.status === "fallback"
        ) {
          return current
        }

        return toConnectionState("connected")
      })
      setState({
        loading: false,
        refreshing: false,
        error: null,
        definitionsError,
        lastLoadedAt: loadedAt,
      })
    }

    void loadSnapshot()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    client,
    hasToken,
    refreshIndex,
    setConnectionState,
    setLatestError,
    setServiceDefinitions,
    setServiceStatuses,
    token,
  ])

  return {
    ...state,
    refresh,
  }
}

function resolveDefinitions(
  result: PromiseSettledResult<ServiceDefinition[]>,
): ServiceDefinition[] {
  if (result.status === "fulfilled") {
    return result.value
  }

  return []
}

function toConnectionState(status: ConnectionStatus) {
  return {
    status,
    checked_at: new Date().toISOString(),
  }
}

function getConnectionStatus(error: ApiError): ConnectionStatus {
  if (isManagementAuthError(error)) {
    return error.code
  }

  return "error"
}
