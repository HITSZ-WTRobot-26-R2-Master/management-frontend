import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useState } from "react"
import { getApiError } from "@/lib/management-api"
import {
  commandsAtom,
  latestErrorAtom,
  managementApiClientAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  CommandDefinition,
  CommandResponse,
  JsonObject,
} from "@/types/management"

export interface ResetOriginPayload {
  pose_x: number
  pose_y: number
  pose_z: number
  pose_yaw_deg: number
  reason: string
}

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

export interface CommandDiscoveryResult {
  discovery: CommandDiscoveryState
  submission: CommandSubmissionState
  refresh: () => void
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

export function useCommandDiscovery(): CommandDiscoveryResult {
  const client = useAtomValue(managementApiClientAtom)
  const setCommands = useSetAtom(commandsAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [discovery, setDiscovery] = useState<CommandDiscoveryState>(
    initialDiscoveryState,
  )
  const [submission, setSubmission] = useState<CommandSubmissionState>(
    initialSubmissionState,
  )

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1)
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
  }, [client, refreshIndex, setCommands, setLatestError])

  const submitResetOrigin = useCallback(
    async (
      command: CommandDefinition,
      payload: ResetOriginPayload,
      confirm: boolean,
    ) => {
      if (!isResetOriginCommand(command)) {
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
    [client, handleSubmissionError, setLatestError],
  )

  return {
    discovery,
    submission,
    refresh,
    submitResetOrigin,
  }
}

export function isResetOriginCommand(command: CommandDefinition) {
  return (
    command.target === "lidar_pose_publisher" &&
    command.name === "reset_origin"
  )
}

function toResetOriginJsonPayload(payload: ResetOriginPayload): JsonObject {
  return {
    pose_x: payload.pose_x,
    pose_y: payload.pose_y,
    pose_z: payload.pose_z,
    pose_yaw_deg: payload.pose_yaw_deg,
    reason: payload.reason.trim(),
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}
