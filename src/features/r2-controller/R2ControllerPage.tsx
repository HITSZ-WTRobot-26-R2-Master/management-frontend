import { useSearchParams } from "react-router-dom"
import { Tabs } from "@/features/r2-controller/components/Tabs"
import { ConnectionPanel } from "@/features/r2-controller/components/ConnectionPanel"
import { StatusDisplay } from "@/features/r2-controller/components/StatusDisplay"
import { ActionStatePanel } from "@/features/r2-controller/components/ActionStatePanel"
import { ConnectionMap } from "@/features/r2-controller/components/ConnectionMap"
import { WasdVelocityControl } from "@/features/r2-controller/components/WasdVelocityControl"
import { HeightControl } from "@/features/r2-controller/components/HeightControl"
import { PostureControl } from "@/features/r2-controller/components/PostureControl"
import { StepControl, StepUpR1Control, StepPoseControl } from "@/features/r2-controller/components/StepControls"
import { GripControl } from "@/features/r2-controller/components/GripControl"
import { SystemControl } from "@/features/r2-controller/components/SystemControl"
import { SerialDebugger } from "@/features/r2-controller/components/SerialDebugger"
import { useChassisWebSocket } from "@/features/r2-controller/hooks/useChassisWebSocket"

export function R2ControllerPage() {
  const [searchParams] = useSearchParams()
  const agentHost = searchParams.get("agentHost") || window.location.hostname
  const agentPort = searchParams.get("agentPort") || "8090"
  const wsUrl = `ws://${agentHost}:${agentPort}/ws/chassis`

  const { connected, state, config, error, sendCommand } = useChassisWebSocket(wsUrl)

  const tabs = [
    {
      id: "chassis",
      label: "底盘控制",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WasdVelocityControl connected={connected} sendCommand={sendCommand} config={config} />
          <HeightControl connected={connected} sendCommand={sendCommand} config={config} state={state} />
        </div>
      ),
    },
    {
      id: "posture",
      label: "位姿控制",
      content: <PostureControl connected={connected} sendCommand={sendCommand} config={config} state={state} />,
    },
    {
      id: "step",
      label: "台阶控制",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <StepControl connected={connected} sendCommand={sendCommand} config={config} />
          <StepUpR1Control connected={connected} sendCommand={sendCommand} />
          <StepPoseControl connected={connected} sendCommand={sendCommand} />
        </div>
      ),
    },
    {
      id: "grip",
      label: "夹爪控制",
      content: <GripControl connected={connected} sendCommand={sendCommand} />,
    },
    {
      id: "system",
      label: "系统",
      content: <SystemControl connected={connected} sendCommand={sendCommand} />,
    },
  ]

  return (
    <div className="min-h-screen bg-background p-2 sm:p-3">
      <div className="mx-auto max-w-[1600px] flex flex-col xl:flex-row gap-3">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <header>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">R2 控制端</h1>
            <p className="text-sm text-muted-foreground">Robocon 2026 独立升降麦轮底盘</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            <ConnectionPanel connected={connected} error={error} agentHost={agentHost} agentPort={agentPort} />
            <StatusDisplay state={state} connected={connected} />
            <ActionStatePanel state={state} connected={connected} />
            <ConnectionMap state={state} connected={connected} />
          </div>

          <Tabs tabs={tabs} defaultTab="chassis" />
        </div>

        <aside className="hidden xl:flex xl:flex-col w-[38rem] shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)]">
          <SerialDebugger />
        </aside>
      </div>
    </div>
  )
}
