# Localize UI to Chinese

## Goal

Convert all user-visible frontend UI copy to Simplified Chinese and persist the convention so future UI work keeps Chinese as the default interface language.

## What I Already Know

- The user requested: "将 ui 全部调整为中文，并持久化该要求".
- The app is a Bun + React + TypeScript + Vite + Tailwind CSS v4 management frontend.
- Frontend guideline documentation itself should remain written in English.
- Backend DTO field names and service path identifiers must remain backend `snake_case` / logical `service_name` values.
- The management safety boundary must not be weakened while changing UI copy.

## Requirements

- Translate user-visible app UI text in `src/**` from English to Simplified Chinese.
- Preserve technical identifiers, backend DTO field names, API paths, enum values, and service names.
- Preserve management safety boundaries: do not add arbitrary shell command UI, Docker exec/API explorer, arbitrary container names, direct ROS CLI, or arbitrary JSON payload editors.
- Persist the convention in project guidance so future frontend UI copy defaults to Simplified Chinese.
- Keep spec documentation language in English while documenting the UI-language rule.

## Acceptance Criteria

- [x] User-visible labels, headings, empty states, status copy, confirmation copy, and action text in the frontend are in Simplified Chinese.
- [x] Automated tests and business logic expectations are updated where they assert display copy.
- [x] `AGENTS.md` and/or `.trellis/spec/frontend/*` records that frontend user-visible UI copy must be Simplified Chinese by default.
- [x] `bun run typecheck`, `bun run lint`, `bun run build`, and `bun run test` pass.

## Definition of Done

- Tests added or updated where behavior/display-copy expectations changed.
- Lint, typecheck, build, and tests pass.
- Persistent guidance updated for future agents.
- Changes stay scoped to localization and guidance.

## Out of Scope

- Full i18n framework or runtime language switching.
- Translating source code identifiers, backend API fields, enum values, package metadata, or generated tool output.
- Changing backend behavior or management command safety boundaries.

## Technical Notes

- Relevant specs:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
  - `.trellis/spec/frontend/type-safety.md`
- Likely impacted files:
  - `src/app/App.tsx`
  - `src/components/management/ManagementShell.tsx`
  - `src/lib/status-presentation.ts`
  - `src/lib/command-confirmation.ts`
  - Tests under `tests/`
