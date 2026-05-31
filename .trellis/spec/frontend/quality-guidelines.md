# Quality Guidelines

Frontend quality gates are Bun scripts in `package.json`.

## Required Commands

- `bun run dev` starts the Vite development server.
- `bun run build` runs TypeScript project build and Vite production build.
- `bun run typecheck` runs TypeScript project build with pretty output.
- `bun run lint` runs ESLint when linting is configured.
- `bun run test` runs focused Bun unit tests for pure management logic.

Use bounded non-interactive commands for verification in agent sessions. Do not leave a persistent dev server running.

## Forbidden Patterns

- Arbitrary shell command UI or arbitrary command string input.
- Docker API explorer, Docker exec, arbitrary container names, Compose editing, image management, or bind mount management.
- Direct ROS CLI controls or backend/agent bypasses.
- Hand-written generated shadcn/ui files under `src/components/ui`.
- API path construction from Docker container names.
- Collapsing `overall`, `docker`, and `ros` status into one boolean.
- Broad `any`, unchecked type assertions, or silent catch blocks around backend errors.

## Required Patterns

- Use Bun for dependency and script commands.
- Use React + TypeScript + Vite and Tailwind CSS v4.
- Use Jotai for shared operator shell state.
- Use backend logical `service_name` values for service paths.
- Use structured backend error `code` values for user-facing error branches.
- Preserve management safety boundaries in UI design and state shape.
- Keep initial pages functional dashboard views, not landing or marketing pages.
- Use `.handoff/` with the `$fullstack-handoff` workflow for frontend/backend
  coordination. Do not create new backend issue notes under
  `backend-docs/issues/`; migrate existing notes into handoff items.

## Testing Requirements

For the integrated MVP baseline, run:

```bash
bun run typecheck
bun run build
bun run lint
bun run test
```

Tests live under `tests/` and use Bun's built-in `bun:test` runner. Prefer
testing framework-neutral helpers in `src/lib/` for API error parsing, service
status presentation, WebSocket event reduction, and high-risk confirmation
behavior; do not introduce browser-heavy test dependencies for pure logic.

## Code Review Checklist

- Does the UI only operate on backend-registered services and visible commands?
- Are `overall`, Docker, and ROS states rendered separately?
- Are shadcn/ui generated files produced through the CLI?
- Do TypeScript, build, lint, and tests pass?
- Are backend docs and frontend specs updated when contracts or conventions change?
- If frontend debugging found backend issue or API drift, is there a
  frontend-to-backend item in `.handoff/inbox/`?
