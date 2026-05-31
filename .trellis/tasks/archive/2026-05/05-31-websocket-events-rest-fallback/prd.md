# WebSocket Events, Recent Activity, and REST Fallback

## Goal

Implement realtime management events, reconnect behavior, recent activity display, and REST fallback so the dashboard does not silently remain stale when WebSocket connectivity changes.

## Background

The frontend now supports authenticated REST operations for service overview, details, logs, stats, restart, and typed commands. The backend also provides `GET /api/events/recent` and `/ws/events?token=<token>` for realtime status snapshots and operation events.

## Scope

- Connect to `/ws/events?token=<token>` using the existing WebSocket URL helper.
- Handle the initial `service_status_snapshot` sent after connection.
- Handle events:
  - `service_status_snapshot`
  - `service_status_changed`
  - `restart_requested`
  - `restart_finished`
  - `command_requested`
  - `command_finished`
  - `backend_warning`
- Reserved or unknown event types must not crash the UI.
- Implement reconnect with backoff.
- Display WebSocket/connection state in the UI.
- On disconnect or reconnect failure, use REST refresh for current service list.
- Load `GET /api/events/recent` to initialize recent activity.
- Recent activity panel should display restart and command request/result events and generic backend warnings/unknown events.
- Do not leak token in logs, visible UI, console messages, share text, or durable state outside `sessionStorage`.

## Acceptance Criteria

- WebSocket disconnect does not leave the UI silently stale.
- Reconnect attempts are visible through connection state and use backoff.
- Reconnect or accepted snapshot updates service statuses.
- Disconnect/reconnect failure triggers REST service refresh fallback.
- Unknown event types are safely ignored or shown as generic events without crashing.
- Recent activity initializes from `GET /api/events/recent` and appends incoming events.
- Token is only used for auth/connection and is not exposed in UI/logs/console.
- `bun run typecheck`, `bun run lint`, and `bun run build` pass.

## Safety Boundary

Do not add:

- arbitrary shell command UI,
- Docker API explorer,
- Docker exec,
- arbitrary container name input,
- arbitrary command string input,
- arbitrary JSON payload editor,
- ROS CLI bypass.

Events may update UI state and activity history only; they must not introduce new execution surfaces.

## Out of Scope

- Long-term audit search/history storage.
- Push notifications.
- Editing event subscriptions.
- Backend changes.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`

If live backend testing is impossible, verify event reducer/connection behavior through static code inspection and quality commands.
