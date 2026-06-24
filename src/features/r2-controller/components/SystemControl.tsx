interface SystemControlProps {
  connected: boolean
  sendCommand: (cmd: number, data: number[]) => boolean
}

export function SystemControl({ connected, sendCommand }: SystemControlProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-card-foreground">系统控制</h3>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => sendCommand(0x01, [])}
          disabled={!connected}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
        >
          Ping
        </button>
        <button
          onClick={() => sendCommand(0x10, [])}
          disabled={!connected}
          className="bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700"
        >
          紧急停止
        </button>
      </div>

      <div className="border-t border-border pt-2 space-y-1.5">
        <h4 className="text-sm font-semibold text-card-foreground">腹部吸盘 (0x45)</h4>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => sendCommand(0x45, [1])}
            disabled={!connected}
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
          >
            启动
          </button>
          <button
            onClick={() => sendCommand(0x45, [0])}
            disabled={!connected}
            className="bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
