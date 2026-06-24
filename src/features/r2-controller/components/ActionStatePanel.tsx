import type { ChassisStateSnapshot } from "@/features/r2-controller/types/controller"

const STEP_LABELS: Record<number, string> = {
  0: "空闲", 1: "完成", 2: "执行中", 3: "等待取矛",
}
const CHASSIS_MODE: Record<number, string> = { 0: "待命", 1: "曲线", 2: "速度" }
const LIFT_LABELS: Record<number, string> = { 0: "空闲", 1: "执行中", 2: "就绪" }
const GRIP_LABELS: Record<number, string> = {
  0: "空闲", 1: "取矛中", 2: "KFS存", 3: "KFS放", 5: "完成",
}
const IR_LABELS: Record<number, string> = { 0: "无", 1: "对接完成", 2: "保活" }

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
            <span className="font-medium text-card-foreground">{STEP_LABELS[state.action.step_status] ?? state.action.step_status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">底盘模式</span>
            <span className="font-medium text-card-foreground">{CHASSIS_MODE[state.action.chassis_mode] ?? state.action.chassis_mode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">曲线完成</span>
            <span className="font-medium text-card-foreground">{state.action.chassis_curve_finished ? "✓" : "✗"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">升降</span>
            <span className="font-medium text-card-foreground">{LIFT_LABELS[state.action.lift_status] ?? state.action.lift_status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">夹爪</span>
            <span className="font-medium text-card-foreground">{GRIP_LABELS[state.action.grip_status] ?? state.action.grip_status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">吸盘有物</span>
            <span className={`font-medium ${state.action.grip_suction_has_object ? "text-emerald-600" : "text-muted-foreground"}`}>
              {state.action.grip_suction_has_object ? "是" : "否"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">红外</span>
            <span className="font-medium text-card-foreground">{IR_LABELS[state.action.infrared_receiver_state] ?? state.action.infrared_receiver_state}</span>
          </div>
        </div>
      )}
    </div>
  )
}
