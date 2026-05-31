import type {
  ApiError,
  CommandDefinition,
  CommandRequest,
  CommandResponse,
  ConnectionState,
  DockerState,
  DockerStatus,
  HealthResponse,
  ManagementEvent,
  OverallLevel,
  OverallStatus,
  RestartRequest,
  RestartResponse,
  RosDiagnosticStatus,
  RosExpectedNode,
  RosStatus,
  RosTopicFreshness,
  RosTopicStatus,
  ServiceDefinition,
  ServiceLogsResponse,
  ServiceRiskLevel,
  ServiceStats,
  ServiceStatus,
} from "@/types/management"

export const DEFAULT_MANAGEMENT_BASE_URL = "http://127.0.0.1:8080"

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
    this.fetchImpl = fetchImpl
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
    const response = await this.fetchImpl(buildManagementHttpUrl(this.baseUrl, path), {
      method: options.method ?? "GET",
      headers: this.buildHeaders(options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })

    const payload = await readJson(response)

    if (!response.ok) {
      throw new ManagementApiError(
        parseApiError(payload, response.status),
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

export function buildManagementHttpUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/+$/, "")
  const endpointPath = path.replace(/^\/+/, "")

  base.pathname = `${basePath}/`
  base.search = ""
  base.hash = ""

  return new URL(endpointPath, base).toString()
}

export function buildManagementWebSocketUrl(baseUrl: string, token: string) {
  const url = new URL(buildManagementHttpUrl(baseUrl, "/ws/events"))

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

  return url.toString()
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
      message: "当前浏览器无法访问管理后端",
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

export function parseApiError(payload: unknown, status: number): ApiError {
  if (isApiError(payload)) {
    return payload
  }

  if (status === 401) {
    return {
      code: "auth_required",
      message: "管理后端需要认证",
    }
  }

  return {
    code: "request_failed",
    message: `管理后端请求失败，HTTP ${status}`,
  }
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
    isNumber(value.restart_count) &&
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

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}
