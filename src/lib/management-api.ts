import type {
  ApiError,
  ChassisStateSnapshot,
  CommandDefinition,
  CommandRequest,
  CommandResponse,
  ConnectionState,
  DashboardCompactWebSocketMessage,
  DashboardSnapshot,
  DashboardStreamMessage,
  DashboardWebSocketMessage,
  DockerState,
  DockerStatus,
  HealthResponse,
  ManagementEvent,
  MasterControlPoseMessage,
  MasterControlPoseSnapshot,
  OdinOdometryPoseMessage,
  OverallLevel,
  OverallStatus,
  PoseSourceSnapshot,
  RestartRequest,
  RestartResponse,
  ResetOriginPreset,
  RosDiagnosticStatus,
  RosExpectedNode,
  RosStatus,
  RosTopicFreshness,
  RosTopicStatus,
  ServiceSummaryUpdate,
  ServiceDefinition,
  ServiceLogsResponse,
  ServiceRiskLevel,
  ServiceStats,
  ServiceStatus,
} from "@/types/management"
import { DEFAULT_SERVICE_LOG_TAIL } from "@/lib/service-log-stream"

export const DEFAULT_MANAGEMENT_BASE_URL = "/management-api"

export const AUTH_REQUIRED_ERROR = {
  code: "auth_required",
  message: "管理后端需要认证",
} satisfies ApiError

const dockerStates = [
  "running",
  "created",
  "restarting",
  "paused",
  "exited",
  "dead",
  "missing",
  "unknown",
] as const

const overallLevels = ["ok", "warning", "error", "unknown"] as const

const serviceRiskLevels = ["low", "medium", "high", "critical"] as const

export class ManagementApiError extends Error {
  readonly apiError: ApiError
  readonly status: number | null

  constructor(apiError: ApiError, status: number | null = null) {
    super(apiError.message)
    this.name = "ManagementApiError"
    this.apiError = apiError
    this.status = status
  }

  get code() {
    return this.apiError.code
  }
}

export interface ManagementApiClientOptions {
  baseUrl?: string
  token?: string
  fetchImpl?: typeof fetch
}

interface RequestOptions {
  method?: "GET" | "POST"
  body?: unknown
  signal?: AbortSignal
}

interface RequestErrorContext {
  baseUrl: string
  method: string
  requestUrl: string
}

interface ServiceLogWebSocketOptions {
  tail?: number
  stdout?: boolean
  stderr?: boolean
  timestamps?: boolean
}

type Validator<T> = (value: unknown) => value is T

export class ManagementApiClient {
  readonly baseUrl: string
  readonly token: string

  private readonly fetchImpl: typeof fetch

  constructor({
    baseUrl = DEFAULT_MANAGEMENT_BASE_URL,
    token = "",
    fetchImpl = fetch,
  }: ManagementApiClientOptions = {}) {
    this.baseUrl = baseUrl
    this.token = token
    this.fetchImpl = (input, init) => fetchImpl.call(globalThis, input, init)
  }

  getHealth(signal?: AbortSignal) {
    return this.request("/healthz", isHealthResponse, { signal })
  }

  getReadiness(signal?: AbortSignal) {
    return this.request("/readyz", isHealthResponse, { signal })
  }

  listServices(signal?: AbortSignal) {
    return this.request("/api/services", isServiceStatusArray, { signal })
  }

  getServiceStatus(serviceName: string, signal?: AbortSignal) {
    return this.request(
      `/api/services/${encodeURIComponent(serviceName)}`,
      isServiceStatus,
      { signal },
    )
  }

  listServiceDefinitions(signal?: AbortSignal) {
    return this.request(
      "/api/config/services",
      isServiceDefinitionArray,
      { signal },
    )
  }

  getServiceLogs(
    serviceName: string,
    options: {
      tail?: number
      stdout?: boolean
      stderr?: boolean
      timestamps?: boolean
      signal?: AbortSignal
    } = {},
  ) {
    const query = new URLSearchParams()

    if (options.tail !== undefined) {
      query.set("tail", options.tail.toString())
    }

    if (options.stdout !== undefined) {
      query.set("stdout", options.stdout.toString())
    }

    if (options.stderr !== undefined) {
      query.set("stderr", options.stderr.toString())
    }

    if (options.timestamps !== undefined) {
      query.set("timestamps", options.timestamps.toString())
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : ""

    return this.request(
      `/api/services/${encodeURIComponent(serviceName)}/logs${suffix}`,
      isServiceLogsResponse,
      { signal: options.signal },
    )
  }

  getServiceStats(serviceName: string, signal?: AbortSignal) {
    return this.request(
      `/api/services/${encodeURIComponent(serviceName)}/stats`,
      isServiceStats,
      { signal },
    )
  }

  getChassisState(signal?: AbortSignal) {
    return this.request("/api/chassis/state", isChassisStateSnapshot, {
      signal,
    })
  }

  getMasterControlPose(signal?: AbortSignal) {
    return this.request(
      "/api/master-control/pose",
      isMasterControlPoseSnapshot,
      { signal },
    )
  }

  getDashboard(signal?: AbortSignal) {
    return this.request("/api/dashboard", isDashboardWebSocketMessage, {
      signal,
    })
  }

  restartService(
    serviceName: string,
    request: RestartRequest,
    signal?: AbortSignal,
  ) {
    return this.request(
      `/api/services/${encodeURIComponent(serviceName)}/restart`,
      isRestartResponse,
      {
        method: "POST",
        body: request,
        signal,
      },
    )
  }

  listCommands(signal?: AbortSignal) {
    return this.request("/api/commands", isCommandDefinitionArray, { signal })
  }

  listResetOriginPresets(signal?: AbortSignal) {
    return this.request(
      "/api/commands/reset_origin/presets",
      isResetOriginPresetArray,
      { signal },
    )
  }

  submitCommand(request: CommandRequest, signal?: AbortSignal) {
    return this.request("/api/commands", isCommandResponse, {
      method: "POST",
      body: request,
      signal,
    })
  }

  listRecentEvents(signal?: AbortSignal) {
    return this.request("/api/events/recent", isManagementEventArray, {
      signal,
    })
  }

  async testConnection(signal?: AbortSignal): Promise<ConnectionState> {
    await this.getReadiness(signal)

    return {
      status: "connected",
      checked_at: new Date().toISOString(),
    }
  }

  private async request<T>(
    path: string,
    validator: Validator<T>,
    options: RequestOptions = {},
  ) {
    const requestUrl = buildManagementHttpUrl(this.baseUrl, path)
    const method = options.method ?? "GET"
    const requestContext = {
      baseUrl: this.baseUrl,
      method,
      requestUrl,
    }
    let response: Response

    try {
      response = await this.fetchImpl(requestUrl, {
        method,
        headers: this.buildHeaders(options.body !== undefined),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error) {
      if (isAbortError(error)) {
        throw error
      }

      throw new ManagementApiError(
        buildBrowserRequestFailure(error, requestContext),
      )
    }

    const payload = await readJson(response)

    if (!response.ok) {
      throw new ManagementApiError(
        parseApiError(payload, response.status, requestContext),
        response.status,
      )
    }

    if (!validator(payload)) {
      throw new ManagementApiError({
        code: "request_failed",
        message: "后端响应不符合预期的管理接口契约",
      })
    }

    return payload
  }

  private buildHeaders(hasBody: boolean) {
    const headers = new Headers({
      Accept: "application/json",
    })

    if (hasBody) {
      headers.set("Content-Type", "application/json")
    }

    const token = this.token.trim()

    if (token.length > 0) {
      headers.set("Authorization", `Bearer ${token}`)
    }

    return headers
  }
}

export function isValidManagementBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim()

  if (isRelativeManagementBaseUrl(normalizedBaseUrl)) {
    return true
  }

  try {
    const url = new URL(normalizedBaseUrl)

    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function hasManagementAuthToken(token: string) {
  return token.trim().length > 0
}

export function isManagementAuthError(
  error: ApiError,
): error is ApiError & { code: "auth_required" | "auth_invalid" } {
  return error.code === "auth_required" || error.code === "auth_invalid"
}

export function isAbortError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  )
}

export function buildManagementHttpUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.trim()
  const endpointPath = path.replace(/^\/+/, "")

  if (isRelativeManagementBaseUrl(normalizedBaseUrl)) {
    const basePath = normalizedBaseUrl.replace(/\/+$/, "")

    return `${basePath}/${endpointPath}`
  }

  const base = new URL(normalizedBaseUrl)

  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new ManagementApiError({
      code: "request_failed",
      message: "管理后端 URL 必须使用 http、https 或同源代理路径",
    })
  }

  const basePath = base.pathname.replace(/\/+$/, "")

  base.pathname = `${basePath}/`
  base.search = ""
  base.hash = ""

  return new URL(endpointPath, base).toString()
}

export function buildDashboardWebSocketUrl(baseUrl: string, token: string) {
  return buildManagementWebSocketEndpointUrl(
    baseUrl,
    "/ws/dashboard",
    token,
  ).toString()
}

export function buildBlockStatesWebSocketUrl(baseUrl: string, token: string) {
  return buildManagementWebSocketEndpointUrl(
    baseUrl,
    "/ws/block-states",
    token,
  ).toString()
}

export function buildServiceLogWebSocketUrl(
  baseUrl: string,
  token: string,
  serviceName: string,
  options: ServiceLogWebSocketOptions = {},
) {
  const url = buildManagementWebSocketEndpointUrl(
    baseUrl,
    `/ws/services/${encodeURIComponent(serviceName)}/logs`,
    token,
  )

  url.searchParams.set(
    "tail",
    (options.tail ?? DEFAULT_SERVICE_LOG_TAIL).toString(),
  )
  url.searchParams.set("stdout", (options.stdout ?? true).toString())
  url.searchParams.set("stderr", (options.stderr ?? true).toString())
  url.searchParams.set("timestamps", (options.timestamps ?? true).toString())

  return url.toString()
}

function buildManagementWebSocketEndpointUrl(
  baseUrl: string,
  path: string,
  token: string,
) {
  const url = new URL(
    buildManagementHttpUrl(baseUrl, path),
    getCurrentBrowserOrigin(),
  )

  if (url.protocol === "http:") {
    url.protocol = "ws:"
  } else if (url.protocol === "https:") {
    url.protocol = "wss:"
  } else {
    throw new ManagementApiError({
      code: "request_failed",
      message: "管理后端 URL 必须使用 http 或 https",
    })
  }

  const trimmedToken = token.trim()

  if (trimmedToken.length > 0) {
    url.searchParams.set("token", trimmedToken)
  }

  return url
}

function isRelativeManagementBaseUrl(baseUrl: string) {
  return baseUrl.startsWith("/") && !baseUrl.startsWith("//")
}

function getCurrentBrowserOrigin() {
  return globalThis.location?.origin ?? "http://localhost"
}

export function createManagementApiClient(options: ManagementApiClientOptions) {
  return new ManagementApiClient(options)
}

export function getApiError(error: unknown): ApiError {
  if (error instanceof ManagementApiError) {
    return error.apiError
  }

  if (error instanceof TypeError) {
    return {
      code: "request_failed",
      message: `当前浏览器无法访问管理后端。浏览器异常：${error.message}`,
    }
  }

  if (error instanceof Error) {
    return {
      code: "request_failed",
      message: error.message,
    }
  }

  return {
    code: "request_failed",
    message: "管理请求失败",
  }
}

async function readJson(response: Response) {
  const text = await response.text()

  if (text.length === 0) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export function parseApiError(
  payload: unknown,
  status: number,
  context?: RequestErrorContext,
): ApiError {
  if (isApiError(payload)) {
    return payload
  }

  if (status === 401) {
    return AUTH_REQUIRED_ERROR
  }

  return {
    code: "request_failed",
    message: buildHttpFailureMessage(status, context),
  }
}

function buildBrowserRequestFailure(
  error: unknown,
  context: RequestErrorContext,
): ApiError {
  const browserMessage =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "浏览器未返回可读的 HTTP 响应"

  return {
    code: "request_failed",
    message: [
      `${context.method} ${context.requestUrl} 未收到可读的管理后端响应。`,
      describeBaseUrlFailureContext(context.baseUrl),
      `浏览器异常：${browserMessage}`,
    ]
      .filter((line) => line.length > 0)
      .join(" "),
  }
}

function buildHttpFailureMessage(
  status: number,
  context?: RequestErrorContext,
) {
  if (!context) {
    return `管理后端请求失败，HTTP ${status}`
  }

  return [
    `${context.method} ${context.requestUrl} 返回 HTTP ${status}，且响应不是管理后端结构化错误。`,
    describeBaseUrlFailureContext(context.baseUrl),
  ]
    .filter((line) => line.length > 0)
    .join(" ")
}

function describeBaseUrlFailureContext(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim()

  if (isRelativeManagementBaseUrl(normalizedBaseUrl)) {
    return `当前使用同源代理路径 ${normalizedBaseUrl}；若在 Vite 开发服务器下运行，请检查 VITE_MANAGEMENT_PROXY_TARGET 是否指向正在运行的 management backend。`
  }

  return "请检查该后端 URL 是否可从当前浏览器所在机器访问，且后端 CORS/网络路径允许本页面来源。"
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    isBackendErrorCode(value.code) &&
    isString(value.message)
  )
}

function isBackendErrorCode(value: unknown): value is ApiError["code"] {
  return isString(value) && value.length > 0
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return (
    isRecord(value) &&
    isString(value.status) &&
    isString(value.bind_address) &&
    isNumber(value.port) &&
    isString(value.agent_url)
  )
}

export function isServiceStatusArray(value: unknown): value is ServiceStatus[] {
  return isArrayOf(value, isServiceStatus)
}

export function isServiceStatus(value: unknown): value is ServiceStatus {
  return (
    isRecord(value) &&
    isString(value.service_name) &&
    isString(value.container_name) &&
    isString(value.display_name) &&
    isString(value.category) &&
    isString(value.compose_profile) &&
    isServiceRiskLevel(value.risk_level) &&
    isDockerStatus(value.docker) &&
    isRosStatus(value.ros) &&
    isOverallStatus(value.overall)
  )
}

function isDockerStatus(value: unknown): value is DockerStatus {
  return (
    isRecord(value) &&
    isBoolean(value.exists) &&
    isDockerState(value.state) &&
    isBoolean(value.running) &&
    isNullableString(value.status) &&
    isNullableString(value.started_at) &&
    isNullableString(value.finished_at) &&
    isNullableNumber(value.exit_code) &&
    isNullableNumber(value.restart_count) &&
    isNullableString(value.health)
  )
}

function isRosStatus(value: unknown): value is RosStatus {
  return (
    isRecord(value) &&
    isBoolean(value.agent_available) &&
    isOverallLevel(value.level) &&
    isString(value.summary) &&
    isArrayOf(value.expected_nodes, isRosExpectedNode) &&
    isArrayOf(value.topics, isRosTopicStatus) &&
    isArrayOf(value.diagnostics, isRosDiagnosticStatus)
  )
}

function isRosExpectedNode(value: unknown): value is RosExpectedNode {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isBoolean(value.present) &&
    isNullableString(value.last_seen)
  )
}

function isRosTopicStatus(value: unknown): value is RosTopicStatus {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.resolved_name) &&
    isString(value.required_endpoint) &&
    isString(value.type_name) &&
    isArrayOf(value.observed_types, isString) &&
    isNumber(value.publisher_count) &&
    isNumber(value.subscriber_count) &&
    isBoolean(value.present) &&
    isNullableRosTopicFreshness(value.freshness)
  )
}

function isRosTopicFreshness(value: unknown): value is RosTopicFreshness {
  return (
    isRecord(value) &&
    isBoolean(value.supported) &&
    isNullableString(value.last_message_at) &&
    isNullableNumber(value.age_ms) &&
    isNullableNumber(value.max_age_ms) &&
    isNullableBoolean(value.fresh)
  )
}

function isRosDiagnosticStatus(value: unknown): value is RosDiagnosticStatus {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOverallLevel(value.level) &&
    isString(value.message) &&
    isString(value.hardware_id)
  )
}

function isOverallStatus(value: unknown): value is OverallStatus {
  return (
    isRecord(value) &&
    isOverallLevel(value.level) &&
    isString(value.reason)
  )
}

function isServiceDefinitionArray(value: unknown): value is ServiceDefinition[] {
  return isArrayOf(value, isServiceDefinition)
}

function isServiceDefinition(value: unknown): value is ServiceDefinition {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.container_name) &&
    isString(value.display_name) &&
    isString(value.category) &&
    isString(value.compose_profile) &&
    isServiceRiskLevel(value.risk_level) &&
    isBoolean(value.supports_hard_restart) &&
    isBoolean(value.supports_soft_restart) &&
    isArrayOf(value.expected_ros_nodes, isString) &&
    isArrayOf(value.expected_topics, isString)
  )
}

function isServiceLogsResponse(value: unknown): value is ServiceLogsResponse {
  return (
    isRecord(value) &&
    isString(value.service) &&
    isString(value.container_name) &&
    isNumber(value.tail) &&
    isArrayOf(value.lines, isString)
  )
}

function isServiceStats(value: unknown): value is ServiceStats {
  return (
    isRecord(value) &&
    isNumber(value.cpu_percent) &&
    isNumber(value.memory_usage_bytes) &&
    isNumber(value.memory_limit_bytes) &&
    isNumber(value.memory_percent) &&
    isNumber(value.network_rx_bytes) &&
    isNumber(value.network_tx_bytes) &&
    isNumber(value.block_read_bytes) &&
    isNumber(value.block_write_bytes) &&
    isNumber(value.pids_current)
  )
}

export function isChassisStateSnapshot(
  value: unknown,
): value is ChassisStateSnapshot {
  return (
    isRecord(value) &&
    isBoolean(value.available) &&
    isString(value.topic) &&
    isNullableString(value.received_at) &&
    (value.message === null || isChassisStateMessage(value.message))
  )
}

export function isMasterControlPoseSnapshot(
  value: unknown,
): value is MasterControlPoseSnapshot {
  return (
    isRecord(value) &&
    isBoolean(value.available) &&
    isString(value.topic) &&
    isNullableString(value.received_at) &&
    isPoseSourceSnapshot(value.lidar_pose, isMasterControlPoseMessage) &&
    isPoseSourceSnapshot(value.odin_odometry, isOdinOdometryPoseMessage)
  )
}

export function isDashboardSnapshot(
  value: unknown,
): value is DashboardSnapshot {
  return (
    isRecord(value) &&
    isServiceStatusArray(value.services) &&
    (value.chassis_state === null ||
      isChassisStateSnapshot(value.chassis_state)) &&
    (value.master_control_pose === null ||
      isMasterControlPoseSnapshot(value.master_control_pose))
  )
}

function isPoseSourceSnapshot<TMessage>(
  value: unknown,
  isMessage: (message: unknown) => message is TMessage,
): value is PoseSourceSnapshot<TMessage> {
  return (
    isRecord(value) &&
    isBoolean(value.available) &&
    isString(value.topic) &&
    isNullableString(value.received_at) &&
    (value.message === null || isMessage(value.message))
  )
}

function isChassisStateMessage(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.timestamp_ms) &&
    isChassisPoseState(value.pose) &&
    isChassisActionState(value.action) &&
    isChassisConnectionState(value.connection)
  )
}

function isChassisPoseState(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.yaw_deg) &&
    isNumber(value.front_height) &&
    isNumber(value.rear_height)
  )
}

function isChassisActionState(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.raw_table) &&
    isNumber(value.step_status) &&
    isNumber(value.chassis_mode) &&
    isBoolean(value.chassis_curve_finished) &&
    isNumber(value.lift_status) &&
    isNumber(value.grip_status) &&
    isBoolean(value.grip_suction_has_object) &&
    isNumber(value.infrared_receiver_state)
  )
}

function isChassisConnectionState(value: unknown) {
  return (
    isRecord(value) &&
    isNumber(value.raw_table) &&
    isBoolean(value.wheel_0) &&
    isBoolean(value.wheel_1) &&
    isBoolean(value.wheel_2) &&
    isBoolean(value.wheel_3) &&
    isBoolean(value.lift_0) &&
    isBoolean(value.lift_1) &&
    isBoolean(value.lift_2) &&
    isBoolean(value.lift_3) &&
    isBoolean(value.grip_arm) &&
    isBoolean(value.grip_turn) &&
    isBoolean(value.gyro_yaw) &&
    isBoolean(value.upper_host_localization) &&
    isBoolean(value.upper_host)
  )
}

function isMasterControlPoseMessage(
  value: unknown,
): value is MasterControlPoseMessage {
  return (
    isRecord(value) &&
    isRosHeader(value.header) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.z) &&
    isNumber(value.roll_deg) &&
    isNumber(value.pitch_deg) &&
    isNumber(value.yaw_deg)
  )
}

function isOdinOdometryPoseMessage(
  value: unknown,
): value is OdinOdometryPoseMessage {
  return (
    isRecord(value) &&
    isRosHeader(value.header) &&
    isString(value.child_frame_id) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.z) &&
    isNumber(value.roll_deg) &&
    isNumber(value.pitch_deg) &&
    isNumber(value.yaw_deg)
  )
}

function isRosHeader(value: unknown) {
  return (
    isRecord(value) &&
    isRosTime(value.stamp) &&
    isString(value.frame_id)
  )
}

function isRosTime(value: unknown) {
  return isRecord(value) && isNumber(value.sec) && isNumber(value.nanosec)
}

export function isDashboardWebSocketMessage(
  value: unknown,
): value is DashboardWebSocketMessage {
  if (
    !isRecord(value) ||
    !isString(value.type) ||
    !isInteger(value.seq) ||
    value.seq < 0 ||
    !isString(value.time)
  ) {
    return false
  }

  if (value.type === "dashboard_snapshot") {
    return isDashboardSnapshot(value.snapshot)
  }

  return (
    value.type === "dashboard_error" &&
    isString(value.code) &&
    isString(value.message)
  )
}

export function parseDashboardStreamMessage(
  value: unknown,
): DashboardStreamMessage | null {
  if (isDashboardWebSocketMessage(value)) {
    return value
  }

  if (!Array.isArray(value) || value.length < 4 || !isString(value[0])) {
    return null
  }

  const [, seq, timeMs] = value
  if (!isNonNegativeInteger(seq)) {
    return null
  }
  const time = isoFromEpochMs(timeMs)
  if (!time) {
    return null
  }

  switch (value[0]) {
    case "c":
      return parseDashboardChassisFrame(value, seq, time)
    case "p":
      return parseDashboardPoseFrame(value, seq, time)
    case "s":
      return parseDashboardServicesFrame(value, seq, time)
    case "e":
      return parseDashboardErrorFrame(value, seq, time)
    default:
      return null
  }
}

function parseDashboardChassisFrame(
  value: unknown[],
  seq: number,
  time: string,
): DashboardCompactWebSocketMessage | null {
  if (value.length !== 4) {
    return null
  }
  const chassisState = parseCompactChassisState(value[3])
  if (!chassisState) {
    return null
  }

  return {
    type: "dashboard_chassis",
    seq,
    time,
    chassis_state: chassisState,
  }
}

function parseDashboardPoseFrame(
  value: unknown[],
  seq: number,
  time: string,
): DashboardCompactWebSocketMessage | null {
  if (value.length !== 4) {
    return null
  }
  const masterControlPose = parseCompactMasterControlPose(value[3])
  if (!masterControlPose) {
    return null
  }

  return {
    type: "dashboard_pose",
    seq,
    time,
    master_control_pose: masterControlPose,
  }
}

function parseDashboardServicesFrame(
  value: unknown[],
  seq: number,
  time: string,
): DashboardCompactWebSocketMessage | null {
  if (value.length !== 4 || !Array.isArray(value[3])) {
    return null
  }
  const services: ServiceSummaryUpdate[] = []
  for (const item of value[3]) {
    const summary = parseCompactServiceSummary(item)
    if (!summary) {
      return null
    }
    services.push(summary)
  }

  return {
    type: "dashboard_services",
    seq,
    time,
    services,
  }
}

function parseDashboardErrorFrame(
  value: unknown[],
  seq: number,
  time: string,
): DashboardCompactWebSocketMessage | null {
  if (
    value.length !== 5 ||
    !isString(value[3]) ||
    value[3].length === 0 ||
    !isString(value[4])
  ) {
    return null
  }

  return {
    type: "dashboard_error",
    seq,
    time,
    code: value[3],
    message: value[4],
  }
}

function parseCompactServiceSummary(
  value: unknown,
): ServiceSummaryUpdate | null {
  if (!Array.isArray(value) || value.length !== 13) {
    return null
  }
  const [
    serviceIndex,
    overallLevelCode,
    overallReason,
    dockerExistsCode,
    dockerStateCode,
    dockerRunningCode,
    dockerStatus,
    dockerExitCode,
    dockerRestartCount,
    dockerHealth,
    rosAgentAvailableCode,
    rosLevelCode,
    rosSummary,
  ] = value
  const overallLevel = decodeOverallLevel(overallLevelCode)
  const dockerState = decodeDockerState(dockerStateCode)
  const rosLevel = decodeOverallLevel(rosLevelCode)
  const dockerExists = decodeBooleanCode(dockerExistsCode)
  const dockerRunning = decodeBooleanCode(dockerRunningCode)
  const rosAgentAvailable = decodeBooleanCode(rosAgentAvailableCode)

  if (
    !isNonNegativeInteger(serviceIndex) ||
    !overallLevel ||
    !isString(overallReason) ||
    dockerExists === null ||
    !dockerState ||
    dockerRunning === null ||
    !isNullableString(dockerStatus) ||
    !isNullableNumber(dockerExitCode) ||
    !isNullableNumber(dockerRestartCount) ||
    !isNullableString(dockerHealth) ||
    rosAgentAvailable === null ||
    !rosLevel ||
    !isString(rosSummary)
  ) {
    return null
  }

  return {
    service_index: serviceIndex,
    overall: {
      level: overallLevel,
      reason: overallReason,
    },
    docker: {
      exists: dockerExists,
      state: dockerState,
      running: dockerRunning,
      status: dockerStatus,
      exit_code: dockerExitCode,
      restart_count: dockerRestartCount,
      health: dockerHealth,
    },
    ros: {
      agent_available: rosAgentAvailable,
      level: rosLevel,
      summary: rosSummary,
    },
  }
}

function parseCompactChassisState(value: unknown): ChassisStateSnapshot | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null
  }
  const [availableCode, topic, receivedMs, messageValue] = value
  const available = decodeBooleanCode(availableCode)
  const receivedAt = nullableIsoFromEpochMs(receivedMs)
  if (available === null || !isString(topic) || receivedAt === undefined) {
    return null
  }
  const message =
    messageValue === null ? null : parseCompactChassisMessage(messageValue)
  if (message === undefined) {
    return null
  }

  return {
    available,
    topic,
    received_at: receivedAt,
    message,
  }
}

function parseCompactChassisMessage(
  value: unknown,
): ChassisStateSnapshot["message"] | undefined {
  if (!Array.isArray(value) || value.length !== 15) {
    return undefined
  }
  const [
    timestampMs,
    x,
    y,
    yawDeg,
    frontHeight,
    rearHeight,
    actionRaw,
    stepStatus,
    chassisMode,
    curveFinishedCode,
    liftStatus,
    gripStatus,
    gripHasObjectCode,
    infraredState,
    connectionRaw,
  ] = value
  const curveFinished = decodeBooleanCode(curveFinishedCode)
  const gripHasObject = decodeBooleanCode(gripHasObjectCode)
  if (
    !isNumber(timestampMs) ||
    !isNumber(x) ||
    !isNumber(y) ||
    !isNumber(yawDeg) ||
    !isNumber(frontHeight) ||
    !isNumber(rearHeight) ||
    !isNumber(actionRaw) ||
    !isNumber(stepStatus) ||
    !isNumber(chassisMode) ||
    curveFinished === null ||
    !isNumber(liftStatus) ||
    !isNumber(gripStatus) ||
    gripHasObject === null ||
    !isNumber(infraredState) ||
    !isNumber(connectionRaw)
  ) {
    return undefined
  }

  return {
    timestamp_ms: timestampMs,
    pose: {
      x,
      y,
      yaw_deg: yawDeg,
      front_height: frontHeight,
      rear_height: rearHeight,
    },
    action: {
      raw_table: actionRaw,
      step_status: stepStatus,
      chassis_mode: chassisMode,
      chassis_curve_finished: curveFinished,
      lift_status: liftStatus,
      grip_status: gripStatus,
      grip_suction_has_object: gripHasObject,
      infrared_receiver_state: infraredState,
    },
    connection: decodeChassisConnection(connectionRaw),
  }
}

function parseCompactMasterControlPose(
  value: unknown,
): MasterControlPoseSnapshot | null {
  if (!Array.isArray(value) || value.length !== 5) {
    return null
  }
  const [availableCode, topic, receivedMs, lidarValue, odinValue] = value
  const available = decodeBooleanCode(availableCode)
  const receivedAt = nullableIsoFromEpochMs(receivedMs)
  const lidarPose = parseCompactPoseSource(
    lidarValue,
    parseCompactMasterControlPoseMessage,
  )
  const odinOdometry = parseCompactPoseSource(
    odinValue,
    parseCompactOdinOdometryPoseMessage,
  )
  if (
    available === null ||
    !isString(topic) ||
    receivedAt === undefined ||
    !lidarPose ||
    !odinOdometry
  ) {
    return null
  }

  return {
    available,
    topic,
    received_at: receivedAt,
    lidar_pose: lidarPose,
    odin_odometry: odinOdometry,
  }
}

function parseCompactPoseSource<TMessage>(
  value: unknown,
  parseMessage: (value: unknown) => TMessage | undefined,
): PoseSourceSnapshot<TMessage> | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null
  }
  const [availableCode, topic, receivedMs, messageValue] = value
  const available = decodeBooleanCode(availableCode)
  const receivedAt = nullableIsoFromEpochMs(receivedMs)
  if (available === null || !isString(topic) || receivedAt === undefined) {
    return null
  }
  const message = messageValue === null ? null : parseMessage(messageValue)
  if (message === undefined) {
    return null
  }

  return {
    available,
    topic,
    received_at: receivedAt,
    message,
  }
}

function parseCompactMasterControlPoseMessage(
  value: unknown,
): MasterControlPoseMessage | undefined {
  if (!Array.isArray(value) || value.length !== 9) {
    return undefined
  }
  const [stampSec, stampNanosec, frameId, x, y, z, rollDeg, pitchDeg, yawDeg] =
    value
  if (
    !isNumber(stampSec) ||
    !isNumber(stampNanosec) ||
    !isString(frameId) ||
    !isNumber(x) ||
    !isNumber(y) ||
    !isNumber(z) ||
    !isNumber(rollDeg) ||
    !isNumber(pitchDeg) ||
    !isNumber(yawDeg)
  ) {
    return undefined
  }

  return {
    header: {
      stamp: {
        sec: stampSec,
        nanosec: stampNanosec,
      },
      frame_id: frameId,
    },
    x,
    y,
    z,
    roll_deg: rollDeg,
    pitch_deg: pitchDeg,
    yaw_deg: yawDeg,
  }
}

function parseCompactOdinOdometryPoseMessage(
  value: unknown,
): OdinOdometryPoseMessage | undefined {
  if (!Array.isArray(value) || value.length !== 10) {
    return undefined
  }
  const [
    stampSec,
    stampNanosec,
    frameId,
    childFrameId,
    x,
    y,
    z,
    rollDeg,
    pitchDeg,
    yawDeg,
  ] = value
  if (
    !isNumber(stampSec) ||
    !isNumber(stampNanosec) ||
    !isString(frameId) ||
    !isString(childFrameId) ||
    !isNumber(x) ||
    !isNumber(y) ||
    !isNumber(z) ||
    !isNumber(rollDeg) ||
    !isNumber(pitchDeg) ||
    !isNumber(yawDeg)
  ) {
    return undefined
  }

  return {
    header: {
      stamp: {
        sec: stampSec,
        nanosec: stampNanosec,
      },
      frame_id: frameId,
    },
    child_frame_id: childFrameId,
    x,
    y,
    z,
    roll_deg: rollDeg,
    pitch_deg: pitchDeg,
    yaw_deg: yawDeg,
  }
}

function decodeChassisConnection(rawTable: number) {
  return {
    raw_table: rawTable,
    wheel_0: hasBit(rawTable, 0),
    wheel_1: hasBit(rawTable, 1),
    wheel_2: hasBit(rawTable, 2),
    wheel_3: hasBit(rawTable, 3),
    lift_0: hasBit(rawTable, 4),
    lift_1: hasBit(rawTable, 5),
    lift_2: hasBit(rawTable, 6),
    lift_3: hasBit(rawTable, 7),
    grip_arm: hasBit(rawTable, 8),
    grip_turn: hasBit(rawTable, 9),
    gyro_yaw: hasBit(rawTable, 10),
    upper_host_localization: hasBit(rawTable, 14),
    upper_host: hasBit(rawTable, 15),
  }
}

function hasBit(value: number, bit: number) {
  return (Math.trunc(value) & (1 << bit)) !== 0
}

function decodeOverallLevel(value: unknown): OverallLevel | null {
  if (!isNumber(value)) {
    return null
  }
  return overallLevels[value] ?? null
}

function decodeDockerState(value: unknown): DockerState | null {
  if (!isNumber(value)) {
    return null
  }
  return dockerStates[value] ?? null
}

function decodeBooleanCode(value: unknown): boolean | null {
  if (value === 0) {
    return false
  }
  if (value === 1) {
    return true
  }
  return null
}

function nullableIsoFromEpochMs(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  return isoFromEpochMs(value) ?? undefined
}

function isoFromEpochMs(value: unknown): string | null {
  if (!isNumber(value)) {
    return null
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function isRestartResponse(value: unknown): value is RestartResponse {
  return (
    isRecord(value) &&
    isString(value.request_id) &&
    isString(value.service) &&
    isString(value.mode) &&
    isBoolean(value.accepted) &&
    isString(value.started_at) &&
    isNullableString(value.finished_at) &&
    isString(value.result)
  )
}

function isCommandDefinitionArray(value: unknown): value is CommandDefinition[] {
  return isArrayOf(value, isCommandDefinition)
}

function isCommandDefinition(value: unknown): value is CommandDefinition {
  return (
    isRecord(value) &&
    isString(value.target) &&
    isString(value.name) &&
    isString(value.description) &&
    isRecord(value.node) &&
    isString(value.node.transport) &&
    isString(value.node.payload_schema) &&
    isRecord(value.backend) &&
    isServiceRiskLevel(value.backend.risk_level) &&
    isBoolean(value.backend.requires_confirm)
  )
}

function isCommandResponse(value: unknown): value is CommandResponse {
  return (
    isRecord(value) &&
    isString(value.request_id) &&
    isString(value.target) &&
    isString(value.command) &&
    isBoolean(value.accepted) &&
    isString(value.state) &&
    isString(value.result) &&
    isString(value.message) &&
    isString(value.started_at) &&
    isNullableString(value.finished_at)
  )
}

function isResetOriginPresetArray(value: unknown): value is ResetOriginPreset[] {
  return isArrayOf(value, isResetOriginPreset)
}

function isResetOriginPreset(value: unknown): value is ResetOriginPreset {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isNumber(value.pose_x) &&
    isNumber(value.pose_y) &&
    isNumber(value.pose_z) &&
    isNumber(value.pose_yaw_deg)
  )
}

export function isManagementEventArray(
  value: unknown,
): value is ManagementEvent[] {
  return isArrayOf(value, isManagementEvent)
}

export function isManagementEvent(value: unknown): value is ManagementEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.type) &&
    isString(value.time) &&
    isRecord(value.payload)
  )
}

function isOverallLevel(value: unknown): value is OverallLevel {
  return isString(value) && overallLevels.includes(value as OverallLevel)
}

function isDockerState(value: unknown): value is DockerState {
  return isString(value) && dockerStates.includes(value as DockerState)
}

function isServiceRiskLevel(value: unknown): value is ServiceRiskLevel {
  return isString(value) && serviceRiskLevels.includes(value as ServiceRiskLevel)
}

function isNullableRosTopicFreshness(
  value: unknown,
): value is RosTopicFreshness | null {
  return value === null || isRosTopicFreshness(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value)
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || isBoolean(value)
}

function isArrayOf<T>(value: unknown, validator: Validator<T>): value is T[] {
  return Array.isArray(value) && value.every((item) => validator(item))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}
