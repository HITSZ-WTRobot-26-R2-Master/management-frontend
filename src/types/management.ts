export type ServiceRiskLevel = "low" | "medium" | "high" | "critical"

export type OverallLevel = "ok" | "warning" | "error" | "unknown"

export type DockerState =
  | "running"
  | "created"
  | "restarting"
  | "paused"
  | "exited"
  | "dead"
  | "missing"
  | "unknown"

export type RosLevel = OverallLevel

export type RestartMode = "hard" | "soft"

export type RestartResult = "success" | "failed" | "rejected" | string

export type CommandState = "finished" | "rejected" | string

export type CommandResult = "success" | "failed" | "rejected" | string

export type CommandTransport = "topic" | "service" | "action" | string

export type EventType =
  | "service_status_snapshot"
  | "service_status_changed"
  | "restart_requested"
  | "restart_finished"
  | "command_requested"
  | "command_finished"
  | "backend_warning"
  | string

export type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

export interface JsonObject {
  [key: string]: JsonValue
}

export interface ApiError {
  code: ApiErrorCode
  message: string
}

export type ApiErrorCode =
  | "auth_required"
  | "auth_invalid"
  | "not_found"
  | "request_failed"
  | "config_error"
  | "service_not_found"
  | "command_not_found"
  | "command_confirm_required"
  | "docker_unavailable"
  | "docker_operation_failed"
  | "command_transport_unavailable"
  | string

export interface HealthResponse {
  status: "ok" | "ready" | string
  bind_address: string
  port: number
  agent_url: string
}

export interface OverallStatus {
  level: OverallLevel
  reason: string
}

export interface DockerStatus {
  exists: boolean
  state: DockerState
  running: boolean
  status: string | null
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  restart_count: number | null
  health: string | null
}

export interface RosExpectedNode {
  name: string
  present: boolean
  last_seen: string | null
}

export interface RosTopicFreshness {
  supported: boolean
  last_message_at: string | null
  age_ms: number | null
  max_age_ms: number | null
  fresh: boolean | null
}

export interface RosTopicStatus {
  name: string
  resolved_name: string
  required_endpoint: "publisher" | "subscriber" | string
  type_name: string
  observed_types: string[]
  publisher_count: number
  subscriber_count: number
  present: boolean
  freshness: RosTopicFreshness | null
}

export interface RosDiagnosticStatus {
  name: string
  level: RosLevel
  message: string
  hardware_id: string
}

export interface RosStatus {
  agent_available: boolean
  level: RosLevel
  summary: string
  expected_nodes: RosExpectedNode[]
  topics: RosTopicStatus[]
  diagnostics: RosDiagnosticStatus[]
}

export interface ServiceStatus {
  service_name: string
  container_name: string
  display_name: string
  category: string
  compose_profile: string
  risk_level: ServiceRiskLevel
  docker: DockerStatus
  ros: RosStatus
  overall: OverallStatus
}

export interface ServiceDefinition {
  name: string
  container_name: string
  display_name: string
  category: string
  compose_profile: string
  risk_level: ServiceRiskLevel
  supports_hard_restart: boolean
  supports_soft_restart: boolean
  expected_ros_nodes: string[]
  expected_topics: string[]
}

export interface ServiceLogsResponse {
  service: string
  container_name: string
  tail: number
  lines: string[]
}

export interface ServiceStats {
  cpu_percent: number
  memory_usage_bytes: number
  memory_limit_bytes: number
  memory_percent: number
  network_rx_bytes: number
  network_tx_bytes: number
  block_read_bytes: number
  block_write_bytes: number
  pids_current: number
}

export interface RestartRequest {
  mode: "hard"
  reason?: string
  confirm: boolean
}

export interface RestartResponse {
  request_id: string
  service: string
  mode: RestartMode
  accepted: boolean
  started_at: string
  finished_at: string | null
  result: RestartResult
}

export interface CommandDefinition {
  target: string
  name: string
  description: string
  node: {
    transport: CommandTransport
    payload_schema: string
  }
  backend: {
    risk_level: ServiceRiskLevel
    requires_confirm: boolean
  }
}

export interface CommandRequest {
  target: string
  command: string
  payload?: JsonObject
  confirm?: boolean | null
}

export interface CommandResponse {
  request_id: string
  target: string
  command: string
  accepted: boolean
  state: CommandState
  result: CommandResult
  message: string
  started_at: string
  finished_at: string | null
}

export interface ServiceStatusSnapshotPayload {
  services: ServiceStatus[]
}

export interface RestartRequestedPayload {
  request_id: string
  service: string
  mode: RestartMode
  confirm: boolean | null
  reason: string | null
}

export interface CommandRequestedPayload {
  request_id: string
  target: string
  command: string
  confirm: boolean | null
  reason: string | null
}

export interface ManagementEvent {
  id: string
  type: EventType
  time: string
  payload:
    | ServiceStatusSnapshotPayload
    | RestartRequestedPayload
    | RestartResponse
    | CommandRequestedPayload
    | CommandResponse
    | Record<string, unknown>
}

export type ConnectionStatus =
  | "idle"
  | "checking"
  | "connected"
  | "stream_connecting"
  | "live"
  | "reconnecting"
  | "fallback"
  | "auth_required"
  | "auth_invalid"
  | "error"

export interface ConnectionState {
  status: ConnectionStatus
  checked_at: string | null
  retry_attempt?: number
  next_retry_at?: string | null
  last_event_at?: string | null
  fallback_at?: string | null
}
