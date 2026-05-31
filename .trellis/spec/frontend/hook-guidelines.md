# Hook Guidelines

Hooks should isolate browser lifecycle and API synchronization details from presentational management components.

## Custom Hook Patterns

- Name hooks with the `use*` prefix.
- Keep hook modules focused on one concern, such as selected service state, service polling, command discovery, or WebSocket events.
- Return typed data, loading state, and structured errors rather than throwing backend responses into components.
- Clean up timers, abort controllers, and WebSocket connections in effect cleanup functions.

## Data Fetching

Hooks must use the management backend contracts in `backend-docs/api.md`:

- Fetch registered services from `/api/services` or `/api/config/services`.
- Fetch visible typed commands from `/api/commands`.
- Use `/ws/events` for live status snapshots and reconnect with REST fallback.
- Use backend `service_name` values for path parameters.
- Branch on structured error `code` values, not only HTTP status or text messages.
- Funnel WebSocket snapshots and REST fallback refreshes into the same
  `ServiceStatus[]` state shape.
- Gate management REST and WebSocket requests on a non-empty auth token. When
  the token is empty, set the UI to `auth_required`, clear privileged server
  state such as service statuses, commands, and recent events, and do not start
  reconnect timers.
- Treat `AbortController` cancellations as lifecycle cleanup, not request
  failures. Browser abort errors may only expose `name === "AbortError"` rather
  than inheriting from `Error`, so shared abort detection must not depend on
  `instanceof Error`.

## Naming Conventions

- Put shared hooks in `src/hooks/` when introduced.
- Keep feature-specific hooks near the feature until they are shared.
- Use names that describe the source and behavior, for example `useServicesSnapshot`, `useCommandDiscovery`, or `useEventStream`.
- Keep pure parsing/reducer logic in `src/lib/` when it is shared with tests;
  hooks should orchestrate lifecycle, cleanup, and atom updates.

## Common Mistakes

- Do not create hooks that accept arbitrary command strings or container names.
- Do not duplicate status merge rules in hooks unless the backend contract explicitly requires a client-side fallback.
- Do not collapse `overall`, `docker`, and `ros` status into one boolean.
- Do not log auth tokens, WebSocket token query strings, or command payloads containing sensitive operator context.
- Do not open `/ws/events` without a token; backends that reject the handshake
  before `open` must leave the connection state at `auth_required` or
  `auth_invalid`, not `reconnecting`.
