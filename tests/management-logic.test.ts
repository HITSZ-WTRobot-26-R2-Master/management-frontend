import { describe, expect, test } from "bun:test"
import {
  getCommandConfirmationState,
  isHighRisk,
} from "../src/lib/command-confirmation"
import { reduceServiceStatusesForEvent } from "../src/lib/event-reducer"
import {
  buildManagementHttpUrl,
  buildManagementWebSocketUrl,
  isAbortError,
  isServiceStatus,
  isValidManagementBaseUrl,
  parseApiError,
} from "../src/lib/management-api"
import {
  isServiceNotFoundError,
  removeStaleServiceStatus,
} from "../src/lib/service-not-found-recovery"
import {
  formatRosSummary,
  getToneForOverallLevel,
} from "../src/lib/status-presentation"
import type {
  CommandDefinition,
  ManagementEvent,
  ServiceStatus,
} from "../src/types/management"

describe("management API errors", () => {
  test("keeps structured backend error codes and messages", () => {
    expect(
      parseApiError(
        {
          code: "service_not_found",
          message: "service not found: stale_service",
        },
        404,
      ),
    ).toEqual({
      code: "service_not_found",
      message: "service not found: stale_service",
    })
  })

  test("maps unauthenticated non-contract responses to auth_required", () => {
    expect(parseApiError(null, 401)).toEqual({
      code: "auth_required",
      message: "管理后端需要认证",
    })
  })

  test("maps malformed error payloads to a request_failed fallback", () => {
    expect(parseApiError({ message: "missing code" }, 503)).toEqual({
      code: "request_failed",
      message: "管理后端请求失败，HTTP 503",
    })
  })

  test("detects browser abort errors without relying on Error inheritance", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true)
    expect(isAbortError(new Error("AbortError"))).toBe(false)
  })
})

describe("management API URL helpers", () => {
  test("builds HTTP URLs for the same-origin development proxy", () => {
    expect(buildManagementHttpUrl("/management-api", "/api/services")).toBe(
      "/management-api/api/services",
    )
    expect(buildManagementHttpUrl("/management-api/", "readyz")).toBe(
      "/management-api/readyz",
    )
  })

  test("builds WebSocket URLs for the same-origin development proxy", () => {
    const previousLocation = globalThis.location

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        origin: "http://127.0.0.1:5173",
      },
    })

    try {
      expect(
        buildManagementWebSocketUrl("/management-api", "change-me"),
      ).toBe("ws://127.0.0.1:5173/management-api/ws/events?token=change-me")
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: previousLocation,
      })
    }
  })

  test("accepts only HTTP(S) URLs or same-origin proxy paths", () => {
    expect(isValidManagementBaseUrl("http://192.168.31.52:8080")).toBe(true)
    expect(isValidManagementBaseUrl("/management-api")).toBe(true)
    expect(isValidManagementBaseUrl("ftp://192.168.31.52:8080")).toBe(false)
    expect(isValidManagementBaseUrl("//192.168.31.52:8080")).toBe(false)
  })
})

describe("management API validators", () => {
  test("accepts docker-unavailable service status with null restart count", () => {
    expect(
      isServiceStatus(
        makeServiceStatus({
          docker: {
            exists: false,
            restart_count: null,
            state: "unknown",
            status: "docker unavailable",
          },
          overall: {
            level: "unknown",
            reason: "docker unavailable",
          },
        }),
      ),
    ).toBe(true)
  })
})

describe("service-not-found recovery helpers", () => {
  test("detects only service-not-found errors as service selection recovery triggers", () => {
    expect(
      isServiceNotFoundError({
        code: "service_not_found",
        message: "service not found: stale_service",
      }),
    ).toBe(true)
    expect(
      isServiceNotFoundError({
        code: "docker_unavailable",
        message: "Docker Engine is unavailable",
      }),
    ).toBe(false)
  })

  test("removes the stale logical service from the current status snapshot", () => {
    const stale = makeServiceStatus({ service_name: "stale_service" })
    const remaining = makeServiceStatus({ service_name: "arm_driver" })

    expect(removeStaleServiceStatus([stale, remaining], "stale_service")).toEqual(
      [remaining],
    )
  })

  test("preserves the existing status array when the stale service is already absent", () => {
    const services = [makeServiceStatus({ service_name: "arm_driver" })]

    expect(removeStaleServiceStatus(services, "stale_service")).toBe(services)
  })
})

describe("status presentation", () => {
  test("maps overall levels to stable UI severity tones", () => {
    expect(getToneForOverallLevel("ok")).toBe("success")
    expect(getToneForOverallLevel("warning")).toBe("warning")
    expect(getToneForOverallLevel("error")).toBe("error")
    expect(getToneForOverallLevel("unknown")).toBe("neutral")
  })

  test("keeps Docker running plus ROS agent unavailable as an agent warning", () => {
    const service = makeServiceStatus({
      docker: {
        running: true,
        state: "running",
      },
      overall: {
        level: "warning",
        reason: "agent_unavailable",
      },
      ros: {
        agent_available: false,
        level: "unknown",
        summary: "agent_unavailable",
      },
    })

    expect(service.overall.level).toBe("warning")
    expect(formatRosSummary(service)).toBe(
      "未知, 代理不可用: Docker 正在运行；ROS 代理不可用",
    )
  })
})

describe("command confirmation helpers", () => {
  const resetOriginCommand = {
    target: "lidar_pose_publisher",
    name: "reset_origin",
    description: "Reset pose origin from the current car pose",
    node: {
      transport: "topic",
      payload_schema: "pose_reset_origin_v1",
    },
    backend: {
      risk_level: "high",
      requires_confirm: false,
    },
  } satisfies CommandDefinition

  test("requires operator confirmation for high-risk discovered commands", () => {
    expect(isHighRisk("high")).toBe(true)
    expect(
      getCommandConfirmationState({
        command: resetOriginCommand,
        error: null,
        operatorConfirmed: false,
        reason: "field reset",
        submitting: false,
      }),
    ).toEqual({
      canSubmit: false,
      requiresConfirm: true,
    })
  })

  test("allows submission after confirmation and operator reason", () => {
    expect(
      getCommandConfirmationState({
        command: resetOriginCommand,
        error: null,
        operatorConfirmed: true,
        reason: "field reset",
        submitting: false,
      }),
    ).toEqual({
      canSubmit: true,
      requiresConfirm: true,
    })
  })

  test("requires confirmation again when backend policy asks for it", () => {
    const mediumRiskCommand = {
      ...resetOriginCommand,
      backend: {
        risk_level: "medium",
        requires_confirm: false,
      },
    } satisfies CommandDefinition

    expect(
      getCommandConfirmationState({
        command: mediumRiskCommand,
        error: {
          code: "command_confirm_required",
          message: "confirm=true required",
        },
        operatorConfirmed: false,
        reason: "field reset",
        submitting: false,
      }),
    ).toEqual({
      canSubmit: false,
      requiresConfirm: true,
    })
  })
})

describe("event reducer", () => {
  test("replaces services from a status snapshot", () => {
    const initial = [makeServiceStatus({ service_name: "arm_driver" })]
    const next = [
      makeServiceStatus({
        display_name: "Lidar Pose Publisher",
        service_name: "lidar_pose_publisher",
      }),
    ]

    expect(
      reduceServiceStatusesForEvent(initial, {
        id: "event-1",
        payload: { services: next },
        time: "2026-05-30T12:00:00Z",
        type: "service_status_snapshot",
      }),
    ).toEqual(next)
  })

  test("updates one changed service by logical service_name", () => {
    const arm = makeServiceStatus({
      display_name: "Arm Driver",
      service_name: "arm_driver",
    })
    const lidar = makeServiceStatus({
      display_name: "Lidar Pose Publisher",
      service_name: "lidar_pose_publisher",
    })
    const changedLidar = makeServiceStatus({
      display_name: "Lidar Pose Publisher",
      overall: {
        level: "warning",
        reason: "agent_unavailable",
      },
      service_name: "lidar_pose_publisher",
    })

    expect(
      reduceServiceStatusesForEvent([arm, lidar], {
        id: "event-2",
        payload: { service: changedLidar },
        time: "2026-05-30T12:00:01Z",
        type: "service_status_changed",
      }),
    ).toEqual([arm, changedLidar])
  })

  test("ignores unknown event types and malformed change payloads", () => {
    const services = [makeServiceStatus({ service_name: "arm_driver" })]
    const unknownEvent = {
      id: "event-3",
      payload: { message: "reserved event" },
      time: "2026-05-30T12:00:02Z",
      type: "future_event_type",
    } satisfies ManagementEvent
    const malformedChange = {
      id: "event-4",
      payload: { service: { service_name: "arm_driver" } },
      time: "2026-05-30T12:00:03Z",
      type: "service_status_changed",
    } satisfies ManagementEvent

    expect(reduceServiceStatusesForEvent(services, unknownEvent)).toBe(services)
    expect(reduceServiceStatusesForEvent(services, malformedChange)).toBe(
      services,
    )
  })
})

function makeServiceStatus(
  overrides: {
    display_name?: string
    docker?: Partial<ServiceStatus["docker"]>
    overall?: Partial<ServiceStatus["overall"]>
    ros?: Partial<ServiceStatus["ros"]>
    service_name?: string
  } = {},
): ServiceStatus {
  const serviceName = overrides.service_name ?? "chassis_serial"

  return {
    category: "pose",
    compose_profile: "pose",
    container_name: `r2_${serviceName}`,
    display_name: overrides.display_name ?? "Chassis Serial",
    docker: {
      exists: true,
      finished_at: null,
      health: null,
      restart_count: 0,
      running: false,
      started_at: null,
      state: "exited",
      status: "EXITED",
      exit_code: 1,
      ...overrides.docker,
    },
    overall: {
      level: "error",
      reason: "container_not_running",
      ...overrides.overall,
    },
    risk_level: "medium",
    ros: {
      agent_available: true,
      diagnostics: [],
      expected_nodes: [],
      level: "ok",
      summary: "ok",
      topics: [],
      ...overrides.ros,
    },
    service_name: serviceName,
  }
}
