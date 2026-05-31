# Service Overview Dashboard

## Goal

Implement the operator's first screen: a live service operations dashboard that loads registered service statuses from the management backend, preserves the backend's three-layer status model, and supports filtering and service selection without widening the safety boundary.

## Background

Previous tasks created the frontend scaffold and the typed backend contract layer, including the API client, auth/base URL settings, and Jotai atoms. This task replaces the static shell with a dashboard driven by `GET /api/services` and optional service-definition metadata from `GET /api/config/services`.

## Scope

- The first screen remains the service operations dashboard, not a landing or marketing page.
- Load service status data from `GET /api/services`.
- Optionally load `GET /api/config/services` to enrich capability/meta information, but render primarily from status API data.
- Store loaded statuses/definitions in the existing Jotai atoms.
- Render each service returned by the API, including future services not known at frontend build time.
- Display:
  - `display_name`
  - `service_name`
  - `category`
  - `risk_level`
  - `overall.level`
  - `overall.reason`
  - Docker state/running/status
  - ROS summary and agent availability
- Preserve the three-layer model:
  - `overall`
  - `docker`
  - `ros`
- Do not collapse service health into a single boolean.
- When Docker is running and `ros.agent_available=false`, present a warning/agent-unavailable state, not a Docker failure.
- Add filtering or grouping by status/category/risk. Filtering is enough for MVP.
- Support selecting a service and showing a Task-4-ready details placeholder/summary area.
- Handle:
  - loading,
  - empty service list,
  - missing/invalid auth,
  - Docker unavailable (`docker_unavailable`),
  - generic backend/client errors.

## Acceptance Criteria

- API-returned services render without frontend constants; current documented services should all display if returned:
  - `chassis_serial`
  - `arm_driver`
  - `lidar_pose_publisher`
  - `r2_vision`
  - `odin_ros_driver`
- Newly added backend services appear from API responses without changing frontend constants.
- UI does not accept arbitrary container names.
- Status colors/icons/text distinguish `ok`, `warning`, `error`, and `unknown`.
- Docker running plus unavailable ROS agent is clearly represented as a warning/agent issue rather than a Docker failure.
- Service selection uses logical `service_name`.
- Loading, empty, auth error, Docker unavailable, and generic error states are visible and useful.
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

All service actions and paths must be based on backend-returned logical `service_name`, not operator-entered container names.

## Out of Scope

- Full service detail API panel.
- Logs, stats, and restart operations.
- Typed command UI.
- WebSocket realtime updates and REST fallback.
- Long-term metrics/history.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`

If live backend testing is impossible, verify behavior through static code inspection and local build checks.
