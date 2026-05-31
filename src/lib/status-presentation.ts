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
    ? "agent available"
    : "agent unavailable"
  const summary =
    service.docker.running && !service.ros.agent_available
      ? "Docker is running; ROS agent is unavailable"
      : service.ros.summary

  return `${service.ros.level}, ${agent}: ${summary}`
}
