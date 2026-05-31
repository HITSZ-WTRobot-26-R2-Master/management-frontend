# Service Detail, Logs, Stats, and Hard Restart

## Goal

Implement selected-service diagnostics and controlled hard restart workflows using only documented management backend routes and backend-returned logical `service_name` values.

## Background

The dashboard now loads service statuses and supports selecting a service. This task deepens the selected service view with detail refresh, Docker and ROS diagnostics, bounded Docker logs, one-shot Docker stats snapshots, and a high-risk-aware hard restart operation.

## Scope

- Use the selected logical `service_name` to call `GET /api/services/{service}` for detail refresh.
- Never use Docker `container_name` as an API path parameter.
- Docker detail must show:
  - `exists`
  - `state`
  - `running`
  - `status`
  - `started_at`
  - `finished_at`
  - `exit_code`
  - `restart_count`
  - `health`
- ROS detail must show:
  - `agent_available`
  - `level`
  - `summary`
  - `expected_nodes`
  - `topics`
  - `diagnostics`
- Logs panel:
  - call `GET /api/services/{service}/logs`,
  - support `tail`,
  - support stdout/stderr/timestamps toggles if practical,
  - clearly label logs as coming from the Docker container,
  - display logs as unstructured text without parsing line formats.
- Stats panel:
  - call `GET /api/services/{service}/stats`,
  - show CPU, memory, network RX/TX, block read/write, and PIDs,
  - MVP is a single snapshot with refresh, not a history store.
- Hard restart:
  - call `POST /api/services/{service}/restart`,
  - send only `mode: "hard"`,
  - never expose soft restart,
  - require a second explicit confirmation for `risk_level=high` or `risk_level=critical`,
  - support optional reason,
  - display request result fields: `request_id`, `started_at`, `finished_at`, `result`.

## Acceptance Criteria

- Detail API path always uses logical `service_name`.
- High/critical risk services cannot be restarted with a single accidental click.
- Docker unavailable, service not found, auth errors, and operation failed errors are shown using structured `code` where available.
- Logs/stats/restart do not require backend Docker safety boundary changes.
- No soft restart UI is present.
- No arbitrary container name, Docker command, shell command, ROS CLI, arbitrary command string, or arbitrary JSON payload editor is present.
- `bun run typecheck`, `bun run lint`, and `bun run build` pass.

## Safety Boundary

Do not add:

- arbitrary shell command UI,
- Docker API explorer,
- Docker exec,
- arbitrary container name input,
- arbitrary command string input,
- arbitrary JSON payload editor,
- ROS CLI bypass,
- soft restart operation.

All service operations must be routed through documented backend methods and selected `service_name`.

## Out of Scope

- Typed commands UI.
- WebSocket realtime event handling.
- Historical stats/time series.
- Editing service/Compose/backend configuration.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`

If live backend testing is impossible, verify endpoint usage and safety semantics through code inspection and build checks.
