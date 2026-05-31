# Frontend Development Guidelines

These guidelines define the fixed stack and baseline conventions for the R2 management frontend.

## Stack

- Package manager/runtime: Bun.
- App framework: React + TypeScript + Vite.
- Styling: Tailwind CSS v4 through `@tailwindcss/vite`.
- UI primitives: shadcn/ui with the `new-york` style and lucide icons.
- State management: Jotai for operator shell and shared client state.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Active |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Active |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | Active |
| [State Management](./state-management.md) | Local state, global state, server state | Active |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Active |
| [Type Safety](./type-safety.md) | Type patterns, validation | Active |

## Pre-Development Checklist

Before changing frontend code:

1. Read the relevant guideline files in this directory.
2. Read `backend-docs/project-requirements.md`, `backend-docs/api.md`, and `backend-docs/architecture.md` when touching management workflows or API-facing UI.
3. Confirm the work does not add arbitrary shell input, Docker API exploration, Docker exec, arbitrary container names, arbitrary command strings, or direct ROS CLI access.
4. Search before changing shared paths, aliases, scripts, registries, or generated UI setup.
5. Run `bun run typecheck`, `bun run build`, and `bun run lint` when linting is configured.

## shadcn/ui Rule

Use `bunx shadcn@latest ...` when adding or updating shadcn/ui generated files. Do not hand-write generated files under `src/components/ui`; edit wrapper/application components instead unless the shadcn CLI output itself is being regenerated.

## Language

All frontend guideline documentation should be written in English.
