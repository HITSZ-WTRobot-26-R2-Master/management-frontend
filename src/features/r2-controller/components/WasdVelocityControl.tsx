import { useState, useEffect, useRef, useCallback } from "react"
import type { ControllerConfig } from "@/features/r2-controller/types/controller"

const V_DEFAULT = 1.0
const V_MAX_LIMIT = 8.0
const A_DEFAULT = 1.2
const A_MAX_LIMIT = 3.0
const W_DEFAULT = 60
const W_MAX_LIMIT = 460
const AW_DEFAULT = 70
const AW_MAX_LIMIT = 170
const SEND_INTERVAL = 50

interface WasdVelocityControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
  config: ControllerConfig | null
}

const initialKeys = { w: false, a: false, s: false, d: false, q: false, e: false }
type KeyState = typeof initialKeys

export function WasdVelocityControl({ connected, sendCommand, config }: WasdVelocityControlProps) {
  const [vMax, setVMax] = useState(config?.velocity.xy_maxv ?? V_DEFAULT)
  const [aMax, setAMax] = useState(config?.velocity.xy_maxa ?? A_DEFAULT)
  const [wMax, setWMax] = useState(config?.velocity.yaw_maxv ?? W_DEFAULT)
  const [awMax, setAwMax] = useState(config?.velocity.yaw_maxa ?? AW_DEFAULT)
  const [enabled, setEnabled] = useState(false)
  const keysRef = useRef<KeyState>({ ...initialKeys })
  const [keyDisplay, setKeyDisplay] = useState<KeyState>({ ...initialKeys })
  const lastSentRef = useRef({ vx: 0, vy: 0, wz: 0 })
  const sendingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vMaxRef = useRef(vMax)
  const wMaxRef = useRef(wMax)
  vMaxRef.current = vMax
  wMaxRef.current = wMax

  const anyKeyHeld = useCallback(() => {
    const k = keysRef.current
    return k.w || k.a || k.s || k.d || k.q || k.e
  }, [])

  const sendCurrentVelocity = useCallback(
    (v: number, w: number) => {
      const k = keysRef.current
      let vx = 0, vy = 0, wz = 0
      if (k.w) vx += v
      if (k.s) vx -= v
      if (k.a) vy += v
      if (k.d) vy -= v
      if (k.q) wz += w
      if (k.e) wz -= w
      const last = lastSentRef.current
      const isZero = vx === 0 && vy === 0 && wz === 0
      const lastZero = last.vx === 0 && last.vy === 0 && last.wz === 0
      if (isZero && lastZero) return
      lastSentRef.current = { vx, vy, wz }
      sendCommand(0x15, [vx, vy, wz])
    },
    [sendCommand],
  )

  const startSending = useCallback(() => {
    if (sendingRef.current) return
    sendingRef.current = true
    sendCurrentVelocity(vMaxRef.current, wMaxRef.current)
    intervalRef.current = setInterval(() => {
      sendCurrentVelocity(vMaxRef.current, wMaxRef.current)
    }, SEND_INTERVAL)
  }, [sendCurrentVelocity])

  const stopSending = useCallback(() => {
    if (!sendingRef.current) return
    sendingRef.current = false
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    keysRef.current = { ...initialKeys }
    setKeyDisplay({ ...initialKeys })
    lastSentRef.current = { vx: 0, vy: 0, wz: 0 }
    sendCommand(0x15, [0, 0, 0])
  }, [sendCommand])

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      stopSending()
      return
    }

    const isInput = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInput(e.target)) return
      const key = e.key.toLowerCase()
      if (key in keysRef.current) {
        e.preventDefault()
        if (e.repeat) return
        const wasHeld = anyKeyHeld()
        keysRef.current[key as keyof KeyState] = true
        setKeyDisplay({ ...keysRef.current })
        if (!wasHeld) startSending()
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keysRef.current) {
        e.preventDefault()
        keysRef.current[key as keyof KeyState] = false
        setKeyDisplay({ ...keysRef.current })
        if (!anyKeyHeld()) stopSending()
      }
    }

    const handleBlur = () => stopSending()

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
      stopSending()
    }
  }, [enabled, anyKeyHeld, startSending, stopSending])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-card-foreground">WASD 速度控制</h3>
        <button
          onClick={() => setEnabled(!enabled)}
          disabled={!connected}
          className={`px-2 py-0.5 rounded text-sm text-white transition-colors disabled:opacity-50 ${
            enabled ? "bg-emerald-600" : "bg-gray-500 hover:bg-gray-600"
          }`}
        >
          {enabled ? "已启用" : "点击启用"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 max-w-[12rem] mx-auto">
        <div />
        <KeyBadge keyName="W" label="前进" active={keyDisplay.w} />
        <div />
        <KeyBadge keyName="A" label="左移" active={keyDisplay.a} />
        <KeyBadge keyName="S" label="后退" active={keyDisplay.s} />
        <KeyBadge keyName="D" label="右移" active={keyDisplay.d} />
        <KeyBadge keyName="Q" label="左转" active={keyDisplay.q} />
        <div />
        <KeyBadge keyName="E" label="右转" active={keyDisplay.e} />
      </div>

      <div className="space-y-2">
        <SliderField label="平移 最大速度" unit="m/s" value={vMax} onChange={setVMax} min={0} max={V_MAX_LIMIT} step={0.05} />
        <SliderField label="平移 最大加速度" unit="m/s²" value={aMax} onChange={setAMax} min={0} max={A_MAX_LIMIT} step={0.05} />
        <SliderField label="旋转 最大速度" unit="°/s" value={wMax} onChange={setWMax} min={0} max={W_MAX_LIMIT} step={5} />
        <SliderField label="旋转 最大加速度" unit="°/s²" value={awMax} onChange={setAwMax} min={0} max={AW_MAX_LIMIT} step={5} />
      </div>

      <p className="text-xs text-muted-foreground">
        启用后焦点在窗口时按键生效。W/A/S/D 平移，Q/E 旋转。松开按键自动停止。
      </p>
    </div>
  )
}

function KeyBadge({ keyName, label, active }: { keyName: string; label: string; active: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded border-2 w-12 h-12 text-xs font-mono transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border"
      }`}
    >
      <span className="font-bold text-sm">{keyName}</span>
      <span className="text-[10px]">{label}</span>
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
