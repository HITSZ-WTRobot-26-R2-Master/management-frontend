import type { OverallLevel, ServiceStatus } from "@/types/management"

export type StatusTone = "error" | "neutral" | "success" | "warning"

export function getToneForOverallLevel(level: OverallLevel): StatusTone {
  if (level === "ok") {
    return "success"
  }

  if (level === "warning") {
    return "warning"
  }

  if (level === "error") {
    return "error"
  }

  return "neutral"
}

export function formatRosSummary(service: ServiceStatus) {
  const agent = service.ros.agent_available
    ? "代理可用"
    : "代理不可用"
  const level = formatOverallLevel(service.ros.level)
  const summary =
    service.docker.running && !service.ros.agent_available
      ? "Docker 正在运行；ROS 代理不可用"
      : service.ros.summary

  return `${level}, ${agent}: ${summary}`
}

function formatOverallLevel(level: OverallLevel) {
  const labels: Record<OverallLevel, string> = {
    error: "错误",
    ok: "正常",
    unknown: "未知",
    warning: "警告",
  }

  return labels[level]
}
