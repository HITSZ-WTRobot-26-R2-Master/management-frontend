import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ApiError,
  LaserStatusSnapshot,
} from "@/types/management"

type CardTone = "success" | "warning" | "error" | "neutral"

const toneStyles: Record<CardTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

const SENSOR_LABELS: Record<string, string> = {
  front_center: "前中",
  rear_center: "后中",
  left_front: "左前",
  left_rear: "左后",
  right_front: "右前",
  right_rear: "右后",
}

export function LaserStatusCard({
  snapshot,
  error,
  status,
  onRefresh,
}: {
  snapshot: LaserStatusSnapshot | null
  error: ApiError | null
  status: "connecting" | "live" | "fallback"
  onRefresh: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const summary = useMemo(
    () => summarizeLaserStatus(snapshot, error, status),
    [snapshot, error, status],
  )
  const msg = snapshot?.message

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-card-foreground">
            Laser 定位
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {summary.subtitle}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted"
          onClick={onRefresh}
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
          <span className="min-w-0 break-words text-sm text-muted-foreground">
            {summary.detail}
          </span>
        </div>

        {msg ? (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <StatBlock label="beam" value={msg.beam_mode ?? "-"} />
              <StatBlock label="score" value={msg.score?.toFixed(3) ?? "-"} />
              <StatBlock
                label="残差"
                value={
                  msg.residual_m != null
                    ? `${(msg.residual_m * 1000).toFixed(1)} mm`
                    : "-"
                }
              />
            </div>

            {/* Sensor indicators */}
            <div className="mt-2 rounded-md border border-border bg-muted/45 px-2.5 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                传感器状态
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {msg.laser_decoded?.logical_sensors
                  ? Object.entries(msg.laser_decoded.logical_sensors).map(
                      ([name, sensor]) => (
                        <SensorBadge
                          key={name}
                          label={SENSOR_LABELS[name] ?? name}
                          rangeM={sensor.range_m}
                          usable={sensor.usable}
                        />
                      ),
                    )
                  : Array.from({ length: 6 }).map((_, i) => (
                      <SensorBadge
                        key={i}
                        label={Object.values(SENSOR_LABELS)[i] ?? `S${i}`}
                        rangeM={null}
                        usable={false}
                      />
                    ))}
              </div>
            </div>

            {/* Expand detail */}
            <button
              type="button"
              className="mt-2 inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/60"
              onClick={() => setShowDetail(!showDetail)}
            >
              {showDetail ? (
                <ChevronDown aria-hidden="true" className="size-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4" />
              )}
              解算详情
            </button>

            {showDetail && (
              <div className="mt-1 space-y-2 text-sm">
                <DetailSection title="求解器">
                  <DetailRow label="beam_mode" value={msg.solver_debug?.beam_mode} />
                  <DetailRow label="x_beam" value={msg.solver_debug?.x_beam} />
                  <DetailRow
                    label="theta_side"
                    value={
                      msg.solver_debug?.theta_side_deg != null
                        ? `${msg.solver_debug.theta_side_deg.toFixed(2)} deg`
                        : null
                    }
                  />
                  <DetailRow
                    label="correction"
                    value={
                      msg.solver_debug?.correction_debug?.delta_xy_norm_m != null
                        ? `${(msg.solver_debug.correction_debug.delta_xy_norm_m * 1000).toFixed(1)} mm`
                        : null
                    }
                  />
                  <DetailRow
                    label="residual"
                    value={
                      msg.solver_debug?.residual_debug?.mean_residual_m != null
                        ? `${(msg.solver_debug.residual_debug.mean_residual_m * 1000).toFixed(1)} mm`
                        : null
                    }
                  />
                </DetailSection>

                <DetailSection title="时序">
                  <DetailRow
                    label="transport_delay"
                    value={
                      msg.timing_debug?.transport_delay_ms != null
                        ? `${msg.timing_debug.transport_delay_ms.toFixed(1)} ms`
                        : null
                    }
                  />
                  <DetailRow
                    label="frame_age"
                    value={
                      msg.timing_debug?.range_frame_age_ms != null
                        ? `${msg.timing_debug.range_frame_age_ms.toFixed(1)} ms`
                        : null
                    }
                  />
                  <DetailRow
                    label="frame_count"
                    value={msg.timing_debug?.range_frame_count?.toString() ?? null}
                  />
                </DetailSection>

                {msg.region_debug?.candidates?.length ? (
                  <DetailSection title="区域候选">
                    {msg.region_debug.candidates.map((c, i) => (
                      <div
                        key={c.name || i}
                        className={cn(
                          "rounded-sm px-2 py-1 text-xs",
                          c.matched
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <span className="font-medium">{c.name || `#${i}`}</span>
                        {" p:"}
                        {c.position_match ? " Y" : " N"}
                        {" y:"}
                        {c.yaw_match ? " Y" : " N"}
                        {c.reject_reason ? ` (${c.reject_reason})` : ""}
                      </div>
                    ))}
                  </DetailSection>
                ) : null}

                {msg.corner_pose ? (
                  <DetailSection title="角点位姿">
                    <DetailRow
                      label="corner_local"
                      value={`x=${msg.corner_pose.x?.toFixed(3)} y=${msg.corner_pose.y?.toFixed(3)} yaw=${msg.corner_pose.yaw_deg?.toFixed(1)} deg`}
                    />
                  </DetailSection>
                ) : null}
              </div>
            )}
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

function StatBlock({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/45 px-2.5 py-2">
      <p className="break-words text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-card-foreground">
        {value}
      </p>
    </div>
  )
}

function SensorBadge({
  label,
  rangeM,
  usable,
}: {
  label: string
  rangeM: number | null
  usable: boolean
}) {
  const hasRange = rangeM != null && Number.isFinite(rangeM)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-mono",
        usable
          ? "bg-emerald-100 text-emerald-800"
          : hasRange
            ? "bg-amber-100 text-amber-800"
            : "bg-zinc-100 text-zinc-500",
      )}
    >
      <span className="font-medium">{label}</span>
      <span>
        {hasRange ? `${(rangeM * 1000).toFixed(0)}` : "-"}
      </span>
    </span>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-card-foreground">{value}</span>
    </div>
  )
}

function summarizeLaserStatus(
  snapshot: LaserStatusSnapshot | null,
  error: ApiError | null,
  status: "connecting" | "live" | "fallback",
) {
  if (error) {
    return {
      detail: error.message,
      emptyText: error.message,
      icon: AlertTriangle as LucideIcon,
      label: "读取失败",
      subtitle: "无法读取 laser_status",
      tone: "error" as const,
    }
  }

  if (!snapshot || !snapshot.message) {
    return {
      detail: snapshot?.topic ? `topic ${snapshot.topic}` : "等待首帧",
      emptyText:
        "management agent 尚未收到 /laser_status 消息。",
      icon: CircleHelp as LucideIcon,
      label: status === "connecting" ? "连接中" : "无消息",
      subtitle: "等待 agv_pose_refiner 输出",
      tone: "neutral" as const,
    }
  }

  const msg = snapshot.message
  const localized = msg.localized
  const stateLabel =
    msg.state === "REFINED"
      ? "已定位"
      : msg.state === "COARSE_ONLY"
        ? "粗定位"
        : "无法定位"

  return {
    detail: `${msg.laser_pose_output_reason_text} · ${msg.beam_mode ?? "无"}`,
    emptyText: "",
    icon: (localized ? CheckCircle2 : AlertTriangle) as LucideIcon,
    label: stateLabel,
    subtitle: `${msg.region_name ?? "无区域"} · beams=${msg.selected_valid_beam_count}/${msg.selected_beam_count}`,
    tone: (localized ? "success" : "warning") as const,
  }
}
