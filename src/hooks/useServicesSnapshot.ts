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
  baseUrlAtom,
  connectionStateAtom,
  latestErrorAtom,
  managementApiClientAtom,
  serviceDefinitionsAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
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
  const baseUrl = useAtomValue(baseUrlAtom)
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
      const [servicesResult, definitionsResult] = await Promise.allSettled([
        client.listServices(controller.signal),
        client.listServiceDefinitions(controller.signal),
      ])

      if (disposed) {
        return
      }

      if (servicesResult.status === "rejected") {
        if (isAbortError(servicesResult.reason)) {
          return
        }

        const apiError = getApiError(servicesResult.reason)
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

      setServiceStatuses(servicesResult.value)
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
    baseUrl,
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
