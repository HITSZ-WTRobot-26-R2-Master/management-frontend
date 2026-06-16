import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AUTH_REQUIRED_ERROR,
  buildDashboardWebSocketUrl,
  getApiError,
  hasManagementAuthToken,
  isAbortError,
  isManagementAuthError,
  parseDashboardStreamMessage,
} from "@/lib/management-api"
import { applyServiceSummaryUpdates } from "@/lib/dashboard-service-summary"
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
  ChassisStateSnapshot,
  ConnectionStatus,
  DashboardCompactWebSocketMessage,
  DashboardSnapshotMessage,
  LaserStatusSnapshot,
  ManagementEvent,
  MasterControlPoseMessage,
  OdinOdometryPoseMessage,
  PoseSourceSnapshot,
} from "@/types/management"

const maxRecentEvents = 200
const maxReconnectAttempts = 8
const baseReconnectDelayMs = 1_000
const maxReconnectDelayMs = 30_000
const maxDashboardSnapshotAgeMs = 10_000

export type DashboardPanelStreamStatus =
  | "auth_required"
  | "connecting"
  | "live"
  | "fallback"
  | "error"

export interface ChassisStateStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: ChassisStateSnapshot | null
  status: DashboardPanelStreamStatus
}

export interface MasterControlPoseStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: PoseSourceSnapshot<MasterControlPoseMessage> | null
  status: DashboardPanelStreamStatus
}

export interface LaserStatusStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: LaserStatusSnapshot | null
  status: DashboardPanelStreamStatus
}

export interface OdinBasePoseStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: PoseSourceSnapshot<MasterControlPoseMessage> | null
  status: DashboardPanelStreamStatus
}

export interface LaserPoseStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: PoseSourceSnapshot<MasterControlPoseMessage> | null
  status: DashboardPanelStreamStatus
}

export interface OdinOdometryStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: PoseSourceSnapshot<OdinOdometryPoseMessage> | null
  status: DashboardPanelStreamStatus
}

interface DashboardStreamInternalState {
  chassisState: ChassisStateSnapshot | null
  error: ApiError | null
  fallbackRefreshAt: string | null
  lastSnapshotAt: string | null
  laserPose: PoseSourceSnapshot<MasterControlPoseMessage> | null
  laserStatus: LaserStatusSnapshot | null
  loadedRecentAt: string | null
  masterControlPose: PoseSourceSnapshot<MasterControlPoseMessage> | null
  odinBasePose: PoseSourceSnapshot<MasterControlPoseMessage> | null
  odinOdometry: PoseSourceSnapshot<OdinOdometryPoseMessage> | null
  status: DashboardPanelStreamStatus
}

export interface DashboardStreamState {
  chassisStateStream: ChassisStateStreamState
  error: ApiError | null
  fallbackRefreshAt: string | null
  laserPoseStream: LaserPoseStreamState
  laserStatusStream: LaserStatusStreamState
  lastSnapshotAt: string | null
  loadedRecentAt: string | null
  masterControlPoseStream: MasterControlPoseStreamState
  odinBasePoseStream: OdinBasePoseStreamState
  odinOdometryStream: OdinOdometryStreamState
  refreshDashboard: () => void
  refreshRecent: () => void
  status: DashboardPanelStreamStatus
}

export function useDashboardStream(): DashboardStreamState {
  const baseUrl = useAtomValue(baseUrlAtom)
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const setConnectionState = useSetAtom(connectionStateAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const setRecentEvents = useSetAtom(recentEventsAtom)
  const setServiceStatuses = useSetAtom(serviceStatusesAtom)
  const fallbackInFlightRef = useRef(false)
  const latestSeqRef = useRef({
    chassis: -1,
    error: -1,
    laser: -1,
    laserPose: -1,
    odin: -1,
    odinBase: -1,
    pose: -1,
    services: -1,
    snapshot: -1,
  })
  const [recentRefreshIndex, setRecentRefreshIndex] = useState(0)
  const [dashboardRefreshIndex, setDashboardRefreshIndex] = useState(0)
  const [state, setState] = useState<DashboardStreamInternalState>({
    chassisState: null,
    error: null,
    fallbackRefreshAt: null,
    laserPose: null,
    laserStatus: null,
    lastSnapshotAt: null,
    loadedRecentAt: null,
    masterControlPose: null,
    odinBasePose: null,
    odinOdometry: null,
    status: "auth_required",
  })
  const refreshRecent = useCallback(() => {
    setRecentRefreshIndex((current) => current + 1)
  }, [])
  const refreshDashboard = useCallback(() => {
    setDashboardRefreshIndex((current) => current + 1)
  }, [])
  const hasToken = hasManagementAuthToken(token)

  useEffect(() => {
    if (!hasToken) {
      setRecentEvents([])
      setState((current) => ({
        ...current,
        error: AUTH_REQUIRED_ERROR,
        loadedRecentAt: null,
      }))
      return
    }

    const controller = new AbortController()
    let disposed = false

    async function loadRecentEvents() {
      try {
        const events = await client.listRecentEvents(controller.signal)

        if (disposed) {
          return
        }

        setRecentEvents(boundEvents(events))
        setState((current) => ({
          ...current,
          loadedRecentAt: new Date().toISOString(),
        }))
      } catch (error) {
        if (disposed || isAbortError(error)) {
          return
        }

        setLatestError(getApiError(error))
      }
    }

    void loadRecentEvents()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [client, hasToken, recentRefreshIndex, setLatestError, setRecentEvents])

  useEffect(() => {
    if (!hasToken) {
      latestSeqRef.current = initialDashboardSeqState()
      setServiceStatuses([])
      setConnectionState({
        status: "auth_required",
        checked_at: new Date().toISOString(),
        retry_attempt: 0,
        next_retry_at: null,
      })
      setLatestError(null)
      setState((current) => ({
        ...current,
        chassisState: null,
        error: AUTH_REQUIRED_ERROR,
        fallbackRefreshAt: null,
        laserPose: null,
        laserStatus: null,
        lastSnapshotAt: null,
        masterControlPose: null,
        odinBasePose: null,
        odinOdometry: null,
        status: "auth_required",
      }))
      return
    }

    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let fallbackController: AbortController | null = null
    let retryAttempt = 0
    latestSeqRef.current = initialDashboardSeqState()

    const applyDashboardSnapshot = (
      message: DashboardSnapshotMessage,
      options: { requireFresh: boolean; status: DashboardPanelStreamStatus },
    ) => {
      if (message.seq <= latestSeqRef.current.snapshot) {
        return true
      }

      if (options.requireFresh && isDashboardSnapshotTooOld(message.time)) {
        const apiError: ApiError = {
          code: "request_failed",
          message: "仪表盘实时快照延迟过高，正在重连",
        }
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
          status: "error",
        }))
        return false
      }

      latestSeqRef.current = {
        chassis: message.seq,
        error: latestSeqRef.current.error,
        laser: message.seq,
        laserPose: message.seq,
        odin: message.seq,
        odinBase: message.seq,
        pose: message.seq,
        services: message.seq,
        snapshot: message.seq,
      }
      const receivedAt = new Date().toISOString()
      setServiceStatuses(message.snapshot.services)
      setLatestError(null)
      setConnectionState((current) => ({
        ...current,
        status: options.status === "fallback" ? "fallback" : "live",
        checked_at: receivedAt,
        last_event_at: receivedAt,
        next_retry_at: null,
        retry_attempt: 0,
      }))
      setState((current) => ({
        ...current,
        chassisState: message.snapshot.chassis_state,
        error: null,
        laserPose: message.snapshot.laser_pose,
        laserStatus: message.snapshot.laser_status,
        lastSnapshotAt: message.time,
        masterControlPose: message.snapshot.master_control_pose
          ? {
              available: message.snapshot.master_control_pose.available,
              topic: message.snapshot.master_control_pose.topic,
              received_at: message.snapshot.master_control_pose.received_at,
              message: message.snapshot.master_control_pose.message ?? null,
            }
          : null,
        odinBasePose: message.snapshot.odin_base_pose,
        odinOdometry: message.snapshot.odin_odometry,
        status: options.status,
      }))
      return true
    }

    const applyDashboardCompactMessage = (
      message: DashboardCompactWebSocketMessage,
      options: { requireFresh: boolean; status: DashboardPanelStreamStatus },
    ) => {
      if (message.type === "dashboard_error") {
        if (message.seq <= latestSeqRef.current.error) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          error: message.seq,
        }
        const apiError: ApiError = {
          code: message.code,
          message: message.message,
        }
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
          status: "error",
        }))
        return true
      }

      if (options.requireFresh && isDashboardSnapshotTooOld(message.time)) {
        const apiError: ApiError = {
          code: "request_failed",
          message: "仪表盘实时快照延迟过高，正在重连",
        }
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
          status: "error",
        }))
        return false
      }

      const receivedAt = new Date().toISOString()
      setLatestError(null)
      setConnectionState((current) => ({
        ...current,
        status: options.status === "fallback" ? "fallback" : "live",
        checked_at: receivedAt,
        last_event_at: receivedAt,
        next_retry_at: null,
        retry_attempt: 0,
      }))

      if (message.type === "dashboard_services") {
        if (message.seq <= latestSeqRef.current.services) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          services: message.seq,
        }
        setServiceStatuses((current) =>
          applyServiceSummaryUpdates(current, message.services),
        )
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_chassis") {
        if (message.seq <= latestSeqRef.current.chassis) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          chassis: message.seq,
        }
        setState((current) => ({
          ...current,
          chassisState: message.chassis_state,
          error: null,
          lastSnapshotAt: message.time,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_pose") {
        if (message.seq <= latestSeqRef.current.pose) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          pose: message.seq,
        }
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          masterControlPose: message.master_control_pose,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_odin") {
        if (message.seq <= latestSeqRef.current.odin) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          odin: message.seq,
        }
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          odinOdometry: message.odin_odometry,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_odin_base") {
        if (message.seq <= latestSeqRef.current.odinBase) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          odinBase: message.seq,
        }
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          odinBasePose: message.odin_base_pose,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_laser_pose") {
        if (message.seq <= latestSeqRef.current.laserPose) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          laserPose: message.seq,
        }
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          laserPose: message.laser_pose,
          status: options.status,
        }))
        return true
      }

      if (message.type === "dashboard_laser") {
        if (message.seq <= latestSeqRef.current.laser) {
          return true
        }
        latestSeqRef.current = {
          ...latestSeqRef.current,
          laser: message.seq,
        }
        setState((current) => ({
          ...current,
          error: null,
          lastSnapshotAt: message.time,
          laserStatus: message.laser_status,
          status: options.status,
        }))
        return true
      }

      return true
    }

    const refreshFallback = async (): Promise<ApiError | null> => {
      if (fallbackInFlightRef.current) {
        return null
      }

      const controller = new AbortController()
      fallbackController = controller
      fallbackInFlightRef.current = true
      try {
        const message = await client.getDashboard(controller.signal)

        if (disposed) {
          return null
        }

        const fallbackAt = new Date().toISOString()
        if (message.type === "dashboard_snapshot") {
          applyDashboardSnapshot(message, {
            requireFresh: false,
            status: "fallback",
          })
        } else {
          const apiError: ApiError = {
            code: message.code,
            message: message.message,
          }
          setLatestError(apiError)
          setState((current) => ({
            ...current,
            error: apiError,
            status: "error",
          }))
          return apiError
        }

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
          status: isManagementAuthError(apiError) ? "auth_required" : "error",
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
        setState((current) => ({
          ...current,
          status: "fallback",
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
      setState((current) => ({
        ...current,
        status: "connecting",
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
        url = buildDashboardWebSocketUrl(baseUrl, token)
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
          status: "error",
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
      setState((current) => ({
        ...current,
        error: null,
        status: "connecting",
      }))

      try {
        socket = new WebSocket(url)
      } catch {
        const apiError: ApiError = {
          code: "request_failed",
          message: "无法打开仪表盘实时流",
        }
        setLatestError(apiError)
        setState((current) => ({
          ...current,
          error: apiError,
          status: "error",
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
          status: "live",
        }))
      })

      socket.addEventListener("message", (message) => {
        if (disposed) {
          return
        }

        const parsed = parseDashboardSocketMessage(message.data)
        if (!parsed) {
          return
        }

        if (parsed.type === "dashboard_snapshot") {
          const accepted = applyDashboardSnapshot(parsed, {
            requireFresh: true,
            status: "live",
          })
          if (!accepted) {
            socket?.close()
          }
          return
        }

        const accepted = applyDashboardCompactMessage(parsed, {
          requireFresh: true,
          status: "live",
        })
        if (!accepted) {
          socket?.close()
        }
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
    dashboardRefreshIndex,
    hasToken,
    setConnectionState,
    setLatestError,
    setServiceStatuses,
    token,
  ])

  const chassisStateStream = useMemo<ChassisStateStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.chassisState,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.chassisState,
      state.error,
      state.lastSnapshotAt,
      state.status,
    ],
  )
  const masterControlPoseStream = useMemo<MasterControlPoseStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.masterControlPose,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.error,
      state.lastSnapshotAt,
      state.masterControlPose,
      state.status,
    ],
  )
  const odinOdometryStream = useMemo<OdinOdometryStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.odinOdometry,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.error,
      state.lastSnapshotAt,
      state.odinOdometry,
      state.status,
    ],
  )
  const odinBasePoseStream = useMemo<OdinBasePoseStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.odinBasePose,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.error,
      state.lastSnapshotAt,
      state.odinBasePose,
      state.status,
    ],
  )
  const laserPoseStream = useMemo<LaserPoseStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.laserPose,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.error,
      state.lastSnapshotAt,
      state.laserPose,
      state.status,
    ],
  )
  const laserStatusStream = useMemo<LaserStatusStreamState>(
    () => ({
      error: state.error,
      lastMessageAt: state.lastSnapshotAt,
      refresh: refreshDashboard,
      snapshot: state.laserStatus,
      status: state.status,
    }),
    [
      refreshDashboard,
      state.error,
      state.lastSnapshotAt,
      state.laserStatus,
      state.status,
    ],
  )

  return {
    chassisStateStream,
    error: state.error,
    fallbackRefreshAt: state.fallbackRefreshAt,
    laserPoseStream,
    laserStatusStream,
    lastSnapshotAt: state.lastSnapshotAt,
    loadedRecentAt: state.loadedRecentAt,
    masterControlPoseStream,
    odinBasePoseStream,
    odinOdometryStream,
    refreshDashboard,
    refreshRecent,
    status: state.status,
  }
}

function parseDashboardSocketMessage(data: unknown) {
  if (typeof data !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(data) as unknown
    return parseDashboardStreamMessage(parsed)
  } catch {
    return null
  }
}

function initialDashboardSeqState() {
  return {
    chassis: -1,
    error: -1,
    laser: -1,
    laserPose: -1,
    odin: -1,
    odinBase: -1,
    pose: -1,
    services: -1,
    snapshot: -1,
  }
}

function isDashboardSnapshotTooOld(time: string) {
  const parsed = Date.parse(time)
  if (!Number.isFinite(parsed)) {
    return true
  }

  return Date.now() - parsed > maxDashboardSnapshotAgeMs
}

function boundEvents(events: ManagementEvent[]) {
  return events.slice(-maxRecentEvents)
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
