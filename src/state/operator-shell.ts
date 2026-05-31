import { atom } from "jotai"
import { atomWithStorage, createJSONStorage } from "jotai/utils"
import {
  createManagementApiClient,
  DEFAULT_MANAGEMENT_BASE_URL,
} from "@/lib/management-api"
import type {
  ApiError,
  CommandDefinition,
  ConnectionState,
  ManagementEvent,
  ServiceDefinition,
  ServiceStatus,
} from "@/types/management"

const baseUrlStorage = createJSONStorage<string>(() => localStorage)
const authTokenStorage = createJSONStorage<string>(() => sessionStorage)

export const baseUrlAtom = atomWithStorage(
  "r2-management.base-url",
  DEFAULT_MANAGEMENT_BASE_URL,
  baseUrlStorage,
  { getOnInit: true },
)

export const authTokenAtom = atomWithStorage(
  "r2-management.auth-token",
  "",
  authTokenStorage,
  { getOnInit: true },
)

export const selectedServiceNameAtom = atom("")

export const serviceStatusesAtom = atom<ServiceStatus[]>([])

export const serviceDefinitionsAtom = atom<ServiceDefinition[]>([])

export const commandsAtom = atom<CommandDefinition[]>([])

export const recentEventsAtom = atom<ManagementEvent[]>([])

export const connectionStateAtom = atom<ConnectionState>({
  status: "idle",
  checked_at: null,
})

export const latestErrorAtom = atom<ApiError | null>(null)

export const selectedServiceAtom = atom((get) => {
  const services = get(serviceStatusesAtom)
  const selectedName = get(selectedServiceNameAtom)

  return (
    services.find((service) => service.service_name === selectedName) ??
    services[0] ??
    null
  )
})

export const selectedServiceDefinitionAtom = atom((get) => {
  const definitions = get(serviceDefinitionsAtom)
  const selectedService = get(selectedServiceAtom)
  const selectedName = selectedService?.service_name ?? get(selectedServiceNameAtom)

  return (
    definitions.find((definition) => definition.name === selectedName) ??
    definitions[0] ??
    null
  )
})

export const managementApiClientAtom = atom((get) =>
  createManagementApiClient({
    baseUrl: get(baseUrlAtom),
    token: get(authTokenAtom),
  }),
)

export const clearAuthTokenAtom = atom(null, (_get, set) => {
  set(authTokenAtom, "")
})
