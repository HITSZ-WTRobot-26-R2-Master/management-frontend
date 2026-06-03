import type { DockerState, OverallLevel, ServiceStatus } from "@/types/management"

export type DiagnosticEntryKind = "summary" | "ros-diagnostic"

export interface ServiceDiagnosticEntry {
  detail: string
  hardwareId: string
  key: string
  kind: DiagnosticEntryKind
  label: string
  level: OverallLevel
  title: string
}

export interface ServiceDiagnosticGroup {
  count: number
  entries: ServiceDiagnosticEntry[]
  key: string
  label: string
  level: OverallLevel
  source: string
  summaryEntry: ServiceDiagnosticEntry
  title: string
}

const defaultRosDiagnosticSource = "ROS 诊断"

export function getServiceDiagnosticGroups(
  service: ServiceStatus,
): ServiceDiagnosticGroup[] {
  const groups: ServiceDiagnosticGroup[] = []
  const docker = service.docker
  const ros = service.ros

  if (service.overall.level !== "ok") {
    groups.push(
      createSingleEntryGroup({
        detail: formatDisplaySummary(service.overall.reason),
        key: "overall",
        label: "总体状态",
        level: normalizeDiagnosticLevel(service.overall.level),
        title: "总体异常",
      }),
    )
  }

  if (!docker.exists) {
    groups.push(
      createSingleEntryGroup({
        detail: "Docker 容器未存在于当前后端快照。",
        key: "docker:missing",
        label: "Docker",
        level: "error",
        title: "容器缺失",
      }),
    )
  } else if (!docker.running || docker.state !== "running") {
    groups.push(
      createSingleEntryGroup({
        detail: `${formatDockerState(docker.state)}，运行=${formatBoolean(
          docker.running,
        )}${docker.status ? `，状态 ${docker.status}` : ""}`,
        key: "docker:state",
        label: "Docker",
        level: docker.running ? "warning" : "error",
        title: "运行状态异常",
      }),
    )
  }

  if (docker.exit_code !== null && docker.exit_code !== 0) {
    groups.push(
      createSingleEntryGroup({
        detail: `容器退出码 ${docker.exit_code}。`,
        key: "docker:exit-code",
        label: "Docker",
        level: "error",
        title: "退出码异常",
      }),
    )
  }

  if (docker.health && docker.health !== "healthy") {
    groups.push(
      createSingleEntryGroup({
        detail: `健康状态 ${docker.health}。`,
        key: "docker:health",
        label: "Docker",
        level: docker.health === "unhealthy" ? "error" : "warning",
        title: "健康检查异常",
      }),
    )
  }

  if (ros.level !== "ok") {
    groups.push(
      createSingleEntryGroup({
        detail: formatDisplaySummary(ros.summary),
        key: "ros:level",
        label: "ROS",
        level: normalizeDiagnosticLevel(ros.level),
        title: "ROS 状态异常",
      }),
    )
  }

  if (!ros.agent_available) {
    groups.push(
      createSingleEntryGroup({
        detail: "ROS 代理当前不可用。",
        key: "ros:agent",
        label: "ROS",
        level: docker.running ? "warning" : "error",
        title: "代理不可用",
      }),
    )
  }

  for (const node of ros.expected_nodes) {
    if (!node.present) {
      groups.push(
        createSingleEntryGroup({
          detail: `最近出现 ${formatNullableTimestamp(node.last_seen)}。`,
          key: `ros:node:${node.name}`,
          label: "预期节点",
          level: "warning",
          title: node.name,
        }),
      )
    }
  }

  for (const topic of ros.topics) {
    if (!topic.present) {
      groups.push(
        createSingleEntryGroup({
          detail: `${topic.resolved_name} 缺少${formatEndpointRole(
            topic.required_endpoint,
          )}。`,
          key: `ros:topic:${topic.name}:${topic.resolved_name}`,
          label: "话题",
          level: "warning",
          title: topic.resolved_name,
        }),
      )
      continue
    }

    if (topic.freshness?.fresh === false) {
      groups.push(
        createSingleEntryGroup({
          detail: `最近消息 ${formatNullableTimestamp(
            topic.freshness.last_message_at,
          )}。`,
          key: `ros:topic-freshness:${topic.name}:${topic.resolved_name}`,
          label: "话题",
          level: "warning",
          title: topic.resolved_name,
        }),
      )
    }
  }

  return groups.concat(getRosDiagnosticGroups(service))
}

function getRosDiagnosticGroups(service: ServiceStatus): ServiceDiagnosticGroup[] {
  const groupsBySource = new Map<string, ServiceDiagnosticGroup>()

  for (const [index, diagnostic] of service.ros.diagnostics.entries()) {
    const hardwareId = diagnostic.hardware_id.trim()
    const source = hardwareId || defaultRosDiagnosticSource
    const key = `ros:diagnostics:${source}`
    const entry: ServiceDiagnosticEntry = {
      detail: diagnostic.message,
      hardwareId,
      key: `ros:diagnostic:${diagnostic.name}:${diagnostic.hardware_id}:${index}`,
      kind: "ros-diagnostic",
      label: hardwareId ? `ROS 诊断 / ${hardwareId}` : defaultRosDiagnosticSource,
      level: normalizeDiagnosticLevel(diagnostic.level),
      title: diagnostic.name,
    }
    const existing = groupsBySource.get(key)

    if (existing) {
      existing.entries.push(entry)
      existing.count = existing.entries.length
      existing.level = getWorstDiagnosticLevel(existing.entries)
      existing.summaryEntry = getSummaryDiagnosticEntry(existing.entries)
      continue
    }

    groupsBySource.set(key, {
      count: 1,
      entries: [entry],
      key,
      label: entry.label,
      level: entry.level,
      source,
      summaryEntry: entry,
      title: source,
    })
  }

  return Array.from(groupsBySource.values())
}

function createSingleEntryGroup(
  entry: Omit<ServiceDiagnosticEntry, "hardwareId" | "kind">,
): ServiceDiagnosticGroup {
  const diagnosticEntry: ServiceDiagnosticEntry = {
    ...entry,
    hardwareId: "",
    kind: "summary",
  }

  return {
    count: 1,
    entries: [diagnosticEntry],
    key: entry.key,
    label: entry.label,
    level: entry.level,
    source: entry.label,
    summaryEntry: diagnosticEntry,
    title: entry.title,
  }
}

function getWorstDiagnosticLevel(entries: ServiceDiagnosticEntry[]): OverallLevel {
  return getSummaryDiagnosticEntry(entries).level
}

function getSummaryDiagnosticEntry(
  entries: ServiceDiagnosticEntry[],
): ServiceDiagnosticEntry {
  const [firstEntry, ...remainingEntries] = entries

  if (!firstEntry) {
    throw new Error("diagnostic group entries must not be empty")
  }

  return remainingEntries.reduce<ServiceDiagnosticEntry>((summary, entry) =>
    diagnosticLevelWeight[entry.level] > diagnosticLevelWeight[summary.level]
      ? entry
      : summary,
    firstEntry,
  )
}

function normalizeDiagnosticLevel(level: OverallLevel): OverallLevel {
  return level === "unknown" ? "warning" : level
}

function formatDockerState(state: DockerState) {
  const labels: Record<DockerState, string> = {
    created: "已创建",
    dead: "已停止",
    exited: "已退出",
    missing: "缺失",
    paused: "已暂停",
    restarting: "重启中",
    running: "运行中",
    unknown: "未知",
  }

  return labels[state]
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

function formatDisplaySummary(value: string) {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .join(" ")
}

function formatNullableTimestamp(value: string | null) {
  return value ? formatTimestamp(value) : "未上报"
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function formatBoolean(value: boolean) {
  return value ? "是" : "否"
}

const diagnosticLevelWeight: Record<OverallLevel, number> = {
  error: 3,
  ok: 0,
  unknown: 1,
  warning: 2,
}
