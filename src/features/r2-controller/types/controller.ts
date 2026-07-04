/** 底盘实时状态（与 ChassisFeedback.msg 对应） */

export interface ChassisStatePose {
  x: number
  y: number
  yaw_deg: number
  front_height: number
  rear_height: number
}

export interface ChassisStateAction {
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

export interface ChassisStateConnection {
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

export interface ChassisStateSnapshot {
  timestamp_ms: number
  pose: ChassisStatePose
  action: ChassisStateAction
  connection: ChassisStateConnection
}

/** 底盘命令：cmd + 6 个 float32 data */
export type ChassisCommand = {
  cmd: number
  data: [number, number, number, number, number, number]
}

/** 控制器参数（从 /chassis/config 加载） */
export interface ControllerVelocityConfig {
  xy_maxv: number
  xy_maxa: number
  yaw_maxv: number
  yaw_maxa: number
  send_interval_ms: number
}

export interface ControllerHeightConfig {
  min: number
  max: number
  step: number
  v_max: number
  a_max: number
  j_max: number
}

export interface ControllerStepConfig {
  step_height_200: number
  step_height_400: number
}

export interface ControllerConfig {
  velocity: ControllerVelocityConfig
  height: ControllerHeightConfig
  step: ControllerStepConfig
  commands: Array<{
    name: string
    cmd_byte: number
    param_fields: string
    description: string
  }>
}

/** WebSocket 协议消息 */
export type ServerMessage =
  | { type: "chassis_state"; data: ChassisStateSnapshot }
  | { type: "config"; data: ControllerConfig }

export type ClientMessage =
  | { type: "command"; cmd: number; data: number[] }
  | { type: "subscribe"; enabled: boolean }
