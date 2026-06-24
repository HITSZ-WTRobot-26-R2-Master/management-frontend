import { LoaderCircle, PlugZap, Plug } from "lucide-react"

interface ConnectionPanelProps {
  connected: boolean
  error: string | null
  agentHost: string
  agentPort: string
}

export function ConnectionPanel({
  connected,
  error,
  agentHost,
  agentPort,
}: ConnectionPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-card-foreground">连接状态</h3>
      <div className="mt-3 flex items-center gap-2">
        {connected ? (
          <PlugZap className="size-4 text-emerald-600" />
        ) : error ? (
          <Plug className="size-4 text-amber-600" />
        ) : (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        )}
        <span
          className={`text-sm font-medium ${
            connected
              ? "text-emerald-700"
              : error
                ? "text-amber-700"
                : "text-muted-foreground"
          }`}
        >
          {connected ? "已连接" : error ? "连接失败" : "正在连接..."}
        </span>
      </div>
      {connected && (
        <p className="mt-2 text-xs text-muted-foreground">
          ws://{agentHost}:{agentPort}/ws/chassis
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
