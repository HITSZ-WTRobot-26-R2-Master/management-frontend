# Frontend Stack Convention and App Scaffold

## Goal

Establish the Management Frontend application foundation and persist the fixed frontend stack conventions so future agents build on the same baseline.

## Background

The management frontend is the operator UI for the Rust Rocket management backend described in `backend-docs/`. The repository currently contains Trellis metadata and backend integration documentation, but no frontend app scaffold. This task creates the React app foundation only; later tasks implement API contracts, operations UI, service details, commands, realtime events, and final test polish.

## Required Stack

- Bun as package manager/runtime.
- React + TypeScript + Vite.
- Tailwind CSS v4.
- shadcn/ui.
- Jotai.
- shadcn components must be installed/generated with `bunx shadcn@latest ...` when possible.
- Agents must not hand-write generated shadcn files under `components/ui`.

## Scope

- Update Trellis frontend specs to record the fixed stack and generated shadcn rule.
- Add a stable note outside the Trellis-managed block in `AGENTS.md` if useful for future agents.
- Scaffold a React TypeScript Vite app runnable with Bun.
- Initialize Tailwind v4 and shadcn/ui configuration.
- Create the basic source tree, entry point, global styles, and an empty management UI shell.
- Add scripts:
  - `bun run dev`
  - `bun run build`
  - `bun run typecheck`
  - `bun run lint` if linting is configured in this task.

## Acceptance Criteria

- `bun run dev` can start the app.
- `bun run build` passes.
- `bun run typecheck` passes.
- shadcn is initialized/configured through the CLI path where possible, and generated `components/ui` files are not hand-written by the agent.
- Technical stack, directory structure, state management direction, quality expectations, type-safety expectations, and the shadcn generation rule are persisted in `.trellis/spec/frontend/`.
- The initial UI is an operations dashboard shell, not a marketing or landing page.

## Safety Boundary

This task must not add UI or client capability for:

- arbitrary shell command input,
- Docker API exploration,
- Docker exec,
- arbitrary container name input,
- arbitrary command string input,
- ROS CLI bypass.

## Out of Scope

- Backend DTOs and API client implementation.
- Authentication settings UI.
- Service overview data loading.
- Service detail, logs, stats, restart.
- Typed commands UI.
- WebSocket events.
- Full test suite.

## Verification

Run and report:

- `bun run typecheck`
- `bun run build`
- `bun run lint` if configured

If dependency installation or shadcn initialization requires network access and cannot complete under sandbox restrictions, report the blocked command and exact reason.
