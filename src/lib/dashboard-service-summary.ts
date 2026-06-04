import type { ServiceStatus, ServiceSummaryUpdate } from "@/types/management"

export function applyServiceSummaryUpdates(
  services: ServiceStatus[],
  updates: ServiceSummaryUpdate[],
) {
  if (services.length === 0 || updates.length === 0) {
    return services
  }

  let changed = false
  const next = services.slice()

  for (const update of updates) {
    const current = next[update.service_index]
    if (!current) {
      continue
    }

    const updated: ServiceStatus = {
      ...current,
      docker: {
        ...current.docker,
        exists: update.docker.exists,
        state: update.docker.state,
        running: update.docker.running,
        status: update.docker.status,
        exit_code: update.docker.exit_code,
        restart_count: update.docker.restart_count,
        health: update.docker.health,
      },
      ros: {
        ...current.ros,
        agent_available: update.ros.agent_available,
        level: update.ros.level,
        summary: update.ros.summary,
      },
      overall: update.overall,
    }
    next[update.service_index] = updated
    changed = true
  }

  return changed ? next : services
}
