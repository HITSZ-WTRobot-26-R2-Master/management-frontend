import type { ChassisActionState } from "@/types/management"
import { formatHexWord } from "@/lib/display-format"

const stepStatusLabels: Record<number, string> = {
  0: "Idle",
  1: "Done",
  2: "Running",
  3: "WaitingTake",
}

const chassisModeLabels: Record<number, string> = {
  0: "Stop",
  1: "Velocity",
  2: "Position",
  3: "Slave",
}

const liftStatusLabels: Record<number, string> = {
  0: "Calibrating",
  1: "Running",
  2: "Ready",
  3: "NotEnabled",
}

const gripStatusLabels: Record<number, string> = {
  0: "Calibrating",
  1: "TakingSpear",
  2: "KfsStore",
  3: "KfsRelease",
  4: "Idle",
  5: "Done",
}

const infraredReceiverStateLabels: Record<number, string> = {
  0: "A0",
  1: "A1",
  2: "A2",
  3: "A3",
}

export function formatChassisStepStatus(value: number) {
  return formatEnumValue(stepStatusLabels, value)
}

export function formatChassisMode(value: number) {
  return formatEnumValue(chassisModeLabels, value)
}

export function formatChassisCurveFinished(value: boolean) {
  return value ? "Finished" : "Unfinished"
}

export function formatLiftStatus(value: number) {
  return formatEnumValue(liftStatusLabels, value)
}

export function formatGripStatus(value: number) {
  return formatEnumValue(gripStatusLabels, value)
}

export function formatGripSuctionHasObject(value: boolean) {
  return value ? "HasObject" : "NoObject"
}

export function formatInfraredReceiverState(value: number) {
  return formatEnumValue(infraredReceiverStateLabels, value)
}

export function getChassisActionStateDisplayFields(
  action: ChassisActionState,
) {
  return [
    ["raw_table", formatHexWord(action.raw_table)],
    ["step_status", formatChassisStepStatus(action.step_status)],
    ["chassis_mode", formatChassisMode(action.chassis_mode)],
    [
      "chassis_curve_finished",
      formatChassisCurveFinished(action.chassis_curve_finished),
    ],
    ["lift_status", formatLiftStatus(action.lift_status)],
    ["grip_status", formatGripStatus(action.grip_status)],
    [
      "grip_suction_has_object",
      formatGripSuctionHasObject(action.grip_suction_has_object),
    ],
    [
      "infrared_receiver_state",
      formatInfraredReceiverState(action.infrared_receiver_state),
    ],
  ] satisfies Array<[string, string]>
}

function formatEnumValue(labels: Record<number, string>, value: number) {
  return labels[value] ?? `Unknown(${String(value)})`
}
