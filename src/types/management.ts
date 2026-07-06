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

export interface DecisionScrollPick {
  from: number
  get: number
}

export interface DecisionSnapshot {
  available: boolean
  topic: string
  received_at: string | null
  action_order: number[]
  scroll_picks: DecisionScrollPick[]
  revision: number
}

export type DecisionWebSocketMessage =
  | {
      type: "decision_snapshot"
      time: string
      snapshot: DecisionSnapshot
    }
  | {
      type: "decision_error"
      time: string
      code: string
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

export type ServiceLogMessageType =
  | "service_log_opened"
  | "service_log_line"
  | "service_log_error"
  | "service_log_stream_ended"

export type ServiceLogOutputStream = "stdout" | "stderr" | "unknown" | string

export interface ServiceLogOpenedMessage {
  type: "service_log_opened"
  service: string
  container_name: string
  tail: number
  stdout: boolean
  stderr: boolean
  timestamps: boolean
  time: string
}

export interface ServiceLogLineMessage {
  type: "service_log_line"
  service: string
  container_name: string
  stream: ServiceLogOutputStream
  line: string
  time: string
}

export interface ServiceLogErrorMessage {
  type: "service_log_error"
  service: string
  container_name?: string
  code: ApiErrorCode
  message: string
  time: string
}

export interface ServiceLogStreamEndedMessage {
  type: "service_log_stream_ended"
  service: string
  container_name: string
  reason: string
  time: string
}

export type ServiceLogWebSocketMessage =
  | ServiceLogOpenedMessage
  | ServiceLogLineMessage
  | ServiceLogErrorMessage
  | ServiceLogStreamEndedMessage

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

export interface ChassisPoseState {
  x: number
  y: number
  yaw_deg: number
  front_height: number
  rear_height: number
}

export interface ChassisActionState {
  raw_table: number
  step_status: number
  chassis_mode: number
  chassis_curve_finished: boolean
  lift_status: number
  grip_status: number
  trajectory_offline_state: number
  infrared_switch_state: number
  infrared_switch_0: boolean
  infrared_switch_1: boolean
  infrared_switch_2: boolean
  infrared_switch_3: boolean
}

export interface ChassisConnectionState {
  raw_table: number
  wheel_0: boolean
  wheel_1: boolean
  wheel_2: boolean
  wheel_3: boolean
  lift_0: boolean
  lift_1: boolean
  lift_2: boolean
  lift_3: boolean
  grip_arm: boolean
  grip_turn: boolean
  gyro_yaw: boolean
  upper_host_localization: boolean
  upper_host: boolean
}

export interface ChassisStateMessage {
  timestamp_ms: number
  pose: ChassisPoseState
  action: ChassisActionState
  connection: ChassisConnectionState
}

export interface ChassisStateSnapshot {
  available: boolean
  topic: string
  received_at: string | null
  message: ChassisStateMessage | null
}

export interface RosTime {
  sec: number
  nanosec: number
}

export interface RosHeader {
  stamp: RosTime
  frame_id: string
}

export interface MasterControlPoseMessage {
  header: RosHeader
  source: string
  x: number
  y: number
  z: number
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
}

export interface OdinOdometryPoseMessage {
  header: RosHeader
  child_frame_id: string
  x: number
  y: number
  z: number
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
}

export interface PoseSourceSnapshot<TMessage> {
  available: boolean
  topic: string
  received_at: string | null
  message: TMessage | null
}

export interface MasterControlPoseSnapshot {
  available: boolean
  topic: string
  received_at: string | null
  message?: MasterControlPoseMessage | null
  lidar_pose: PoseSourceSnapshot<MasterControlPoseMessage>
  odin_odometry: PoseSourceSnapshot<OdinOdometryPoseMessage>
}

export interface LaserStatusSnapshot {
  available: boolean
  topic: string
  received_at: string | null
  message: LaserStatusMessage | null
}

export interface ArmFeedbackSnapshot {
  available: boolean
  topic: string
  received_at: string | null
  completed_cmd: number | null
}

export interface LaserStatusMessage {
  localized: boolean
  state: string
  pose_source: string
  laser_pose_output: "POSE" | "NAN"
  laser_pose_output_reason: string
  laser_pose_output_reason_text: string
  in_solve_region: boolean
  solve_attempted: boolean
  solve_success: boolean
  current_solver_beams: string[]
  coarse_pose: LaserPoseState
  timing_debug: LaserTimingDebug
  region_debug: LaserRegionDebug
  solver_debug: LaserSolverDebug
  laser_decoded?: LaserDecodedSnapshot
  valid_beam_count: number
  usable_sensor_count: number
  selected_beam_count: number
  selected_valid_beam_count: number
  target_hit_count: number
  score: number
  prior_age_ms: number | null
  reason: string
  region_name: string | null
  wall_pair_name: string | null
  beam_mode: string | null
  selected_beams: string[] | null
  yaw_in_corner_deg: number | null
  residual_m: number | null
  corner_pose?: LaserCornerPose
  corner_world_pose?: LaserCornerPose
  world_pose?: LaserWorldPose
}

export interface LaserPoseState {
  x: number
  y: number
  z: number
  yaw_deg: number
  roll_rad: number
  pitch_rad: number
}

export interface LaserTimingDebug {
  transport_delay_ms: number | null
  range_frame_found: boolean | null
  range_frame_age_ms: number | null
  range_frame_count: number | null
}

export interface LaserRegionDebug {
  evaluated: boolean
  matched: boolean
  matched_region_name: string | null
  matched_wall_pair_name: string | null
  candidate_count: number
  candidates: LaserRegionCandidate[]
}

export interface LaserRegionCandidate {
  name: string
  priority: number
  position_match: boolean
  yaw_match: boolean
  matched: boolean
  position_score_m: number | null
  yaw_error_deg: number | null
  expected_yaw_deg: number | null
  yaw_tolerance_deg: number | null
  reject_reason: string | null
}

export interface LaserSolverDebug {
  attempted: boolean
  success: boolean
  beam_mode?: string
  x_beam?: string
  side_front_beam?: string
  side_rear_beam?: string
  theta_side_deg?: number | null
  corner_pose?: LaserCornerPose
  corner_world_pose?: LaserCornerPose
  candidate_pose?: LaserCornerPose
  correction_debug?: LaserCorrectionDebug
  residual_debug?: LaserResidualDebug
  current_solver_beams: string[]
}

export interface LaserCorrectionDebug {
  delta_x_m: number | null
  delta_y_m: number | null
  delta_xy_norm_m: number | null
  delta_yaw_deg: number | null
  max_correction_xy_m: number | null
  max_correction_yaw_deg: number | null
}

export interface LaserResidualDebug {
  mean_residual_m: number | null
  target_hit_count: number | null
  residual_thresh_m?: number | null
  min_valid_corner_beams?: number | null
}

export interface LaserCornerPose {
  x: number
  y: number
  yaw_deg: number
}

export interface LaserWorldPose {
  frame_id: string
  source?: string
  x: number
  y: number
  yaw_deg: number
}

export interface LaserDecodedSnapshot {
  has_data: boolean
  query_device_ids: number[]
  latest_range_frame_age_ms: number | null
  device_frames: Record<string, LaserDeviceFrame>
  logical_sensors: Record<string, LaserSensorState>
}

export interface LaserDeviceFrame {
  device_id: number
  age_ms: number
  report_type: number
  report_name: string
  status_bits: number
  slots: LaserSlotState[]
}

export interface LaserSlotState {
  slot_index: number
  raw_mm: number
  online: boolean
  serial_valid: boolean
  range_m: number | null
}

export interface LaserSensorState {
  device_id: number
  slot_index: number
  raw_mm: number | null
  online: boolean | null
  serial_valid: boolean
  range_m: number | null
  usable: boolean
}

export interface DashboardSnapshot {
  services: ServiceStatus[]
  chassis_state: ChassisStateSnapshot | null
  master_control_pose: MasterControlPoseSnapshot | null
  odin_odometry: PoseSourceSnapshot<OdinOdometryPoseMessage> | null
  odin_base_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
  laser_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
  laser_status: LaserStatusSnapshot | null
  map_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
}

export type BlockStateValue = 0 | 1 | 2 | 3 | 4

export interface DashboardSnapshotMessage {
  type: "dashboard_snapshot"
  seq: number
  time: string
  snapshot: DashboardSnapshot
}

export interface DashboardErrorMessage {
  type: "dashboard_error"
  seq: number
  time: string
  code: ApiErrorCode
  message: string
}

export type DashboardWebSocketMessage =
  | DashboardSnapshotMessage
  | DashboardErrorMessage

export interface ServiceSummaryUpdate {
  service_index: number
  overall: OverallStatus
  docker: Pick<
    DockerStatus,
    | "exists"
    | "state"
    | "running"
    | "status"
    | "exit_code"
    | "restart_count"
    | "health"
  >
  ros: Pick<RosStatus, "agent_available" | "level" | "summary">
}

export interface DashboardChassisFrameMessage {
  type: "dashboard_chassis"
  seq: number
  time: string
  chassis_state: ChassisStateSnapshot | null
}

export interface DashboardPoseFrameMessage {
  type: "dashboard_pose"
  seq: number
  time: string
  master_control_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
}

export interface DashboardServicesFrameMessage {
  type: "dashboard_services"
  seq: number
  time: string
  services: ServiceSummaryUpdate[]
}

export interface DashboardLaserFrameMessage {
  type: "dashboard_laser"
  seq: number
  time: string
  laser_status: LaserStatusSnapshot | null
}

export interface DashboardOdinFrameMessage {
  type: "dashboard_odin"
  seq: number
  time: string
  odin_odometry: PoseSourceSnapshot<OdinOdometryPoseMessage> | null
}

export interface DashboardOdinBaseFrameMessage {
  type: "dashboard_odin_base"
  seq: number
  time: string
  odin_base_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
}

export interface DashboardLaserPoseFrameMessage {
  type: "dashboard_laser_pose"
  seq: number
  time: string
  laser_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
}

export interface DashboardMapPoseFrameMessage {
  type: "dashboard_map_pose"
  seq: number
  time: string
  map_pose: PoseSourceSnapshot<MasterControlPoseMessage> | null
}

export interface LaserDetailSnapshotMessage {
  type: "laser_detail_snapshot"
  time: string
  snapshot: LaserStatusSnapshot | null
}

export interface LaserDetailErrorMessage {
  type: "laser_detail_error"
  time: string
  code: ApiErrorCode
  message: string
}

export type LaserDetailWebSocketMessage =
  | LaserDetailSnapshotMessage
  | LaserDetailErrorMessage

export type DashboardCompactWebSocketMessage =
  | DashboardChassisFrameMessage
  | DashboardPoseFrameMessage
  | DashboardServicesFrameMessage
  | DashboardLaserFrameMessage
  | DashboardOdinFrameMessage
  | DashboardOdinBaseFrameMessage
  | DashboardLaserPoseFrameMessage
  | DashboardMapPoseFrameMessage
  | DashboardErrorMessage

export type DashboardStreamMessage =
  | DashboardWebSocketMessage
  | DashboardCompactWebSocketMessage

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

export interface ResetOriginPreset {
  id: string
  label: string
  pose_x: number
  pose_y: number
  pose_z: number
  pose_yaw_deg: number
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

export type RetryType = "retry_take_spear" | "retry_merlin" | "retry_combat"

export interface RetryStateParams {
  spear_index?: number
  previous_spear_needs_dock?: boolean
  r2_taken_count?: number
  taken_r2_blocks?: number[]
  combat_source?: number
  combat_place_layer?: number
}

export interface RetryStateSnapshot {
  active_retry_type: RetryType
  params: RetryStateParams
  revision: number
}

export interface RetryStateUpdate {
  active_retry_type: RetryType
  params: RetryStateParams
}

export interface RetryStateSnapshotMessage {
  type: "retry_state_snapshot"
  time: string
  snapshot: RetryStateSnapshot
}

export interface RetryStateErrorMessage {
  type: "retry_state_error"
  time: string
  code: string
  message: string
}

export type RetryStateWebSocketMessage =
  | RetryStateSnapshotMessage
  | RetryStateErrorMessage

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
