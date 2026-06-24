import type { ChassisStateSnapshot } from "@/features/r2-controller/types/controller"

function fmt(v: number | undefined, d: number = 3): string {
  if (v === undefined || !Number.isFinite(v)) return "—"
  return v.toFixed(d)
}

interface StatusDisplayProps {
  state: ChassisStateSnapshot | null
  connected: boolean
}

export function StatusDisplay({ state, connected }: StatusDisplayProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-card-foreground">底盘位姿</h3>
      {!state ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {connected ? "等待状态数据..." : "未连接"}
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">X</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {fmt(state.pose.x)} m
          </dd>
          <dt className="text-muted-foreground">Y</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {fmt(state.pose.y)} m
          </dd>
          <dt className="text-muted-foreground">航向</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {fmt(state.pose.yaw_deg, 1)}°
          </dd>
          <dt className="text-muted-foreground">前高</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {fmt(state.pose.front_height)} m
          </dd>
          <dt className="text-muted-foreground">后高</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {fmt(state.pose.rear_height)} m
          </dd>
          <dt className="text-muted-foreground">时间戳</dt>
          <dd className="text-right font-mono tabular-nums text-card-foreground">
            {state.timestamp_ms} ms
          </dd>
        </dl>
      )}
    </div>
  )
}
