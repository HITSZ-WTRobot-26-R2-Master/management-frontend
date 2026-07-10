import { describe, expect, test } from "bun:test"
import {
  formatChassisCurveFinished,
  formatChassisMode,
  formatChassisStepStatus,
  formatGripStatus,
  formatInfraredSwitchState,
  formatLiftStatus,
  formatTrajectoryOfflineState,
  getChassisActionStateDisplayFields,
} from "../src/lib/chassis-action-state-display"
import { getCommandConfirmationState } from "../src/lib/command-confirmation"
import {
  getAllianceBackgroundColor,
  getOpponentAllianceColor,
} from "../src/lib/alliance-color"
import { applyServiceSummaryUpdates } from "../src/lib/dashboard-service-summary"
import {
  DEFAULT_RESET_ORIGIN_PAYLOAD,
  readResetOriginSessionPayload,
  RESET_ORIGIN_SESSION_STORAGE_KEY,
  toResetOriginJsonPayload,
  writeResetOriginSessionPayload,
} from "../src/lib/reset-origin-payload"
import {
  buildManagementHttpUrl,
  buildDashboardWebSocketUrl,
  buildBlockStatesWebSocketUrl,
  buildDecisionWebSocketUrl,
  buildServiceLogWebSocketUrl,
  isChassisStateSnapshot,
  isDashboardSnapshot,
  isDashboardWebSocketMessage,
  isMasterControlPoseSnapshot,
  isAbortError,
  isServiceStatus,
  isValidManagementBaseUrl,
  ManagementApiError,
  ManagementApiClient,
  parseApiError,
  parseDashboardStreamMessage,
} from "../src/lib/management-api"
import {
  appendBoundedServiceLogLine,
  DEFAULT_SERVICE_LOG_TAIL,
  isServiceLogWebSocketMessage,
  normalizeServiceLogTail,
  parseServiceLogWebSocketMessage,
  trimServiceLogLines,
} from "../src/lib/service-log-stream"
import { parseBlockStateMessage } from "../src/lib/block-state-stream"
import { parseDecisionMessage } from "../src/features/vision-handin/lib/decisionStream"
import {
  buildDecisionOverlayModel,
  entryPointNear,
  exitPointNear,
  getStepCenters,
} from "../src/features/vision-handin/lib/decisionOverlay"
import {
  BLOCK_STATE_RECONNECT_DELAY_MS,
  getBlockStateReconnectDelayMs,
} from "../src/lib/block-state-connection"
import {
  getAllowedRetrySpearIndices,
  resolveRetrySpearIndex,
} from "../src/features/process-control/lib/retrySpearIndexRules"
import {
  readVisionDirectionCache,
  resolveInitialVisionMode,
  resolveVisionModeTransition,
  VISION_HANDIN_DIRECTION_STORAGE_KEY,
  writeVisionDirectionForColor,
} from "../src/features/vision-handin/lib/visionModeStorage"
import {
  isServiceNotFoundError,
  removeStaleServiceStatus,
} from "../src/lib/service-not-found-recovery"
import { formatBytes, formatPercent } from "../src/lib/resource-format"
import {
  formatHexWord,
  formatMillimeterPrecision,
  formatReadableDurationMs,
  formatRosTime,
} from "../src/lib/display-format"
import {
  formatRosSummary,
  getToneForOverallLevel,
} from "../src/lib/status-presentation"
import { getServiceDiagnosticGroups } from "../src/lib/service-diagnostics"
import type {
  CommandDefinition,
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
              id: "red_zone_1",
              label: "红场一区起点",
              pose_x: 0.5,
              pose_y: -1.4,
              pose_z: 0,
              pose_yaw_deg: -90,
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
        id: "red_zone_1",
        label: "红场一区起点",
        pose_x: 0.5,
        pose_y: -1.4,
        pose_z: 0,
        pose_yaw_deg: -90,
      },
    ])
  })

  test("requests master_full hard restart with confirmation", async () => {
    const responseBody = {
      request_id: "restart-1",
      service: "master_full",
      mode: "hard",
      accepted: true,
      started_at: "2026-07-07T04:00:00Z",
      finished_at: "2026-07-07T04:00:02Z",
      result: "success",
    }
    let requestBody: BodyInit | null | undefined = undefined
    const client = new ManagementApiClient({
      baseUrl: "/management-api",
      token: "operator-token",
      fetchImpl: async (input, init) => {
        expect(input.toString()).toBe(
          "/management-api/api/services/master_full/restart",
        )
        expect(init?.method).toBe("POST")
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer operator-token",
        )
        expect(new Headers(init?.headers).get("Content-Type")).toBe(
          "application/json",
        )
        requestBody = init?.body

        return new Response(JSON.stringify(responseBody), {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        })
      },
    })

    await expect(
      client.restartService("master_full", { mode: "hard", confirm: true }),
    ).resolves.toEqual(responseBody)
    expect(requestBody).toBe(JSON.stringify({ mode: "hard", confirm: true }))
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

  test("builds dashboard WebSocket URLs for the same-origin development proxy", () => {
    const previousLocation = globalThis.location

    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: {
        origin: "http://127.0.0.1:5173",
      },
    })

    try {
      expect(
        buildDashboardWebSocketUrl("/management-api", "change-me"),
      ).toBe(
        "ws://127.0.0.1:5173/management-api/ws/dashboard?token=change-me",
      )
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
        "wss://operator.local/management-api/ws/services/lidar%2Fpose%20publisher/logs?token=token+value&tail=200&stdout=false&stderr=true&timestamps=false",
      )
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: previousLocation,
      })
    }
  })

  test("builds block states WebSocket URLs with query token auth", () => {
    expect(
      buildBlockStatesWebSocketUrl("http://127.0.0.1:8080", "change-me"),
    ).toBe("ws://127.0.0.1:8080/ws/block-states?token=change-me")
  })

  test("builds decision WebSocket URLs with query token auth", () => {
    expect(
      buildDecisionWebSocketUrl("http://127.0.0.1:8080", "change-me"),
    ).toBe("ws://127.0.0.1:8080/ws/decision?token=change-me")
  })

  test("builds dashboard WebSocket URLs with query token auth", () => {
    expect(
      buildDashboardWebSocketUrl("http://127.0.0.1:8080", "change-me"),
    ).toBe("ws://127.0.0.1:8080/ws/dashboard?token=change-me")
  })

  test("accepts only HTTP(S) URLs or same-origin proxy paths", () => {
    expect(isValidManagementBaseUrl("http://192.168.31.52:8080")).toBe(true)
    expect(isValidManagementBaseUrl("/management-api")).toBe(true)
    expect(isValidManagementBaseUrl("ftp://192.168.31.52:8080")).toBe(false)
    expect(isValidManagementBaseUrl("//192.168.31.52:8080")).toBe(false)
  })
})

describe("vision hand-in block state stream", () => {
  test("maps alliance colors to shared background colors", () => {
    expect(getAllianceBackgroundColor("blue")).toBe("rgb(128, 191, 209)")
    expect(getAllianceBackgroundColor("red")).toBe("rgb(236, 162, 151)")
    expect(getOpponentAllianceColor("blue")).toBe("red")
    expect(getOpponentAllianceColor("red")).toBe("blue")
  })

  test("retries the first failed websocket handshake immediately once", () => {
    expect(
      getBlockStateReconnectDelayMs({
        hasOpened: false,
        usedInitialFastRetry: false,
      }),
    ).toBe(0)
    expect(
      getBlockStateReconnectDelayMs({
        hasOpened: false,
        usedInitialFastRetry: true,
      }),
    ).toBe(BLOCK_STATE_RECONNECT_DELAY_MS)
    expect(
      getBlockStateReconnectDelayMs({
        hasOpened: true,
        usedInitialFastRetry: false,
      }),
    ).toBe(BLOCK_STATE_RECONNECT_DELAY_MS)
  })

  test("parses block state snapshot envelopes from the backend", () => {
    expect(
      parseBlockStateMessage(
        JSON.stringify({
          type: "block_states_snapshot",
          time: "2026-06-04T12:00:00Z",
          snapshot: {
            states: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1],
            revision: 7,
          },
        }),
      ),
    ).toEqual({
      type: "block_states_snapshot",
      blocks: [
        "unknown",
        "null",
        "r1",
        "r2",
        "fake",
        "unknown",
        "null",
        "r1",
        "r2",
        "fake",
        "unknown",
        "null",
      ],
      revision: 7,
      color: "blue",
      matchType: "competition_full",
    })
  })

  test("parses block state error envelopes from the backend", () => {
    expect(
      parseBlockStateMessage(
        JSON.stringify({
          type: "block_states_error",
          time: "2026-06-04T12:00:00Z",
          code: "invalid_block_states",
          message: "block states must contain 12 values, got 3",
        }),
      ),
    ).toEqual({
      type: "block_states_error",
      code: "invalid_block_states",
      message: "block states must contain 12 values, got 3",
    })
  })

  test("rejects stale bare-array and malformed block state messages", () => {
    expect(parseBlockStateMessage("[0,1,2,3,4,0,1,2,3,4,0,1]")).toBeNull()
    expect(
      parseBlockStateMessage(
        JSON.stringify({
          type: "block_states_snapshot",
          snapshot: {
            states: [0, 1, 2],
            revision: 1,
          },
        }),
      ),
    ).toBeNull()
    expect(
      parseBlockStateMessage(
        JSON.stringify({
          type: "block_states_snapshot",
          snapshot: {
            states: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
            revision: 1,
          },
        }),
      ),
    ).toBeNull()
  })
})

describe("retry spear index rules", () => {
  test("limits martial merlin red side to spear indices 1 through 3", () => {
    expect(
      getAllowedRetrySpearIndices({
        color: "red",
        matchType: "martial_merlin",
      }),
    ).toEqual([1, 2, 3])
    expect(
      resolveRetrySpearIndex(5, {
        color: "red",
        matchType: "martial_merlin",
      }),
    ).toBe(1)
  })

  test("limits martial merlin blue side to spear indices 4 through 6", () => {
    expect(
      getAllowedRetrySpearIndices({
        color: "blue",
        matchType: "martial_merlin",
      }),
    ).toEqual([4, 5, 6])
    expect(
      resolveRetrySpearIndex(2, {
        color: "blue",
        matchType: "martial_merlin",
      }),
    ).toBe(4)
  })

  test("allows all retry spear indices outside martial merlin", () => {
    expect(
      getAllowedRetrySpearIndices({
        color: "red",
        matchType: "competition_full",
      }),
    ).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      resolveRetrySpearIndex(6, {
        color: "red",
        matchType: "competition_full",
      }),
    ).toBe(6)
  })
})

describe("vision hand-in decision stream", () => {
  test("parses decision snapshot envelopes from the backend", () => {
    expect(
      parseDecisionMessage(
        JSON.stringify({
          type: "decision_snapshot",
          time: "2026-07-06T12:00:00Z",
          snapshot: {
            available: true,
            topic: "/decision",
            received_at: "2026-07-06T12:00:00Z",
            action_order: [0, 1, 5, 12, 0],
            scroll_picks: [{ from: 0, get: 5 }, { from: 5, get: 12 }],
            revision: 9,
          },
        }),
      ),
    ).toEqual({
      type: "decision_snapshot",
      snapshot: {
        available: true,
        topic: "/decision",
        received_at: "2026-07-06T12:00:00Z",
        action_order: [0, 1, 5, 12, 0],
        scroll_picks: [{ from: 0, get: 5 }, { from: 5, get: 12 }],
        revision: 9,
      },
    })
  })

  test("rejects malformed decision messages", () => {
    expect(parseDecisionMessage("{")).toBeNull()
    expect(
      parseDecisionMessage(
        JSON.stringify({
          type: "decision_snapshot",
          snapshot: {
            available: true,
            topic: "/decision",
            received_at: null,
            action_order: [13],
            scroll_picks: [],
            revision: 1,
          },
        }),
      ),
    ).toBeNull()
    expect(
      parseDecisionMessage(
        JSON.stringify({
          type: "decision_snapshot",
          snapshot: {
            available: true,
            topic: "/decision",
            received_at: null,
            action_order: [1],
            scroll_picks: [{ from: 0, get: 0 }],
            revision: 1,
          },
        }),
      ),
    ).toBeNull()
  })

  test("builds decision overlay path and scroll markers from current grid orientation", () => {
    const mode = {
      color: "blue",
      direction: "front",
      matchType: "competition_full",
    } as const
    const centers = getStepCenters(mode)
    const stepOne = centers.get(1)
    const stepFive = centers.get(5)
    const stepTwelve = centers.get(12)

    expect(stepOne).toBeDefined()
    expect(stepFive).toBeDefined()
    expect(stepTwelve).toBeDefined()

    const model = buildDecisionOverlayModel(
      {
        available: true,
        topic: "/decision",
        received_at: "2026-07-06T12:00:00Z",
        action_order: [0, 1, 5, 12, 0],
        scroll_picks: [{ from: 0, get: 5 }, { from: 5, get: 12 }],
        revision: 1,
      },
      mode,
    )

    expect(model.pathSegments).toHaveLength(4)
    expect(model.scrollCircles).toHaveLength(2)
    expect(model.scrollArrows).toHaveLength(2)
    expect(model.pathSegments[0].from).toEqual(entryPointNear(stepOne!, mode))
    expect(model.pathSegments[3].to).toEqual(exitPointNear(stepTwelve!, mode))
    expect(model.pathSegments[0].from.x).toBe(104)
    expect(model.pathSegments[3].to.x).toBe(-4)
    expect(model.scrollCircles[0].center).toEqual(stepFive)
  })
})

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))

  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

describe("vision hand-in direction cache", () => {
  test("reads valid per-color direction cache entries", () => {
    const storage = createMemoryStorage({
      [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
        blue: "front",
        red: "back",
      }),
    })

    expect(readVisionDirectionCache(storage)).toEqual({
      blue: "front",
      red: "back",
    })
  })

  test("ignores invalid cache JSON and invalid per-color values", () => {
    expect(
      readVisionDirectionCache(
        createMemoryStorage({
          [VISION_HANDIN_DIRECTION_STORAGE_KEY]: "{",
        }),
      ),
    ).toEqual({})

    expect(
      readVisionDirectionCache(
        createMemoryStorage({
          [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
            blue: "sideways",
            red: "back",
          }),
        }),
      ),
    ).toEqual({ red: "back" })
  })

  test("uses cached direction before URL direction for the active color", () => {
    const storage = createMemoryStorage({
      [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
        blue: "front",
        red: "back",
      }),
    })

    expect(
      resolveInitialVisionMode(
        "?color=blue&direction=back&match_type=martial_merlin",
        storage,
      ),
    ).toEqual({
      color: "blue",
      direction: "front",
      matchType: "martial_merlin",
    })

    expect(resolveInitialVisionMode("?color=red", storage)).toEqual({
      color: "red",
      direction: "back",
      matchType: "competition_full",
    })
  })

  test("falls back to URL and defaults when cache entries are missing", () => {
    const storage = createMemoryStorage()

    expect(
      resolveInitialVisionMode(
        "?color=red&direction=back&match_type=combat_only_top",
        storage,
      ),
    ).toEqual({
      color: "red",
      direction: "back",
      matchType: "combat_only_top",
    })

    expect(resolveInitialVisionMode("?color=green", storage)).toEqual({
      color: "blue",
      direction: "front",
      matchType: "competition_full",
    })
  })

  test("persists direction changes only for the current color", () => {
    const storage = createMemoryStorage({
      [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
        blue: "back",
        red: "front",
      }),
    })
    const previous = {
      color: "red",
      direction: "front",
      matchType: "competition_full",
    } as const

    expect(
      resolveVisionModeTransition(
        previous,
        { ...previous, direction: "back" },
        storage,
      ),
    ).toEqual({
      color: "red",
      direction: "back",
      matchType: "competition_full",
    })
    expect(readVisionDirectionCache(storage)).toEqual({
      blue: "back",
      red: "back",
    })
  })

  test("restores cached direction when switching colors", () => {
    const storage = createMemoryStorage({
      [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
        blue: "front",
        red: "back",
      }),
    })
    const previous = {
      color: "blue",
      direction: "front",
      matchType: "competition_full",
    } as const

    expect(
      resolveVisionModeTransition(
        previous,
        { ...previous, color: "red" },
        storage,
      ),
    ).toEqual({
      color: "red",
      direction: "back",
      matchType: "competition_full",
    })
  })

  test("seeds missing target color direction when switching colors", () => {
    const storage = createMemoryStorage({
      [VISION_HANDIN_DIRECTION_STORAGE_KEY]: JSON.stringify({
        blue: "back",
      }),
    })
    const previous = {
      color: "blue",
      direction: "back",
      matchType: "competition_full",
    } as const

    expect(
      resolveVisionModeTransition(
        previous,
        { ...previous, color: "red" },
        storage,
      ),
    ).toEqual({
      color: "red",
      direction: "back",
      matchType: "competition_full",
    })
    expect(readVisionDirectionCache(storage)).toEqual({
      blue: "back",
      red: "back",
    })
  })

  test("does not throw when browser storage access fails", () => {
    const throwingStorage = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    }

    expect(
      resolveInitialVisionMode(
        "?color=red&direction=back&match_type=combat_only_middle",
        throwingStorage,
      ),
    ).toEqual({
      color: "red",
      direction: "back",
      matchType: "combat_only_middle",
    })

    writeVisionDirectionForColor("red", "front", throwingStorage)
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

  test("formats chassis action state protocol enum names", () => {
    const action = chassisStateSnapshot().message.action

    expect(formatChassisStepStatus(action.step_status)).toBe("Done")
    expect(formatChassisMode(action.chassis_mode)).toBe("Position")
    expect(formatChassisCurveFinished(action.chassis_curve_finished)).toBe(
      "Finished",
    )
    expect(formatLiftStatus(action.lift_status)).toBe("NotEnabled")
    expect(formatGripStatus(action.grip_status)).toBe("Done")
    expect(formatTrajectoryOfflineState(action.trajectory_offline_state)).toBe(
      "Finished",
    )
    expect(formatInfraredSwitchState(action.infrared_switch_state)).toBe(
      "0b1010 switch[1,3]",
    )
    expect(getChassisActionStateDisplayFields(action)).toEqual([
      ["raw_table", "0x1234"],
      ["step_status", "Done"],
      ["chassis_mode", "Position"],
      ["chassis_curve_finished", "Finished"],
      ["lift_status", "NotEnabled"],
      ["grip_status", "Done"],
      ["trajectory_offline_state", "Finished"],
      ["infrared_switch_state", "0b1010 switch[1,3]"],
    ])
  })

  test("formats unknown chassis action state values with stable fallbacks", () => {
    expect(formatChassisStepStatus(4)).toBe("Unknown(4)")
    expect(formatChassisMode(7)).toBe("Unknown(7)")
    expect(formatLiftStatus(Number.NaN)).toBe("Unknown(NaN)")
    expect(formatGripStatus(7)).toBe("Unknown(7)")
    expect(formatTrajectoryOfflineState(-1)).toBe("Unknown(-1)")
    expect(formatInfraredSwitchState(0)).toBe("0b0000 None")
    expect(formatChassisCurveFinished(false)).toBe("Unfinished")
  })
})

describe("master-control pose API contract", () => {
  test("validates complete master-control pose snapshots", () => {
    expect(isMasterControlPoseSnapshot(masterControlPoseSnapshot())).toBe(true)
    expect(
      isMasterControlPoseSnapshot({
        available: false,
        topic: "to_master_control",
        received_at: null,
        lidar_pose: {
          available: false,
          topic: "to_master_control",
          received_at: null,
          message: null,
        },
        odin_odometry: {
          available: false,
          topic: "/odin1/odometry",
          received_at: null,
          message: null,
        },
      }),
    ).toBe(true)
  })

  test("rejects malformed master-control pose snapshots", () => {
    const snapshot = masterControlPoseSnapshot()

    expect(
      isMasterControlPoseSnapshot({
        ...snapshot,
        lidar_pose: {
          ...snapshot.lidar_pose,
          message: {
            ...snapshot.lidar_pose.message,
            yaw_deg: "90",
          },
        },
      }),
    ).toBe(false)
  })

  test("validates dashboard websocket messages", () => {
    expect(
      isDashboardWebSocketMessage({
        type: "dashboard_snapshot",
        seq: 1,
        time: "2026-06-04T00:00:00Z",
        snapshot: dashboardSnapshot(),
      }),
    ).toBe(true)
    expect(
      isDashboardWebSocketMessage({
        type: "dashboard_error",
        seq: 2,
        time: "2026-06-04T00:00:01Z",
        code: "request_failed",
        message: "agent unavailable",
      }),
    ).toBe(true)
    expect(
      isDashboardWebSocketMessage({
        type: "dashboard_snapshot",
        seq: 0,
        time: "2026-06-04T00:00:00Z",
        snapshot: { services: [{}], chassis_state: null, master_control_pose: null },
      }),
    ).toBe(false)
  })

  test("parses compact dashboard stream frames", () => {
    const timestampMs = Date.parse("2026-06-04T12:00:00Z")

    expect(
      parseDashboardStreamMessage([
        "s",
        7,
        timestampMs,
        [[0, 1, "ros_warning", 1, 0, 1, "UP", null, 3, "healthy", 1, 1, "topic_stale"]],
      ]),
    ).toEqual({
      type: "dashboard_services",
      seq: 7,
      time: "2026-06-04T12:00:00.000Z",
      services: [
        {
          service_index: 0,
          overall: {
            level: "warning",
            reason: "ros_warning",
          },
          docker: {
            exists: true,
            state: "running",
            running: true,
            status: "UP",
            exit_code: null,
            restart_count: 3,
            health: "healthy",
          },
          ros: {
            agent_available: true,
            level: "warning",
            summary: "topic_stale",
          },
        },
      ],
    })

    expect(
      parseDashboardStreamMessage([
        "c",
        8,
        timestampMs,
        [
          1,
          "chassis_state",
          timestampMs,
          [
            1234, 1.25, -2.5, 90, 0.12, 0.13, 0x1234, 1, 2, 1, 3, 5, 2, 10,
            0xc3ff,
          ],
        ],
      ]),
    ).toMatchObject({
      type: "dashboard_chassis",
      chassis_state: {
        available: true,
        topic: "chassis_state",
        received_at: "2026-06-04T12:00:00.000Z",
        message: {
          timestamp_ms: 1234,
          action: {
            raw_table: 0x1234,
            chassis_curve_finished: true,
            grip_status: 5,
            trajectory_offline_state: 2,
            infrared_switch_state: 10,
            infrared_switch_1: true,
            infrared_switch_3: true,
          },
          connection: {
            raw_table: 0xc3ff,
            wheel_0: true,
            lift_3: true,
            gyro_yaw: false,
            upper_host_localization: true,
            upper_host: true,
          },
        },
      },
    })

    expect(
      parseDashboardStreamMessage([
        "p",
        9,
        timestampMs,
        [
          1,
          "to_master_control",
          timestampMs,
          [123, 456000000, "ideal_world", "odin", 1.25, -2.5, 0.75, 0, 0, 90],
        ],
      ]),
    ).toMatchObject({
      type: "dashboard_pose",
      seq: 9,
      master_control_pose: {
        topic: "to_master_control",
        message: {
          header: {
            frame_id: "ideal_world",
            stamp: {
              sec: 123,
              nanosec: 456000000,
            },
          },
          source: "odin",
          yaw_deg: 90,
        },
      },
    })

    expect(
      parseDashboardStreamMessage([
        "e",
        10,
        timestampMs,
        "request_failed",
        "agent unavailable",
      ]),
    ).toEqual({
      type: "dashboard_error",
      seq: 10,
      time: "2026-06-04T12:00:00.000Z",
      code: "request_failed",
      message: "agent unavailable",
    })
  })

  test("rejects malformed compact dashboard stream frames", () => {
    const timestampMs = Date.parse("2026-06-04T12:00:00Z")

    expect(parseDashboardStreamMessage(["x", 1, timestampMs, []])).toBeNull()
    expect(parseDashboardStreamMessage(["c", 1, timestampMs, [2, "", null, null]])).toBeNull()
    expect(
      parseDashboardStreamMessage([
        "s",
        1,
        timestampMs,
        [[0, 9, "bad level", 1, 0, 1, null, null, null, null, 1, 0, "ok"]],
      ]),
    ).toBeNull()
    expect(parseDashboardStreamMessage(["p", 1, "not-ms", []])).toBeNull()
  })

  test("applies compact service summaries without clearing diagnostics", () => {
    const current = [
      makeServiceStatus({
        docker: {
          health: "starting",
          restart_count: 1,
          running: true,
          state: "running",
          status: "UP",
        },
        overall: {
          level: "warning",
          reason: "topic_stale",
        },
        ros: {
          diagnostics: [
            {
              level: "warning",
              message: "camera delayed",
              name: "camera",
              source: "ros",
              values: {
                delay_ms: "120",
              },
            },
          ],
          expected_nodes: [
            {
              actual: null,
              expected: "/chassis_serial",
              matched: true,
            },
          ],
          level: "warning",
          summary: "topic_stale",
          topics: [
            {
              actual: "chassis_state",
              expected: "chassis_state",
              freshness: "fresh",
              last_message_at: "2026-06-04T12:00:00Z",
              matched: true,
              message_count: 10,
              node_name: "/chassis_serial",
              type: "interfaces/msg/ChassisState",
            },
          ],
        },
      }),
    ]

    const updated = applyServiceSummaryUpdates(current, [
      {
        service_index: 0,
        docker: {
          exists: true,
          health: "healthy",
          restart_count: 2,
          running: true,
          state: "running",
          status: "UP 10 seconds",
          exit_code: null,
        },
        overall: {
          level: "ok",
          reason: "ok",
        },
        ros: {
          agent_available: true,
          level: "ok",
          summary: "ok",
        },
      },
    ])

    expect(updated).not.toBe(current)
    expect(updated[0].overall).toEqual({
      level: "ok",
      reason: "ok",
    })
    expect(updated[0].docker.status).toBe("UP 10 seconds")
    expect(updated[0].ros.summary).toBe("ok")
    expect(updated[0].ros.diagnostics).toBe(current[0].ros.diagnostics)
    expect(updated[0].ros.expected_nodes).toBe(current[0].ros.expected_nodes)
    expect(updated[0].ros.topics).toBe(current[0].ros.topics)
  })

  test("validates dashboard snapshots with nullable dashboard sections", () => {
    expect(isDashboardSnapshot(dashboardSnapshot())).toBe(true)
    expect(
      isDashboardSnapshot({
        services: [makeServiceStatus()],
        chassis_state: null,
        master_control_pose: null,
      }),
    ).toBe(true)
    expect(
      isDashboardSnapshot({
        services: [makeServiceStatus()],
        chassis_state: { available: true },
        master_control_pose: null,
      }),
    ).toBe(false)
  })
})

describe("service log stream helpers", () => {
  test("uses 200 as the frontend default service log tail", () => {
    expect(DEFAULT_SERVICE_LOG_TAIL).toBe(200)
    expect(normalizeServiceLogTail(Number.NaN)).toBe(200)
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

  test("formats meter values with millimeter precision", () => {
    expect(formatMillimeterPrecision(1)).toBe("1.000")
    expect(formatMillimeterPrecision(-0.0014)).toBe("-0.001")
    expect(formatMillimeterPrecision(Number.NaN)).toBe("缺失")
  })

  test("formats protocol table values as uppercase hex words", () => {
    expect(formatHexWord(0x1234)).toBe("0x1234")
    expect(formatHexWord(10.9)).toBe("0x000A")
    expect(formatHexWord(-1)).toBe("0x0000")
  })

  test("formats MCU millisecond durations as readable operator text", () => {
    expect(formatReadableDurationMs(123)).toBe("123 ms")
    expect(formatReadableDurationMs(1234)).toBe("1.23 s")
    expect(formatReadableDurationMs(62_000)).toBe("1 分 02 秒")
    expect(formatReadableDurationMs(3_661_000)).toBe("1 小时 01 分 01 秒")
  })

  test("formats ROS stamps as readable wall-clock times", () => {
    expect(formatRosTime({ sec: 0, nanosec: 123_000_000 })).toMatch(
      /^ROS \d{2}:\d{2}:\d{2}\.123$/,
    )
    expect(formatRosTime({ sec: 1, nanosec: 999_999_999 })).toMatch(
      /^ROS \d{2}:\d{2}:\d{2}\.999$/,
    )
    expect(formatRosTime({ sec: 1, nanosec: 1_000_000_000 })).toBe(
      "ROS 时间 1.1000000000",
    )
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

describe("service diagnostics", () => {
  test("groups multiple Odin ROS diagnostics by hardware id without dropping entry fields", () => {
    const service = makeServiceStatus({
      docker: {
        exit_code: 0,
        running: true,
        state: "running",
        status: "UP",
      },
      overall: {
        level: "error",
        reason: "ros_error",
      },
      ros: {
        diagnostics: [
          {
            hardware_id: "odin",
            level: "warning",
            message: "dtof stream delayed",
            name: "odin/dtof",
          },
          {
            hardware_id: "odin",
            level: "error",
            message: "image stream timeout",
            name: "odin/image",
          },
        ],
        level: "error",
        summary: "diagnostics_error",
      },
      service_name: "odin_ros_driver",
    })

    const odinGroup = getServiceDiagnosticGroups(service).find(
      (group) => group.key === "ros:diagnostics:odin",
    )

    expect(odinGroup).toMatchObject({
      count: 2,
      label: "ROS 诊断 / odin",
      level: "error",
      source: "odin",
      summaryEntry: {
        detail: "image stream timeout",
        hardwareId: "odin",
        key: "ros:diagnostic:odin/image:odin:1",
        kind: "ros-diagnostic",
        label: "ROS 诊断 / odin",
        level: "error",
        title: "odin/image",
      },
      title: "odin",
    })
    expect(odinGroup?.entries).toEqual([
      {
        detail: "dtof stream delayed",
        hardwareId: "odin",
        key: "ros:diagnostic:odin/dtof:odin:0",
        kind: "ros-diagnostic",
        label: "ROS 诊断 / odin",
        level: "warning",
        title: "odin/dtof",
      },
      {
        detail: "image stream timeout",
        hardwareId: "odin",
        key: "ros:diagnostic:odin/image:odin:1",
        kind: "ros-diagnostic",
        label: "ROS 诊断 / odin",
        level: "error",
        title: "odin/image",
      },
    ])
  })

  test("groups diagnostics with empty hardware id under a stable ROS source", () => {
    const service = makeServiceStatus({
      docker: {
        exit_code: 0,
        running: true,
        state: "running",
        status: "UP",
      },
      overall: {
        level: "warning",
        reason: "ros_warning",
      },
      ros: {
        diagnostics: [
          {
            hardware_id: "",
            level: "unknown",
            message: "diagnostic source did not report hardware id",
            name: "anonymous diagnostic",
          },
        ],
        level: "warning",
        summary: "diagnostics_warning",
      },
    })

    const group = getServiceDiagnosticGroups(service).find(
      (item) => item.key === "ros:diagnostics:ROS 诊断",
    )

    expect(group).toMatchObject({
      count: 1,
      label: "ROS 诊断",
      level: "warning",
      source: "ROS 诊断",
      title: "ROS 诊断",
    })
    expect(group?.entries[0]).toMatchObject({
      detail: "diagnostic source did not report hardware id",
      hardwareId: "",
      kind: "ros-diagnostic",
      label: "ROS 诊断",
      level: "warning",
      title: "anonymous diagnostic",
    })
  })

  test("keeps non-ROS diagnostic groups for docker nodes and topics", () => {
    const service = makeServiceStatus({
      docker: {
        exists: false,
        running: false,
        state: "missing",
      },
      ros: {
        expected_nodes: [
          {
            last_seen: null,
            name: "odin_ros_driver",
            present: false,
          },
        ],
        topics: [
          {
            freshness: null,
            name: "/odin1/cloud_raw",
            observed_types: [],
            present: false,
            publisher_count: 0,
            required_endpoint: "publisher",
            resolved_name: "/odin1/cloud_raw",
            subscriber_count: 0,
            type_name: "sensor_msgs/msg/PointCloud2",
          },
        ],
      },
    })

    const keys = getServiceDiagnosticGroups(service).map((group) => group.key)

    expect(keys).toContain("docker:missing")
    expect(keys).toContain("ros:node:odin_ros_driver")
    expect(keys).toContain("ros:topic:/odin1/cloud_raw:/odin1/cloud_raw")
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
        grip_status: 5,
        trajectory_offline_state: 2,
        infrared_switch_state: 10,
        infrared_switch_0: false,
        infrared_switch_1: true,
        infrared_switch_2: false,
        infrared_switch_3: true,
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

function masterControlPoseSnapshot() {
  return {
    available: true,
    topic: "to_master_control",
    received_at: "2026-06-03T02:30:01Z",
    lidar_pose: {
      available: true,
      topic: "to_master_control",
      received_at: "2026-06-03T02:30:00Z",
      message: {
        header: {
          stamp: {
            sec: 123,
            nanosec: 456000000,
          },
          frame_id: "ideal_world",
        },
        source: "odin",
        x: 1.25,
        y: -2.5,
        z: 0.75,
        roll_deg: 0,
        pitch_deg: 0,
        yaw_deg: 90,
      },
    },
    odin_odometry: {
      available: true,
      topic: "/odin1/odometry",
      received_at: "2026-06-03T02:30:01Z",
      message: {
        header: {
          stamp: {
            sec: 124,
            nanosec: 789000000,
          },
          frame_id: "odom",
        },
        child_frame_id: "odin1_base_link",
        x: 3.5,
        y: -4.25,
        z: 0.5,
        roll_deg: 0,
        pitch_deg: 0,
        yaw_deg: 180,
      },
    },
  }
}

function dashboardSnapshot() {
  return {
    services: [makeServiceStatus()],
    chassis_state: chassisStateSnapshot(),
    master_control_pose: masterControlPoseSnapshot(),
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
