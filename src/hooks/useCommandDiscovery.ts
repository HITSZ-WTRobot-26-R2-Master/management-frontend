import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import {
  AUTH_REQUIRED_ERROR,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
} from "@/lib/management-api"
import { toResetOriginJsonPayload } from "@/lib/reset-origin-payload"
import {
  authTokenAtom,
  baseUrlAtom,
  commandsAtom,
  latestErrorAtom,
  managementApiClientAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  CommandDefinition,
  CommandResponse,
  ResetOriginPreset,
} from "@/types/management"
import type { ResetOriginPayload } from "@/lib/reset-origin-payload"

export type { ResetOriginPayload } from "@/lib/reset-origin-payload"

export interface CommandDiscoveryState {
  commands: CommandDefinition[]
  error: ApiError | null
  lastLoadedAt: string | null
  loading: boolean
  refreshing: boolean
}

export interface CommandSubmissionState {
  error: ApiError | null
  response: CommandResponse | null
  submitting: boolean
}

export interface ResetOriginPresetState {
  error: ApiError | null
  lastLoadedAt: string | null
  loading: boolean
  presets: ResetOriginPreset[]
  refreshing: boolean
}

export interface CommandDiscoveryResult {
  discovery: CommandDiscoveryState
  resetOriginPresets: ResetOriginPresetState
  submission: CommandSubmissionState
  refresh: () => void
  refreshPresets: () => void
  submitResetOrigin: (
    command: CommandDefinition,
    payload: ResetOriginPayload,
    confirm: boolean,
  ) => Promise<CommandResponse | null>
}

const initialDiscoveryState = {
  commands: [],
  error: null,
  lastLoadedAt: null,
  loading: true,
  refreshing: false,
} satisfies CommandDiscoveryState

const initialSubmissionState = {
  error: null,
  response: null,
  submitting: false,
} satisfies CommandSubmissionState

const initialResetOriginPresetState = {
  error: null,
  lastLoadedAt: null,
  loading: true,
  presets: [],
  refreshing: false,
} satisfies ResetOriginPresetState

export function useCommandDiscovery(): CommandDiscoveryResult {
  const baseUrl = useAtomValue(baseUrlAtom)
  const client = useAtomValue(managementApiClientAtom)
  const token = useAtomValue(authTokenAtom)
  const setCommands = useSetAtom(commandsAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [presetRefreshIndex, setPresetRefreshIndex] = useState(0)
  const [discovery, setDiscovery] = useState<CommandDiscoveryState>(
    initialDiscoveryState,
  )
  const [resetOriginPresets, setResetOriginPresets] =
    useState<ResetOriginPresetState>(initialResetOriginPresetState)
  const [submission, setSubmission] = useState<CommandSubmissionState>(
    initialSubmissionState,
  )
  const hasToken = hasManagementAuthToken(token)

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1)
    setPresetRefreshIndex((current) => current + 1)
  }, [])

  const refreshPresets = useCallback(() => {
    setPresetRefreshIndex((current) => current + 1)
  }, [])

  const handleSubmissionError = useCallback(
    (apiError: ApiError) => {
      setSubmission({
        error: apiError,
        response: null,
        submitting: false,
      })
      setLatestError(apiError)

      if (apiError.code === "command_not_found") {
        refresh()
      }
    },
    [refresh, setLatestError],
  )

  useEffect(() => {
    if (!hasToken) {
      setCommands([])
      setDiscovery({
        commands: [],
        error: AUTH_REQUIRED_ERROR,
        lastLoadedAt: null,
        loading: false,
        refreshing: false,
      })
      return
    }

    const controller = new AbortController()
    let disposed = false

    setDiscovery((current) => ({
      ...current,
      error: null,
      loading: current.lastLoadedAt === null,
      refreshing: current.lastLoadedAt !== null,
    }))

    async function loadCommands() {
      try {
        const commands = await client.listCommands(controller.signal)

        if (disposed) {
          return
        }

        setCommands(commands)
        setLatestError(null)
        setDiscovery({
          commands,
          error: null,
          lastLoadedAt: new Date().toISOString(),
          loading: false,
          refreshing: false,
        })
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        setCommands([])
        setLatestError(apiError)
        setDiscovery((current) => ({
          ...current,
          commands: [],
          error: apiError,
          loading: false,
          refreshing: false,
        }))
      }
    }

    void loadCommands()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    baseUrl,
    client,
    hasToken,
    refreshIndex,
    setCommands,
    setLatestError,
    token,
  ])

  useEffect(() => {
    if (!hasToken) {
      setResetOriginPresets({
        error: AUTH_REQUIRED_ERROR,
        lastLoadedAt: null,
        loading: false,
        presets: [],
        refreshing: false,
      })
      return
    }

    const controller = new AbortController()
    let disposed = false

    setResetOriginPresets((current) => ({
      ...current,
      error: null,
      loading: current.lastLoadedAt === null,
      refreshing: current.lastLoadedAt !== null,
    }))

    async function loadResetOriginPresets() {
      try {
        const presets = await client.listResetOriginPresets(controller.signal)

        if (disposed) {
          return
        }

        setLatestError(null)
        setResetOriginPresets({
          error: null,
          lastLoadedAt: new Date().toISOString(),
          loading: false,
          presets,
          refreshing: false,
        })
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        const apiError = getApiError(error)
        setLatestError(apiError)
        setResetOriginPresets((current) => ({
          ...current,
          error: apiError,
          loading: false,
          presets: [],
          refreshing: false,
        }))
      }
    }

    void loadResetOriginPresets()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [
    baseUrl,
    client,
    hasToken,
    presetRefreshIndex,
    setLatestError,
    token,
  ])

  const submitResetOrigin = useCallback(
    async (
      command: CommandDefinition,
      payload: ResetOriginPayload,
      confirm: boolean,
    ) => {
      if (!isResetOriginCommand(command)) {
        return null
      }

      if (!hasToken) {
        setSubmission({
          error: AUTH_REQUIRED_ERROR,
          response: null,
          submitting: false,
        })
        setLatestError(AUTH_REQUIRED_ERROR)
        return null
      }

      setSubmission((current) => ({
        ...current,
        error: null,
        submitting: true,
      }))

      const requestPayload = toResetOriginJsonPayload(payload)

      try {
        const response = await client.submitCommand({
          target: command.target,
          command: command.name,
          payload: requestPayload,
          confirm,
        })

        setLatestError(null)
        setSubmission({
          error: null,
          response,
          submitting: false,
        })

        return response
      } catch (error) {
        if (isAbortError(error)) {
          return null
        }

        const apiError = getApiError(error)

        handleSubmissionError(apiError)
        return null
      }
    },
    [client, handleSubmissionError, hasToken, setLatestError],
  )

  return {
    discovery,
    resetOriginPresets,
    submission,
    refresh,
    refreshPresets,
    submitResetOrigin,
  }
}

export function isResetOriginCommand(command: CommandDefinition) {
  return (
    command.target === "lidar_pose_publisher" &&
    command.name === "reset_origin"
  )
}
