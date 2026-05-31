import { isServiceStatus, isServiceStatusArray } from "@/lib/management-api"
import type { ManagementEvent, ServiceStatus } from "@/types/management"

export function reduceServiceStatusesForEvent(
  services: ServiceStatus[],
  event: ManagementEvent,
): ServiceStatus[] {
  if (event.type === "service_status_snapshot") {
    return getSnapshotServices(event) ?? services
  }

  if (event.type === "service_status_changed") {
    const service = getChangedService(event)
    if (service) {
      return replaceServiceStatus(services, service)
    }
  }

  return services
}

export function getSnapshotServices(event: ManagementEvent | undefined) {
  if (!event || event.type !== "service_status_snapshot") {
    return null
  }

  const payload = event.payload

  if (
    isRecord(payload) &&
    "services" in payload &&
    isServiceStatusArray(payload.services)
  ) {
    return payload.services
  }

  return null
}

export function getChangedService(event: ManagementEvent) {
  const payload = event.payload

  if (
    isRecord(payload) &&
    "service" in payload &&
    isServiceStatus(payload.service)
  ) {
    return payload.service
  }

  if (
    isRecord(payload) &&
    "status" in payload &&
    isServiceStatus(payload.status)
  ) {
    return payload.status
  }

  return null
}

function replaceServiceStatus(
  services: ServiceStatus[],
  nextService: ServiceStatus,
): ServiceStatus[] {
  const existingIndex = services.findIndex(
    (service) => service.service_name === nextService.service_name,
  )

  if (existingIndex === -1) {
    return [nextService, ...services]
  }

  return services.map((service, index) =>
    index === existingIndex ? nextService : service,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
