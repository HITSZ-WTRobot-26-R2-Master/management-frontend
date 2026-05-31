# Final MVP Integration, UX Polish, Tests, and Documentation Sync

## Goal

Close the Management Frontend MVP by auditing safety boundaries, adding focused tests, polishing integration behavior, syncing documentation/specs with the implemented conventions, and running final quality gates.

## Background

Tasks 1-6 delivered the scaffold, backend contract/client/auth state, service overview, service detail/logs/stats/hard restart, typed commands, WebSocket events, recent activity, and REST fallback. This task verifies the MVP as a whole against `backend-docs/project-requirements.md` and `backend-docs/api.md`.

## Scope

- Perform a full safety boundary audit and confirm the frontend does not include:
  - arbitrary shell command input,
  - Docker API explorer,
  - Docker exec,
  - container create/delete,
  - image pull/build/push,
  - Compose editing,
  - arbitrary container name API call,
  - arbitrary command string input,
  - arbitrary JSON command payload editor,
  - ROS CLI bypass.
- Add focused high-value tests for:
  - API error parsing,
  - status severity mapping,
  - Docker running plus ROS agent unavailable => warning/agent issue,
  - command confirmation flow helpers or state,
  - WebSocket event reducer,
  - unknown event handling.
- Add a test script and dependency setup if needed and practical with Bun.
- Polish UX where needed:
  - loading/empty/error states,
  - compact dashboard layout,
  - readable logs,
  - accessible dialogs/forms/buttons,
  - responsive laptop/tablet layout,
  - no text overflow or incoherent overlap.
- Confirm docs/specs record actual conventions:
  - stack,
  - directory structure,
  - state management,
  - generated shadcn component rule,
  - backend-docs contract usage,
  - test command if added.
- Run final quality commands:
  - `bun run typecheck`,
  - `bun run build`,
  - `bun run lint`,
  - test command if added.

## Acceptance Criteria

- `backend-docs/project-requirements.md` MVP workflows are covered in the frontend:
  - service overview,
  - service detail,
  - logs,
  - stats,
  - controlled hard restart,
  - typed commands,
  - realtime updates with fallback.
- `backend-docs/api.md` API contract has corresponding frontend types/client methods/UI flows where needed.
- Safety boundary audit passes.
- Focused tests exist for the highest-value pure logic paths, or any missing test setup is explicitly justified.
- Build/typecheck/lint/tests pass or have a precise non-code blocker.
- Trellis frontend specs and project docs no longer describe placeholders for implemented conventions.

## Safety Boundary

This task must not add new execution surfaces. Any polish or tests must preserve all previous safety constraints.

## Verification

Run and report:

- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `bun run test` if a test script is added

Also report the safety audit search patterns and any residual risks.
