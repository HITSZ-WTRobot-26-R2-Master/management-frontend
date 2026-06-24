import { useState, useRef, useCallback } from "react"
import { VerticalSlider } from "@/features/r2-controller/components/VerticalSlider"
import type { ChassisStateSnapshot, ControllerConfig } from "@/features/r2-controller/types/controller"

const HEIGHT_MIN = 0.207
const HEIGHT_MAX = 0.6152
const HEIGHT_STEP = 0.005
const LIFT_V_DEFAULT = 0.05
const LIFT_V_MAX_LIMIT = 1.178
const LIFT_A_DEFAULT = 0.02
const LIFT_A_MAX_LIMIT = 5.0

interface HeightControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
  config: ControllerConfig | null
  state: ChassisStateSnapshot | null
}

export function HeightControl({ connected, sendCommand, config, state }: HeightControlProps) {
  const [height, setHeight] = useState(config?.height.min ?? HEIGHT_MIN)
  const [vMax, setVMax] = useState(config?.height.v_max ?? LIFT_V_DEFAULT)
  const [aMax, setAMax] = useState(config?.height.a_max ?? LIFT_A_DEFAULT)
  const [immediateSend, setImmediateSend] = useState(false)

  const lastSendTs = useRef(0)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestParams = useRef({ height: config?.height.min ?? HEIGHT_MIN, vMax: config?.height.v_max ?? LIFT_V_DEFAULT, aMax: config?.height.a_max ?? LIFT_A_DEFAULT })

  const clamp = useCallback((v: number) => Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, v)), [])
  const clampRange = useCallback((v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)), [])

  const doSend = useCallback(() => {
    lastSendTs.current = Date.now()
    const p = latestParams.current
    sendCommand(0x11, [p.height, p.vMax, p.aMax, 0, 0])
  }, [sendCommand])

  const scheduleSend = useCallback(() => {
    const now = Date.now()
    const elapsed = now - lastSendTs.current
    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current)
      pendingTimer.current = null
    }
    if (elapsed >= 40) {
      doSend()
    } else {
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null
        doSend()
      }, 40 - elapsed)
    }
  }, [doSend])

  const handleHeightChange = useCallback((v: number) => {
    const c = clamp(v)
    setHeight(c)
    latestParams.current.height = c
    if (immediateSend) scheduleSend()
  }, [clamp, immediateSend, scheduleSend])

  const handleVMaxChange = useCallback((v: number) => {
    const c = clampRange(v, 0, LIFT_V_MAX_LIMIT)
    setVMax(c)
    latestParams.current.vMax = c
  }, [clampRange])

  const handleAMaxChange = useCallback((v: number) => {
    const c = clampRange(v, 0, LIFT_A_MAX_LIMIT)
    setAMax(c)
    latestParams.current.aMax = c
  }, [clampRange])

  const handleUseCurrentHeight = useCallback(() => {
    if (state) {
      const h = clamp(state.pose.front_height)
      setHeight(h)
      latestParams.current.height = h
      if (immediateSend) scheduleSend()
    }
  }, [state, clamp, immediateSend, scheduleSend])

  const pct = ((height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)) * 100

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-card-foreground">底盘高度控制</h3>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <span>即时发送</span>
          <button
            type="button"
            role="switch"
            aria-checked={immediateSend}
            disabled={!connected}
            onClick={() => setImmediateSend(!immediateSend)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              immediateSend ? "bg-primary" : "bg-gray-400"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                immediateSend ? "translate-x-[1.125rem]" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
      </div>
      <div className="flex gap-3 items-stretch">
        <div className="flex flex-col items-center gap-1.5 shrink-0 py-0.5">
          <span className="text-xs text-muted-foreground font-mono">{HEIGHT_MAX.toFixed(3)}</span>
          <VerticalSlider
            value={height}
            min={HEIGHT_MIN}
            max={HEIGHT_MAX}
            step={HEIGHT_STEP}
            onChange={handleHeightChange}
            height={224}
          />
          <span className="text-xs text-muted-foreground font-mono">{HEIGHT_MIN.toFixed(3)}</span>
        </div>

        <div className="flex-1 space-y-2">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-sm text-muted-foreground">
                当前高度 <span className="font-mono text-card-foreground">{height.toFixed(3)} m</span>
                <span className="ml-1.5 text-muted-foreground">({pct.toFixed(0)}%)</span>
              </label>
              <button
                type="button"
                onClick={handleUseCurrentHeight}
                disabled={!state}
                className="text-xs px-2 py-0.5 rounded border border-border bg-card text-muted-foreground hover:text-card-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                使用当前
              </button>
            </div>
            <input
              type="number"
              step={HEIGHT_STEP} min={HEIGHT_MIN} max={HEIGHT_MAX}
              value={height}
              onChange={(e) => handleHeightChange(parseFloat(e.target.value) || HEIGHT_MIN)}
              className="w-full border border-input rounded px-2 py-1 bg-card text-card-foreground"
            />
          </div>
          <SliderField label="最大速度" unit="m/s" value={vMax} onChange={handleVMaxChange} min={0} max={LIFT_V_MAX_LIMIT} step={0.01} />
          <SliderField label="最大加速度" unit="m/s²" value={aMax} onChange={handleAMaxChange} min={0} max={LIFT_A_MAX_LIMIT} step={0.05} />
          {!immediateSend && (
            <button
              type="button"
              onClick={doSend}
              disabled={!connected}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full text-sm"
            >
              发送
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        高度 {HEIGHT_MIN}–{HEIGHT_MAX} m · 速度上限 {LIFT_V_MAX_LIMIT} m/s · 加速度上限 {LIFT_A_MAX_LIMIT} m/s²
      </p>
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
