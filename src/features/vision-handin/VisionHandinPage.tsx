import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useBlockState } from "./hooks/useBlockState";
import { useDecision } from "./hooks/useDecision";
import { SystemToggle } from "./components/SystemToggle";
import { MatchTypeToggle } from "./components/MatchTypeToggle";
import { SidePanel } from "./components/SidePanel";
import { MainGrid } from "./components/MainGrid";
import { getAllianceBackgroundColor, getOpponentAllianceColor } from "@/lib/alliance-color";
import type { BlockSyncStatus } from "./hooks/useBlockState";

const COUNT_ITEMS: { state: string; label: string; className: string }[] = [
  { state: "r1", label: "R1", className: "bg-blue-500 text-white" },
  { state: "r2", label: "R2", className: "bg-green-500 text-white" },
  { state: "null", label: "Null", className: "bg-gray-200 text-gray-800" },
  { state: "fake", label: "Fake", className: "bg-red-500 text-white" },
];

const statusLabels: Record<BlockSyncStatus, string> = {
  auth_required: "需要令牌",
  connecting: "连接中",
  live: "已连接",
  reconnecting: "重连中",
  error: "连接错误",
};

export function VisionHandinPage() {
  const {
    baseUrl,
    blocks,
    connected,
    error,
    mode,
    setBlockState,
    setMode,
    setMatchType,
    status,
  } = useBlockState();
  const { decision } = useDecision();

  const counts = useMemo(() => {
    const c: Record<string, number> = { r1: 0, r2: 0, null: 0, fake: 0 };
    for (const b of blocks) {
      if (b in c) c[b]++;
    }
    return c;
  }, [blocks]);

  const isBlue = mode.color === "blue";
  const isFront = mode.direction === "front";
  const showTop = isBlue === isFront;
  const showBottom = isBlue !== isFront;
  const opponentLabel = isBlue ? "红方" : "蓝方";
  const opponentBg = getAllianceBackgroundColor(getOpponentAllianceColor(mode.color));

  return (
    <div className="h-screen text-foreground flex flex-col">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-8 py-3 bg-background/60 backdrop-blur-sm gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/overview"
            className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            返回管理台
          </Link>
          <h1 className="text-[clamp(1.5rem,4vw,3rem)] font-bold tracking-wide">R2 Vision</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded border bg-background px-3 py-1.5 text-[clamp(0.8rem,1.6vw,1.2rem)]">
            <span className="text-xs text-muted-foreground shrink-0">WS</span>
            <span className="max-w-[clamp(120px,18vw,260px)] truncate font-semibold">
              {baseUrl}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {COUNT_ITEMS.map((item) => (
              <span
                key={item.state}
                className={`px-2 py-0.5 rounded text-[clamp(0.8rem,1.8vw,1.3rem)] font-semibold ${item.className}`}
              >
                {item.label}:{counts[item.state]}
              </span>
            ))}
          </div>
          <span className={connected ? "text-green-500 text-[clamp(1rem,2.5vw,2rem)]" : "text-red-500 text-[clamp(1rem,2.5vw,2rem)]"}>
            {connected ? "●" : "○"} {statusLabels[status]}
          </span>
          {error ? (
            <span className="max-w-[clamp(120px,18vw,260px)] truncate text-[clamp(0.75rem,1.4vw,1rem)] text-red-700">
              {error.message}
            </span>
          ) : null}
        </div>
      </header>
      {/* 对方方向指示（上） */}
      {showTop && (
        <div
          className="text-center py-3 font-bold text-[clamp(0.9rem,2.2vw,1.8rem)] text-white shrink-0 flex items-center justify-center"
          style={{ backgroundColor: opponentBg, minHeight: "clamp(24px, 4vh, 48px)" }}
        >
          {opponentLabel}
        </div>
      )}
      {/* 主体：左 - 中 - 右侧标签 - 控制栏 */}
      <main className="flex-1 flex items-stretch gap-2 p-4 min-h-0">
        <SidePanel side="left" mode={mode} />
        <div className="flex-1 min-h-0">
          <MainGrid
            blocks={blocks}
            decision={decision}
            mode={mode}
            onCellChange={setBlockState}
          />
        </div>
        <SidePanel side="right" mode={mode} />
        {/* 控制栏：独立一列，上下占满 */}
        <div className="flex flex-row items-stretch justify-center gap-2 p-2 rounded-lg bg-background/60 backdrop-blur-sm h-full">
          <div className="w-[clamp(60px,7vw,100px)]">
            <SystemToggle mode={mode} onChange={setMode} />
          </div>
          <div className="w-[clamp(60px,7vw,100px)]">
            <MatchTypeToggle matchType={mode.matchType} onChange={setMatchType} />
          </div>
        </div>
      </main>
      {/* 对方方向指示（下） */}
      {showBottom && (
        <div
          className="text-center py-3 font-bold text-[clamp(0.9rem,2.2vw,1.8rem)] text-white shrink-0 flex items-center justify-center"
          style={{ backgroundColor: opponentBg, minHeight: "clamp(24px, 4vh, 48px)" }}
        >
          {opponentLabel}
        </div>
      )}
    </div>
  );
}
