import { useState } from "react"
import type { ChassisStateSnapshot, ControllerConfig } from "@/features/r2-controller/types/controller"

const XY_VMAX_DEFAULT = 3.0
const XY_AMAX_DEFAULT = 3.0
const YAW_VMAX_DEFAULT = 180
const YAW_AMAX_DEFAULT = 180

interface PostureControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
  config: ControllerConfig | null
  state: ChassisStateSnapshot | null
}

export function PostureControl({ connected, sendCommand, config, state }: PostureControlProps) {
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [yaw, setYaw] = useState(0)
  const [xyVmax, setXyVmax] = useState(config?.velocity.xy_maxv ?? XY_VMAX_DEFAULT)
  const [xyAmax, setXyAmax] = useState(config?.velocity.xy_maxa ?? XY_AMAX_DEFAULT)
  const [yawVmax, setYawVmax] = useState(config?.velocity.yaw_maxv ?? YAW_VMAX_DEFAULT)
  const [yawAmax, setYawAmax] = useState(config?.velocity.yaw_maxa ?? YAW_AMAX_DEFAULT)

  const handleUseCurrent = () => {
    if (state) {
      setX(state.pose.x)
      setY(state.pose.y)
      setYaw(state.pose.yaw_deg)
    }
  }

  const handleSend = () => {
    sendCommand(0x13, [x, y, yaw, xyVmax, xyAmax, yawVmax, yawAmax])
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">位姿控制 (SetMasterChassisTargetCurrentState)</h3>

      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-sm text-muted-foreground">目标位姿</label>
          <button
            type="button"
            onClick={handleUseCurrent}
            disabled={!state}
            className="text-xs px-2 py-0.5 rounded border border-border bg-card text-muted-foreground hover:text-card-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            使用当前位置
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <NumField label="X (m)" step={0.01} value={x} onChange={setX} />
          <NumField label="Y (m)" step={0.01} value={y} onChange={setY} />
          <NumField label="Yaw (°)" step={0.1} value={yaw} onChange={setYaw} />
        </div>
      </div>

      <div>
        <label className="text-sm text-muted-foreground block mb-0.5">运动参数</label>
        <div className="grid grid-cols-2 gap-2">
          <SliderField label="XY 最大速度" unit="m/s" value={xyVmax} onChange={setXyVmax} min={0} max={8} step={0.1} />
          <SliderField label="XY 最大加速度" unit="m/s²" value={xyAmax} onChange={setXyAmax} min={0} max={3} step={0.05} />
          <SliderField label="Yaw 最大速度" unit="°/s" value={yawVmax} onChange={setYawVmax} min={0} max={460} step={1} />
          <SliderField label="Yaw 最大加速度" unit="°/s²" value={yawAmax} onChange={setYawAmax} min={0} max={170} step={1} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!connected}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full"
      >
        发送位姿指令
      </button>
    </div>
  )
}

function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
      <input
        type="number" step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full border border-input rounded px-2 py-1 bg-card text-card-foreground"
      />
    </div>
  )
}

function SliderField({
  label, unit, value, onChange, min, max, step,
}: {
  label: string; unit: string; value: number
  onChange: (v: number) => void; min: number; max: number; step: number
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <label className="text-sm text-muted-foreground">{label} ({unit})</label>
        <input
          type="number" step={step} min={min} max={max}
          value={value}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
          className="w-20 border border-input rounded px-2 py-0.5 text-sm bg-card text-card-foreground text-right"
        />
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  )
}
