import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Gauge,
  RadioTower,
  RefreshCw,
  Route,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import type { ChassisStateStreamState } from "@/hooks/useChassisStateStream"
import { cn } from "@/lib/utils"
import type {
  ApiError,
  ChassisActionState,
  ChassisConnectionState,
  ChassisPoseState,
  ChassisStateMessage,
  ChassisStateSnapshot,
} from "@/types/management"

const staleThresholdMs = 2_000

type CardTone = "success" | "warning" | "error" | "neutral"

const toneStyles: Record<CardTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

export function ChassisStateCard({
  stream,
}: {
  stream: ChassisStateStreamState
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const summary = useMemo(
    () => summarizeChassisState(stream.snapshot, stream.error, stream.status),
    [stream.error, stream.snapshot, stream.status],
  )
  const message = stream.snapshot?.message ?? null
  const closeDetails = useCallback(() => setDetailsOpen(false), [])

  useEffect(() => {
    if (!message) {
      setDetailsOpen(false)
    }
  }, [message])

  useEffect(() => {
    if (!detailsOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDetails()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [closeDetails, detailsOpen])

  return (
    <>
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-card-foreground">
              底盘状态
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {summary.subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!message}
              onClick={() => setDetailsOpen(true)}
            >
              详情
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted"
              onClick={stream.refresh}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              刷新
            </button>
          </div>
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
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <SummaryMetric
                  icon={Route}
                  label="位置"
                  value={`${formatNumber(message.pose.x)} / ${formatNumber(
                    message.pose.y,
                  )}`}
                  detail={`航向 ${formatNumber(message.pose.yaw_deg)} deg`}
                />
                <SummaryMetric
                  icon={Gauge}
                  label="高度"
                  value={`${formatNumber(
                    message.pose.front_height,
                  )} / ${formatNumber(message.pose.rear_height)}`}
                  detail="前 / 后"
                />
                <SummaryMetric
                  icon={RadioTower}
                  label="连接"
                  value={`${onlineConnectionCount(message.connection)} / 13`}
                  detail={connectionIssueSummary(message.connection)}
                />
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-4">
                <CompactField label="底盘模式" value={message.action.chassis_mode} />
                <CompactField label="路径状态" value={message.action.step_status} />
                <CompactField label="升降状态" value={message.action.lift_status} />
                <CompactField label="夹爪状态" value={message.action.grip_status} />
                <CompactField
                  label="曲线完成"
                  value={message.action.chassis_curve_finished ? "是" : "否"}
                />
                <CompactField
                  label="吸附检测"
                  value={message.action.grip_suction_has_object ? "有物" : "无物"}
                />
                <CompactField
                  label="红外状态"
                  value={message.action.infrared_receiver_state}
                />
                <CompactField
                  label="MCU 时间"
                  value={`${message.timestamp_ms} ms`}
                />
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-4 py-5 text-sm text-muted-foreground">
              {summary.emptyText}
            </div>
          )}        </div>
      </section>
      {message ? (
        <ChassisStateDetailsDrawer
          message={message}
          open={detailsOpen}
          onClose={closeDetails}
        />
      ) : null}
    </>
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

function CompactField({
  label,
  value,
}: {
  label: string
  value: boolean | number | string
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-2.5 py-1.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-card-foreground">
        {String(value)}
      </p>
    </div>
  )
}

function ChassisStateDetailsDrawer({
  message,
  onClose,
  open,
}: {
  message: ChassisStateMessage
  onClose: () => void
  open: boolean
}) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-start" role="presentation">
      <button
        type="button"
        aria-label="关闭底盘状态详情"
        className="absolute inset-0 cursor-default bg-black/30"
        onClick={onClose}
      />
      <aside
        aria-labelledby="chassis-state-details-title"
        aria-modal="true"
        className="relative z-10 flex h-full w-[min(28rem,calc(100vw-2rem))] flex-col border-r border-border bg-card shadow-xl"
        role="dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3
              className="text-base font-semibold text-card-foreground"
              id="chassis-state-details-title"
            >
              底盘状态详情
            </h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              MCU {message.timestamp_ms} ms
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭底盘状态详情"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-card-foreground hover:bg-muted"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <ChassisStateDetails message={message} />
      </aside>
    </div>
  )
}

function ChassisStateDetails({ message }: { message: ChassisStateMessage }) {
  return (
    <div className="grid min-h-0 gap-4 overflow-y-auto p-4">
      <DetailGroup title="Pose" values={poseFields(message.pose)} />
      <DetailGroup title="Action" values={actionFields(message.action)} />
      <DetailGroup title="Connection" values={connectionFields(message.connection)} />
    </div>
  )
}

function DetailGroup({
  title,
  values,
}: {
  title: string
  values: Array<[string, boolean | number | string]>
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/35 p-3">
      <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
      <dl className="mt-3 grid gap-2">
        {values.map(([label, value]) => (
          <div
            className="grid grid-cols-[minmax(110px,0.8fr)_minmax(0,1fr)] gap-3 text-sm"
            key={label}
          >
            <dt className="truncate text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate font-mono text-card-foreground">
              {String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function summarizeChassisState(
  snapshot: ChassisStateSnapshot | null,
  error: ApiError | null,
  status: ChassisStateStreamState["status"],
) {
  if (status === "auth_required") {
    return {
      detail: "需要配置 Bearer 令牌",
      emptyText: "连接设置完成后会显示 chassis_state 最新反馈。",
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
      subtitle: "无法读取 chassis_state",
      tone: "error" as const,
    }
  }

  if (!snapshot || !snapshot.available || !snapshot.message) {
    return {
      detail: snapshot?.topic ? `topic ${snapshot.topic}` : "等待首帧",
      emptyText: "management agent 尚未收到 chassis_state 消息。",
      icon: CircleHelp,
      label: status === "connecting" ? "连接中" : "无消息",
      subtitle: "等待 chassis_serial 反馈",
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
    label: stale ? "反馈过期" : status === "fallback" ? "REST 回退" : "实时反馈",
    subtitle: `${snapshot.topic} / MCU ${snapshot.message.timestamp_ms} ms`,
    tone: stale ? ("warning" as const) : ("success" as const),
  }
}

function poseFields(pose: ChassisPoseState): Array<[string, number]> {
  return [
    ["x", pose.x],
    ["y", pose.y],
    ["yaw_deg", pose.yaw_deg],
    ["front_height", pose.front_height],
    ["rear_height", pose.rear_height],
  ]
}

function actionFields(action: ChassisActionState) {
  return [
    ["raw_table", formatHex(action.raw_table)],
    ["step_status", action.step_status],
    ["chassis_mode", action.chassis_mode],
    ["chassis_curve_finished", action.chassis_curve_finished],
    ["lift_status", action.lift_status],
    ["grip_status", action.grip_status],
    ["grip_suction_has_object", action.grip_suction_has_object],
    ["infrared_receiver_state", action.infrared_receiver_state],
  ] satisfies Array<[string, boolean | number | string]>
}

function connectionFields(connection: ChassisConnectionState) {
  return [
    ["raw_table", formatHex(connection.raw_table)],
    ["wheel_0", connection.wheel_0],
    ["wheel_1", connection.wheel_1],
    ["wheel_2", connection.wheel_2],
    ["wheel_3", connection.wheel_3],
    ["lift_0", connection.lift_0],
    ["lift_1", connection.lift_1],
    ["lift_2", connection.lift_2],
    ["lift_3", connection.lift_3],
    ["grip_arm", connection.grip_arm],
    ["grip_turn", connection.grip_turn],
    ["gyro_yaw", connection.gyro_yaw],
    ["upper_host_localization", connection.upper_host_localization],
    ["upper_host", connection.upper_host],
  ] satisfies Array<[string, boolean | number | string]>
}

function onlineConnectionCount(connection: ChassisConnectionState) {
  return connectionFields(connection).filter(
    ([label, value]) => label !== "raw_table" && value === true,
  ).length
}

function connectionIssueSummary(connection: ChassisConnectionState) {
  const offline = connectionFields(connection)
    .filter(([label, value]) => label !== "raw_table" && value === false)
    .map(([label]) => label)

  return offline.length === 0 ? "全部在线" : `离线 ${offline.slice(0, 2).join(", ")}`
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "缺失"
}

function formatHex(value: number) {
  return `0x${Math.max(0, Math.trunc(value)).toString(16).toUpperCase().padStart(4, "0")}`
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
    return "时间未知"
  }
  if (value < 1_000) {
    return `${Math.max(0, value)} ms 前`
  }

  return `${Math.max(0, value / 1_000).toFixed(1)} s 前`
}

function formatTimestamp(value: string) {
  const time = new Date(value)

  if (Number.isNaN(time.getTime())) {
    return value
  }

  return time.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
