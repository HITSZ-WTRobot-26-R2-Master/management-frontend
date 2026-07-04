import type { ChassisStateSnapshot } from "@/features/r2-controller/types/controller"

const STEP_LABELS: Record<number, string> = {
  0: "空闲",
  1: "完成",
  2: "执行中",
  3: "等待取矛",
}
const CHASSIS_MODE: Record<number, string> = {
  0: "停止",
  1: "速度",
  2: "位置",
  3: "从机",
}
const LIFT_LABELS: Record<number, string> = {
  0: "校准中",
  1: "执行中",
  2: "就绪",
  3: "未启用",
}
const GRIP_LABELS: Record<number, string> = {
  0: "校准中",
  1: "取矛中",
  2: "KFS存",
  3: "KFS放",
  5: "完成",
  6: "运行中",
}
const TRAJECTORY_LABELS: Record<number, string> = {
  0: "空闲",
  1: "执行中",
  2: "完成",
  3: "中断",
}

function formatInfraredSwitchState(value: number) {
  const active = [0, 1, 2, 3].filter((index) => Boolean(value & (1 << index)))
  const bits = `0b${(value & 0xf).toString(2).padStart(4, "0")}`
  return active.length > 0 ? `${bits} [${active.join(", ")}]` : bits
}

interface ActionStatePanelProps {
  state: ChassisStateSnapshot | null
  connected: boolean
}

export function ActionStatePanel({ state, connected }: ActionStatePanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-card-foreground">动作状态</h3>
      {!state ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {connected ? "等待状态数据..." : "未连接"}
        </p>
      ) : (
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">台阶</span>
            <span className="font-medium text-card-foreground">
              {STEP_LABELS[state.action.step_status] ?? state.action.step_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">底盘模式</span>
            <span className="font-medium text-card-foreground">
              {CHASSIS_MODE[state.action.chassis_mode] ?? state.action.chassis_mode}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">曲线完成</span>
            <span className="font-medium text-card-foreground">
              {state.action.chassis_curve_finished ? "✓" : "✗"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">升降</span>
            <span className="font-medium text-card-foreground">
              {LIFT_LABELS[state.action.lift_status] ?? state.action.lift_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">夹爪</span>
            <span className="font-medium text-card-foreground">
              {GRIP_LABELS[state.action.grip_status] ?? state.action.grip_status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">离线轨迹</span>
            <span className="font-medium text-card-foreground">
              {TRAJECTORY_LABELS[state.action.trajectory_offline_state] ??
                state.action.trajectory_offline_state}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">红外开关</span>
            <span className="font-medium text-card-foreground">
              {formatInfraredSwitchState(state.action.infrared_switch_state)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
