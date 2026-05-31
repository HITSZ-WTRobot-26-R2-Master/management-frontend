# Type Safety

The frontend uses strict TypeScript through `tsconfig.app.json`.

## Type Organization

- Put shared frontend model types in `src/types/`.
- Keep local-only component prop types beside the component.
- Preserve backend DTO field names exactly when modeling backend responses. Backend JSON uses `snake_case`, such as `service_name`, `container_name`, `risk_level`, `agent_available`, and `restart_count`.
- Use discriminated unions or literal unions for known status fields such as overall levels, Docker states, and risk levels.

## Backend Contract Direction

The backend API contract lives in `backend-docs/api.md`. API client types model:

- `ServiceStatus`, including separate `overall`, `docker`, and `ros` objects.
- `ServiceDefinition` from `/api/config/services`.
- Structured errors with `code` and `message`.
- `CommandDefinition` and typed command submission payloads discovered from `/api/commands`.
- Event envelopes from `/api/events/recent` and `/ws/events`.

Do not invent camelCase API DTOs unless the code explicitly maps from backend snake_case at the boundary.

## Validation

Runtime validation uses explicit type guards at the API boundary in
`src/lib/management-api.ts`. Treat backend JSON as `unknown` until it passes a
contract validator, and raise a structured `request_failed` API error when a
response does not match the documented contract.

## Common Patterns

- Use `satisfies` for object literals that must conform to a record or DTO-like shape.
- Use `Record<Union, Value>` for exhaustive styling maps.
- Prefer typed helper functions over repeated inline string comparisons for status formatting.

## Forbidden Patterns

- Do not use `any` for backend responses.
- Do not use type assertions to skip validation of untrusted JSON.
- Do not type command payloads as arbitrary shell strings.
- Do not type service path parameters as Docker container names.
- Do not erase the distinction between `overall.level`, `docker.state`, and `ros.level`.
