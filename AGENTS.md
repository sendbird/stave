# AGENTS.md

Project instructions for AI agents and maintainers working in the Stave repository.

## Scope

- Keep repository guidance public, self-contained, and English-only.
- Prefer repo-local instructions over user-home-specific conventions.
- Use Bun for install, test, and build commands. Use `bunx --bun` instead of `npx`.

## Product Constraints

Stave is an installable product. Do not bake author-specific machine state into code, docs, tests, or examples.

- Do not add personal absolute paths such as `/Users/<name>/...`.
- Do not assume private dotfile layouts such as `~/.claude/local` as product defaults.
- Prefer placeholders such as `<workspace>`, `<user-home>`, and `/tmp/...` in docs and test fixtures.
- If runtime behavior depends on a user-home lookup, keep it configurable and describe it generically.

## Git, PR, And Release Rules

- Use Conventional Commits for every commit.
- Keep PR titles in Conventional Commits form and keep the subject lowercase.
- For explicit PR requests, use `skills/stave-worktree-pr-flow/SKILL.md` when the runtime supports repo-local skills.
- For explicit release requests, use `skills/stave-release/SKILL.md` when the runtime supports repo-local skills.
- Ordinary commit or push requests must not change `package.json`, `CHANGELOG.md`, or semver tags unless the user explicitly asks for release work.
- Release tags use `vX.Y.Z`.
- Refresh `CHANGELOG.md` with `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s` unless the work is intentionally establishing a brand-new baseline release.

## Repository Map

- `src/`: renderer app, Zustand store, editor, chat surfaces, and client-side helpers
- `electron/`: Electron main process, preload bridge, provider runtimes, IPC handlers, persistence
- `server/`: browser-only dev bridge server
- `docs/`: end-user, developer, architecture, and provider documentation
- `tests/`: unit and integration coverage

High-signal files:

- `src/store/app.store.ts`: central Zustand store
- `electron/providers/claude-sdk-runtime.ts`: Claude runtime adapter
- `electron/providers/codex-sdk-runtime.ts`: Codex runtime adapter
- `src/types/window-api.d.ts`: renderer-to-main IPC contract
- `electron/preload.ts`: exposed renderer bridge

## UI And Theme Guardrails

Use `shadcn-ui` when the task adds or changes shadcn/ui components and the runtime supports that skill.

Any UI, layout, or visual change must verify the theme system. Required check files:

- `src/globals.css`
- `src/lib/themes/types.ts`
- `src/lib/themes/presets.ts`
- `src/lib/themes/builtin-themes.ts`
- `src/lib/themes/apply.ts`
- `src/lib/themes/validate.ts`
- `src/lib/themes/index.ts`
- `src/store/theme.utils.ts`
- `tests/custom-theme.test.ts`

Rules:

- Keep `src/globals.css` base tokens and `src/lib/themes/presets.ts` in sync.
- If you add or rename a theme token, update built-in themes and any Tailwind `@theme inline` mapping in the same change.
- If a UI change introduces a new semantic surface color, define it for light mode, dark mode, and every built-in theme.
- Do not treat UI work as complete until theme behavior has been checked explicitly.

## Provider And IPC Contract Guardrails

Treat provider runtime options, IPC payloads, and normalized provider events as multi-file contracts.

Required check files:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `src/lib/providers/schemas.ts`
- `src/types/window-api.d.ts`
- `electron/preload.ts`
- `electron/main/ipc/schemas.ts`
- call sites such as `src/store/app.store.ts`

Rules:

- Keep `NormalizedProviderEvent` and `NormalizedProviderEventSchema` in sync.
- When a provider payload changes, verify the full renderer -> preload -> IPC schema -> main -> runtime path.
- If a change is provider-specific, say so explicitly. Otherwise, check the sibling provider adapter for symmetry.
- For Codex runtime upgrades, review `docs/providers/codex-upgrade-checklist.md`.

## Terminal Surface Guardrails

Terminal work includes docked terminals, CLI session panels, PTY lifecycle, restore behavior, and terminal shell layout.

Required check files:

- `src/components/layout/useTerminalSessionManager.ts`
- `src/components/layout/useTerminalTabManager.ts`
- `src/components/layout/useTerminalInstance.ts`
- `src/components/layout/TerminalTabSurface.tsx`
- `src/components/layout/pty-session-surface.utils.ts`
- `src/components/layout/terminal-surface-styles.ts`
- `src/components/layout/TerminalDock.tsx`
- `src/components/layout/CliSessionPanel.tsx`
- `src/components/layout/app-shell.shortcuts.ts`
- `src/lib/terminal/types.ts`
- `src/store/workspace-session-state.ts`
- `src/store/app.store.ts`
- `electron/main/ipc/terminal.ts`
- `electron/host-service/terminal-runtime.ts`
- `src/types/window-api.d.ts`
- `tests/pty-session-surface.utils.test.ts`
- `tests/terminal-dock.utils.test.ts`
- `tests/terminal-session-slot-registry.test.ts`

Rules:

- Renderer unmount detaches a session; closing a tab closes it.
- Keep terminal DOM workarounds inside terminal-specific hooks, not shell components.
- Keep shell chrome separate from PTY lifecycle logic.
- Use shared slot-key helpers instead of hardcoded formats.

## Zustand And React Guardrails

Hot surfaces in this repository are sensitive to unstable selectors and long-lived effect mistakes.

- Do not return fresh objects, arrays, maps, sets, or fallback containers from Zustand selectors.
- Derive filtered or presentation-only collections outside the selector.
- Prefer row-local subscriptions over broad parent subscriptions on lists and tab surfaces.
- Treat `useEffect`, observers, timers, IPC listeners, and keep-alive callbacks as stale-closure risks by default.

Relevant docs:

- `docs/developer/zustand-selector-stability.md`
- `docs/developer/terminal-regression-prevention.md`
- `docs/developer/provider-session-stability.md`

## Workspace Handoff Convention

When handing follow-up work to a newly created Stave workspace:

- Write the handoff plan to `.stave/context/plans/<taskIdPrefix>_<timestamp>.md`.
- Leave only a short pointer such as `See plan: .stave/context/plans/<filename>.md` in workspace notes.
- Keep todos terse and point them back at the plan file.
- Do not copy the source workspace's notes, todos, or plan body verbatim into the target workspace.

## Validation

Use the smallest relevant check set for the change, then escalate when the scope is broad.

Common commands:

- `bun run typecheck`
- `bun test`
- `bun run build`
- `bun run build:desktop`
- `bun run build:pages`
- `bun run test:ci`
