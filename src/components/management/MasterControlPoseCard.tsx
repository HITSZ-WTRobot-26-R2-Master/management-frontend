import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Compass,
  MapPinned,
  RefreshCw,
} from "lucide-react"
import { useMemo } from "react"
import type { LucideIcon } from "lucide-react"
import type { MasterControlPoseStreamState } from "@/hooks/useMasterControlPoseStream"
import { cn } from "@/lib/utils"
import type {
  ApiError,
  MasterControlPoseMessage,
  MasterControlPoseSnapshot,
} from "@/types/management"

const staleThresholdMs = 1_500

type CardTone = "success" | "warning" | "error" | "neutral"

const toneStyles: Record<CardTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

export function MasterControlPoseCard({
  stream,
}: {
  stream: MasterControlPoseStreamState
}) {
  const summary = useMemo(
    () =>
      summarizeMasterControlPose(stream.snapshot, stream.error, stream.status),
    [stream.error, stream.snapshot, stream.status],
  )
  const message = stream.snapshot?.message ?? null

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-card-foreground">
            主控定位
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {summary.subtitle}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted"
          onClick={stream.refresh}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          刷新
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatePill tone={summary.tone} icon={summary.icon}>
            {summary.label}
          </StatePill>
          <span className="text-sm text-muted-foreground">
            {summary.detail}
          </span>
        </div>

        {message ? (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryMetric
                icon={MapPinned}
                label="位置"
                value={`${formatNumber(message.x)} / ${formatNumber(message.y)}`}
                detail={`Z ${formatNumber(message.z)}`}
              />
              <SummaryMetric
                icon={Compass}
                label="坐标系"
                value={message.header.frame_id || "未设置"}
                detail={formatRosStamp(message)}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <CompactField
                label="Roll"
                value={`${formatNumber(message.roll_deg)} deg`}
              />
              <CompactField
                label="Pitch"
                value={`${formatNumber(message.pitch_deg)} deg`}
              />
              <CompactField
                label="Yaw"
                value={`${formatNumber(message.yaw_deg)} deg`}
              />
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
            {summary.emptyText}
          </div>
        )}
      </div>
    </section>
  )
}

function StatePill({
  children,
  icon: Icon,
  tone,
}: {
  children: string
  icon: LucideIcon
  tone: CardTone
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
        toneStyles[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </span>
  )
}

function SummaryMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/45 p-2.5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-1.5 truncate text-base font-semibold tracking-normal text-card-foreground">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function CompactField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-2.5 py-1.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-card-foreground">
        {value}
      </p>
    </div>
  )
}

function summarizeMasterControlPose(
  snapshot: MasterControlPoseSnapshot | null,
  error: ApiError | null,
  status: MasterControlPoseStreamState["status"],
) {
  if (status === "auth_required") {
    return {
      detail: "需要配置 Bearer 令牌",
      emptyText: "连接设置完成后会显示 to_master_control 最新数据。",
      icon: AlertTriangle,
      label: "需要令牌",
      subtitle: "等待管理后端认证",
      tone: "warning" as const,
    }
  }

  if (error) {
    return {
      detail: error.message,
      emptyText: error.message,
      icon: AlertTriangle,
      label: "读取失败",
      subtitle: "无法读取 to_master_control",
      tone: "error" as const,
    }
  }

  if (!snapshot || !snapshot.available || !snapshot.message) {
    return {
      detail: snapshot?.topic ? `topic ${snapshot.topic}` : "等待首帧",
      emptyText: "management agent 尚未收到 to_master_control 消息。",
      icon: CircleHelp,
      label: status === "connecting" ? "连接中" : "无消息",
      subtitle: "等待 pose_node 输出",
      tone: "neutral" as const,
    }
  }

  const ageMs = ageFromIso(snapshot.received_at)
  const stale = ageMs !== null && ageMs > staleThresholdMs

  return {
    detail: snapshot.received_at
      ? `${formatTimestamp(snapshot.received_at)}，${formatAge(ageMs)}`
      : "收到消息但缺少时间戳",
    emptyText: "",
    icon: stale ? AlertTriangle : CheckCircle2,
    label: stale ? "位姿过期" : status === "fallback" ? "REST 回退" : "实时位姿",
    subtitle: `${snapshot.topic} / ${snapshot.message.header.frame_id || "frame 未设置"}`,
    tone: stale ? ("warning" as const) : ("success" as const),
  }
}

function formatRosStamp(message: MasterControlPoseMessage) {
  return `ROS ${message.header.stamp.sec}.${String(
    message.header.stamp.nanosec,
  ).padStart(9, "0")}`
}

function formatNumber(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "缺失"
}

function ageFromIso(value: string | null) {
  if (!value) {
    return null
  }
  const time = Date.parse(value)

  return Number.isFinite(time) ? Date.now() - time : null
}

function formatAge(value: number | null) {
  if (value === null) {
    return "未知延迟"
  }
  if (value < 1_000) {
    return `${Math.max(0, Math.round(value))} ms 前`
  }

  return `${Math.round(value / 1_000)} s 前`
}

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
