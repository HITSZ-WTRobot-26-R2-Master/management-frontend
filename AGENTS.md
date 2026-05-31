<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Frontend Stack

This management frontend uses Bun, React, TypeScript, Vite, Tailwind CSS v4,
shadcn/ui, and Jotai. Generate shadcn/ui files with `bunx shadcn@latest ...`
when adding UI primitives; do not hand-write generated files under
`src/components/ui`.

Quality gates are Bun scripts:

- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run test`

Tests use Bun's built-in test runner under `tests/` for focused pure-logic
coverage. Keep management API DTO field names in backend snake_case, use
logical `service_name` values for service paths, and preserve the documented
management safety boundary: no arbitrary shell command UI, Docker exec/API
explorer, arbitrary container names, arbitrary command strings, direct ROS CLI,
or arbitrary JSON payload editors.

User-facing frontend UI copy must be Simplified Chinese by default. Keep code
identifiers, backend DTO fields, API paths, enum values, service names, command
names, package metadata, and generated/tool output in their required technical
forms unless a display formatter explicitly translates them for operators.

Frontend agents may use `$playwright-cli` for browser debugging, UI regression
checks, request inspection, screenshots, and user-visible workflow validation.
When backend behavior is required for verification, ask the main agent or user
to ensure the backend service is running; do not assume the frontend agent can
deploy the backend.

When frontend debugging indicates a probable backend issue or API contract
drift, coordinate with backend developers through the shared `.handoff/`
directory using the `$fullstack-handoff` workflow. Create frontend-to-backend
`issue`, `request`, or `question` items in `.handoff/inbox/`, preserve observed
requests/responses and frontend impact in the item body, and let the receiver
move work through `accepted/`, `needs-info/`, and `ready-for-verify/`.
Frontend-side defensive handling must stay separate from backend issue
resolution. Do not create new backend coordination notes under
`backend-docs/issues/`; existing notes should be migrated into `.handoff/`.
