# Typed Commands UI

## Goal

Expose backend-discovered allowlisted typed commands in the operator UI, including a typed form for `lidar_pose_publisher/reset_origin`, without providing arbitrary command strings or arbitrary JSON payload editing.

## Background

The frontend now supports service overview, selected-service diagnostics, logs, stats, and controlled hard restart. This task adds the command workflow using `GET /api/commands` discovery and `POST /api/commands` submission through the existing typed API client.

## Scope

- Load visible commands with `GET /api/commands`.
- Store command discovery results in the existing `commandsAtom`.
- Render command cards/list from discovery results.
- Do not hardcode the entire command list as the source of truth.
- Provide a typed form when discovery includes:
  - `target: "lidar_pose_publisher"`
  - `name: "reset_origin"`
- The `reset_origin` typed form includes:
  - `pose_x`
  - `pose_y`
  - `pose_z`
  - `pose_yaw_deg`
  - `reason`
- Submit `POST /api/commands` with:
  - `target`
  - `command`
  - `payload`
  - `confirm`
- Respect discovery metadata:
  - `description`
  - `node.transport`
  - `node.payload_schema`
  - `backend.risk_level`
  - `backend.requires_confirm`
- If backend returns `command_confirm_required`, require explicit operator confirmation and retry.
- If backend returns `command_not_found`, refresh discovery.
- If backend returns `command_transport_unavailable`, show it as management agent/ROS transport unavailable.
- Unknown future commands may be displayed as unavailable/unsupported command cards, but must not expose arbitrary command or JSON editors.

## Acceptance Criteria

- No arbitrary command string input exists.
- No arbitrary JSON payload editor exists.
- `reset_origin` is usable when discovery returns it.
- High-risk command execution has clear operator intent and confirmation state.
- Command list is discovery-driven.
- Error branches for confirm-required, not-found, and transport-unavailable are represented.
- `bun run typecheck`, `bun run lint`, and `bun run build` pass.

## Safety Boundary

Do not add:

- arbitrary shell command UI,
- Docker API explorer,
- Docker exec,
- arbitrary container name input,
- arbitrary command string input,
- arbitrary JSON command payload editor,
- ROS CLI bypass.

All command submissions must use a discovered command definition and typed payload construction.

## Out of Scope

- WebSocket event streaming for command events.
- Generic support for unknown future payload schemas.
- Command history beyond immediate response display.
- Editing the backend command registry.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`

If live backend testing is impossible, verify discovery-driven rendering, submit payload construction, and safety boundaries by code inspection and build checks.
