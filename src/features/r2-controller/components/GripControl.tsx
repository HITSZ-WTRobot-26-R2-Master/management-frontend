import { useState } from "react"

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

interface GripControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
}

export function GripControl({ connected, sendCommand }: GripControlProps) {
  const [mode, setMode] = useState<"byId" | "byPos">("byId")
  const [spearId, setSpearId] = useState(0)
  const [targetX, setTargetX] = useState(0)
  const [targetY, setTargetY] = useState(0)
  const [targetYaw, setTargetYaw] = useState(0)
  const [endX, setEndX] = useState(0)
  const [endY, setEndY] = useState(0)
  const [endYaw, setEndYaw] = useState(0)
  const [armPos, setArmPos] = useState(0)
  const [turnPos, setTurnPos] = useState(0)
  const [clawMode, setClawMode] = useState(0)
  const [presetId, setPresetId] = useState(0)

  const handleTake = () => {
    if (mode === "byId") {
      sendCommand(0x41, [spearId, endX, endY, endYaw])
    } else {
      sendCommand(0x40, [targetX, targetY, targetYaw, endX, endY, endYaw])
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">夹爪控制</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* 左列：取矛操作 */}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground block mb-0.5">取矛协议</label>
            <RadioGroup
              value={mode}
              onChange={(v) => setMode(v)}
              options={[{ value: "byId", label: "按编号 (0x41)" }, { value: "byPos", label: "按坐标 (0x40)" }]}
            />
          </div>
          {mode === "byId" ? (
            <div>
              <label className="text-sm text-muted-foreground block mb-0.5">矛编号</label>
              <RadioGroup
                value={spearId}
                onChange={setSpearId}
                options={[0, 1, 2, 3, 4, 5].map((id) => ({ value: id, label: String(id) }))}
              />
            </div>
          ) : (
            <div>
              <label className="text-sm text-muted-foreground block mb-0.5">目标位姿</label>
              <div className="grid grid-cols-3 gap-1.5">
                <NumField label="X (m)" step={0.01} value={targetX} onChange={setTargetX} />
                <NumField label="Y (m)" step={0.01} value={targetY} onChange={setTargetY} />
                <NumField label="Yaw (°)" step={0.1} value={targetYaw} onChange={setTargetYaw} />
              </div>
            </div>
          )}
          <div>
            <label className="text-sm text-muted-foreground block mb-0.5">终点位姿</label>
            <div className="grid grid-cols-3 gap-1.5">
              <NumField label="X (m)" step={0.01} value={endX} onChange={setEndX} />
              <NumField label="Y (m)" step={0.01} value={endY} onChange={setEndY} />
              <NumField label="Yaw (°)" step={0.1} value={endYaw} onChange={setEndYaw} />
            </div>
          </div>
          <button
            onClick={handleTake}
            disabled={!connected}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full"
          >
            取矛
          </button>
          <div className="border-t border-border pt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => sendCommand(0x42, [])}
              disabled={!connected}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
            >
              存储 KFS
            </button>
            <button
              onClick={() => sendCommand(0x43, [])}
              disabled={!connected}
              className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600"
            >
              释放 KFS
            </button>
          </div>
        </div>

        {/* 右列：夹爪执行器 */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-card-foreground">Grip 吸盘 (0x44)</h4>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => sendCommand(0x44, [1])} disabled={!connected} className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90">启动</button>
              <button onClick={() => sendCommand(0x44, [0])} disabled={!connected} className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600">关闭</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-card-foreground">独立夹爪 (0x46)</h4>
            <p className="text-xs text-muted-foreground">仅控制夹爪 GPIO，不影响 arm/turn 关节</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => sendCommand(0x46, [0])} disabled={!connected} className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90">张开</button>
              <button onClick={() => sendCommand(0x46, [1])} disabled={!connected} className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600">闭合</button>
            </div>
          </div>

          <div className="border-t border-border pt-2 space-y-2">
            <h4 className="text-sm font-semibold text-card-foreground">Grip 关节姿态 (0x16)</h4>
            <InputRow label="大臂角 arm_pos (°)" value={armPos} onChange={setArmPos} step={0.1} />
            <InputRow label="转向角 turn_pos (°)" value={turnPos} onChange={setTurnPos} step={0.1} />
            <div>
              <label className="text-sm text-muted-foreground block mb-0.5">夹爪模式</label>
              <RadioGroup value={clawMode} onChange={setClawMode} options={[{ value: 0, label: "保持" }, { value: 1, label: "张开" }, { value: 2, label: "闭合" }]} />
            </div>
            <button onClick={() => sendCommand(0x16, [armPos, turnPos, clawMode])} disabled={!connected} className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full">发送关节姿态</button>
          </div>

          <div className="border-t border-border pt-2 space-y-2">
            <h4 className="text-sm font-semibold text-card-foreground">Grip 预设姿态 (0x17)</h4>
            <div>
              <label className="text-sm text-muted-foreground block mb-0.5">预设</label>
              <div className="flex flex-wrap gap-0.5">
                {[
                  { id: 0, label: "Standby" }, { id: 1, label: "PrepareGrab" }, { id: 2, label: "Grab" },
                  { id: 3, label: "Docking" }, { id: 4, label: "KfsPickup" }, { id: 5, label: "KfsStore" }, { id: 6, label: "KfsRelease" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    className={`px-1.5 py-0.5 text-xs rounded border transition-colors ${
                      presetId === p.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-card-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => sendCommand(0x17, [presetId])} disabled={!connected} className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90 w-full">发送预设 ({presetId})</button>
          </div>
        </div>
      </div>
    </div>
  )
}

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
