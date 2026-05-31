import {
  Activity,
  AlertTriangle,
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
  useMemo,
  useState,
} from "react"
import { ManagementShell } from "@/components/management/ManagementShell"
import {
  type CommandDiscoveryState,
  type CommandSubmissionState,
  isResetOriginCommand,
  type ResetOriginPayload,
  useCommandDiscovery,
} from "@/hooks/useCommandDiscovery"
import { useEventStream } from "@/hooks/useEventStream"
import {
  type ServiceLogOptions,
  useSelectedServiceDiagnostics,
} from "@/hooks/useSelectedServiceDiagnostics"
import { useServicesSnapshot } from "@/hooks/useServicesSnapshot"
import { createManagementApiClient, getApiError } from "@/lib/management-api"
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
  CommandResponse,
  CommandRequestedPayload,
  ConnectionState,
  ConnectionStatus,
  DockerState,
  ManagementEvent,
  OverallLevel,
  RestartRequestedPayload,
  RestartResponse,
  ServiceDefinition,
  ServiceLogsResponse,
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
  idle: "Not checked",
  checking: "Checking",
  connected: "Connected",
  stream_connecting: "Connecting stream",
  live: "Live events",
  reconnecting: "Reconnecting",
  fallback: "REST fallback",
  auth_required: "Token required",
  auth_invalid: "Invalid token",
  error: "Connection error",
}

const overallIcons: Record<OverallLevel, LucideIcon> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  unknown: CircleHelp,
}

export function App() {
  const services = useAtomValue(serviceStatusesAtom)
  const selectedService = useAtomValue(selectedServiceAtom)
  const selectedDefinition = useAtomValue(selectedServiceDefinitionAtom)
  const setSelectedServiceName = useSetAtom(selectedServiceNameAtom)
  const snapshot = useServicesSnapshot()
  const commandDiscovery = useCommandDiscovery()
  const eventStream = useEventStream()
  const [filters, setFilters] = useState<ServiceFilterState>({
    status: allFilterValue,
    category: allFilterValue,
    risk: allFilterValue,
  })
  const filteredServices = useMemo(
    () => filterServices(services, filters),
    [filters, services],
  )

  return (
    <ManagementShell>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="space-y-6">
          <ConnectionSettings onRefresh={snapshot.refresh} />
          <HeaderSummary
            eventStream={eventStream}
            lastLoadedAt={snapshot.lastLoadedAt}
            services={services}
          />
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
            onSelectService={setSelectedServiceName}
          />
          <CommandsPanel
            discovery={commandDiscovery.discovery}
            submission={commandDiscovery.submission}
            onRefresh={commandDiscovery.refresh}
            onSubmitResetOrigin={commandDiscovery.submitResetOrigin}
          />
          <RecentActivityPanel eventStream={eventStream} />
        </section>

        <ServiceInspector
          definition={selectedDefinition}
          onServiceNotFound={snapshot.refresh}
          service={selectedService}
        />
      </div>
    </ManagementShell>
  )
}

function ConnectionSettings({ onRefresh }: { onRefresh: () => void }) {
  const [baseUrl, setBaseUrl] = useAtom(baseUrlAtom)
  const [token, setToken] = useAtom(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const [connectionState, setConnectionState] = useAtom(connectionStateAtom)
  const setLatestError = useSetAtom(latestErrorAtom)
  const clearAuthToken = useSetAtom(clearAuthTokenAtom)
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrl)
  const [tokenDraft, setTokenDraft] = useState(token)

  const hasToken = token.trim().length > 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedBaseUrl = baseUrlDraft.trim()
    const nextToken = tokenDraft.trim()

    if (normalizedBaseUrl.length === 0) {
      setConnectionState(toConnectionState("error"))
      setLatestError({
        code: "request_failed",
        message: "management backend base URL is required",
      })
      return
    }

    try {
      new URL(normalizedBaseUrl)
    } catch {
      setConnectionState(toConnectionState("error"))
      setLatestError({
        code: "request_failed",
        message: "management backend base URL must be a valid URL",
      })
      return
    }

    setBaseUrl(normalizedBaseUrl)
    setToken(nextToken)
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
    setConnectionState(toConnectionState("idle"))
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <form
        className="grid gap-5 p-5 lg:grid-cols-[minmax(280px,1fr)_minmax(240px,320px)_auto]"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            <Link2 aria-hidden="true" className="size-4 text-primary" />
            Backend base URL
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
            Bearer token
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
            Connect
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-card-foreground"
            onClick={handleClearToken}
            disabled={!hasToken && tokenDraft.length === 0}
          >
            <ShieldAlert aria-hidden="true" className="size-4" />
            Clear
          </button>
        </div>
      </form>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
        <ConnectionBadge state={connectionState} />
        <p className="text-sm text-muted-foreground">
          HTTP requests use the Authorization bearer header; browser WebSocket
          connections use a token query parameter.
        </p>
      </div>
    </section>
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
  const latestError = useAtomValue(latestErrorAtom)
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        icon={Server}
        label="Managed services"
        value={services.length.toString()}
        detail={`${definitions.length} registry definitions loaded`}
      />
      <MetricTile
        icon={CheckCircle2}
        label="OK / warning"
        value={`${counts.ok} / ${counts.warning}`}
        detail={`${counts.error} error, ${counts.unknown} unknown`}
      />
      <MetricTile
        icon={TerminalSquare}
        label="Commands"
        value={commands.length.toString()}
        detail="visible typed command definitions"
      />
      <MetricTile
        icon={latestError || eventStream.error ? AlertTriangle : Activity}
        label="Event stream"
        value={connectionLabels[connectionState.status]}
        detail={
          eventStream.lastEventAt
            ? `live ${formatTimestamp(eventStream.lastEventAt)}`
            : eventStream.fallbackRefreshAt
              ? `REST fallback ${formatTimestamp(
                  eventStream.fallbackRefreshAt,
                )}`
              : eventStream.error
                ? formatApiError(eventStream.error)
                : latestError
                  ? formatApiError(latestError)
                  : eventStream.loadedRecentAt
                    ? `recent loaded ${formatTimestamp(
                        eventStream.loadedRecentAt,
                      )}`
                    : lastLoadedAt
                      ? `snapshot ${formatTimestamp(lastLoadedAt)}`
                      : "awaiting first load"
        }
      />
      <MetricTile
        icon={ListRestart}
        label="Recent events"
        value={events.length.toString()}
        detail={
          eventStream.loadedRecentAt
            ? `loaded ${formatTimestamp(eventStream.loadedRecentAt)}`
            : latestError
              ? formatApiError(latestError)
              : lastLoadedAt
                ? `loaded ${formatTimestamp(lastLoadedAt)}`
                : "awaiting first load"
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
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-normal text-card-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-md border border-border bg-secondary p-2 text-secondary-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
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
  onSelectService,
}: ServiceOverviewProps) {
  const categories = useMemo(() => getCategories(services), [services])

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-normal text-card-foreground">
            Operations Dashboard
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Registry-scoped service health keeps overall, Docker, and ROS
            status semantics separate.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Backend allowlist only
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
          title="Service definitions unavailable"
        >
          The status snapshot still loaded from <code>/api/services</code>.
          Definition metadata could not be loaded:{" "}
          {formatApiError(definitionsError)}
        </InlineNotice>
      ) : null}

      {loading ? (
        <LoadingServicesState />
      ) : error ? (
        <ErrorServicesState error={error} onRefresh={onRefresh} />
      ) : services.length === 0 ? (
        <EmptyServicesState />
      ) : filteredServices.length === 0 ? (
        <NoFilteredServicesState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted text-xs uppercase text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Service</th>
                <th className="px-5 py-3 font-semibold">Category</th>
                <th className="px-5 py-3 font-semibold">Overall</th>
                <th className="px-5 py-3 font-semibold">Docker</th>
                <th className="px-5 py-3 font-semibold">ROS</th>
                <th className="px-5 py-3 font-semibold">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service) => (
                <ServiceRow
                  key={service.service_name}
                  service={service}
                  selected={service.service_name === selectedServiceName}
                  onSelect={() => onSelectService(service.service_name)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="grid gap-3 sm:grid-cols-3">
        <FilterSelect
          disabled={disabled}
          label="Overall"
          value={filters.status}
          onChange={(status) =>
            onUpdate({ ...filters, status: status as StatusFilter })
          }
        >
          <option value={allFilterValue}>All statuses</option>
          <option value="ok">OK</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="unknown">Unknown</option>
        </FilterSelect>
        <FilterSelect
          disabled={disabled}
          label="Category"
          value={filters.category}
          onChange={(category) => onUpdate({ ...filters, category })}
        >
          <option value={allFilterValue}>All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          disabled={disabled}
          label="Risk"
          value={filters.risk}
          onChange={(risk) =>
            onUpdate({ ...filters, risk: risk as RiskFilter })
          }
        >
          <option value={allFilterValue}>All risks</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </FilterSelect>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ListFilter aria-hidden="true" className="size-4" />
          {visibleCount} of {serviceCount} visible
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
          Refresh
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
        className="h-10 rounded-md border border-input bg-card px-3 text-sm font-medium text-card-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="grid min-h-[260px] place-items-center p-6 text-center">
      <div className="max-w-md">
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto size-9 animate-spin text-primary"
        />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          Loading service snapshot
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Reading registered service status from <code>/api/services</code> and
          registry metadata from <code>/api/config/services</code>.
        </p>
      </div>
    </div>
  )
}

function EmptyServicesState() {
  return (
    <div className="grid min-h-[220px] place-items-center p-6 text-center">
      <div className="max-w-md">
        <Server aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          No registered services returned
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The backend responded successfully, but <code>/api/services</code>{" "}
          returned an empty list. Check the management service registry on the
          backend side.
        </p>
      </div>
    </div>
  )
}

function NoFilteredServicesState() {
  return (
    <div className="grid min-h-[220px] place-items-center p-6 text-center">
      <div className="max-w-md">
        <ListFilter aria-hidden="true" className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold text-card-foreground">
          No services match these filters
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Adjust status, category, or risk filters to return to the full
          backend snapshot.
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
    <div className="grid min-h-[260px] place-items-center p-6 text-center">
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
          Retry
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
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-normal text-card-foreground">
            <DatabaseZap aria-hidden="true" className="size-5" />
            Typed commands
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Visible command capabilities are discovered from{" "}
            <code>/api/commands</code>; only known typed payloads can be
            submitted.
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
          Refresh commands
        </button>
      </div>

      {discovery.error ? (
        <div className="p-5">
          <PanelError error={discovery.error} />
        </div>
      ) : discovery.loading ? (
        <div className="grid min-h-[180px] place-items-center p-6 text-center">
          <div>
            <LoaderCircle
              aria-hidden="true"
              className="mx-auto size-8 animate-spin text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              Loading command discovery
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Reading visible backend command definitions.
            </p>
          </div>
        </div>
      ) : discovery.commands.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center p-6 text-center">
          <div className="max-w-md">
            <DatabaseZap
              aria-hidden="true"
              className="mx-auto size-8 text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              No visible commands returned
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The backend responded successfully, but no command definitions are
              currently visible to the operator UI.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-5 lg:grid-cols-2">
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
        <DetailItem label="Transport" value={command.node.transport} />
        <DetailItem label="Schema" value={command.node.payload_schema} />
        <DetailItem
          label="Confirm"
          value={formatBoolean(command.backend.requires_confirm)}
        />
        <DetailItem label="Support" value={supported ? "typed form" : "unavailable"} />
      </dl>

      {supported ? (
        <ResetOriginForm
          command={command}
          submission={submission}
          onSubmitResetOrigin={onSubmitResetOrigin}
        />
      ) : (
        <InlineCommandNotice
          title="Unsupported typed payload"
          text="This discovered command is visible, but the frontend has no typed payload form for it yet."
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
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-normal text-card-foreground">
            <ListRestart aria-hidden="true" className="size-5" />
            Recent activity
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Restart, typed command, backend warning, and status stream events
            from <code>/api/events/recent</code> and <code>/ws/events</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge state={connectionState} />
          {connectionState.retry_attempt ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              <RefreshCw aria-hidden="true" className="size-4" />
              Retry {connectionState.retry_attempt}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 border-b border-border p-4 md:grid-cols-3">
        <ActivityMeta
          icon={Activity}
          label="Last event"
          value={
            eventStream.lastEventAt
              ? formatTimestamp(eventStream.lastEventAt)
              : "not received"
          }
        />
        <ActivityMeta
          icon={RefreshCw}
          label="Fallback refresh"
          value={
            eventStream.fallbackRefreshAt
              ? formatTimestamp(eventStream.fallbackRefreshAt)
              : "not used"
          }
        />
        <ActivityMeta
          icon={ListRestart}
          label="Recent history"
          value={
            eventStream.loadedRecentAt
              ? `${events.length} events loaded`
              : "loading history"
          }
        />
      </div>

      {connectionState.next_retry_at ? (
        <InlineNotice
          icon={RefreshCw}
          tone="warning"
          title="WebSocket reconnect scheduled"
        >
          Next attempt {formatTimestamp(connectionState.next_retry_at)}. A REST
          service refresh runs while the event stream is unavailable.
        </InlineNotice>
      ) : null}

      {eventStream.error ? (
        <div className="px-5 pt-4">
          <PanelError error={eventStream.error} />
        </div>
      ) : null}

      {latestEvents.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center p-6 text-center">
          <div className="max-w-md">
            <ListRestart
              aria-hidden="true"
              className="mx-auto size-8 text-primary"
            />
            <h3 className="mt-4 text-base font-semibold text-card-foreground">
              No recent events loaded
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Recent activity initializes from the backend event history and
              then appends live WebSocket events.
            </p>
          </div>
        </div>
      ) : (
        <ol className="divide-y divide-border">
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

function ActivityEventItem({ event }: { event: ManagementEvent }) {
  const summary = getEventSummary(event)
  const Icon = summary.icon

  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
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
          <h3 className="break-words text-sm font-semibold text-card-foreground">
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
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {summary.description}
        </p>
        <p className="mt-2 break-all text-xs text-muted-foreground">
          Event {event.id}
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
        badge: "status",
        description:
          services === null
            ? "Status snapshot payload did not include a valid service list."
            : `${services.length} service statuses received from the backend.`,
        icon: Server,
        title: "Service status snapshot",
        tone: "info",
      }
    }
    case "service_status_changed": {
      const service = getEventService(event)

      return {
        badge: "status",
        description: service
          ? `${service.display_name} is ${service.overall.level}: ${service.overall.reason}.`
          : "A service status changed event arrived without a recognized service payload.",
        icon: Activity,
        title: service
          ? `${service.display_name} status changed`
          : "Service status changed",
        tone: service ? getToneForOverallLevel(service.overall.level) : "neutral",
      }
    }
    case "restart_requested": {
      const request = getRestartRequestPayload(event)
      const service = request?.service ?? "registered service"

      return {
        badge: "restart",
        description: request
          ? `${request.mode} restart requested for ${service}${request.reason ? `: ${request.reason}` : "."}`
          : "A restart request event arrived with an unrecognized payload.",
        icon: RotateCcw,
        title: `Restart requested: ${service}`,
        tone: "warning",
      }
    }
    case "restart_finished": {
      const response = getRestartResponsePayload(event)
      const success = response?.result === "success"
      const service = response?.service ?? "registered service"

      return {
        badge: "restart",
        description: response
          ? `${response.mode} restart ${response.result} for ${service}.`
          : "A restart result event arrived with an unrecognized payload.",
        icon: success ? CheckCircle2 : XCircle,
        title: `Restart finished: ${service}`,
        tone: success ? "success" : "error",
      }
    }
    case "command_requested": {
      const request = getCommandRequestPayload(event)
      const target = request?.target ?? "registered service"
      const command = request?.command ?? "typed command"

      return {
        badge: "command",
        description: request
          ? `${target}/${command} was requested${request.reason ? `: ${request.reason}` : "."}`
          : "A command request event arrived with an unrecognized payload.",
        icon: Send,
        title: `Command requested: ${target}/${command}`,
        tone: "info",
      }
    }
    case "command_finished": {
      const response = getCommandResponsePayload(event)
      const success = response?.result === "success"
      const rejected = response?.state === "rejected"
      const target = response?.target ?? "registered service"
      const command = response?.command ?? "typed command"

      return {
        badge: "command",
        description: response
          ? `${target}/${command} ${response.result}: ${response.message}`
          : "A command result event arrived with an unrecognized payload.",
        icon: success ? CheckCircle2 : XCircle,
        title: `Command finished: ${target}/${command}`,
        tone: success ? "success" : rejected ? "warning" : "error",
      }
    }
    case "backend_warning": {
      return {
        badge: "warning",
        description: getWarningDescription(event.payload),
        icon: AlertTriangle,
        title: "Backend warning",
        tone: "warning",
      }
    }
    default:
      return {
        badge: "event",
        description: "Reserved or unknown backend event received safely.",
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
          reason
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
            Confirm reset origin for{" "}
            <strong>{command.target}</strong>. This sends the typed payload to
            the backend allowlisted command endpoint.
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
          Reset origin
        </button>
        <span className="text-xs text-muted-foreground">
          Payload fields are fixed by the reset-origin typed form.
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
        {label}
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
      <DetailItem label="Request ID" value={response.request_id} />
      <DetailItem label="Accepted" value={formatBoolean(response.accepted)} />
      <DetailItem label="State" value={response.state} />
      <DetailItem label="Result" value={response.result} />
      <DetailItem
        label="Started"
        value={formatNullableTimestamp(response.started_at)}
      />
      <DetailItem
        label="Finished"
        value={formatNullableTimestamp(response.finished_at)}
      />
      <div className="col-span-2">
        <DetailItem label="Message" value={response.message} />
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
  onSelect: () => void
}

function ServiceRow({ service, selected, onSelect }: ServiceRowProps) {
  const OverallIcon = overallIcons[service.overall.level]
  const agentIssue =
    service.docker.running && !service.ros.agent_available
      ? "Docker running; ROS agent unavailable"
      : service.ros.summary

  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0",
        selected ? "bg-sky-50/70" : "bg-card hover:bg-muted/60",
      )}
    >
      <td className="px-5 py-4">
        <button
          type="button"
          className="flex max-w-[280px] flex-col text-left"
          onClick={onSelect}
          aria-pressed={selected}
        >
          <span className="font-medium text-card-foreground">
            {service.display_name}
          </span>
          <span className="mt-1 break-all text-xs text-muted-foreground">
            {service.service_name}
          </span>
        </button>
      </td>
      <td className="px-5 py-4">
        <span className="text-sm font-medium capitalize text-card-foreground">
          {service.category}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          profile {service.compose_profile}
        </p>
      </td>
      <td className="px-5 py-4">
        <StatusPill level={service.overall.level}>
          <OverallIcon aria-hidden="true" className="size-3.5" />
          {service.overall.level}
        </StatusPill>
        <p className="mt-2 text-xs text-muted-foreground">
          {service.overall.reason}
        </p>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <Container
            aria-hidden="true"
            className={cn("size-4", dockerStyles[service.docker.state])}
          />
          <span className="text-sm font-medium capitalize text-card-foreground">
            {service.docker.state}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          running={String(service.docker.running)}
          {service.docker.status ? `, status ${service.docker.status}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          restarts {service.docker.restart_count}
        </p>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          {service.ros.agent_available ? (
            <Wifi aria-hidden="true" className="size-4 text-emerald-700" />
          ) : (
            <WifiOff aria-hidden="true" className="size-4 text-amber-700" />
          )}
          <span className="text-sm font-medium text-card-foreground">
            {service.ros.agent_available ? "Agent available" : "Agent unavailable"}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {agentIssue}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {service.ros.expected_nodes.length} nodes, {service.ros.topics.length}{" "}
          topics
        </p>
      </td>
      <td className="px-5 py-4">
        <RiskPill riskLevel={service.risk_level} />
      </td>
    </tr>
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
      {riskLevel}
    </span>
  )
}

function ServiceInspector({
  definition,
  onServiceNotFound,
  service,
}: {
  definition: ServiceDefinition | null
  onServiceNotFound: () => void
  service: ServiceStatus | null
}) {
  const [logOptions, setLogOptions] = useState<ServiceLogOptions>({
    tail: 200,
    stdout: true,
    stderr: true,
    timestamps: true,
  })
  const diagnostics = useSelectedServiceDiagnostics(
    service?.service_name ?? null,
    logOptions,
    onServiceNotFound,
  )
  const detailService = diagnostics.detail.data ?? service

  return (
    <aside className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        {detailService ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Selected service
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal text-card-foreground">
                  {detailService.display_name}
                </h2>
              </div>
              <StatusPill level={detailService.overall.level}>
                {detailService.overall.level}
              </StatusPill>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <DetailItem label="Logical name" value={detailService.service_name} />
              <DetailItem label="Profile" value={detailService.compose_profile} />
              <DetailItem label="Category" value={detailService.category} />
              <DetailItem label="Risk" value={detailService.risk_level} />
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
                Refresh detail
              </button>
              <span className="text-xs text-muted-foreground">
                {diagnostics.detail.loadedAt
                  ? `detail loaded ${formatTimestamp(
                      diagnostics.detail.loadedAt,
                    )}`
                  : "detail loads from the selected logical service"}
              </span>
            </div>

            {diagnostics.detail.error ? (
              <PanelError error={diagnostics.detail.error} />
            ) : null}
          </>
        ) : (
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Selected service
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-card-foreground">
              Awaiting snapshot
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Service detail panels use backend <code>service_name</code>{" "}
              values after the status snapshot is populated.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-card-foreground">
          <Gauge aria-hidden="true" className="size-4" />
          Status layers
        </h3>
        <div className="mt-4 space-y-3">
          <LayerLine
            icon={Activity}
            label="Overall"
            value={
              detailService
                ? `${detailService.overall.level}: ${detailService.overall.reason}`
                : "no service selected"
            }
          />
          <LayerLine
            icon={Container}
            label="Docker"
            value={
              detailService
                ? formatDockerSummary(detailService)
                : "awaiting backend status"
            }
          />
          <LayerLine
            icon={RadioTower}
            label="ROS"
            value={
              detailService
                ? formatRosSummary(detailService)
                : "awaiting backend status"
            }
          />
        </div>
      </section>

      <DockerDetailPanel service={detailService} />

      <RosDetailPanel definition={definition} service={detailService} />

      <LogsPanel
        logs={diagnostics.logs.data}
        options={logOptions}
        error={diagnostics.logs.error}
        loading={diagnostics.logs.loading}
        refreshing={diagnostics.logs.refreshing}
        loadedAt={diagnostics.logs.loadedAt}
        service={detailService}
        onRefresh={diagnostics.refreshLogs}
        onUpdateOptions={setLogOptions}
      />

      <StatsPanel
        error={diagnostics.stats.error}
        loadedAt={diagnostics.stats.loadedAt}
        loading={diagnostics.stats.loading}
        refreshing={diagnostics.stats.refreshing}
        stats={diagnostics.stats.data}
        service={detailService}
        onRefresh={diagnostics.refreshStats}
      />

      <HardRestartPanel
        error={diagnostics.restart.error}
        response={diagnostics.restart.response}
        service={detailService}
        submitting={diagnostics.restart.submitting}
        onRestart={diagnostics.restartHard}
      />
    </aside>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold capitalize text-card-foreground">
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
  return (
    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="font-semibold">{getErrorStateCopy(error).title}</p>
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
            ? `Container ${service.container_name}`
            : "Awaiting selected service"
        }
        icon={Container}
        title="Docker detail"
      />
      {docker ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="Exists" value={formatBoolean(docker.exists)} />
          <DetailItem label="State" value={docker.state} />
          <DetailItem label="Running" value={formatBoolean(docker.running)} />
          <DetailItem label="Status" value={docker.status ?? "not reported"} />
          <DetailItem
            label="Started"
            value={formatNullableTimestamp(docker.started_at)}
          />
          <DetailItem
            label="Finished"
            value={formatNullableTimestamp(docker.finished_at)}
          />
          <DetailItem
            label="Exit code"
            value={
              docker.exit_code === null
                ? "not reported"
                : docker.exit_code.toString()
            }
          />
          <DetailItem
            label="Restart count"
            value={docker.restart_count.toString()}
          />
          <DetailItem label="Health" value={docker.health ?? "not reported"} />
        </dl>
      ) : (
        <EmptyPanelText text="Select a registered service to load Docker status." />
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
            ? `${ros.expected_nodes.length} expected nodes, ${ros.topics.length} topics`
            : "Awaiting selected service"
        }
        icon={RadioTower}
        title="ROS detail"
      />
      {ros ? (
        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <DetailItem
              label="Agent"
              value={ros.agent_available ? "available" : "unavailable"}
            />
            <DetailItem label="Level" value={ros.level} />
            <DetailItem label="Summary" value={ros.summary} />
            <DetailItem
              label="Configured topics"
              value={(definition?.expected_topics.length ?? 0).toString()}
            />
          </dl>

          <div>
            <h4 className="text-sm font-semibold text-card-foreground">
              Expected nodes
            </h4>
            {ros.expected_nodes.length > 0 ? (
              <div className="mt-2 space-y-2">
                {ros.expected_nodes.map((node) => (
                  <div
                    key={node.name}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="break-all font-medium text-card-foreground">
                        {node.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-1 text-xs font-semibold",
                          node.present
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                        )}
                      >
                        {node.present ? "present" : "missing"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      last seen {formatNullableTimestamp(node.last_seen)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanelText text="No expected nodes were returned for this service." />
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-card-foreground">
              Topics
            </h4>
            {ros.topics.length > 0 ? (
              <div className="mt-2 space-y-2">
                {ros.topics.map((topic) => (
                  <div
                    key={`${topic.name}:${topic.resolved_name}`}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="break-all font-medium text-card-foreground">
                        {topic.resolved_name}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {topic.present ? "present" : "missing"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {topic.required_endpoint}, publishers{" "}
                      {topic.publisher_count}, subscribers{" "}
                      {topic.subscriber_count}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanelText text="No topic observations were returned for this service." />
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-card-foreground">
              Diagnostics
            </h4>
            {ros.diagnostics.length > 0 ? (
              <div className="mt-2 space-y-2">
                {ros.diagnostics.map((diagnostic) => (
                  <div
                    key={`${diagnostic.name}:${diagnostic.hardware_id}`}
                    className="rounded-md border border-border bg-muted/60 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="break-all font-medium text-card-foreground">
                        {diagnostic.name}
                      </span>
                      <StatusPill level={diagnostic.level}>
                        {diagnostic.level}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {diagnostic.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyPanelText text="No ROS diagnostics were returned for this service." />
            )}
          </div>
        </div>
      ) : (
        <EmptyPanelText text="Select a registered service to load ROS diagnostics." />
      )}
    </section>
  )
}

function LogsPanel({
  error,
  loadedAt,
  loading,
  logs,
  options,
  refreshing,
  service,
  onRefresh,
  onUpdateOptions,
}: {
  error: ApiError | null
  loadedAt: string | null
  loading: boolean
  logs: ServiceLogsResponse | null
  options: ServiceLogOptions
  refreshing: boolean
  service: ServiceStatus | null
  onRefresh: () => void
  onUpdateOptions: (options: ServiceLogOptions) => void
}) {
  const busy = loading || refreshing

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <PanelHeader
        detail={
          logs
            ? `${logs.lines.length} lines from ${logs.container_name}`
            : "Bounded container logs"
        }
        icon={FileText}
        title="Docker logs"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Tail
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
            label="timestamps"
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
            Refresh logs
          </button>
        </div>
      </div>

      {error ? <PanelError error={error} /> : null}
      <p className="mt-4 text-xs text-muted-foreground">
        Logs are unstructured Docker container output for{" "}
        <code>{service?.service_name ?? "no service selected"}</code>
        {loadedAt ? `, loaded ${formatTimestamp(loadedAt)}` : ""}.
      </p>
      <pre className="mt-3 max-h-[360px] overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100">
        {logs && logs.lines.length > 0
          ? logs.lines.join("\n")
          : service
            ? "No log lines returned for the current options."
            : "Select a registered service to load Docker logs."}
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
              ? `Snapshot loaded ${formatTimestamp(loadedAt)}`
              : "Single resource snapshot"
          }
          icon={Cpu}
          title="Docker stats"
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
          Refresh
        </button>
      </div>
      {error ? <PanelError error={error} /> : null}
      {stats ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="CPU" value={formatPercent(stats.cpu_percent)} />
          <DetailItem
            label="Memory"
            value={`${formatBytes(stats.memory_usage_bytes)} / ${formatBytes(
              stats.memory_limit_bytes,
            )}`}
          />
          <DetailItem
            label="Memory %"
            value={formatPercent(stats.memory_percent)}
          />
          <DetailItem
            label="Network RX"
            value={formatBytes(stats.network_rx_bytes)}
          />
          <DetailItem
            label="Network TX"
            value={formatBytes(stats.network_tx_bytes)}
          />
          <DetailItem
            label="Block read"
            value={formatBytes(stats.block_read_bytes)}
          />
          <DetailItem
            label="Block write"
            value={formatBytes(stats.block_write_bytes)}
          />
          <DetailItem label="PIDs" value={stats.pids_current.toString()} />
        </dl>
      ) : (
        <EmptyPanelText text="Select a registered service to load one Docker stats snapshot." />
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
        detail="Posts mode hard to the selected logical service"
        icon={RotateCcw}
        title="Hard restart"
      />
      <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase text-red-900">
            Optional reason
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
              Confirm high-risk hard restart for{" "}
              <strong>{highRiskService.display_name}</strong>. This is a second
              explicit operator confirmation.
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
          Hard restart
        </button>
      </form>

      {error ? <PanelError error={error} /> : null}
      {response ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <DetailItem label="Request ID" value={response.request_id} />
          <DetailItem
            label="Started"
            value={formatNullableTimestamp(response.started_at)}
          />
          <DetailItem
            label="Finished"
            value={formatNullableTimestamp(response.finished_at)}
          />
          <DetailItem label="Result" value={response.result} />
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

  return "Backend emitted a warning event."
}

function formatEventType(type: string) {
  return type
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
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
  return value ? formatTimestamp(value) : "not reported"
}

function formatBoolean(value: boolean) {
  return value ? "true" : "false"
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function formatBytes(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    notation: "compact",
    style: "unit",
    unit: "byte",
    unitDisplay: "narrow",
  }).format(value)
}

function clampLogTail(value: number) {
  if (!Number.isFinite(value)) {
    return 200
  }

  return Math.min(1000, Math.max(1, Math.round(value)))
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
    ? `, status ${service.docker.status}`
    : ", status not reported"
  const exitCode =
    service.docker.exit_code === null
      ? ""
      : `, exit code ${service.docker.exit_code}`

  return `${service.docker.state}, running=${String(
    service.docker.running,
  )}${status}, restarts=${service.docker.restart_count}${exitCode}`
}

function getCommandErrorCopy(error: ApiError): {
  body: string
  title: string
} {
  if (error.code === "command_confirm_required") {
    return {
      body: "Backend policy requires explicit confirmation. Check the confirmation box and submit again.",
      title: "Command confirmation required",
    }
  }

  if (error.code === "command_not_found") {
    return {
      body: "The command definition is no longer in the backend registry. Discovery is refreshing.",
      title: "Command no longer available",
    }
  }

  if (error.code === "command_transport_unavailable") {
    return {
      body: "The backend could not reach the management agent or ROS command transport.",
      title: "Management agent transport unavailable",
    }
  }

  return {
    body: "The backend rejected or failed the typed command request.",
    title: "Command request failed",
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
      body: "The management backend requires a bearer token. Enter the configured token above and reconnect.",
      icon: KeyRound,
      iconClass: "text-amber-700",
      title: "Authentication required",
    }
  }

  if (error.code === "auth_invalid") {
    return {
      body: "The backend rejected the configured token. Clear or replace the token, then reconnect.",
      icon: ShieldAlert,
      iconClass: "text-red-700",
      title: "Invalid management token",
    }
  }

  if (error.code === "docker_unavailable") {
    return {
      body: "The backend is reachable, but Docker Engine status cannot be read. This is a backend/Docker control plane issue, not an individual ROS service failure.",
      icon: Container,
      iconClass: "text-red-700",
      title: "Docker control plane unavailable",
    }
  }

  return {
    body: "The service snapshot could not be loaded from the management backend. Retry after checking the backend URL, token, and network path.",
    icon: AlertTriangle,
    iconClass: "text-red-700",
    title: "Service snapshot unavailable",
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
