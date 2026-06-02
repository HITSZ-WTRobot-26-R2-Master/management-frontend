import { describe, expect, test } from "bun:test"
import { getCommandConfirmationState } from "../src/lib/command-confirmation"
import {
  DEFAULT_RESET_ORIGIN_PAYLOAD,
  readResetOriginSessionPayload,
  RESET_ORIGIN_SESSION_STORAGE_KEY,
  toResetOriginJsonPayload,
  writeResetOriginSessionPayload,
} from "../src/lib/reset-origin-payload"
import { reduceServiceStatusesForEvent } from "../src/lib/event-reducer"
import {
  buildManagementHttpUrl,
  buildManagementWebSocketUrl,
  buildChassisStateWebSocketUrl,
  buildServiceLogWebSocketUrl,
  isChassisStateSnapshot,
  isChassisStateWebSocketMessage,
  isAbortError,
  isServiceStatus,
  isValidManagementBaseUrl,
  ManagementApiError,
  ManagementApiClient,
  parseApiError,
} from "../src/lib/management-api"
import {
  appendBoundedServiceLogLine,
  DEFAULT_SERVICE_LOG_TAIL,
  isServiceLogWebSocketMessage,
  normalizeServiceLogTail,
  parseServiceLogWebSocketMessage,
  trimServiceLogLines,
} from "../src/lib/service-log-stream"
import {
  isServiceNotFoundError,
  removeStaleServiceStatus,
} from "../src/lib/service-not-found-recovery"
import { formatBytes, formatPercent } from "../src/lib/resource-format"
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

  test("includes request context when structured HTTP errors are missing", () => {
    expect(
      parseApiError(
        { message: "missing code" },
        500,
        {
          baseUrl: "/management-api",
          method: "GET",
          requestUrl: "/management-api/readyz",
        },
      ),
    ).toEqual({
      code: "request_failed",
      message:
        "GET /management-api/readyz 返回 HTTP 500，且响应不是管理后端结构化错误。 当前使用同源代理路径 /management-api；若在 Vite 开发服务器下运行，请检查 VITE_MANAGEMENT_PROXY_TARGET 是否指向正在运行的 management backend。",
    })
  })

  test("wraps browser network failures with request context", async () => {
    const client = new ManagementApiClient({
      baseUrl: "/management-api",
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch")
      },
    })

    await expect(client.getReadiness()).rejects.toBeInstanceOf(ManagementApiError)
    await expect(client.getReadiness()).rejects.toMatchObject({
      apiError: {
        code: "request_failed",
        message:
          "GET /management-api/readyz 未收到可读的管理后端响应。 当前使用同源代理路径 /management-api；若在 Vite 开发服务器下运行，请检查 VITE_MANAGEMENT_PROXY_TARGET 是否指向正在运行的 management backend。 浏览器异常：Failed to fetch",
      },
    })
  })

  test("calls browser fetch with the global receiver", async () => {
    const browserLikeFetch = function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation")
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: "ready",
            bind_address: "0.0.0.0",
            port: 8080,
            agent_url: "http://127.0.0.1:8090",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        ),
      )
    } satisfies typeof fetch
    const client = new ManagementApiClient({
      baseUrl: "/management-api",
      fetchImpl: browserLikeFetch,
    })

    await expect(client.getReadiness()).resolves.toEqual({
      status: "ready",
      bind_address: "0.0.0.0",
      port: 8080,
      agent_url: "http://127.0.0.1:8090",
    })
  })

  test("loads reset_origin presets from the dedicated endpoint", async () => {
    const client = new ManagementApiClient({
      baseUrl: "/management-api",
      token: "operator-token",
      fetchImpl: async (input, init) => {
        expect(input.toString()).toBe(
          "/management-api/api/commands/reset_origin/presets",
        )
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer operator-token",
        )

        return new Response(
          JSON.stringify([
            {
              id: "field_origin",
              label: "场地原点",
              pose_x: 0,
              pose_y: 0,
              pose_z: 0,
              pose_yaw_deg: 0,
            },
          ]),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        )
      },
    })

    await expect(client.listResetOriginPresets()).resolves.toEqual([
      {
        id: "field_origin",
        label: "场地原点",
        pose_x: 0,
        pose_y: 0,
        pose_z: 0,
        pose_yaw_deg: 0,
      },
    ])
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

  test("builds service log WebSocket URLs with encoded service and default tail", () => {
    const previousLocation = globalThis.location

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        origin: "https://operator.local",
      },
    })

    try {
      expect(
        buildServiceLogWebSocketUrl(
          "/management-api",
          "token value",
          "lidar/pose publisher",
          {
            stdout: false,
            stderr: true,
            timestamps: false,
          },
        ),
      ).toBe(
        "wss://operator.local/management-api/ws/services/lidar%2Fpose%20publisher/logs?token=token+value&tail=1000&stdout=false&stderr=true&timestamps=false",
      )
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: previousLocation,
      })
    }
  })

  test("builds chassis state WebSocket URLs with query token auth", () => {
    const previousLocation = globalThis.location

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        origin: "http://127.0.0.1:5173",
      },
    })

    try {
      expect(
        buildChassisStateWebSocketUrl("/management-api", "change-me"),
      ).toBe(
        "ws://127.0.0.1:5173/management-api/ws/chassis/state?token=change-me",
      )
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: previousLocation,
      })
    }
  })

  test("preserves the existing events WebSocket helper behavior", () => {
    expect(
      buildManagementWebSocketUrl("http://127.0.0.1:8080", "change-me"),
    ).toBe("ws://127.0.0.1:8080/ws/events?token=change-me")
  })

  test("accepts only HTTP(S) URLs or same-origin proxy paths", () => {
    expect(isValidManagementBaseUrl("http://192.168.31.52:8080")).toBe(true)
    expect(isValidManagementBaseUrl("/management-api")).toBe(true)
    expect(isValidManagementBaseUrl("ftp://192.168.31.52:8080")).toBe(false)
    expect(isValidManagementBaseUrl("//192.168.31.52:8080")).toBe(false)
  })
})

describe("chassis state API contract", () => {
  test("validates complete chassis state snapshots", () => {
    expect(isChassisStateSnapshot(chassisStateSnapshot())).toBe(true)
    expect(
      isChassisStateSnapshot({
        available: false,
        topic: "chassis_state",
        received_at: null,
        message: null,
      }),
    ).toBe(true)
  })

  test("rejects malformed chassis state snapshots", () => {
    const snapshot = chassisStateSnapshot()

    expect(
      isChassisStateSnapshot({
        ...snapshot,
        message: {
          ...snapshot.message,
          connection: {
            ...snapshot.message.connection,
            upper_host: "yes",
          },
        },
      }),
    ).toBe(false)
  })

  test("validates chassis state websocket messages", () => {
    expect(
      isChassisStateWebSocketMessage({
        type: "chassis_state_snapshot",
        time: "2026-06-02T02:30:00Z",
        snapshot: chassisStateSnapshot(),
      }),
    ).toBe(true)
    expect(
      isChassisStateWebSocketMessage({
        type: "chassis_state_error",
        time: "2026-06-02T02:30:00Z",
        code: "request_failed",
        message: "agent unavailable",
      }),
    ).toBe(true)
    expect(
      isChassisStateWebSocketMessage({
        type: "chassis_state_snapshot",
        time: "2026-06-02T02:30:00Z",
        snapshot: { available: true },
      }),
    ).toBe(false)
  })
})

describe("service log stream helpers", () => {
  test("uses 1000 as the frontend default service log tail", () => {
    expect(DEFAULT_SERVICE_LOG_TAIL).toBe(1000)
    expect(normalizeServiceLogTail(Number.NaN)).toBe(1000)
  })

  test("validates service log WebSocket contract messages", () => {
    expect(
      isServiceLogWebSocketMessage({
        type: "service_log_opened",
        service: "lidar_pose_publisher",
        container_name: "r2_lidar_pose_publisher",
        tail: 1000,
        stdout: true,
        stderr: true,
        timestamps: true,
        time: "2026-06-01T11:55:00Z",
      }),
    ).toBe(true)

    expect(
      isServiceLogWebSocketMessage({
        type: "service_log_line",
        service: "lidar_pose_publisher",
        container_name: "r2_lidar_pose_publisher",
        stream: "stdout",
        line: "pose node started",
        time: "2026-06-01T11:55:01Z",
      }),
    ).toBe(true)

    expect(
      isServiceLogWebSocketMessage({
        type: "service_log_error",
        service: "lidar_pose_publisher",
        code: "docker_operation_failed",
        message: "Docker log stream failed",
        time: "2026-06-01T11:55:02Z",
      }),
    ).toBe(true)

    expect(
      isServiceLogWebSocketMessage({
        type: "service_log_stream_ended",
        service: "lidar_pose_publisher",
        container_name: "r2_lidar_pose_publisher",
        reason: "container_exited",
        time: "2026-06-01T11:55:03Z",
      }),
    ).toBe(true)

    expect(
      isServiceLogWebSocketMessage({
        type: "service_log_line",
        service: "lidar_pose_publisher",
        line: "missing required fields",
      }),
    ).toBe(false)
  })

  test("parses JSON service log frames and ignores unknown message types", () => {
    expect(
      parseServiceLogWebSocketMessage(
        JSON.stringify({
          type: "service_log_line",
          service: "lidar_pose_publisher",
          container_name: "r2_lidar_pose_publisher",
          stream: "stderr",
          line: "warning",
          time: "2026-06-01T11:55:01Z",
        }),
      ),
    ).toMatchObject({
      type: "service_log_line",
      stream: "stderr",
      line: "warning",
    })

    expect(
      parseServiceLogWebSocketMessage(
        JSON.stringify({
          type: "future_log_message",
          service: "lidar_pose_publisher",
        }),
      ),
    ).toBeNull()
    expect(parseServiceLogWebSocketMessage("{")).toBeNull()
  })

  test("trims service log buffers from the top", () => {
    expect(trimServiceLogLines(["1", "2", "3", "4"], 3)).toEqual([
      "2",
      "3",
      "4",
    ])
    expect(appendBoundedServiceLogLine(["1", "2", "3"], "4", 3)).toEqual([
      "2",
      "3",
      "4",
    ])
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

describe("resource display formatting", () => {
  test("keeps Docker CPU percentages as backend-provided percent values", () => {
    expect(formatPercent(0.5)).toBe("0.5%")
    expect(formatPercent(523.456)).toBe("523.5%")
    expect(formatPercent(1200)).toBe("1200.0%")
  })

  test("uses stable binary byte units for memory and IO values", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1024)).toBe("1.00 KiB")
    expect(formatBytes(512 * 1024 * 1024)).toBe("512 MiB")
    expect(formatBytes(1536 * 1024 * 1024)).toBe("1.50 GiB")
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.00 TiB")
  })

  test("returns a visible fallback for non-finite byte values", () => {
    expect(formatBytes(Number.NaN)).toBe("未上报")
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("未上报")
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

  test("allows reset_origin submission when backend policy does not require confirmation", () => {
    expect(
      getCommandConfirmationState({
        command: resetOriginCommand,
        error: null,
        operatorConfirmed: false,
        submitting: false,
      }),
    ).toEqual({
      canSubmit: true,
      requiresConfirm: false,
    })
  })

  test("requires confirmation when backend policy requires it", () => {
    const confirmRequiredCommand = {
      ...resetOriginCommand,
      backend: {
        risk_level: "high",
        requires_confirm: true,
      },
    } satisfies CommandDefinition

    expect(
      getCommandConfirmationState({
        command: confirmRequiredCommand,
        error: null,
        operatorConfirmed: false,
        submitting: false,
      }),
    ).toEqual({
      canSubmit: false,
      requiresConfirm: true,
    })

    expect(
      getCommandConfirmationState({
        command: confirmRequiredCommand,
        error: null,
        operatorConfirmed: true,
        submitting: false,
      }),
    ).toEqual({
      canSubmit: true,
      requiresConfirm: true,
    })
  })

  test("keeps submission disabled while a command is submitting", () => {
    expect(
      getCommandConfirmationState({
        command: resetOriginCommand,
        error: null,
        operatorConfirmed: false,
        submitting: true,
      }),
    ).toEqual({
      canSubmit: false,
      requiresConfirm: false,
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
        submitting: false,
      }),
    ).toEqual({
      canSubmit: false,
      requiresConfirm: true,
    })
  })
})

describe("reset_origin payload helpers", () => {
  test("builds command payloads without legacy reason", () => {
    const payload = toResetOriginJsonPayload({
      pose_x: 1.5,
      pose_y: -2,
      pose_z: 0,
      pose_yaw_deg: 90,
    })

    expect(payload).toEqual({
      pose_x: 1.5,
      pose_y: -2,
      pose_z: 0,
      pose_yaw_deg: 90,
    })
    expect("reason" in payload).toBe(false)
  })

  test("reads valid last payloads from session storage", () => {
    const storage = memoryStorage({
      [RESET_ORIGIN_SESSION_STORAGE_KEY]: JSON.stringify({
        pose_x: 3,
        pose_y: 4,
        pose_z: 0.2,
        pose_yaw_deg: -45,
      }),
    })

    expect(readResetOriginSessionPayload(storage)).toEqual({
      pose_x: 3,
      pose_y: 4,
      pose_z: 0.2,
      pose_yaw_deg: -45,
    })
  })

  test("ignores damaged or illegal session payloads", () => {
    expect(
      readResetOriginSessionPayload(
        memoryStorage({
          [RESET_ORIGIN_SESSION_STORAGE_KEY]: "{",
        }),
      ),
    ).toEqual(DEFAULT_RESET_ORIGIN_PAYLOAD)

    expect(
      readResetOriginSessionPayload(
        memoryStorage({
          [RESET_ORIGIN_SESSION_STORAGE_KEY]: JSON.stringify({
            pose_x: 3,
            pose_y: "bad",
            pose_z: 0,
            pose_yaw_deg: 0,
          }),
        }),
      ),
    ).toEqual(DEFAULT_RESET_ORIGIN_PAYLOAD)
  })

  test("writes the last successful reset_origin payload", () => {
    const storage = memoryStorage()
    const payload = {
      pose_x: 1,
      pose_y: 2,
      pose_z: 3,
      pose_yaw_deg: 180,
    }

    writeResetOriginSessionPayload(payload, storage)

    expect(storage.values.get(RESET_ORIGIN_SESSION_STORAGE_KEY)).toBe(
      JSON.stringify(payload),
    )
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

function chassisStateSnapshot() {
  return {
    available: true,
    topic: "chassis_state",
    received_at: "2026-06-02T02:30:00Z",
    message: {
      timestamp_ms: 1234,
      pose: {
        x: 1.25,
        y: -2.5,
        yaw_deg: 90,
        front_height: 0.12,
        rear_height: 0.13,
      },
      action: {
        raw_table: 0x1234,
        step_status: 1,
        chassis_mode: 2,
        chassis_curve_finished: true,
        lift_status: 3,
        grip_status: 4,
        grip_suction_has_object: false,
        infrared_receiver_state: 2,
      },
      connection: {
        raw_table: 0xc3ff,
        wheel_0: true,
        wheel_1: true,
        wheel_2: true,
        wheel_3: false,
        lift_0: true,
        lift_1: false,
        lift_2: true,
        lift_3: false,
        grip_arm: true,
        grip_turn: false,
        gyro_yaw: true,
        upper_host_localization: true,
        upper_host: false,
      },
    },
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
