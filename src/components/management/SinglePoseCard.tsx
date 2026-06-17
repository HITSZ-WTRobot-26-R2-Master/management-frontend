import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
} from "lucide-react"
import { useMemo } from "react"
import type { LucideIcon } from "lucide-react"
import { formatMillimeterPrecision, formatRosTime } from "@/lib/display-format"
import { cn } from "@/lib/utils"
import type {
  ApiError,
  MasterControlPoseMessage,
  OdinOdometryPoseMessage,
  PoseSourceSnapshot,
} from "@/types/management"

type CardTone = "success" | "warning" | "error" | "neutral"

const toneStyles: Record<CardTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

const staleThresholdMs = 1_500

type PoseMessage = MasterControlPoseMessage | OdinOdometryPoseMessage

export interface SinglePoseStreamState {
  error: ApiError | null
  lastMessageAt: string | null
  refresh: () => void
  snapshot: PoseSourceSnapshot<PoseMessage> | null
  status: "auth_required" | "connecting" | "live" | "fallback" | "error"
}

export function SinglePoseCard({
  stream,
  title,
  subtitle: defaultSubtitle,
  showChildFrame,
  onClick,
  nanPoseMessage,
}: {
  stream: SinglePoseStreamState
  title: string
  subtitle: string
  showChildFrame?: boolean
  onClick?: () => void
  nanPoseMessage?: string
}) {
  const summary = useMemo(
    () => summarizePose(stream.snapshot, stream.error, stream.status, defaultSubtitle),
    [stream.error, stream.snapshot, stream.status, defaultSubtitle],
  )
  const msg = stream.snapshot?.message ?? null
  const hasPose = msg !== null
  const hasNanPose = hasPose && isNaN(msg.x) && isNaN(msg.y) && isNaN(msg.z)
  const clickable = Boolean(onClick)
  const isOdinMsg = (
    m: PoseMessage,
  ): m is OdinOdometryPoseMessage =>
    "child_frame_id" in m

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-card-foreground">{title}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {summary.subtitle}
          </p>
        </div>
      </div>

      <div
        className={cn("min-h-0 overflow-y-auto p-2", clickable && "cursor-pointer")}
        onClick={clickable ? onClick : undefined}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <StatePill tone={summary.tone} icon={summary.icon}>
            {summary.label}
          </StatePill>
        </div>

        {hasPose ? (
          hasNanPose && nanPoseMessage ? (
            <p className="mt-2 break-words text-xs font-medium text-muted-foreground">
              {nanPoseMessage}
            </p>
          ) : (
            <>
              <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-sm font-semibold text-card-foreground">
                <PoseAxisValue axis="X" value={msg.x} />
                <PoseAxisValue axis="Y" value={msg.y} />
                <PoseAxisValue axis="Z" value={msg.z} />
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                <PoseAngleValue axis="R" value={(msg as MasterControlPoseMessage).roll_deg ?? 0} />
                <span aria-hidden="true">/</span>
                <PoseAngleValue axis="P" value={(msg as MasterControlPoseMessage).pitch_deg ?? 0} />
                <span aria-hidden="true">/</span>
                <PoseAngleValue axis="Y" value={(msg as MasterControlPoseMessage).yaw_deg ?? 0} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="break-words">
                  {showChildFrame && isOdinMsg(msg)
                    ? msg.child_frame_id
                    : msg.header.frame_id}
                </span>
                {" · "}
                {"source" in msg && (
                  <>
                    <span className="whitespace-nowrap">
                      source {(msg as MasterControlPoseMessage).source}
                    </span>
                    {" · "}
                  </>
                )}
                <span className="whitespace-nowrap">
                  {formatRosTime(msg.header.stamp)}
                </span>
              </p>
            </>
          )
        ) : (
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {summary.emptyText}
          </p>
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
        "inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold",
        toneStyles[tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  )
}

function PoseAxisValue({ axis, value }: { axis: "X" | "Y" | "Z"; value: number }) {
  return (
    <span className="whitespace-nowrap rounded-sm bg-card/70 px-1.5 py-0.5">
      {axis} {formatMillimeterPrecision(value)} m
    </span>
  )
}

function PoseAngleValue({ axis, value }: { axis: "R" | "P" | "Y"; value: number }) {
  return (
    <span className="whitespace-nowrap">
      {axis} {formatAngle(value)} deg
    </span>
  )
}

function formatAngle(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "缺失"
}

function ageFromIso(value: string | null) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? Date.now() - time : null
}

function summarizePose(
  snapshot: PoseSourceSnapshot<PoseMessage> | null,
  error: ApiError | null,
  status: "auth_required" | "connecting" | "live" | "fallback" | "error",
  defaultSubtitle: string,
) {
  if (error) {
    return {
      emptyText: error.message,
      icon: AlertTriangle as LucideIcon,
      label: "读取失败",
      subtitle: defaultSubtitle,
      tone: "error" as const,
    }
  }

  if (!snapshot || !snapshot.message) {
    return {
      emptyText: snapshot?.topic
        ? `等待 ${snapshot.topic} 消息`
        : "等待首帧",
      icon: CircleHelp as LucideIcon,
      label: status === "connecting" ? "连接中" : "无消息",
      subtitle: defaultSubtitle,
      tone: "neutral" as const,
    }
  }

  const receivedAt = snapshot.received_at
  const ageMs = ageFromIso(receivedAt)
  const stale = ageMs !== null && ageMs > staleThresholdMs

  return {
    emptyText: "",
    icon: stale ? AlertTriangle : (CheckCircle2 as LucideIcon),
    label: stale ? "位姿过期" : "实时",
    subtitle: snapshot.topic,
    tone: (stale ? "warning" : "success") as CardTone,
  }
}
