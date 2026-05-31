# Backend Contract Types, API Client, Auth, and Jotai State

## Goal

Establish the typed frontend contract layer for the management backend: DTOs matching `backend-docs/api.md`, a narrow authenticated API client, persisted auth/base URL settings, and Jotai atoms for global application state.

## Background

Task 1 created the React/Vite/Bun/Tailwind/shadcn/Jotai scaffold and persisted frontend conventions. This task wires the frontend foundation to the backend contract without yet building the full service dashboard workflows. Later tasks will consume these types, client methods, and atoms.

## Scope

- Define TypeScript DTOs from `backend-docs/api.md`:
  - `ServiceStatus`
  - `DockerStatus`
  - `RosStatus`
  - `OverallStatus`
  - `ServiceDefinition`
  - `ServiceLogsResponse`
  - `ServiceStats`
  - `RestartRequest`
  - `RestartResponse`
  - `CommandDefinition`
  - `CommandRequest`
  - `CommandResponse`
  - `ManagementEvent`
  - `ApiError`
- DTO field names must preserve backend `snake_case`; do not silently convert to camelCase.
- Implement a typed API client with:
  - default base URL `http://127.0.0.1:8080`,
  - `Authorization: Bearer <token>` for HTTP requests when a token is configured,
  - structured parsing of backend `{ code, message }` errors,
  - surfaced error branches based primarily on `code`,
  - no arbitrary Docker/container/command passthrough.
- Implement Jotai atoms for:
  - base URL,
  - auth token,
  - selected service,
  - service statuses,
  - service definitions,
  - commands,
  - recent events,
  - connection state,
  - latest error.
- Add authentication/connection settings UI:
  - base URL input,
  - token input,
  - connection test using `/readyz` or `/healthz`,
  - clear token action.
- Persist token in `sessionStorage`.
- Persist base URL in `localStorage`.
- Implement WebSocket URL generation:
  - `http` -> `ws`,
  - `https` -> `wss`,
  - token in query parameter for browser WebSocket connection.

## Acceptance Criteria

- Missing auth or invalid token has a clear operator configuration entry point in the UI.
- API client does not expose arbitrary Docker, container, shell, ROS CLI, or free-form command passthrough.
- Error handling prioritizes backend `code` and preserves `message` for display/debugging.
- Type definitions match `backend-docs/api.md` field names and shapes closely enough for later tasks to consume them.
- Token is not written to console output, UI share text, logs, or other durable app state beyond `sessionStorage`.
- Base URL is stored in `localStorage`; token is stored in `sessionStorage`.
- WebSocket URL helper correctly converts HTTP(S) URLs and attaches `token` as a query parameter without logging it.
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

The client should only expose the documented management backend routes and typed operations needed by the MVP.

## Out of Scope

- Full service overview implementation from live data.
- Service details, logs, stats, restart UI.
- Typed command form implementation.
- WebSocket controller/reducer and reconnect behavior.
- Final test suite.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`

Add focused tests only if the current scaffold already has a test setup or if adding one is low-risk; otherwise leave tests to the final integration task.
