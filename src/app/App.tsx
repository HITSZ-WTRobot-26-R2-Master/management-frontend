import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleHelp,
  Container,
  Cpu,
  DatabaseZap,
  FileText,
  Gauge,
  KeyRound,
  Link2,
  ListRestart,
  ListFilter,
  LoaderCircle,
  PlugZap,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom"
import { ManagementShell } from "@/components/management/ManagementShell"
import { ChassisStateCard } from "@/components/management/ChassisStateCard"
import { useChassisStateStream } from "@/hooks/useChassisStateStream"
import {
  type CommandDiscoveryState,
  type CommandSubmissionState,
  isResetOriginCommand,
  type ResetOriginPayload,
  useCommandDiscovery,
} from "@/hooks/useCommandDiscovery"
import { useEventStream } from "@/hooks/useEventStream"
import {
  DEFAULT_SERVICE_LOG_TAIL,
  normalizeServiceLogTail,
} from "@/lib/service-log-stream"
import { formatBytes, formatPercent } from "@/lib/resource-format"
import {
  type ServiceLogsState,
  type ServiceLogOptions,
  useSelectedServiceDiagnostics,
} from "@/hooks/useSelectedServiceDiagnostics"
import { useServicesSnapshot } from "@/hooks/useServicesSnapshot"
import {
  createManagementApiClient,
  getApiError,
  hasManagementAuthToken,
  isValidManagementBaseUrl,
} from "@/lib/management-api"
import {
  authTokenAtom,
  baseUrlAtom,
  clearAuthTokenAtom,
  commandsAtom,
  connectionStateAtom,
  latestErrorAtom,
  managementApiClientAtom,
  recentEventsAtom,
  selectedServiceAtom,
  selectedServiceDefinitionAtom,
  selectedServiceNameAtom,
  serviceDefinitionsAtom,
  serviceStatusesAtom,
} from "@/state/operator-shell"
import type {
  ApiError,
  CommandDefinition,
  CommandResult,
  CommandState,
  CommandTransport,
  CommandResponse,
  CommandRequestedPayload,
  ConnectionState,
  ConnectionStatus,
  DockerState,
  ManagementEvent,
  OverallLevel,
  RestartMode,
  RestartResult,
  RestartRequestedPayload,
  RestartResponse,
  ServiceDefinition,
  ServiceRiskLevel,
  ServiceStats,
  ServiceStatus,
} from "@/types/management"
import {
  getCommandConfirmationState,
  isHighRisk,
} from "@/lib/command-confirmation"
import {
  formatRosSummary,
  getToneForOverallLevel,
  type StatusTone,
} from "@/lib/status-presentation"
import { cn } from "@/lib/utils"

type StatusFilter = OverallLevel | "all"

type RiskFilter = ServiceRiskLevel | "all"

interface ServiceFilterState {
  status: StatusFilter
  category: string
  risk: RiskFilter
}

const allFilterValue = "all"

const levelStyles: Record<OverallLevel, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
  unknown: "border-zinc-200 bg-zinc-50 text-zinc-700",
}

const riskStyles: Record<ServiceRiskLevel, string> = {
  low: "border-sky-200 bg-sky-50 text-sky-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  high: "border-red-200 bg-red-50 text-red-800",
  critical: "border-red-300 bg-red-100 text-red-900",
}

const overallLabels: Record<OverallLevel, string> = {
  ok: "正常",
  warning: "警告",
  error: "错误",
  unknown: "未知",
}

const riskLabels: Record<ServiceRiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
}

const dockerStateLabels: Record<DockerState, string> = {
  running: "运行中",
  created: "已创建",
  restarting: "重启中",
  paused: "已暂停",
  exited: "已退出",
  dead: "已停止",
  missing: "缺失",
  unknown: "未知",
}

const dockerStyles: Record<DockerState, string> = {
  running: "text-emerald-700",
  created: "text-zinc-700",
  restarting: "text-amber-700",
  paused: "text-amber-700",
  exited: "text-red-700",
  dead: "text-red-700",
  missing: "text-red-700",
  unknown: "text-zinc-600",
}

type ActivityTone = StatusTone | "info"

const activityToneStyles: Record<ActivityTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
}

const activityIconStyles: Record<ActivityTone, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-600",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
}

const connectionStyles: Record<ConnectionStatus, string> = {
  idle: "border-zinc-200 bg-zinc-50 text-zinc-700",
  checking: "border-sky-200 bg-sky-50 text-sky-800",
  connected: "border-emerald-200 bg-emerald-50 text-emerald-800",
  stream_connecting: "border-sky-200 bg-sky-50 text-sky-800",
  live: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reconnecting: "border-amber-200 bg-amber-50 text-amber-900",
  fallback: "border-amber-200 bg-amber-50 text-amber-900",
  auth_required: "border-amber-200 bg-amber-50 text-amber-900",
  auth_invalid: "border-red-200 bg-red-50 text-red-800",
  error: "border-red-200 bg-red-50 text-red-800",
}

const connectionLabels: Record<ConnectionStatus, string> = {
  idle: "未检查",
  checking: "检查中",
  connected: "已连接",
  stream_connecting: "正在连接事件流",
  live: "实时事件",
  reconnecting: "正在重连",
  fallback: "REST 回退",
  auth_required: "需要令牌",
  auth_invalid: "令牌无效",
  error: "连接错误",
}

const overallIcons: Record<OverallLevel, LucideIcon> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  unknown: CircleHelp,
}

type DetailTab = "status" | "docker" | "ros" | "logs" | "stats" | "restart"

const detailTabs: Array<{
  id: DetailTab
  label: string
  icon: LucideIcon
}> = [
  { id: "status", label: "状态", icon: Gauge },
  { id: "docker", label: "Docker", icon: Container },
  { id: "ros", label: "ROS", icon: RadioTower },
  { id: "logs", label: "日志", icon: FileText },
  { id: "stats", label: "统计", icon: Cpu },
  { id: "restart", label: "重启", icon: RotateCcw },
]

function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function App() {
  return (
    <BrowserRouter>
      <ManagementApp />
    </BrowserRouter>
  )
}

function ManagementApp() {
  const services = useAtomValue(serviceStatusesAtom)
  const selectedService = useAtomValue(selectedServiceAtom)
  const setSelectedServiceName = useSetAtom(selectedServiceNameAtom)
  const navigate = useNavigate()
  const connectionState = useAtomValue(connectionStateAtom)
  const snapshot = useServicesSnapshot()
  const commandDiscovery = useCommandDiscovery()
  const eventStream = useEventStream()
  const chassisStateStream = useChassisStateStream()
  const refreshSnapshot = snapshot.refresh
  const refreshCommands = commandDiscovery.refresh
  const refreshRecent = eventStream.refreshRecent
  const refreshChassisState = chassisStateStream.refresh
  const refreshManagementData = useCallback(() => {
    refreshSnapshot()
    refreshCommands()
    refreshRecent()
    refreshChassisState()
  }, [refreshChassisState, refreshCommands, refreshRecent, refreshSnapshot])
  const [filters, setFilters] = useState<ServiceFilterState>({
    status: allFilterValue,
    category: allFilterValue,
    risk: allFilterValue,
  })
  const filteredServices = useMemo(
    () => filterServices(services, filters),
    [filters, services],
  )
  const detailPath = selectedService
    ? `/services/${encodeURIComponent(selectedService.service_name)}`
    : "/services"
  const refreshing =
    snapshot.refreshing ||
    commandDiscovery.discovery.refreshing ||
    connectionState.status === "checking"

  const handleSelectService = useCallback(
    (serviceName: string) => {
      setSelectedServiceName(serviceName)
    },
    [setSelectedServiceName],
  )

  const handleOpenServiceDetails = useCallback(
    (serviceName: string) => {
      setSelectedServiceName(serviceName)
      navigate(`/services/${encodeURIComponent(serviceName)}`)
    },
    [navigate, setSelectedServiceName],
  )

  return (
    <ManagementShell
      connectionStatus={<ConnectionBadge state={connectionState} />}
      detailPath={detailPath}
      detailsDisabled={services.length === 0}
      refreshing={refreshing}
      onRefresh={refreshManagementData}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate replace to="/overview" />} />
          <Route
            path="/overview"
            element={
              <OverviewTab
                eventStream={eventStream}
                chassisStateStream={chassisStateStream}
                lastLoadedAt={snapshot.lastLoadedAt}
                services={services}
                onOpenEvents={() => navigate("/events")}
                onOpenServices={() => navigate("/services")}
              />
            }
          />
          <Route
            path="/services"
            element={
              <ServiceOverview
                definitionsError={snapshot.definitionsError}
                error={snapshot.error}
                filteredServices={filteredServices}
                filters={filters}
                loading={snapshot.loading}
                onRefresh={snapshot.refresh}
                selectedServiceName={selectedService?.service_name ?? ""}
                services={services}
                refreshing={snapshot.refreshing}
                setFilters={setFilters}
                onOpenDetails={handleOpenServiceDetails}
                onSelectService={handleSelectService}
              />
            }
          />
          <Route
            path="/services/:serviceName"
            element={
              <ServiceDetailsRoute
                onServiceNotFound={snapshot.refresh}
                services={services}
              />
            }
          />
          <Route
            path="/commands"
            element={
              <CommandsPanel
                discovery={commandDiscovery.discovery}
                submission={commandDiscovery.submission}
                onRefresh={commandDiscovery.refresh}
                onSubmitResetOrigin={commandDiscovery.submitResetOrigin}
              />
            }
          />
          <Route
            path="/events"
            element={<RecentActivityPanel eventStream={eventStream} />}
          />
          <Route
            path="/settings"
            element={<ConnectionSettings onRefresh={refreshManagementData} />}
          />
          <Route path="*" element={<Navigate replace to="/overview" />} />
        </Routes>
      </div>
    </ManagementShell>
  )
}

function ServiceDetailsRoute({
  onServiceNotFound,
  services,
}: {
  onServiceNotFound: () => void
  services: ServiceStatus[]
}) {
  const { serviceName: routeServiceName } = useParams()
  const selectedDefinition = useAtomValue(selectedServiceDefinitionAtom)
  const setSelectedServiceName = useSetAtom(selectedServiceNameAtom)
  const navigate = useNavigate()
  const serviceName = routeServiceName ? decodeRouteParam(routeServiceName) : ""
  const routeService =
    services.find((service) => service.service_name === serviceName) ?? null

  useEffect(() => {
    if (serviceName.length === 0) {
      return
    }

    setSelectedServiceName(serviceName)
  }, [serviceName, setSelectedServiceName])

  const handleSelectService = useCallback(
    (nextServiceName: string) => {
      setSelectedServiceName(nextServiceName)
      navigate(`/services/${encodeURIComponent(nextServiceName)}`)
    },
    [navigate, setSelectedServiceName],
  )

  return (
    <ServiceInspector
      definition={selectedDefinition}
      onServiceNotFound={onServiceNotFound}
      onSelectService={handleSelectService}
      routeServiceName={serviceName}
      service={routeService}
      services={services}
    />
  )
}

function ConnectionSettings({ onRefresh }: { onRefresh: () => void }) {
  const [baseUrl, setBaseUrl] = useAtom(baseUrlAtom)
  const [token, setToken] = useAtom(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const [connectionState, setConnectionState] = useAtom(connectionStateAtom)
  const latestError = useAtomValue(latestErrorAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const clearAuthToken = useSetAtom(clearAuthTokenAtom)
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl)
  const [tokenDraft, setTokenDraft] = useState(token)

  const hasToken = hasManagementAuthToken(token)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedBaseUrl = baseUrlDraft.trim()
    const nextToken = tokenDraft.trim()

    if (normalizedBaseUrl.length === 0) {
      setConnectionState(toConnectionState("error"))
      setLatestError({
        code: "request_failed",
        message: "管理后端基础 URL 不能为空",
      })
      return
    }

    if (!isValidManagementBaseUrl(normalizedBaseUrl)) {
      setConnectionState(toConnectionState("error"))
      setLatestError({
        code: "request_failed",
        message: "管理后端基础 URL 必须是有效 URL 或同源代理路径",
      })
      return
    }

    setBaseUrl(normalizedBaseUrl)
    setToken(nextToken)

    if (!hasManagementAuthToken(nextToken)) {
      setConnectionState(toConnectionState("auth_required"))
      setLatestError(null)
      return
    }

    setConnectionState({ status: "checking", checked_at: null })
    setLatestError(null)

    const activeClient =
      normalizedBaseUrl === baseUrl && nextToken === token
        ? client
        : createManagementApiClient({
            baseUrl: normalizedBaseUrl,
            token: nextToken,
          })

    try {
      await activeClient.getReadiness()
      setConnectionState(toConnectionState("connected"))
      onRefresh()
    } catch (error) {
      const apiError = getApiError(error)
      const status = getConnectionStatus(apiError)
      setConnectionState(toConnectionState(status))
      setLatestError(apiError)
    }
  }

  function handleClearToken() {
    clearAuthToken()
    setTokenDraft("")
    setLatestError(null)
    setConnectionState(toConnectionState("auth_required"))
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border p-4">
        <h1 className="text-xl font-semibold tracking-normal text-card-foreground">
          连接设置
        </h1>
        <p className="mt-1 max-w-3xl truncate text-sm text-muted-foreground">
          配置管理后端 URL 与 Bearer 令牌，并触发一次管理数据刷新。
        </p>
      </div>
      <form
        className="grid shrink-0 gap-5 p-5 lg:grid-cols-[minmax(280px,1fr)_minmax(240px,320px)_auto]"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <Link2 aria-hidden="true" className="size-4 text-primary" />
            后端基础 URL
          </span>
          <input
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            value={baseUrlDraft}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
            spellCheck={false}
            autoComplete="url"
            inputMode="url"
          />
        </label>

        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <KeyRound aria-hidden="true" className="size-4 text-primary" />
            Bearer 令牌
          </span>
          <input
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={connectionState.status === "checking"}
          >
            {connectionState.status === "checking" ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <PlugZap aria-hidden="true" className="size-4" />
            )}
            连接
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-card-foreground"
            onClick={handleClearToken}
            disabled={!hasToken && tokenDraft.length === 0}
          >
            <ShieldAlert aria-hidden="true" className="size-4" />
            清除
          </button>
        </div>
      </form>

      <div className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
        <ConnectionBadge state={connectionState} />
        <p className="text-sm text-muted-foreground">
          HTTP 请求使用 Authorization Bearer 头；浏览器 WebSocket 连接使用
          token 查询参数。
        </p>
      </div>
      {latestError ? <ConnectionErrorNotice error={latestError} /> : null}
    </section>
  )
}

function ConnectionErrorNotice({ error }: { error: ApiError }) {
  const copy = getErrorStateCopy(error)
  const Icon = copy.icon

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <div className="flex items-start gap-3">
          <Icon
            aria-hidden="true"
            className={cn("mt-0.5 size-4 shrink-0", copy.iconClass)}
          />
          <div className="min-w-0">
            <p className="font-semibold">{copy.title}</p>
            <p className="mt-1 break-words text-red-800">{copy.body}</p>
            <p className="mt-2 break-words rounded-md border border-red-200 bg-white/60 px-3 py-2 font-mono text-xs text-red-900">
              {formatApiError(error)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const Icon =
    state.status === "connected" || state.status === "live"
      ? ShieldCheck
      : state.status === "checking" || state.status === "stream_connecting"
        ? LoaderCircle
        : state.status === "reconnecting"
          ? RefreshCw
          : ShieldAlert

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
        connectionStyles[state.status],
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4",
          (state.status === "checking" ||
            state.status === "stream_connecting" ||
            state.status === "reconnecting") &&
            "animate-spin",
        )}
      />
      {connectionLabels[state.status]}
    </span>
  )
}

function OverviewTab({
  chassisStateStream,
  eventStream,
  lastLoadedAt,
  services,
  onOpenEvents,
  onOpenServices,
}: {
  chassisStateStream: ReturnType<typeof useChassisStateStream>
  eventStream: ReturnType<typeof useEventStream>
  lastLoadedAt: string | null
  services: ServiceStatus[]
  onOpenEvents: () => void
  onOpenServices: () => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <HeaderSummary
        eventStream={eventStream}
        lastLoadedAt={lastLoadedAt}
        services={services}
      />
      <ChassisStateCard stream={chassisStateStream} />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <OverviewServiceSummary
          services={services}
          onOpenServices={onOpenServices}
        />
        <OverviewEventsSummary
          eventStream={eventStream}
          onOpenEvents={onOpenEvents}
        />
      </div>
    </section>
  )
}

function OverviewServiceSummary({
  services,
  onOpenServices,
}: {
  services: ServiceStatus[]
  onOpenServices: () => void
}) {
  const abnormalServices = services.filter(
    (service) => service.overall.level !== "ok",
  )
  const previewServices = abnormalServices.slice(0, 8)

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-card-foreground">
            异常服务
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            当前快照中非正常状态的服务摘要
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted"
          onClick={onOpenServices}
        >
          <Boxes aria-hidden="true" className="size-4" />
          服务
        </button>
      </div>

      {services.length === 0 ? (
        <CompactEmptyState
          icon={Server}
          title="等待服务快照"
          text="连接后会在这里显示异常服务摘要。"
        />
      ) : previewServices.length === 0 ? (
        <CompactEmptyState
          icon={CheckCircle2}
          title="未发现异常服务"
          text="当前已加载服务均处于正常状态。"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-3 2xl:grid-cols-2">
            {previewServices.map((service) => (
              <article
                key={service.service_name}
                className="min-w-0 rounded-md border border-border bg-muted/50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-card-foreground">
                      {service.display_name}
                    </h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {service.service_name}
                    </p>
                  </div>
                  <StatusPill level={service.overall.level}>
                    {formatOverallLevel(service.overall.level)}
                  </StatusPill>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {formatDisplaySummary(service.overall.reason)}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function OverviewEventsSummary({
  eventStream,
  onOpenEvents,
}: {
  eventStream: ReturnType<typeof useEventStream>
  onOpenEvents: () => void
}) {
  const events = useAtomValue(recentEventsAtom)
  const latestEvents = useMemo(() => events.slice(-6).reverse(), [events])

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-card-foreground">
            最近事件摘要
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {eventStream.lastEventAt
              ? `最新实时事件 ${formatTimestamp(eventStream.lastEventAt)}`
              : eventStream.loadedRecentAt
                ? `历史已加载 ${formatTimestamp(eventStream.loadedRecentAt)}`
                : "等待事件历史"}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted"
          onClick={onOpenEvents}
        >
          <ListRestart aria-hidden="true" className="size-4" />
          事件
        </button>
      </div>

      {latestEvents.length === 0 ? (
        <CompactEmptyState
          icon={ListRestart}
          title="暂无最近事件"
          text="事件历史或实时流到达后会显示在这里。"
        />
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {latestEvents.map((event) => (
            <ActivityEventItem event={event} key={event.id} compact />
          ))}
        </ol>
      )}
    </section>
  )
}

function CompactEmptyState({
  icon: Icon,
  text,
  title,
}: {
  icon: LucideIcon
  text: string
  title: string
}) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-sm">
        <Icon aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h3 className="mt-3 text-base font-semibold text-card-foreground">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

function HeaderSummary({
  eventStream,
  lastLoadedAt,
  services,
}: {
  eventStream: ReturnType<typeof useEventStream>
  lastLoadedAt: string | null
  services: ServiceStatus[]
}) {
  const definitions = useAtomValue(serviceDefinitionsAtom)
  const commands = useAtomValue(commandsAtom)
  const events = useAtomValue(recentEventsAtom)
  const connectionState = useAtomValue(connectionStateAtom)
  const counts = services.reduce(
    (summary, service) => {
      summary[service.overall.level] += 1
      return summary
    },
    { ok: 0, warning: 0, error: 0, unknown: 0 } satisfies Record<
      OverallLevel,
      number
    >,
  )

  return (
    <div className="grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricTile
        icon={Server}
        label="托管服务"
        value={services.length.toString()}
        detail={`已加载 ${definitions.length} 个注册定义`}
      />
      <MetricTile
        icon={CheckCircle2}
        label="正常 / 警告"
        value={`${counts.ok} / ${counts.warning}`}
        detail={`${counts.error} 个错误，${counts.unknown} 个未知`}
      />
      <MetricTile
        icon={TerminalSquare}
        label="命令"
        value={commands.length.toString()}
        detail="可见的类型化命令定义"
      />
      <MetricTile
        icon={eventStream.error ? AlertTriangle : Activity}
        label="事件流"
        value={connectionLabels[connectionState.status]}
        detail={
          eventStream.lastEventAt
            ? `实时 ${formatTimestamp(eventStream.lastEventAt)}`
            : eventStream.fallbackRefreshAt
              ? `REST 回退 ${formatTimestamp(
                  eventStream.fallbackRefreshAt,
                )}`
              : eventStream.error
                ? formatApiError(eventStream.error)
                : eventStream.loadedRecentAt
                    ? `最近事件已加载 ${formatTimestamp(
                        eventStream.loadedRecentAt,
                      )}`
                    : lastLoadedAt
                      ? `快照 ${formatTimestamp(lastLoadedAt)}`
                      : "等待首次加载"
        }
      />
      <MetricTile
        icon={ListRestart}
        label="最近事件"
        value={events.length.toString()}
        detail={
          eventStream.loadedRecentAt
            ? `已加载 ${formatTimestamp(eventStream.loadedRecentAt)}`
            : lastLoadedAt
                ? `已加载 ${formatTimestamp(lastLoadedAt)}`
                : "等待首次加载"
        }
      />
    </div>
  )
}

interface MetricTileProps {
  icon: LucideIcon
  label: string
  value: string
  detail: string
}

function MetricTile({ icon: Icon, label, value, detail }: MetricTileProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-normal text-card-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-md border border-border bg-secondary p-2 text-secondary-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {detail}
      </p>
    </div>
  )
}

interface ServiceOverviewProps {
  definitionsError: ApiError | null
  error: ApiError | null
  filteredServices: ServiceStatus[]
  filters: ServiceFilterState
  loading: boolean
  onRefresh: () => void
  refreshing: boolean
  services: ServiceStatus[]
  selectedServiceName: string
  setFilters: (filters: ServiceFilterState) => void
  onOpenDetails: (serviceName: string) => void
  onSelectService: (serviceName: string) => void
}

function ServiceOverview({
  definitionsError,
  error,
  filteredServices,
  filters,
  loading,
  onRefresh,
  refreshing,
  services,
  selectedServiceName,
  setFilters,
  onOpenDetails,
  onSelectService,
}: ServiceOverviewProps) {
  const categories = useMemo(() => getCategories(services), [services])
  const selectedService = services.find(
    (service) => service.service_name === selectedServiceName,
  )

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal text-card-foreground">
            服务列表
          </h1>
          <p className="mt-1 max-w-3xl truncate text-sm text-muted-foreground">
            基于注册表的服务健康视图会分别展示总体、Docker 和 ROS 状态。
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <ShieldCheck aria-hidden="true" className="size-4" />
          仅限后端白名单
        </span>
      </div>

      <ServiceFilterBar
        categories={categories}
        disabled={loading || services.length === 0}
        filters={filters}
        refreshing={refreshing}
        serviceCount={services.length}
        visibleCount={filteredServices.length}
        onRefresh={onRefresh}
        onUpdate={setFilters}
      />

      {definitionsError ? (
        <InlineNotice
          icon={AlertTriangle}
          tone="warning"
          title="服务定义不可用"
        >
          状态快照仍已从 <code>/api/services</code> 加载。定义元数据加载失败：{" "}
          {formatApiError(definitionsError)}
        </InlineNotice>
      ) : null}

      {loading && services.length === 0 ? (
        <LoadingServicesState />
      ) : error && services.length === 0 ? (
        <ErrorServicesState error={error} onRefresh={onRefresh} />
      ) : services.length === 0 ? (
        <EmptyServicesState />
      ) : filteredServices.length === 0 ? (
        <NoFilteredServicesState />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[17%]" />
              <col className="w-[20%]" />
              <col className="w-[9%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-muted text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-semibold">服务</th>
                <th className="px-4 py-3 font-semibold">总体</th>
                <th className="px-4 py-3 font-semibold">Docker</th>
                <th className="px-4 py-3 font-semibold">ROS</th>
                <th className="px-4 py-3 font-semibold">风险</th>
                <th className="px-4 py-3 text-right font-semibold">详情</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service) => (
                <ServiceRow
                  key={service.service_name}
                  service={service}
                  selected={service.service_name === selectedServiceName}
                  onSelect={() => onSelectService(service.service_name)}
                  onOpenDetails={() => onOpenDetails(service.service_name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SelectedServiceSummary
        service={selectedService ?? null}
        onOpenDetails={
          selectedService
            ? () => onOpenDetails(selectedService.service_name)
            : undefined
        }
      />
    </section>
  )
}

interface ServiceFiltersProps {
  categories: string[]
  disabled: boolean
  filters: ServiceFilterState
  refreshing: boolean
  serviceCount: number
  visibleCount: number
  onRefresh: () => void
  onUpdate: (filters: ServiceFilterState) => void
}

function ServiceFilterBar({
  categories,
  disabled,
  filters,
  refreshing,
  serviceCount,
  visibleCount,
  onRefresh,
  onUpdate,
}: ServiceFiltersProps) {
  return (
    <div className="grid shrink-0 gap-3 border-b border-border p-3 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect
          disabled={disabled}
          label="总体"
          value={filters.status}
          onChange={(status) =>
            onUpdate({ ...filters, status: status as StatusFilter })
          }
        >
          <option value={allFilterValue}>全部状态</option>
          <option value="ok">正常</option>
          <option value="warning">警告</option>
          <option value="error">错误</option>
          <option value="unknown">未知</option>
        </FilterSelect>
        <FilterSelect
          disabled={disabled}
          label="类别"
          value={filters.category}
          onChange={(category) => onUpdate({ ...filters, category })}
        >
          <option value={allFilterValue}>全部类别</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          disabled={disabled}
          label="风险"
          value={filters.risk}
          onChange={(risk) =>
            onUpdate({ ...filters, risk: risk as RiskFilter })
          }
        >
          <option value={allFilterValue}>全部风险</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="critical">严重</option>
        </FilterSelect>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ListFilter aria-hidden="true" className="size-4" />
          当前显示 {visibleCount} / {serviceCount}
        </span>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn("size-4", refreshing && "animate-spin")}
          />
          刷新
        </button>
      </div>
    </div>
  )
}

interface FilterSelectProps {
  children: ReactNode
  disabled: boolean
  label: string
  value: string
  onChange: (value: string) => void
}

function FilterSelect({
  children,
  disabled,
  label,
  value,
  onChange,
}: FilterSelectProps) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <select
        className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  )
}

function LoadingServicesState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-md">
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto size-9 animate-spin text-primary"
        />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          正在加载服务快照
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          正在从 <code>/api/services</code> 读取已注册服务状态，并从{" "}
          <code>/api/config/services</code> 读取注册表元数据。
        </p>
      </div>
    </div>
  )
}

function EmptyServicesState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-md">
        <Server aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          未返回已注册服务
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          后端已成功响应，但 <code>/api/services</code> 返回空列表。请检查后端管理服务注册表。
        </p>
      </div>
    </div>
  )
}

function NoFilteredServicesState() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-md">
        <ListFilter aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          没有服务匹配当前筛选
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          调整状态、类别或风险筛选即可返回完整后端快照。
        </p>
      </div>
    </div>
  )
}

function ErrorServicesState({
  error,
  onRefresh,
}: {
  error: ApiError
  onRefresh: () => void
}) {
  const copy = getErrorStateCopy(error)
  const Icon = copy.icon

  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
      <div className="max-w-xl">
        <Icon aria-hidden="true" className={cn("mx-auto size-9", copy.iconClass)} />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <p className="mt-3 rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm text-muted-foreground">
          {formatApiError(error)}
        </p>
        <button
          type="button"
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          重试
        </button>
      </div>
    </div>
  )
}

interface CommandsPanelProps {
  discovery: CommandDiscoveryState
  submission: CommandSubmissionState
  onRefresh: () => void
  onSubmitResetOrigin: (
    command: CommandDefinition,
    payload: ResetOriginPayload,
    confirm: boolean,
  ) => Promise<CommandResponse | null>
}

function CommandsPanel({
  discovery,
  submission,
  onRefresh,
  onSubmitResetOrigin,
}: CommandsPanelProps) {
  const busy = discovery.loading || discovery.refreshing

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-normal text-card-foreground">
            <DatabaseZap aria-hidden="true" className="size-5" />
            类型化命令
          </h2>
          <p className="mt-1 max-w-3xl truncate text-sm text-muted-foreground">
            可见命令能力来自 <code>/api/commands</code>；前端只提交已知的类型化载荷。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn("size-4", busy && "animate-spin")}
          />
          刷新命令
        </button>
      </div>

      {discovery.error ? (
        <div className="p-5">
          <PanelError error={discovery.error} />
        </div>
      ) : discovery.loading ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <LoaderCircle
              aria-hidden="true"
              className="mx-auto size-8 animate-spin text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              正在加载命令发现结果
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              正在读取后端可见命令定义。
            </p>
          </div>
        </div>
      ) : discovery.commands.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-md">
            <DatabaseZap
              aria-hidden="true"
              className="mx-auto size-8 text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              未返回可见命令
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              后端已成功响应，但当前没有可供操作员界面展示的命令定义。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 xl:grid-cols-2">
          {discovery.commands.map((command) => (
            <CommandCard
              key={`${command.target}/${command.name}`}
              command={command}
              submission={submission}
              onSubmitResetOrigin={onSubmitResetOrigin}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CommandCard({
  command,
  submission,
  onSubmitResetOrigin,
}: {
  command: CommandDefinition
  submission: CommandSubmissionState
  onSubmitResetOrigin: (
    command: CommandDefinition,
    payload: ResetOriginPayload,
    confirm: boolean,
  ) => Promise<CommandResponse | null>
}) {
  const supported = isResetOriginCommand(command)

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="break-words text-base font-semibold text-card-foreground">
            {command.target}/{command.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {command.description}
          </p>
        </div>
        <RiskPill riskLevel={command.backend.risk_level} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <DetailItem label="传输" value={formatTransport(command.node.transport)} />
        <DetailItem label="Schema" value={command.node.payload_schema} />
        <DetailItem
          label="确认"
          value={formatBoolean(command.backend.requires_confirm)}
        />
        <DetailItem label="支持状态" value={supported ? "类型化表单" : "不可用"} />
      </dl>

      {supported ? (
        <ResetOriginForm
          command={command}
          submission={submission}
          onSubmitResetOrigin={onSubmitResetOrigin}
        />
      ) : (
        <InlineCommandNotice
          title="暂不支持的类型化载荷"
          text="该发现命令可见，但前端尚未提供对应的类型化载荷表单。"
        />
      )}
    </article>
  )
}

function RecentActivityPanel({
  eventStream,
}: {
  eventStream: ReturnType<typeof useEventStream>
}) {
  const events = useAtomValue(recentEventsAtom)
  const connectionState = useAtomValue(connectionStateAtom)
  const latestEvents = useMemo(() => events.slice(-12).reverse(), [events])

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-normal text-card-foreground">
            <ListRestart aria-hidden="true" className="size-5" />
            最近活动
          </h2>
          <p className="mt-1 max-w-3xl truncate text-sm text-muted-foreground">
            展示来自 <code>/api/events/recent</code> 和 <code>/ws/events</code>{" "}
            的重启、类型化命令、后端警告和状态流事件。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge state={connectionState} />
          {connectionState.retry_attempt ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              <RefreshCw aria-hidden="true" className="size-4" />
              第 {connectionState.retry_attempt} 次重试
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid shrink-0 gap-3 border-b border-border p-3 md:grid-cols-3">
        <ActivityMeta
          icon={Activity}
          label="最近事件"
          value={
            eventStream.lastEventAt
              ? formatTimestamp(eventStream.lastEventAt)
              : "尚未收到"
          }
        />
        <ActivityMeta
          icon={RefreshCw}
          label="回退刷新"
          value={
            eventStream.fallbackRefreshAt
              ? formatTimestamp(eventStream.fallbackRefreshAt)
              : "未使用"
          }
        />
        <ActivityMeta
          icon={ListRestart}
          label="最近历史"
          value={
            eventStream.loadedRecentAt
              ? `已加载 ${events.length} 条事件`
              : "正在加载历史"
          }
        />
      </div>

      {connectionState.next_retry_at ? (
        <InlineNotice
          icon={RefreshCw}
          tone="warning"
          title="已安排 WebSocket 重连"
        >
          下次尝试时间 {formatTimestamp(connectionState.next_retry_at)}。事件流不可用时会执行 REST 服务刷新。
        </InlineNotice>
      ) : null}

      {eventStream.error ? (
        <div className="shrink-0 px-5 pt-4">
          <PanelError error={eventStream.error} />
        </div>
      ) : null}

      {latestEvents.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-md">
            <ListRestart
              aria-hidden="true"
              className="mx-auto size-8 text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              暂无最近事件
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              最近活动会先从后端事件历史初始化，然后追加实时 WebSocket 事件。
            </p>
          </div>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {latestEvents.map((event) => (
            <ActivityEventItem event={event} key={event.id} />
          ))}
        </ol>
      )}
    </section>
  )
}

function ActivityMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-card-foreground">
        {value}
      </p>
    </div>
  )
}

function ActivityEventItem({
  compact = false,
  event,
}: {
  compact?: boolean
  event: ManagementEvent
}) {
  const summary = getEventSummary(event)
  const Icon = summary.icon

  return (
    <li
      className={cn(
        "grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start",
        compact && "p-3",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md border",
          activityIconStyles[summary.tone],
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className={cn(
              "text-sm font-semibold text-card-foreground",
              compact ? "truncate" : "break-words",
            )}
          >
            {summary.title}
          </h3>
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
              activityToneStyles[summary.tone],
            )}
          >
            {summary.badge}
          </span>
        </div>
        <p
          className={cn(
            "mt-1 text-sm text-muted-foreground",
            compact ? "line-clamp-2" : "break-words",
          )}
        >
          {summary.description}
        </p>
        <p
          className={cn(
            "mt-2 text-xs text-muted-foreground",
            compact ? "truncate" : "break-all",
          )}
        >
          事件 {event.id}
        </p>
      </div>
      <time
        className="text-xs font-medium text-muted-foreground sm:text-right"
        dateTime={event.time}
      >
        {formatTimestamp(event.time)}
      </time>
    </li>
  )
}

function getEventSummary(event: ManagementEvent): {
  badge: string
  description: string
  icon: LucideIcon
  title: string
  tone: ActivityTone
} {
  switch (event.type) {
    case "service_status_snapshot": {
      const services = getEventServices(event)

      return {
        badge: "状态",
        description:
          services === null
            ? "状态快照载荷没有包含有效的服务列表。"
            : `已从后端收到 ${services.length} 个服务状态。`,
        icon: Server,
        title: "服务状态快照",
        tone: "info",
      }
    }
    case "service_status_changed": {
      const service = getEventService(event)

      return {
        badge: "状态",
        description: service
          ? `${service.display_name} 当前为 ${formatOverallLevel(service.overall.level)}：${service.overall.reason}。`
          : "收到服务状态变更事件，但没有识别到服务载荷。",
        icon: Activity,
        title: service
          ? `${service.display_name} 状态已变更`
          : "服务状态已变更",
        tone: service ? getToneForOverallLevel(service.overall.level) : "neutral",
      }
    }
    case "restart_requested": {
      const request = getRestartRequestPayload(event)
      const service = request?.service ?? "已注册服务"

      return {
        badge: "重启",
        description: request
          ? `已为 ${service} 请求${formatRestartMode(request.mode)}重启${request.reason ? `：${request.reason}` : "。"}`
          : "收到重启请求事件，但载荷无法识别。",
        icon: RotateCcw,
        title: `已请求重启：${service}`,
        tone: "warning",
      }
    }
    case "restart_finished": {
      const response = getRestartResponsePayload(event)
      const success = response?.result === "success"
      const service = response?.service ?? "已注册服务"

      return {
        badge: "重启",
        description: response
          ? `${service} 的${formatRestartMode(response.mode)}重启结果：${formatResult(response.result)}。`
          : "收到重启结果事件，但载荷无法识别。",
        icon: success ? CheckCircle2 : XCircle,
        title: `重启完成：${service}`,
        tone: success ? "success" : "error",
      }
    }
    case "command_requested": {
      const request = getCommandRequestPayload(event)
      const target = request?.target ?? "已注册服务"
      const command = request?.command ?? "类型化命令"

      return {
        badge: "命令",
        description: request
          ? `已请求 ${target}/${command}${request.reason ? `：${request.reason}` : "。"}`
          : "收到命令请求事件，但载荷无法识别。",
        icon: Send,
        title: `已请求命令：${target}/${command}`,
        tone: "info",
      }
    }
    case "command_finished": {
      const response = getCommandResponsePayload(event)
      const success = response?.result === "success"
      const rejected = response?.state === "rejected"
      const target = response?.target ?? "已注册服务"
      const command = response?.command ?? "类型化命令"

      return {
        badge: "命令",
        description: response
          ? `${target}/${command} ${formatResult(response.result)}：${response.message}`
          : "收到命令结果事件，但载荷无法识别。",
        icon: success ? CheckCircle2 : XCircle,
        title: `命令完成：${target}/${command}`,
        tone: success ? "success" : rejected ? "warning" : "error",
      }
    }
    case "backend_warning": {
      return {
        badge: "警告",
        description: getWarningDescription(event.payload),
        icon: AlertTriangle,
        title: "后端警告",
        tone: "warning",
      }
    }
    default:
      return {
        badge: "事件",
        description: "已安全接收保留或未知的后端事件。",
        icon: CircleHelp,
        title: formatEventType(event.type),
        tone: "neutral",
      }
  }
}

function ResetOriginForm({
  command,
  submission,
  onSubmitResetOrigin,
}: {
  command: CommandDefinition
  submission: CommandSubmissionState
  onSubmitResetOrigin: (
    command: CommandDefinition,
    payload: ResetOriginPayload,
    confirm: boolean,
  ) => Promise<CommandResponse | null>
}) {
  const [payload, setPayload] = useState<ResetOriginPayload>({
    pose_x: 0,
    pose_y: 0,
    pose_z: 0,
    pose_yaw_deg: 0,
    reason: "",
  })
  const [operatorConfirmed, setOperatorConfirmed] = useState(false)
  const confirmation = getCommandConfirmationState({
    command,
    error: submission.error,
    operatorConfirmed,
    reason: payload.reason,
    submitting: submission.submitting,
  })

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const response = await onSubmitResetOrigin(
      command,
      payload,
      operatorConfirmed,
    )

    if (response) {
      setOperatorConfirmed(false)
    }
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="pose_x"
          value={payload.pose_x}
          onChange={(pose_x) => setPayload({ ...payload, pose_x })}
        />
        <NumberField
          label="pose_y"
          value={payload.pose_y}
          onChange={(pose_y) => setPayload({ ...payload, pose_y })}
        />
        <NumberField
          label="pose_z"
          value={payload.pose_z}
          onChange={(pose_z) => setPayload({ ...payload, pose_z })}
        />
        <NumberField
          label="pose_yaw_deg"
          value={payload.pose_yaw_deg}
          onChange={(pose_yaw_deg) =>
            setPayload({ ...payload, pose_yaw_deg })
          }
        />
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          原因
        </span>
        <textarea
          className="min-h-20 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
          value={payload.reason}
          onChange={(event) =>
            setPayload({ ...payload, reason: event.target.value })
          }
        />
      </label>

      {confirmation.requiresConfirm ? (
        <label className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <input
            checked={operatorConfirmed}
            className="mt-1 size-4"
            disabled={submission.submitting}
            type="checkbox"
            onChange={(event) => setOperatorConfirmed(event.target.checked)}
          />
          <span>
            确认为 <strong>{command.target}</strong>{" "}
            重置原点。该操作会向后端白名单命令端点发送类型化载荷。
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!confirmation.canSubmit}
        >
          {submission.submitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          ) : (
            <Send aria-hidden="true" className="size-4" />
          )}
          重置原点
        </button>
        <span className="text-xs text-muted-foreground">
          载荷字段由 reset_origin 类型化表单固定。
        </span>
      </div>

      {submission.error ? <CommandError error={submission.error} /> : null}
      {submission.response ? (
        <CommandResponseSummary response={submission.response} />
      ) : null}
    </form>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: keyof Omit<ResetOriginPayload, "reason">
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground">
        {formatResetOriginFieldLabel(label)}
      </span>
      <input
        className="h-10 rounded-md border border-input bg-card px-3 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
        step="any"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(parseNumberInput(event.target.value))}
      />
    </label>
  )
}

function CommandError({ error }: { error: ApiError }) {
  const copy = getCommandErrorCopy(error)

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1">{copy.body}</p>
      <p className="mt-2 break-words text-xs">{formatApiError(error)}</p>
    </div>
  )
}

function CommandResponseSummary({
  response,
}: {
  response: CommandResponse
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <DetailItem label="请求 ID" value={response.request_id} />
      <DetailItem label="已接受" value={formatBoolean(response.accepted)} />
      <DetailItem label="状态" value={formatCommandState(response.state)} />
      <DetailItem label="结果" value={formatResult(response.result)} />
      <DetailItem
        label="开始时间"
        value={formatNullableTimestamp(response.started_at)}
      />
      <DetailItem
        label="结束时间"
        value={formatNullableTimestamp(response.finished_at)}
      />
      <div className="col-span-2">
        <DetailItem label="消息" value={response.message} />
      </div>
    </dl>
  )
}

function InlineCommandNotice({
  text,
  title,
}: {
  text: string
  title: string
}) {
  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{text}</p>
    </div>
  )
}

interface ServiceRowProps {
  service: ServiceStatus
  selected: boolean
  onOpenDetails: () => void
  onSelect: () => void
}

function ServiceRow({
  service,
  selected,
  onOpenDetails,
  onSelect,
}: ServiceRowProps) {
  const OverallIcon = overallIcons[service.overall.level]
  const agentIssue =
    service.docker.running && !service.ros.agent_available
      ? "Docker 正在运行；ROS 代理不可用"
      : service.ros.summary

  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0",
        selected ? "bg-sky-50/70" : "bg-card hover:bg-muted/60",
      )}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          className="flex w-full min-w-0 flex-col text-left"
          onClick={onSelect}
          aria-pressed={selected}
        >
          <span className="truncate font-medium text-card-foreground">
            {service.display_name}
          </span>
          <span className="mt-1 truncate text-xs text-muted-foreground">
            {service.service_name}
          </span>
          <span className="mt-1 truncate text-xs text-muted-foreground">
            {service.category} / {service.compose_profile}
          </span>
        </button>
      </td>
      <td className="px-4 py-3">
        <StatusPill level={service.overall.level}>
          <OverallIcon aria-hidden="true" className="size-3.5" />
          {formatOverallLevel(service.overall.level)}
        </StatusPill>
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {formatDisplaySummary(service.overall.reason)}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Container
            aria-hidden="true"
            className={cn("size-4 shrink-0", dockerStyles[service.docker.state])}
          />
          <span className="truncate text-sm font-medium capitalize text-card-foreground">
            {formatDockerState(service.docker.state)}
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground">
          运行={formatBoolean(service.docker.running)}
          {service.docker.status ? `，状态 ${service.docker.status}` : ""}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          重启 {formatRestartCount(service.docker.restart_count)}
        </p>
      </td>
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {service.ros.agent_available ? (
            <Wifi
              aria-hidden="true"
              className="size-4 shrink-0 text-emerald-700"
            />
          ) : (
            <WifiOff
              aria-hidden="true"
              className="size-4 shrink-0 text-amber-700"
            />
          )}
          <span className="truncate text-sm font-medium text-card-foreground">
            {service.ros.agent_available ? "代理可用" : "代理不可用"}
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {formatDisplaySummary(agentIssue)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {service.ros.expected_nodes.length} 个节点，{service.ros.topics.length}{" "}
          个话题
        </p>
      </td>
      <td className="px-4 py-3">
        <RiskPill riskLevel={service.risk_level} />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-semibold text-card-foreground hover:bg-muted"
          onClick={onOpenDetails}
        >
          <Gauge aria-hidden="true" className="size-3.5" />
          详情
        </button>
      </td>
    </tr>
  )
}

function SelectedServiceSummary({
  service,
  onOpenDetails,
}: {
  service: ServiceStatus | null
  onOpenDetails?: () => void
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-3">
      <div className="min-w-0">
        {service ? (
          <>
            <p className="truncate text-sm font-semibold text-card-foreground">
              已选：{service.display_name}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {service.service_name} / {formatDisplaySummary(service.overall.reason)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-card-foreground">
              尚未选择服务
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              点击服务行后可查看当前选择摘要。
            </p>
          </>
        )}
      </div>
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!service || !onOpenDetails}
        onClick={onOpenDetails}
      >
        <Gauge aria-hidden="true" className="size-4" />
        打开详情
      </button>
    </div>
  )
}

function StatusPill({
  children,
  level,
}: {
  children: ReactNode
  level: OverallLevel
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold uppercase",
        levelStyles[level],
      )}
    >
      {children}
    </span>
  )
}

function RiskPill({ riskLevel }: { riskLevel: ServiceRiskLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold capitalize",
        riskStyles[riskLevel],
      )}
    >
      {formatRiskLevel(riskLevel)}
    </span>
  )
}

function ServiceInspector({
  definition,
  onServiceNotFound,
  onSelectService,
  routeServiceName,
  service,
  services,
}: {
  definition: ServiceDefinition | null
  onServiceNotFound: () => void
  onSelectService: (serviceName: string) => void
  routeServiceName: string
  service: ServiceStatus | null
  services: ServiceStatus[]
}) {
  const [logOptions, setLogOptions] = useState<ServiceLogOptions>({
    tail: DEFAULT_SERVICE_LOG_TAIL,
    stdout: true,
    stderr: true,
    timestamps: true,
  })
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("status")
  const diagnosticsServiceName = routeServiceName || service?.service_name || null
  const diagnostics = useSelectedServiceDiagnostics(
    diagnosticsServiceName,
    logOptions,
    onServiceNotFound,
  )
  const detailService = diagnostics.detail.data ?? service

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
      <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <section className="shrink-0 border-b border-border p-4">
          {detailService ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    当前服务
                  </p>
                  <h2 className="mt-1 truncate text-2xl font-semibold tracking-normal text-card-foreground">
                    {detailService.display_name}
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {detailService.service_name}
                  </p>
                </div>
                <StatusPill level={detailService.overall.level}>
                  {formatOverallLevel(detailService.overall.level)}
                </StatusPill>
              </div>

              <dl className="mt-4 grid grid-cols-4 gap-3 text-sm">
                <DetailItem label="逻辑名称" value={detailService.service_name} />
                <DetailItem label="Profile" value={detailService.compose_profile} />
                <DetailItem label="类别" value={detailService.category} />
                <DetailItem label="风险" value={formatRiskLevel(detailService.risk_level)} />
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={diagnostics.refreshDetail}
                  disabled={
                    diagnostics.detail.loading || diagnostics.detail.refreshing
                  }
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      (diagnostics.detail.loading ||
                        diagnostics.detail.refreshing) &&
                        "animate-spin",
                    )}
                  />
                  刷新详情
                </button>
                <span className="text-xs text-muted-foreground">
                  {diagnostics.detail.loadedAt
                    ? `详情已加载 ${formatTimestamp(
                        diagnostics.detail.loadedAt,
                      )}`
                    : "详情会从当前选中的逻辑服务加载"}
                </span>
              </div>

              {diagnostics.detail.error ? (
                <PanelError error={diagnostics.detail.error} />
              ) : null}
            </>
          ) : (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                当前服务
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-card-foreground">
                等待快照
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {routeServiceName
                  ? `正在等待 ${routeServiceName} 的状态快照。`
                  : "状态快照填充后，服务详情面板会使用后端 service_name 值。"}
              </p>
            </div>
          )}
        </section>

        <nav
          aria-label="服务详情"
          className="flex shrink-0 flex-wrap gap-2 border-b border-border p-3"
          role="tablist"
        >
          {detailTabs.map((tab) => {
            const active = tab.id === activeDetailTab

            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
                )}
                aria-selected={active}
                role="tab"
                onClick={() => setActiveDetailTab(tab.id)}
              >
                <tab.icon aria-hidden="true" className="size-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeDetailTab === "status" ? (
            <StatusLayersPanel service={detailService} />
          ) : null}

          {activeDetailTab === "docker" ? (
            <DockerDetailPanel service={detailService} />
          ) : null}

          {activeDetailTab === "ros" ? (
            <RosDetailPanel definition={definition} service={detailService} />
          ) : null}

          {activeDetailTab === "logs" ? (
            <LogsPanel
              logs={diagnostics.logs}
              options={logOptions}
              service={detailService}
              onRefresh={diagnostics.refreshLogs}
              onUpdateOptions={setLogOptions}
            />
          ) : null}

          {activeDetailTab === "stats" ? (
            <StatsPanel
              error={diagnostics.stats.error}
              loadedAt={diagnostics.stats.loadedAt}
              loading={diagnostics.stats.loading}
              refreshing={diagnostics.stats.refreshing}
              stats={diagnostics.stats.data}
              service={detailService}
              onRefresh={diagnostics.refreshStats}
            />
          ) : null}

          {activeDetailTab === "restart" ? (
            <HardRestartPanel
              error={diagnostics.restart.error}
              response={diagnostics.restart.response}
              service={detailService}
              submitting={diagnostics.restart.submitting}
              onRestart={diagnostics.restartHard}
            />
          ) : null}
        </div>
      </aside>

      <ServiceContainerSwitcher
        currentServiceName={detailService?.service_name ?? routeServiceName}
        services={services}
        onSelectService={onSelectService}
      />
    </div>
  )
}

function ServiceContainerSwitcher({
  currentServiceName,
  onSelectService,
  services,
}: {
  currentServiceName: string
  onSelectService: (serviceName: string) => void
  services: ServiceStatus[]
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="shrink-0 border-b border-border p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
          <Container aria-hidden="true" className="size-4" />
          容器
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          切换当前详情页查看的注册容器状态。
        </p>
      </div>

      {services.length > 0 ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {services.map((service) => {
            const active = service.service_name === currentServiceName
            const OverallIcon = overallIcons[service.overall.level]

            return (
              <button
                key={service.service_name}
                type="button"
                aria-pressed={active}
                className={cn(
                  "flex w-full min-w-0 flex-col rounded-md border p-3 text-left text-sm transition",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-card-foreground hover:bg-muted",
                )}
                onClick={() => onSelectService(service.service_name)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Container
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0",
                      active
                        ? "text-primary-foreground"
                        : dockerStyles[service.docker.state],
                    )}
                  />
                  <span className="truncate font-semibold">
                    {service.container_name}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 truncate text-xs",
                    active ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {service.display_name}
                </span>
                <span
                  className={cn(
                    "mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
                    active
                      ? "border-primary-foreground/40 text-primary-foreground"
                      : levelStyles[service.overall.level],
                  )}
                >
                  <OverallIcon aria-hidden="true" className="size-3" />
                  {formatOverallLevel(service.overall.level)}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-4 text-center">
          <p className="text-sm text-muted-foreground">
            等待服务快照后显示可切换容器。
          </p>
        </div>
      )}
    </aside>
  )
}

function StatusLayersPanel({ service }: { service: ServiceStatus | null }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <Gauge aria-hidden="true" className="size-4" />
        状态层
      </h3>
      <div className="mt-4 space-y-3">
        <LayerLine
          icon={Activity}
          label="总体"
          value={
            service
              ? `${formatOverallLevel(service.overall.level)}：${formatDisplaySummary(service.overall.reason)}`
              : "未选择服务"
          }
        />
        <LayerLine
          icon={Container}
          label="Docker"
          value={service ? formatDockerSummary(service) : "等待后端状态"}
        />
        <LayerLine
          icon={RadioTower}
          label="ROS"
          value={service ? formatRosSummary(service) : "等待后端状态"}
        />
      </div>
    </section>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-semibold capitalize text-card-foreground">
        {value}
      </dd>
    </div>
  )
}

interface LayerLineProps {
  icon: LucideIcon
  label: string
  value: string
}

function LayerLine({ icon: Icon, label, value }: LayerLineProps) {
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-primary" />
        <span className="text-sm font-semibold text-card-foreground">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{value}</p>
    </div>
  )
}

function PanelError({ error }: { error: ApiError }) {
  const copy = getErrorStateCopy(error)

  return (
    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1">{copy.body}</p>
      <p className="mt-1 break-words">{formatApiError(error)}</p>
    </div>
  )
}

function DockerDetailPanel({ service }: { service: ServiceStatus | null }) {
  const docker = service?.docker

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <PanelHeader
        detail={
          service
            ? `容器 ${service.container_name}`
            : "等待选择服务"
        }
        icon={Container}
        title="Docker 详情"
      />
      {docker ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="存在" value={formatBoolean(docker.exists)} />
          <DetailItem label="状态" value={formatDockerState(docker.state)} />
          <DetailItem label="运行中" value={formatBoolean(docker.running)} />
          <DetailItem label="状态文本" value={docker.status ?? "未上报"} />
          <DetailItem
            label="开始时间"
            value={formatNullableTimestamp(docker.started_at)}
          />
          <DetailItem
            label="结束时间"
            value={formatNullableTimestamp(docker.finished_at)}
          />
          <DetailItem
            label="退出码"
            value={
              docker.exit_code === null
                ? "未上报"
                : docker.exit_code.toString()
            }
          />
          <DetailItem
            label="重启次数"
            value={formatNullableNumber(docker.restart_count)}
          />
          <DetailItem label="健康状态" value={docker.health ?? "未上报"} />
        </dl>
      ) : (
        <EmptyPanelText text="选择已注册服务后加载 Docker 状态。" />
      )}
    </section>
  )
}

function RosDetailPanel({
  definition,
  service,
}: {
  definition: ServiceDefinition | null
  service: ServiceStatus | null
}) {
  const ros = service?.ros

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <PanelHeader
        detail={
          ros
            ? `${ros.expected_nodes.length} 个预期节点，${ros.topics.length} 个话题`
            : "等待选择服务"
        }
        icon={RadioTower}
        title="ROS 详情"
      />
      {ros ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem
              label="代理"
              value={ros.agent_available ? "可用" : "不可用"}
            />
            <DetailItem label="等级" value={formatOverallLevel(ros.level)} />
            <DetailItem label="摘要" value={formatDisplaySummary(ros.summary)} />
            <DetailItem
              label="配置话题数"
              value={(definition?.expected_topics.length ?? 0).toString()}
            />
          </dl>

          <div className="grid gap-4 xl:grid-cols-3">
            <RosListPanel title="预期节点">
              {ros.expected_nodes.length > 0 ? (
                ros.expected_nodes.map((node) => (
                  <div
                    key={node.name}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate font-medium text-card-foreground">
                        {node.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md border px-2 py-1 text-xs font-semibold",
                          node.present
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                        )}
                      >
                        {node.present ? "存在" : "缺失"}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      最近出现 {formatNullableTimestamp(node.last_seen)}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyPanelText text="该服务未返回预期节点。" />
              )}
            </RosListPanel>

            <RosListPanel title="话题">
              {ros.topics.length > 0 ? (
                ros.topics.map((topic) => (
                  <div
                    key={`${topic.name}:${topic.resolved_name}`}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate font-medium text-card-foreground">
                        {topic.resolved_name}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        {topic.present ? "存在" : "缺失"}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {formatEndpointRole(topic.required_endpoint)}，发布者{" "}
                      {topic.publisher_count}，订阅者{" "}
                      {topic.subscriber_count}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyPanelText text="该服务未返回话题观测结果。" />
              )}
            </RosListPanel>

            <RosListPanel title="诊断">
              {ros.diagnostics.length > 0 ? (
                ros.diagnostics.map((diagnostic) => (
                  <div
                    key={`${diagnostic.name}:${diagnostic.hardware_id}`}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate font-medium text-card-foreground">
                        {diagnostic.name}
                      </span>
                      <StatusPill level={diagnostic.level}>
                        {formatOverallLevel(diagnostic.level)}
                      </StatusPill>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {diagnostic.message}
                    </p>
                  </div>
                ))
              ) : (
                <EmptyPanelText text="该服务未返回 ROS 诊断。" />
              )}
            </RosListPanel>
          </div>
        </div>
      ) : (
        <EmptyPanelText text="选择已注册服务后加载 ROS 诊断。" />
      )}
    </section>
  )
}

function RosListPanel({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="min-h-0 rounded-md border border-border bg-card p-3">
      <h4 className="text-sm font-semibold text-card-foreground">{title}</h4>
      <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function LogsPanel({
  logs,
  options,
  service,
  onRefresh,
  onUpdateOptions,
}: {
  logs: ServiceLogsState
  options: ServiceLogOptions
  service: ServiceStatus | null
  onRefresh: () => void
  onUpdateOptions: (options: ServiceLogOptions) => void
}) {
  const logViewportRef = useRef<HTMLPreElement | null>(null)
  const [autoFollow, setAutoFollow] = useState(true)
  const busy = logs.loading || logs.refreshing
  const lines = logs.data?.lines ?? []
  const containerName = logs.data?.container_name ?? service?.container_name ?? null
  const streamState = getServiceLogStreamStateCopy(logs)

  useEffect(() => {
    setAutoFollow(true)
  }, [
    options.stderr,
    options.stdout,
    options.tail,
    options.timestamps,
    service?.service_name,
  ])

  useEffect(() => {
    if (!autoFollow) {
      return
    }

    const viewport = logViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [autoFollow, lines.length, logs.status])

  const handleLogScroll = useCallback(() => {
    const viewport = logViewportRef.current
    if (!viewport) {
      return
    }

    setAutoFollow(isScrolledNearBottom(viewport))
  }, [])

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelHeader
          detail={
            containerName
              ? `${containerName}，缓存 ${lines.length}/${logs.acceptedTail} 行`
              : "有界实时 Docker 容器日志"
          }
          icon={FileText}
          title="Docker 日志"
        />
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold",
            streamState.className,
          )}
        >
          <streamState.icon
            aria-hidden="true"
            className={cn("size-3.5", busy && "animate-spin")}
          />
          {streamState.label}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            尾部行数
          </span>
          <input
            className="h-10 rounded-md border border-input bg-card px-3 text-sm text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!service || busy}
            max={1000}
            min={1}
            type="number"
            value={options.tail}
            onChange={(event) =>
              onUpdateOptions({
                ...options,
                tail: clampLogTail(Number(event.target.value)),
              })
            }
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <ToggleCheckbox
            checked={options.stdout}
            disabled={!service || busy}
            label="stdout"
            onChange={(stdout) => onUpdateOptions({ ...options, stdout })}
          />
          <ToggleCheckbox
            checked={options.stderr}
            disabled={!service || busy}
            label="stderr"
            onChange={(stderr) => onUpdateOptions({ ...options, stderr })}
          />
          <ToggleCheckbox
            checked={options.timestamps}
            disabled={!service || busy}
            label="时间戳"
            onChange={(timestamps) =>
              onUpdateOptions({ ...options, timestamps })
            }
          />
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!service || busy}
            onClick={onRefresh}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-4", busy && "animate-spin")}
            />
            重新连接
          </button>
        </div>
      </div>

      {logs.error ? <PanelError error={logs.error} /> : null}
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <DetailItem
          label="连接状态"
          value={streamState.label}
        />
        <DetailItem
          label="接受尾部"
          value={`${logs.acceptedTail} 行`}
        />
        <DetailItem
          label="自动跟随"
          value={autoFollow ? "开启" : "已暂停"}
        />
        <DetailItem
          label="最新日志"
          value={logs.lastLineAt ? formatTimestamp(logs.lastLineAt) : "等待"}
        />
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        日志是 <code>{service?.service_name ?? "未选择服务"}</code>{" "}
        的非结构化 Docker 容器输出
        {logs.openedAt ? `，实时连接 ${formatTimestamp(logs.openedAt)}` : ""}
        {logs.loadedAt && !logs.openedAt
          ? `，加载时间 ${formatTimestamp(logs.loadedAt)}`
          : ""}
        {logs.streamReason ? `。${formatServiceLogStreamReason(logs.streamReason)}` : ""}。
      </p>
      <pre
        ref={logViewportRef}
        className="mt-3 h-[420px] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100"
        onScroll={handleLogScroll}
      >
        {lines.length > 0
          ? lines.join("\n")
          : service
            ? getEmptyLogText(logs.status)
            : "选择已注册服务后加载 Docker 日志。"}
      </pre>
    </section>
  )
}

function StatsPanel({
  error,
  loadedAt,
  loading,
  refreshing,
  service,
  stats,
  onRefresh,
}: {
  error: ApiError | null
  loadedAt: string | null
  loading: boolean
  refreshing: boolean
  service: ServiceStatus | null
  stats: ServiceStats | null
  onRefresh: () => void
}) {
  const busy = loading || refreshing

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <PanelHeader
          detail={
            loadedAt
              ? `快照已加载 ${formatTimestamp(loadedAt)}`
              : "单次资源快照"
          }
          icon={Cpu}
          title="Docker 统计"
        />
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!service || busy}
          onClick={onRefresh}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn("size-4", busy && "animate-spin")}
          />
          刷新
        </button>
      </div>
      {error ? <PanelError error={error} /> : null}
      {stats ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="CPU" value={formatPercent(stats.cpu_percent)} />
          <DetailItem
            label="内存"
            value={`${formatBytes(stats.memory_usage_bytes)} / ${formatBytes(
              stats.memory_limit_bytes,
            )}`}
          />
          <DetailItem
            label="内存占比"
            value={formatPercent(stats.memory_percent)}
          />
          <DetailItem
            label="网络接收"
            value={formatBytes(stats.network_rx_bytes)}
          />
          <DetailItem
            label="网络发送"
            value={formatBytes(stats.network_tx_bytes)}
          />
          <DetailItem
            label="块读取"
            value={formatBytes(stats.block_read_bytes)}
          />
          <DetailItem
            label="块写入"
            value={formatBytes(stats.block_write_bytes)}
          />
          <DetailItem label="PIDs" value={stats.pids_current.toString()} />
        </dl>
      ) : (
        <EmptyPanelText text="选择已注册服务后加载一次 Docker 统计快照。" />
      )}
    </section>
  )
}

function HardRestartPanel({
  error,
  response,
  service,
  submitting,
  onRestart,
}: {
  error: ApiError | null
  response: RestartResponse | null
  service: ServiceStatus | null
  submitting: boolean
  onRestart: (reason: string) => Promise<RestartResponse | null>
}) {
  const [reason, setReason] = useState("")
  const [riskConfirmed, setRiskConfirmed] = useState(false)
  const highRiskService =
    service && isHighRisk(service.risk_level) ? service : null
  const requiresRiskConfirm = highRiskService !== null
  const disabled =
    !service || submitting || (requiresRiskConfirm && !riskConfirmed)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await onRestart(reason)

    if (result) {
      setReason("")
      setRiskConfirmed(false)
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/60 p-5 shadow-sm">
      <PanelHeader
        detail="向当前逻辑服务提交硬重启模式"
        icon={RotateCcw}
        title="硬重启"
      />
      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase text-red-900">
            可选原因
          </span>
          <textarea
            className="min-h-20 resize-y rounded-md border border-red-200 bg-card px-3 py-2 text-sm text-card-foreground outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-300/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!service || submitting}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {requiresRiskConfirm ? (
          <label className="flex items-start gap-3 rounded-md border border-red-200 bg-card p-3 text-sm text-red-900">
            <input
              checked={riskConfirmed}
              className="mt-1 size-4"
              disabled={submitting}
              type="checkbox"
              onChange={(event) => setRiskConfirmed(event.target.checked)}
            />
            <span>
              确认对 <strong>{highRiskService.display_name}</strong>{" "}
              执行高风险硬重启。这是第二次显式操作员确认。
            </span>
          </label>
        ) : null}

        <button
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-red-700 bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={disabled}
        >
          {submitting ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          ) : (
            <RotateCcw aria-hidden="true" className="size-4" />
          )}
          硬重启
        </button>
      </form>

      {error ? <PanelError error={error} /> : null}
      {response ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="请求 ID" value={response.request_id} />
          <DetailItem
            label="开始时间"
            value={formatNullableTimestamp(response.started_at)}
          />
          <DetailItem
            label="结束时间"
            value={formatNullableTimestamp(response.finished_at)}
          />
          <DetailItem label="结果" value={formatResult(response.result)} />
        </dl>
      ) : null}
    </section>
  )
}

function PanelHeader({
  detail,
  icon: Icon,
  title,
}: {
  detail: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function ToggleCheckbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-card-foreground">
      <input
        checked={checked}
        className="size-4"
        disabled={disabled}
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function EmptyPanelText({ text }: { text: string }) {
  return <p className="mt-4 text-sm text-muted-foreground">{text}</p>
}

function toConnectionState(status: ConnectionStatus): ConnectionState {
  return {
    status,
    checked_at: new Date().toISOString(),
  }
}

function getConnectionStatus(error: ApiError): ConnectionStatus {
  if (error.code === "auth_required" || error.code === "auth_invalid") {
    return error.code
  }

  return "error"
}

function formatApiError(error: ApiError) {
  return `${error.code}: ${error.message}`
}

function filterServices(services: ServiceStatus[], filters: ServiceFilterState) {
  return services.filter((service) => {
    const statusMatches =
      filters.status === allFilterValue ||
      service.overall.level === filters.status
    const categoryMatches =
      filters.category === allFilterValue ||
      service.category === filters.category
    const riskMatches =
      filters.risk === allFilterValue || service.risk_level === filters.risk

    return statusMatches && categoryMatches && riskMatches
  })
}

function getCategories(services: ServiceStatus[]) {
  return Array.from(new Set(services.map((service) => service.category))).sort(
    (left, right) => left.localeCompare(right),
  )
}

function getEventServices(event: ManagementEvent): ServiceStatus[] | null {
  const payload = event.payload

  if (
    isRecord(payload) &&
    "services" in payload &&
    Array.isArray(payload.services) &&
    payload.services.every(isServiceStatus)
  ) {
    return payload.services
  }

  return null
}

function getEventService(event: ManagementEvent): ServiceStatus | null {
  const payload = event.payload

  if (isRecord(payload) && "service" in payload && isServiceStatus(payload.service)) {
    return payload.service
  }

  if (isRecord(payload) && "status" in payload && isServiceStatus(payload.status)) {
    return payload.status
  }

  return null
}

function getRestartRequestPayload(
  event: ManagementEvent,
): RestartRequestedPayload | null {
  const payload = event.payload

  if (
    isRecord(payload) &&
    isString(payload.request_id) &&
    isString(payload.service) &&
    isRestartMode(payload.mode) &&
    isNullableBoolean(payload.confirm) &&
    isNullableString(payload.reason)
  ) {
    return {
      request_id: payload.request_id,
      service: payload.service,
      mode: payload.mode,
      confirm: payload.confirm,
      reason: payload.reason,
    }
  }

  return null
}

function getRestartResponsePayload(
  event: ManagementEvent,
): RestartResponse | null {
  const payload = event.payload

  if (
    isRecord(payload) &&
    isString(payload.request_id) &&
    isString(payload.service) &&
    isRestartMode(payload.mode) &&
    isBoolean(payload.accepted) &&
    isString(payload.started_at) &&
    isNullableString(payload.finished_at) &&
    isString(payload.result)
  ) {
    return {
      request_id: payload.request_id,
      service: payload.service,
      mode: payload.mode,
      accepted: payload.accepted,
      started_at: payload.started_at,
      finished_at: payload.finished_at,
      result: payload.result,
    }
  }

  return null
}

function getCommandRequestPayload(
  event: ManagementEvent,
): CommandRequestedPayload | null {
  const payload = event.payload

  if (
    isRecord(payload) &&
    isString(payload.request_id) &&
    isString(payload.target) &&
    isString(payload.command) &&
    isNullableBoolean(payload.confirm) &&
    isNullableString(payload.reason)
  ) {
    return {
      request_id: payload.request_id,
      target: payload.target,
      command: payload.command,
      confirm: payload.confirm,
      reason: payload.reason,
    }
  }

  return null
}

function getCommandResponsePayload(
  event: ManagementEvent,
): CommandResponse | null {
  const payload = event.payload

  if (
    isRecord(payload) &&
    isString(payload.request_id) &&
    isString(payload.target) &&
    isString(payload.command) &&
    isBoolean(payload.accepted) &&
    isString(payload.state) &&
    isString(payload.result) &&
    isString(payload.message) &&
    isString(payload.started_at) &&
    isNullableString(payload.finished_at)
  ) {
    return {
      request_id: payload.request_id,
      target: payload.target,
      command: payload.command,
      accepted: payload.accepted,
      state: payload.state,
      result: payload.result,
      message: payload.message,
      started_at: payload.started_at,
      finished_at: payload.finished_at,
    }
  }

  return null
}

function getWarningDescription(payload: ManagementEvent["payload"]) {
  if (isRecord(payload)) {
    if ("message" in payload && isString(payload.message)) {
      return payload.message
    }

    if ("reason" in payload && isString(payload.reason)) {
      return payload.reason
    }
  }

  return "后端发出了警告事件。"
}

function formatEventType(type: string) {
  const knownEventLabels: Record<string, string> = {
    service_status_snapshot: "服务状态快照",
    service_status_changed: "服务状态变更",
    restart_requested: "重启请求",
    restart_finished: "重启完成",
    command_requested: "命令请求",
    command_finished: "命令完成",
    backend_warning: "后端警告",
  }

  if (type in knownEventLabels) {
    return knownEventLabels[type]
  }

  return type
    .split("_")
    .filter((part) => part.length > 0)
    .join(" ")
}

function formatResetOriginFieldLabel(
  label: keyof Omit<ResetOriginPayload, "reason">,
) {
  const labels: Record<keyof Omit<ResetOriginPayload, "reason">, string> = {
    pose_x: "位姿 X",
    pose_y: "位姿 Y",
    pose_z: "位姿 Z",
    pose_yaw_deg: "偏航角",
  }

  return labels[label]
}

function formatOverallLevel(level: OverallLevel) {
  return overallLabels[level]
}

function formatRiskLevel(riskLevel: ServiceRiskLevel) {
  return riskLabels[riskLevel]
}

function formatDockerState(state: DockerState) {
  return dockerStateLabels[state]
}

function formatRestartMode(mode: RestartMode) {
  if (mode === "hard") {
    return "硬"
  }

  if (mode === "soft") {
    return "软"
  }

  return mode
}

function formatCommandState(state: CommandState) {
  if (state === "finished") {
    return "已完成"
  }

  if (state === "rejected") {
    return "已拒绝"
  }

  return state
}

function formatResult(result: CommandResult | RestartResult) {
  if (result === "success") {
    return "成功"
  }

  if (result === "failed") {
    return "失败"
  }

  if (result === "rejected") {
    return "已拒绝"
  }

  return result
}

function formatEndpointRole(role: string) {
  if (role === "publisher") {
    return "需要发布者"
  }

  if (role === "subscriber") {
    return "需要订阅者"
  }

  return role
}

function formatTransport(transport: CommandTransport) {
  const knownTransportLabels: Record<string, string> = {
    action: "Action 动作",
    service: "Service 服务",
    topic: "Topic 话题",
  }

  return knownTransportLabels[transport] ?? transport
}

function formatDisplaySummary(value: string) {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .join(" ")
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function formatNullableTimestamp(value: string | null) {
  return value ? formatTimestamp(value) : "未上报"
}

function formatNullableNumber(value: number | null) {
  return value === null ? "未上报" : value.toString()
}

function formatRestartCount(value: number | null) {
  return value === null ? "未上报" : `${value} 次`
}

function formatBoolean(value: boolean) {
  return value ? "是" : "否"
}

function clampLogTail(value: number) {
  return normalizeServiceLogTail(value)
}

function isScrolledNearBottom(element: HTMLElement) {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight

  return remaining <= 24
}

function getServiceLogStreamStateCopy(logs: ServiceLogsState): {
  className: string
  icon: LucideIcon
  label: string
} {
  if (logs.status === "live") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: Wifi,
      label: "实时日志",
    }
  }

  if (logs.status === "connecting") {
    return {
      className: "border-sky-200 bg-sky-50 text-sky-800",
      icon: LoaderCircle,
      label: "正在连接",
    }
  }

  if (logs.status === "fallback") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-900",
      icon: RefreshCw,
      label: "REST 回退",
    }
  }

  if (logs.status === "ended") {
    return {
      className: "border-zinc-200 bg-zinc-50 text-zinc-700",
      icon: WifiOff,
      label: "日志流结束",
    }
  }

  if (logs.status === "auth_required") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-900",
      icon: KeyRound,
      label: "需要令牌",
    }
  }

  if (logs.status === "error") {
    return {
      className: "border-red-200 bg-red-50 text-red-800",
      icon: XCircle,
      label: "日志流错误",
    }
  }

  return {
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
    icon: FileText,
    label: "未连接",
  }
}

function getEmptyLogText(status: ServiceLogsState["status"]) {
  if (status === "connecting") {
    return "正在连接服务日志流，等待后端发送初始尾部日志。"
  }

  if (status === "live") {
    return "当前选项未返回历史日志，正在等待新日志行。"
  }

  if (status === "ended") {
    return "服务日志流已结束，当前没有可显示的日志行。"
  }

  if (status === "fallback") {
    return "实时日志连接不可用，REST 回退未返回日志行。"
  }

  if (status === "auth_required") {
    return "管理后端需要令牌后才能打开服务日志流。"
  }

  if (status === "error") {
    return "服务日志流打开失败。"
  }

  return "当前选项未返回日志行。"
}

function formatServiceLogStreamReason(reason: string) {
  const knownReasonLabels: Record<string, string> = {
    container_exited: "容器已退出",
    container_missing: "容器不存在",
    docker_stream_ended: "Docker 日志流结束",
  }

  return knownReasonLabels[reason] ?? reason
}

function parseNumberInput(value: string) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function isRestartMode(value: unknown): value is RestartResponse["mode"] {
  return value === "hard" || value === "soft"
}

function isServiceStatus(value: unknown): value is ServiceStatus {
  return (
    isRecord(value) &&
    isString(value.service_name) &&
    isString(value.container_name) &&
    isString(value.display_name) &&
    isString(value.category) &&
    isString(value.compose_profile) &&
    isString(value.risk_level) &&
    isRecord(value.docker) &&
    isRecord(value.ros) &&
    isRecord(value.overall) &&
    isOverallLevel(value.overall.level) &&
    isString(value.overall.reason)
  )
}

function isOverallLevel(value: unknown): value is OverallLevel {
  return (
    value === "ok" ||
    value === "warning" ||
    value === "error" ||
    value === "unknown"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || isBoolean(value)
}

function formatDockerSummary(service: ServiceStatus) {
  const status = service.docker.status
    ? `，状态 ${service.docker.status}`
    : "，状态未上报"
  const exitCode =
    service.docker.exit_code === null
      ? ""
      : `，退出码 ${service.docker.exit_code}`

  return `${formatDockerState(service.docker.state)}，运行=${formatBoolean(
    service.docker.running,
  )}${status}，重启 ${formatRestartCount(
    service.docker.restart_count,
  )}${exitCode}`
}

function getCommandErrorCopy(error: ApiError): {
  body: string
  title: string
} {
  if (error.code === "command_confirm_required") {
    return {
      body: "后端策略要求显式确认。勾选确认框后再次提交。",
      title: "命令需要确认",
    }
  }

  if (error.code === "command_not_found") {
    return {
      body: "该命令定义已不在后端注册表中。命令发现正在刷新。",
      title: "命令不再可用",
    }
  }

  if (error.code === "command_transport_unavailable") {
    return {
      body: "后端无法访问管理代理或 ROS 命令传输。",
      title: "管理代理传输不可用",
    }
  }

  return {
    body: "后端拒绝或执行类型化命令请求失败。",
    title: "命令请求失败",
  }
}

function getErrorStateCopy(error: ApiError): {
  body: string
  icon: LucideIcon
  iconClass: string
  title: string
} {
  if (error.code === "auth_required") {
    return {
      body: "管理后端需要 Bearer 令牌。请在上方输入配置的令牌并重新连接。",
      icon: KeyRound,
      iconClass: "text-amber-700",
      title: "需要认证",
    }
  }

  if (error.code === "auth_invalid") {
    return {
      body: "后端拒绝了当前令牌。请清除或替换令牌后重新连接。",
      icon: ShieldAlert,
      iconClass: "text-red-700",
      title: "管理令牌无效",
    }
  }

  if (error.code === "docker_unavailable") {
    return {
      body: "后端可达，但无法读取 Docker Engine 状态。这是后端或 Docker 控制平面问题，不是单个 ROS 服务故障。",
      icon: Container,
      iconClass: "text-red-700",
      title: "Docker 控制平面不可用",
    }
  }

  if (error.code === "docker_operation_failed") {
    return {
      body: "后端已收到请求，但本次 Docker 操作失败。服务状态和 ROS 信息可能仍可用。",
      icon: Container,
      iconClass: "text-red-700",
      title: "Docker 操作失败",
    }
  }

  if (error.code === "request_failed") {
    return {
      body: error.message,
      icon: AlertTriangle,
      iconClass: "text-red-700",
      title: "管理请求失败",
    }
  }

  return {
    body: "本次管理请求未完成。请检查后端 URL、令牌和网络路径后重试。",
    icon: AlertTriangle,
    iconClass: "text-red-700",
    title: "管理请求失败",
  }
}

function InlineNotice({
  children,
  icon: Icon,
  title,
  tone,
}: {
  children: ReactNode
  icon: LucideIcon
  title: string
  tone: "warning"
}) {
  return (
    <div
      className={cn(
        "mx-4 mt-4 rounded-md border px-4 py-3 text-sm",
        tone === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-current/85">{children}</p>
        </div>
      </div>
    </div>
  )
}
