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
