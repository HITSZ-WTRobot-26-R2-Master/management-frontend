---
id: "20260531-1722-fe-docker-unavailable-causes-restart-count-to-retur"
type: "issue"
status: "inbox"
from: "frontend"
to: "backend"
title: "Docker 不可用时 restart_count 返回 null"
created_at: "2026-05-31T17:22:06+08:00"
updated_at: "2026-05-31T17:22:06+08:00"
workspace: "r2-management-frontend"
related_paths: "backend-docs/api.md,src/lib/management-api.ts,src/types/management.ts"
---
# Summary

前端调试 management backend 时发现：当 backend 无法访问 Docker Engine，`GET /api/services` 和 `service_status_snapshot` 事件仍会返回注册服务，但 `docker.restart_count` 返回 `null`。当前 API 文档和前端契约原本把该字段视为 number，导致前端运行时校验拒绝整条 `ServiceStatus`。

# Environment

- Requester workspace: `r2-management-frontend`
- Receiver workspace: management backend workspace
- Date: 2026-05-31
- Backend base URL used during debugging: `http://192.168.31.52:8080`
- Auth token used during debugging: `change-me`

# Reproduction Steps

1. 在 Docker Engine 不可用或 backend 无法连接 Docker socket/client 的环境中启动 management backend。
2. 前端使用 backend 地址 `http://192.168.31.52:8080` 和 token `change-me` 调试。
3. 请求 `GET /api/services`。
4. 观察 WebSocket `service_status_snapshot` 事件。
5. 检查任一服务的 `docker.restart_count` 字段。

# Observed Behavior

`GET /api/services` 与 `service_status_snapshot` 都能返回 5 个注册服务。但当 backend 无法访问 Docker Engine 时，返回的 `docker.restart_count` 为 `null`：

```json
{
  "service_name": "chassis_serial",
  "docker": {
    "exists": false,
    "state": "unknown",
    "running": false,
    "status": "docker unavailable: Error in the hyper legacy client: client error (Connect)",
    "started_at": null,
    "finished_at": null,
    "exit_code": null,
    "restart_count": null,
    "health": null
  }
}
```

同一后端状态下：

- `GET /api/services/{service}/logs` 返回 `docker_operation_failed` / HTTP 502。
- `GET /api/services/{service}/stats` 返回 `docker_operation_failed` / HTTP 502。
- 错误原因同样指向 Docker client connect 失败。

# Expected Behavior

backend 应明确并稳定 `DockerStatus.restart_count` 在以下场景中的契约：

- Docker Engine 不可用。
- 容器不存在。
- Docker 查询失败。

可接受的契约选择：

- 保持 nullable，并同步更新 `backend-docs/api.md` 与 Rust public model 文档。
- 或始终返回 number，例如 Docker 不可用时返回 `0`，同时保留 `state="unknown"` 和 `status="docker unavailable: ..."` 表达不可用原因。

无论选择哪种契约，`/api/services`、`/api/services/{service}` 和 `service_status_snapshot` 必须一致。

# Evidence

- 前端运行时校验原本把 `restart_count` 视为 number，收到 `null` 后拒绝整条 `ServiceStatus`。
- 前端临时放宽为 `number | null` 并显示“未上报”，避免 UI 丢弃整批状态。
- 原本记录在 `backend-docs/issues/docker-unavailable-null-restart-count.md`；本条已迁移为 handoff issue，后续以 `.handoff/` 为权威协作渠道。

# Suspected Area

- `DockerStatus` public model。
- Docker 查询失败时的 status merge/serialization 逻辑。
- `backend-docs/api.md` 中 `DockerStatus.restart_count` 的字段契约。
- WebSocket `service_status_snapshot` 与 REST service status 共享契约。

# Impact

- WebSocket 已收到 `service_status_snapshot`，但服务总览仍显示 0 个服务。
- REST 服务快照被前端报告为“后端响应不符合预期的管理接口契约”。
- operator 无法查看 ROS 状态，即使 ROS agent 数据实际已经返回。
- 前端需要局部防御 Docker 失败，不能让日志/统计失败覆盖全局服务快照或事件流状态。

# Acceptance Criteria

- backend 对 `DockerStatus.restart_count` 的 nullable 或 non-null 语义做出明确选择。
- `GET /api/services`、`GET /api/services/{service}`、`service_status_snapshot` 对 `restart_count` 使用同一契约。
- `backend-docs/api.md` 与 Rust public model 文档同步反映该契约。
- Docker 不可用时，前端仍能保留服务快照和 ROS 状态，不因单个 Docker 字段不符合契约而丢弃整批服务。
- 如契约选择 non-null，Docker 不可用、容器不存在、Docker 查询失败场景都返回数字。
- 如契约选择 nullable，文档和测试明确 `null` 是允许值。

# Verification Plan

- 后端修复或确认契约后，将本 item 移动到 `ready-for-verify/` 并附实现说明。
- 前端用 Docker 不可用环境重新请求 `GET /api/services` 和观察 `service_status_snapshot`。
- 前端确认服务总览仍显示注册服务，`restart_count` 显示符合最终契约。
- 前端确认日志/统计 Docker 失败只影响对应局部面板，不覆盖全局服务快照或事件流状态。

# History

- 2026-05-31T17:22:06+08:00 frontend: created issue for backend.
- 2026-05-31T17:22:06+08:00 frontend: migrated original `backend-docs/issues/docker-unavailable-null-restart-count.md` note into fullstack handoff.
