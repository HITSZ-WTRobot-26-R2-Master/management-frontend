import { Wifi, WifiOff } from "lucide-react"
import type { ChassisStateSnapshot } from "@/features/r2-controller/types/controller"

const DEVICES = [
  { key: "wheel_0", label: "轮组0" },
  { key: "wheel_1", label: "轮组1" },
  { key: "wheel_2", label: "轮组2" },
  { key: "wheel_3", label: "轮组3" },
  { key: "lift_0", label: "升降0" },
  { key: "lift_1", label: "升降1" },
  { key: "lift_2", label: "升降2" },
  { key: "lift_3", label: "升降3" },
  { key: "grip_arm", label: "夹爪臂" },
  { key: "grip_turn", label: "夹爪转" },
  { key: "gyro_yaw", label: "陀螺仪" },
  { key: "upper_host_localization", label: "上机定位" },
  { key: "upper_host", label: "上位机" },
]

interface ConnectionMapProps {
  state: ChassisStateSnapshot | null
  connected: boolean
}

export function ConnectionMap({ state, connected }: ConnectionMapProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-card-foreground">子设备连接</h3>
      {!state ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {connected ? "等待状态数据..." : "未连接"}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-y-1 gap-x-3 text-sm">
          {DEVICES.map(({ key, label }) => {
            const online = Boolean((state.connection as unknown as Record<string, boolean | number>)[key])
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{label}</span>
                {online ? (
                  <Wifi className="size-4 text-emerald-500" />
                ) : (
                  <WifiOff className="size-4 text-red-400" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
