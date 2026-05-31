import type { ApiError, ServiceStatus } from "@/types/management"

export function isServiceNotFoundError(error: ApiError) {
  return error.code === "service_not_found"
}

export function removeStaleServiceStatus(
  services: ServiceStatus[],
  staleServiceName: string,
): ServiceStatus[] {
  const nextServices = services.filter(
    (service) => service.service_name !== staleServiceName,
  )

  return nextServices.length === services.length ? services : nextServices
}
