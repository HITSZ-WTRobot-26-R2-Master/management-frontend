# State Management

Jotai is the project state library. The app root wraps React in `JotaiProvider` from `src/main.tsx`.

## State Categories

- Local component state: transient UI state used by one component, such as open menus or input drafts.
- Jotai atoms: operator shell state shared across components, such as the selected logical service.
- Server state: backend snapshots, command discovery, events, logs, and stats.
  Keep server state synchronized through dedicated API hooks.
- URL state: only use for shareable navigation or filters once routing is introduced.

## When to Use Global State

Promote state to a Jotai atom when:

- Multiple sibling components need the same state.
- The state represents the operator's current dashboard context.
- Derived atoms can prevent duplicate lookup logic, as in selected service derivation.

Keep state local when it does not need to survive component boundaries.

## Server State

Server state must preserve backend semantics:

- Track `overall`, `docker`, and `ros` status separately.
- Treat Docker-running plus unavailable ROS agent as a warning, not as a stopped service.
- Refresh command discovery when the backend reports `command_not_found`.
- Refresh services when the backend reports `service_not_found`.
- Keep WebSocket snapshots and REST refreshes flowing into the same typed service state shape.
- Keep recent events bounded to the backend history size used by the UI, and
  reduce known event types without mutating unknown/reserved event payloads.

## Security Boundaries

Do not store or expose state for arbitrary host commands, Docker exec sessions, arbitrary container names, raw Docker API paths, or direct ROS CLI invocations. Command state must come from backend command discovery and use typed payloads.

## Common Mistakes

- Do not copy static preview data into permanent global state once API integration is implemented.
- Do not store authentication tokens in logs, screenshots, or visible debug panels.
- Do not derive privileged backend capabilities from frontend constants; capability should come from backend service and command registries.
