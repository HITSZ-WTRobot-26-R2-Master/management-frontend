# Directory Structure

Frontend code lives under `src/` and uses the `@/*` import alias defined in
`vite.config.ts`, `tsconfig.app.json`, and root `tsconfig.json` so Vite,
TypeScript, and Bun tests resolve the same paths.

## Current Layout

```text
src/
├── app/                  # Top-level application composition
├── components/
│   ├── management/       # Management-domain UI components
│   └── ui/               # shadcn/ui generated primitives, when generated
├── data/                 # Static preview data used before API integration
├── hooks/                # Shared React hooks, when introduced
├── lib/                  # Framework-neutral utilities
├── state/                # Jotai atoms and derived state
├── types/                # Frontend TypeScript models
├── main.tsx              # React root and providers
├── styles.css            # Tailwind v4 theme and global styles
└── vite-env.d.ts         # Vite client type declarations

tests/
└── *.test.ts             # Bun unit tests for pure management logic
```

## Module Organization

- Keep route-level or screen-level composition in `src/app/`.
- Keep reusable domain components in `src/components/management/`.
- Keep shared utilities in `src/lib/`; avoid mixing API calls or React state into utility modules.
- Put framework-neutral event reducers, confirmation helpers, status
  presentation helpers, and API parsing helpers in `src/lib/` when they need
  focused tests.
- Keep Jotai atoms in `src/state/`, grouped by feature or shell concern.
- Keep API-facing and shared model types in `src/types/`.
- Keep Bun unit tests in `tests/`; test pure helpers instead of mounting the
  full dashboard for logic-only coverage.

## Naming Conventions

- Use PascalCase for React component files and exported component names.
- Use kebab-case for non-component module filenames such as `operator-shell.ts`.
- Use backend field names exactly for backend DTO-shaped data, including `snake_case` fields such as `service_name` and `risk_level`.
- Prefer `@/` imports for code under `src/` instead of deep relative paths.

## Boundaries

The frontend must remain an operations dashboard for registered management backend resources. Do not add directories or modules for generic host administration, arbitrary Docker exploration, arbitrary shell execution, or direct ROS CLI control.
