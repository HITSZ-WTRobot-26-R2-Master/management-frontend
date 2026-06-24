export function SerialDebugger() {
  return (
    <div className="flex flex-col h-full rounded-lg border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-card-foreground">串口调试器</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          串口调试功能需 agent 额外转发 serial_tx/rx 事件（chassis_serial_node 目前不发布这些）。后续对接数据源后实现实时帧解析、CRC16 校验和统计。
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          等待串口帧数据...
        </div>
      </div>
    </div>
  )
}
