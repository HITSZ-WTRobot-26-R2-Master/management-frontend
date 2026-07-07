import { useState } from "react"
import type { ControllerConfig } from "@/features/r2-controller/types/controller"

// ---- RadioGroup ----
function RadioGroup<T extends string | number>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex flex-wrap rounded border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 text-sm transition-colors border-r border-border last:border-r-0 ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-card text-card-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---- InputRow ----
function InputRow({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="flex-1 text-sm text-muted-foreground">{label}</label>
      <input
        type="number" step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="border border-input rounded px-2 py-1 w-28 bg-card text-card-foreground"
      />
    </div>
  )
}

// ---- NumField ----
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

// ===================== StepControl =====================

interface StepControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
  config: ControllerConfig | null
}

export function StepControl({ connected, sendCommand }: StepControlProps) {
  const [startDist, setStartDist] = useState(0.5)
  const [endDist, setEndDist] = useState(0.5)
  const [direction, setDirection] = useState(0)
  const [stepHeight, setStepHeight] = useState<"200mm" | "400mm">("200mm")
  const [endHeight, setEndHeight] = useState(0)

  const stepUpCmd = stepHeight === "200mm" ? 0x30 : 0x33
  const stepDownCmd = stepHeight === "200mm" ? 0x32 : 0x34

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">台阶控制</h3>
      <div className="space-y-2">
        <InputRow label="起始距离 (m)" value={startDist} onChange={setStartDist} step={0.01} />
        <InputRow label="结束距离 (m)" value={endDist} onChange={setEndDist} step={0.01} />
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">方向</label>
          <RadioGroup value={direction} onChange={setDirection} options={[{ value: 0, label: "前进" }, { value: 1, label: "后退" }]} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">台阶高度</label>
          <RadioGroup value={stepHeight} onChange={(v) => setStepHeight(v)} options={[{ value: "200mm", label: "200mm" }, { value: "400mm", label: "400mm" }]} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">动作结束后底盘高度</label>
          <RadioGroup value={endHeight} onChange={setEndHeight} options={[{ value: 0, label: "Low (0.22m)" }, { value: 1, label: "High (0.42m)" }]} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => sendCommand(stepUpCmd, [startDist, endDist, direction, endHeight])}
          disabled={!connected}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 text-sm"
        >
          登上
        </button>
        <button
          onClick={() => sendCommand(stepDownCmd, [startDist, endDist, direction, endHeight])}
          disabled={!connected}
          className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600 text-sm"
        >
          走下
        </button>
        <button
          onClick={() => sendCommand(0x31, [])}
          disabled={!connected}
          className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600 text-sm"
        >
          继续登
        </button>
      </div>
    </div>
  )
}

// ===================== StepUpR1Control =====================

interface StepUpR1ControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
}

export function StepUpR1Control({ connected, sendCommand }: StepUpR1ControlProps) {
  const [stepTargetX, setStepTargetX] = useState(0)
  const [stepTargetY, setStepTargetY] = useState(0)
  const [stepTargetYaw, setStepTargetYaw] = useState(0)
  const [direction, setDirection] = useState(0)

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">R1 台阶 (StepUpR1 0x35)</h3>
      <div>
        <label className="text-sm text-muted-foreground block mb-0.5">方向</label>
        <RadioGroup value={direction} onChange={setDirection} options={[{ value: 0, label: "前进" }, { value: 1, label: "后退" }]} />
      </div>
      <div>
        <label className="text-sm text-muted-foreground block mb-0.5">台阶作业点 (世界系)</label>
        <div className="grid grid-cols-3 gap-1.5">
          <NumField label="X (m)" step={0.01} value={stepTargetX} onChange={setStepTargetX} />
          <NumField label="Y (m)" step={0.01} value={stepTargetY} onChange={setStepTargetY} />
          <NumField label="Yaw (°)" step={0.1} value={stepTargetYaw} onChange={setStepTargetYaw} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => sendCommand(0x35, [stepTargetX, stepTargetY, stepTargetYaw, direction])}
        disabled={!connected}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full"
      >
        发送 StepUpR1
      </button>
      <p className="text-xs text-muted-foreground">
        终点由下位机内部配置常量 (UpR1EndRelativePos) 相对 stepTargetPos 生成，结束 lift 目标高度固定为 0.100m
      </p>
    </div>
  )
}

// ===================== StepPoseControl =====================

interface StepPoseControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
}

export function StepPoseControl({ connected, sendCommand }: StepPoseControlProps) {
  const [stepType, setStepType] = useState(0)
  const [direction, setDirection] = useState(0)
  const [stepHeight, setStepHeight] = useState(0)
  const [finalHeight, setFinalHeight] = useState(0)
  const [stepTargetX, setStepTargetX] = useState(0)
  const [stepTargetY, setStepTargetY] = useState(0)
  const [stepTargetYaw, setStepTargetYaw] = useState(0)
  const [endX, setEndX] = useState(0)
  const [endY, setEndY] = useState(0)
  const [endYaw, setEndYaw] = useState(0)

  const handleSend = () => {
    const cmd = 0x50 | (stepType << 3) | (direction << 2) | (stepHeight << 1) | finalHeight
    sendCommand(cmd, [stepTargetX, stepTargetY, stepTargetYaw, endX, endY, endYaw])
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">世界系台阶 (StepPose 0x50-0x5F)</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">动作类型</label>
          <RadioGroup value={stepType} onChange={setStepType} options={[{ value: 0, label: "上台阶" }, { value: 1, label: "下台阶" }]} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">方向</label>
          <RadioGroup value={direction} onChange={setDirection} options={[{ value: 0, label: "前进" }, { value: 1, label: "后退" }]} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">台阶高度</label>
          <RadioGroup value={stepHeight} onChange={setStepHeight} options={[{ value: 0, label: "200mm" }, { value: 1, label: "400mm" }]} />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-0.5">结束底盘高度</label>
          <RadioGroup value={finalHeight} onChange={setFinalHeight} options={[{ value: 0, label: "Low (0.22m)" }, { value: 1, label: "High (0.42m)" }]} />
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground block mb-0.5">台阶作业点 (世界系)</label>
        <div className="grid grid-cols-3 gap-1.5">
          <NumField label="X (m)" step={0.01} value={stepTargetX} onChange={setStepTargetX} />
          <NumField label="Y (m)" step={0.01} value={stepTargetY} onChange={setStepTargetY} />
          <NumField label="Yaw (°)" step={0.1} value={stepTargetYaw} onChange={setStepTargetYaw} />
        </div>
      </div>
      <div>
        <label className="text-sm text-muted-foreground block mb-0.5">结束位置 (世界系)</label>
        <div className="grid grid-cols-3 gap-1.5">
          <NumField label="X (m)" step={0.01} value={endX} onChange={setEndX} />
          <NumField label="Y (m)" step={0.01} value={endY} onChange={setEndY} />
          <NumField label="Yaw (°)" step={0.1} value={endYaw} onChange={setEndYaw} />
        </div>
      </div>
      <button
        type="button"
        onClick={handleSend}
        disabled={!connected}
        className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full"
      >
        发送 StepPose
      </button>
    </div>
  )
}
