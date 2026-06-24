/** 协议缩放常量（与 chassis_serial_node 和 26-r2-controller 一致） */

export const POSITION_SCALE = 2000.0
export const YAW_SCALE = 100.0

/**
 * 构建 SerialCommand 兼容的 {cmd, data} 对象。
 * data 自动补零到 6 个 float。
 */
export function makeCommand(cmd: number, data: number[] = []): { cmd: number; data: number[] } {
  const padded = [...data]
  while (padded.length < 6) {
    padded.push(0)
  }
  return { cmd, data: padded.slice(0, 6) }
}

/** 速度控制 (cmd=0x15) */
export function velocityCommand(
  vx: number,
  vy: number,
  wz: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x15, [vx, vy, wz])
}

/** 紧急停止 (cmd=0x10) */
export function stopCommand(): { cmd: number; data: number[] } {
  return makeCommand(0x10)
}

/** Ping (cmd=0x01) */
export function pingCommand(): { cmd: number; data: number[] } {
  return makeCommand(0x01)
}

/** 升降底盘 (cmd=0x11) */
export function liftCommand(
  height: number,
  vMax: number,
  aMax: number,
  jMax: number,
  linkMode: number = 0,
): { cmd: number; data: number[] } {
  return makeCommand(0x11, [height, vMax, aMax, jMax, linkMode])
}

/** 底盘位姿控制 (cmd=0x13) */
export function moveCommand(
  x: number,
  y: number,
  yawDeg: number,
  xyVmax: number,
  xyAmax: number,
  yawVmax: number,
  yawAmax: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x13, [x, y, yawDeg, xyVmax, xyAmax, yawVmax, yawAmax])
}

/** 台阶控制 (cmd=0x30-0x34) */
export function stepCommand(
  cmd: number,
  startDistance: number,
  endDistance: number,
  direction: number,
  endHeight: number,
): { cmd: number; data: number[] } {
  return makeCommand(cmd, [startDistance, endDistance, direction, endHeight])
}

/** R1台阶 (cmd=0x35) */
export function stepUpR1Command(
  targetX: number,
  targetY: number,
  targetYawDeg: number,
  direction: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x35, [targetX, targetY, targetYawDeg, direction])
}

/** 取矛按坐标 (cmd=0x40) */
export function takeSpearCommand(
  targetX: number,
  targetY: number,
  targetYawDeg: number,
  endX: number,
  endY: number,
  endYawDeg: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x40, [targetX, targetY, targetYawDeg, endX, endY, endYawDeg])
}

/** 取矛按编号 (cmd=0x41) */
export function takeSpearByIdCommand(
  spearId: number,
  endX: number,
  endY: number,
  endYawDeg: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x41, [spearId, endX, endY, endYawDeg])
}

/** KFS存取 (cmd=0x42/0x43) */
export function kfsCommand(cmd: number): { cmd: number; data: number[] } {
  return makeCommand(cmd)
}

/** 世界系台阶 (cmd=0x50-0x5F) */
export function stepPoseCommand(
  stepType: number,
  direction: number,
  stepHeight: number,
  finalHeight: number,
  targetX: number,
  targetY: number,
  targetYawDeg: number,
  endX: number,
  endY: number,
  endYawDeg: number,
): { cmd: number; data: number[] } {
  const cmd = 0x50 | (stepType << 3) | (direction << 2) | (stepHeight << 1) | finalHeight
  return makeCommand(cmd, [targetX, targetY, targetYawDeg, endX, endY, endYawDeg])
}

/** 夹爪关节姿态 (cmd=0x16) */
export function gripPoseCommand(
  armPos: number,
  turnPos: number,
  clawMode: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x16, [armPos, turnPos, clawMode])
}

/** 夹爪预设 (cmd=0x17) */
export function gripPresetCommand(
  presetId: number,
): { cmd: number; data: number[] } {
  return makeCommand(0x17, [presetId])
}

/** 吸盘/夹爪开关 (cmd=0x44/0x45/0x46) */
export function suctionCommand(
  cmd: number,
  on: number,
): { cmd: number; data: number[] } {
  return makeCommand(cmd, [on])
}
