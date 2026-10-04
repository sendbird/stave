# Code Organization

Start with `AGENTS.md`, then use `entrypoints.md` to find the relevant owner.
Follow `contracts.md` only when the change crosses a process or provider
boundary. File size alone does not determine ownership; preserve the existing
behavior and the full contract when moving logic. Keep a cohesive component
together when a move would only add a hop for local presentation helpers or
would require threading shared state through new props.

For a behavior trace, start at the owner in the matching row, then follow the
producer, contract, and consumer that actually participate. Read the listed
tests for that boundary first; expand to adjacent tests when the change reaches
them.

| Domain                           | Owner and boundary                                                                                                                                                                                                                                  | Focused tests to start with                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation send                | `src/store/app-store-send-user-message.ts` owns the send action; `src/store/app.store.ts` wires it into Zustand                                                                                                                                     | `tests/failed-send-recovery.test.ts`, `tests/task-stream-switch-regression.test.ts`, `tests/provider-request-sanitization.test.ts`                 |
| Task source context              | `src/lib/pr-context.ts` owns PR attachment/provenance rules; task attachment producers feed `src/store/app-store-send-user-message.ts` through task `sourceContexts`; `src/lib/task-context/turn-scoped-context.ts` keeps agent-run/wake-up/project turn context off them                                                                                 | `tests/pr-context.test.ts` for rules; `tests/pr-context-ipc-contract.test.ts` for the bridge                                                     |
| Composer                         | `src/components/session/ChatInput.tsx` owns task state; `src/components/session/ChatInputComposer.tsx` owns controls and composition; `chat-input.utils.ts` holds shared decisions                                                                  | `tests/chat-input.runtime.test.ts`, `tests/chat-input-utils.test.ts`; `tests/e2e-electron/composer-interaction.electron.e2e.ts` covers interaction |
| IPC provider options             | `electron/main/ipc/provider-runtime-schemas.ts` owns provider IDs and runtime options; `schemas.ts` exports the public entrypoint                                                                                                                   | `tests/ipc-schemas.test.ts`, `tests/provider-runtime-contracts.test.ts`                                                                            |
| IPC conversation                 | `electron/main/ipc/provider-conversation-schemas.ts` owns turn payload validation; `schemas.ts` exports `StreamTurnArgsSchema`                                                                                                                      | `tests/ipc-schemas.test.ts`                                                                                                                        |
| Claude permissions and questions | `electron/providers/claude-permission-policy.ts` owns permission decisions; `claude-user-input.ts` maps questions and answers; `claude-sdk-runtime.ts` orchestrates the turn                                                                        | `tests/claude-sdk-runtime.test.ts`                                                                                                                 |
| Codex settings snapshot          | `electron/providers/codex-app-server-snapshot.ts` collects settings and model catalog data; `codex-app-server-runtime.ts` keeps the public facade and turn lifecycle                                                                                | `tests/codex-app-server-snapshot.test.ts`, `tests/codex-app-server-runtime.test.ts`                                                                |
| Notification persistence         | `electron/persistence/notification-store.ts` owns notification SQL and cleanup; `sqlite-store.ts` delegates through its persistence facade                                                                                                          | `tests/notification-store.test.ts` (direct SQL behavior)                                                                                           |
| Settings content                 | `src/components/layout/settings-dialog-sections.tsx` dispatches to section modules such as `src/components/layout/settings-sections/settings-dialog-chat-section.tsx`; `src/components/layout/settings-dialog.shared.tsx` holds shared presentation | `tests/settings-controls-a11y.test.tsx` (shared controls), `tests/custom-theme.test.ts` (theme data); section rendering needs separate validation  |
| Workspace Information            | `src/components/layout/WorkspaceInformationPanel.tsx` owns section state; `workspace-information-link-rows.tsx`, `workspace-information-custom-fields.tsx`, and `workspace-information-notes.tsx` own their visible content                         | `tests/workspace-information.test.ts` covers data operations; section rendering needs separate validation                                          |
| Repository/workspace sidebar        | `src/components/layout/RepositoryWorkspaceSidebar.tsx` owns shell state and selection; `workspace-sidebar-rows.tsx` owns row presentation and local behavior; `RepositoryWorkspaceSidebar.utils.ts` holds pure decisions                                  | `tests/repository-workspace-sidebar.test.ts` covers utilities; `tests/e2e/sidebar-work-queue-lanes.e2e.ts` covers rendered lanes                      |

Additional focused owners:

Optional provider discovery lives in `electron/providers/optional-provider-tooling.ts`;
`src/lib/providers/provider-readiness-store.ts` supplies Tooling, catalogs, and
usage surfaces. `src/store/app-store-provider-actions.ts` owns availability and
usage refresh actions. Focused checks are `tests/optional-provider-tooling.test.ts`,
`tests/provider-readiness.test.ts`, and `tests/kiro-usage-connection.test.ts`.

The status bar usage strip is composed in `src/components/layout/StatusBar.tsx`;
`status-bar-usage-strip.utils.ts` holds its pure parts (ring and clock geometry,
reset formatting, hint copy, and the width estimate behind the container-query
breakpoint), `StatusBarUsageStripItems.tsx` and `StatusBarUsageDetails.tsx` render
the entries and the popover body. Tokens and cost come from
`electron/persistence/turn-spend-store.ts` through `persistence:summarize-turn-spend`
(`src/lib/providers/turn-spend.ts` owns the arguments schema and local period
bounds; the store owns which tokens count).
`src/store/rate-limits-account-reset.ts` resets one provider's usage on an
account switch and tracks reads in flight. Focused checks are
`tests/status-bar-usage-strip.test.ts`, `tests/turn-spend.test.ts`,
`tests/rate-limits-account-reset.test.ts`, and `tests/status-bar-usage-utils.test.ts`.
The bar's shrink order (tokens, then usage detail, then the Resource Manager
label, then clipping the strip's end) is `status-bar-shrink.ts`, with its
container-query rules in `status-bar-shrink.styles.ts`;
`tests/status-bar-shrink.test.ts` checks that each step gives way once and in
order.

Provider account registration uses `src/lib/providers/provider-accounts.ts` for
shared types and strict schemas. `electron/provider-accounts/registry.ts` owns
nonsecret metadata and directory resolution; `environment.ts` applies native
profile environments. `electron/main/ipc/provider-accounts.ts` owns validated
CRUD and login requests, and `electron/host-service/provider-account-login.ts`
launches isolated login PTYs through the terminal runtime. Focused checks are
`tests/provider-account-registry.test.ts`,
`tests/provider-account-environment.test.ts`, and
`tests/provider-account-ipc.test.ts`.

API connections (one gateway key for Claude Code and Codex) use
`src/lib/providers/api-connections.ts` for the record, IPC channels, presets,
and error mapping, and `api-connection-catalog.ts` / `api-connection-models.ts`
for discovery filtering and picker rows. The registry stores them next to
accounts (`electron/provider-accounts/api-connection-records.ts`) and lists one
entry per runtime they serve. `electron/provider-accounts/gateway-runtime.ts`
is the Claude adapter and per-runtime credential scope;
`electron/providers/codex-api-connection.ts` is the Codex adapter.
`electron/main/api-connection-check.ts` owns discovery and the key check, and
`electron/main/ipc/api-connections.ts` the validated handlers. Focused checks
are `tests/api-connections.test.ts`, `tests/claude-gateway.test.ts`, and
`tests/api-connection-migration.test.ts`.

Sign-in identity and shared setup add channels without changing the registry
file. `src/lib/providers/provider-account-identity.ts` and
`provider-account-setup.ts` hold the schemas, channel names and the one-line
copy helpers; `provider-account-setup-plan.ts` is the table of what is linked,
copied or skipped. `electron/provider-accounts/identity-parse.ts` holds the
pure parsers (the only code that decodes a credential file's claims),
`identity.ts` the probe and its cache, and `setup-sharing.ts` the link, copy and
removal. `electron/main/ipc/provider-account-identity.ts` and
`provider-account-setup.ts` register the handlers, and the renderer reads
identity through `src/lib/providers/use-provider-account-identity.ts`. Focused
checks are `tests/provider-account-identity-parse.test.ts`,
`tests/provider-account-identity.test.ts`,
`tests/provider-account-setup-sharing.test.ts`, and
`tests/provider-account-identity-ipc.test.ts`.

| Domain | Owner and boundary | Focused tests to start with |
| --- | --- | --- |
| Review tasks | `src/lib/reviews/review-task.ts` holds the settings shape, prompt, delegation arguments and shelf selection; `src/store/review-task-runtime.ts` starts the read-only delegation and attaches the finished review to the draft; `src/components/session/use-review-task-controls.ts` feeds the composer's `local-change-review-dialog.tsx`; `composer-shelf/use-shelf-reviews.ts` and `ShelfReviews.tsx` show running and finished reviews; `settings-sections/settings-dialog-review-cards.tsx` edits the defaults; View reuses `ActivityDetailDialog` through `buildReviewExchange`; `electron/host-service/review-turn-notification.ts` addresses a finished review's notification to the reviewed task; `src/components/open-attached-task.ts` opens a chip's task | `tests/review-task.test.ts`, `tests/review-task-runtime.test.ts`, `tests/shelf-reviews-render.test.tsx`, `tests/review-turn-notification.test.ts`, `tests/composer-shelf.test.ts`, `tests/delegated-task-receipts.test.ts`, `tests/delegated-attention.test.ts` |
| Claude SDK events | `electron/providers/claude-event-mapping.ts` translates SDK events using supplied tracker/plan state; `claude-sdk-runtime.ts` owns turn state and rate-limit observation side effects; `src/lib/session/provider-event-replay.ts` and `src/lib/work-graph/work-graph-reducer.ts` consume normalized events and correlate tool results with earlier tool calls | `tests/claude-sdk-runtime.test.ts`, `tests/claude-rate-limits-observation.test.ts`; inspect replay or work-graph tests when their state changes |
| Codex server requests | `electron/providers/codex-server-request-mapping.ts` maps approval/question presentation and response metadata; `codex-app-server-runtime.ts` owns filtering, pending requests, timers, auth, and responses; `codex-ensure-thread.ts` starts or resumes the thread and retries once on GPT-6 Sol when GPT-6.1 Sol is unavailable | `tests/codex-server-request-mapping.test.ts`, `tests/codex-app-server-runtime.test.ts`, `tests/codex-ensure-thread.test.ts` |
| Codex turn notification ownership | `electron/providers/codex-turn-notification-gate.ts` buffers early notifications until the acknowledged turn is known; the runtime replays matching events and resolves child-thread ownership | `tests/codex-turn-notification-gate.test.ts`, `tests/codex-app-server-mcp-lifecycle.test.ts`; opt-in `tests/e2e-electron/provider-live-smoke.electron.e2e.ts` covers cancel/retry/resume |
| Codex interrupted turns | `electron/providers/codex-orphan-turn-cleanup.ts` waits for native completion before same-thread retry and quarantines unresolved threads; `codex-app-server-pending-request.ts` releases abandoned local RPC waits | `tests/codex-orphan-turn-cleanup.test.ts`, `tests/codex-app-server-pending-request.test.ts`, `tests/codex-app-server-mcp-lifecycle.test.ts`; `tests/e2e-electron/codex-interrupted-start.electron.e2e.ts` covers injected failure recovery in the built app |
| Codex settings UI | `src/components/layout/settings-dialog-codex-section.tsx` owns requests, selection, drafts, and mutations; `codex-settings/` contains the five tab views and shared presentation | `tests/e2e/codex-settings-refactor.e2e.ts` exercises the parent against a mocked provider bridge |
| PR creation UI | `src/components/layout/TopBarOpenPR.tsx` owns the async flow and cancellation; `pull-request/CreatePullRequestDialog.tsx` and `create-pr-dialog-panels.tsx` render the form and review/verification feedback | `tests/topbar-open-pr.utils.test.ts` covers decisions; `tests/e2e/create-pr-dialog.e2e.ts` exercises the parent against a mocked SCM bridge |
| Local MCP Information | `electron/host-service/local-mcp-workspace-information.ts` owns validation and transformations; `local-mcp-runtime.ts` retains resident state, persistence, and notifications | `tests/local-mcp-workspace-information.test.ts`, `tests/local-mcp-runtime-run-task.test.ts` |
| Agent runs                         | `src/lib/agent-runs/policy.ts` decides; `electron/host-service/supervision/agent-run-runtime.ts` performs turns and `agent-run-actions.ts` performs Stave actions; `src/lib/agent-runs/agent-run-view.ts` projects what every surface shows; `src/lib/agent-runs/usage.ts` sums what the agent run's turns spent; `src/lib/agent-runs/insights.ts` aggregates ended runs for the Results page (`src/components/results/`) | `tests/agent-run-policy.test.ts`, `tests/agent-run-runtime.test.ts`, `tests/agent-run-actions.test.ts`, `tests/agent-run-scenarios.test.ts`, `tests/agent-run-usage.test.ts`, `tests/agent-run-insights.test.ts`, `tests/results-view.test.tsx` |
| Work-state vocabulary            | `src/components/ads/components/state-vocabulary.ts` maps each state to one glyph, tone and word; `StateIcon`, `StatusDot`, `agent-state.ts`, Fleet cards, `StageStatusIcon` and agent-run labels read it | `tests/state-vocabulary.test.ts` |
| Agent runs                       | `src/lib/agent-runs/agent-run.ts` builds an Agent-mode prompt's run plan from the agent's workflow (or one implicit Work stage), decides whether a send starts a run and when a run ends without a report; `src/store/agent-run-send.ts` starts and stops runs from the composer; `src/lib/routing/agent-run-route.ts` routes every host-started run turn (pin > the agent's fixed model > Stave Auto with the agent's task class) over the shared decision core in `src/lib/routing/auto-routing.ts`, wired by `electron/host-service/supervision/agent-run-route-host.ts`; `src/lib/agent-runs/agent-run-status.ts` names a run's state, Done when lines and result, and `src/components/agent-runs/AgentRun*.tsx` render its status line, Result card and Progress view in place of the legacy run views | `tests/agent-run.test.ts`, `tests/agent-run-send.test.ts`, `tests/agent-run-route.test.ts`, `tests/agent-run-status.test.ts`, `tests/agent-run-ui.test.tsx`, `tests/agent-run-runtime.test.ts` |
| Composer shelf                   | `src/components/session/composer-shelf/` is the surface over the prompt input: `ComposerShelf.tsx` picks the rows (the run line and the queue), `TurnRunLine.tsx` draws a turn's line and `ShelfRunLine.tsx` the shared layout the legacy run and agent run lines also use, `ShelfQueue.tsx` the queue line and its list; `composer-shelf.utils.ts` holds the pure decisions (rows, tones, where details open, queue actions) and `src/store/composer-shelf-store.ts` the per-run details toggle shared with the floating card | `tests/composer-shelf.test.ts`, `tests/composer-shelf-render.test.tsx`, `tests/turn-activity-render.test.tsx`, `tests/agent-run-ui.test.tsx`, `tests/agent-run-bar.test.tsx` |
| Task panel                       | `src/lib/right-rail-panels.ts` names the rail panels and the Task panel's tabs; `src/components/session/TaskPanel.tsx` hosts Activity, Progress, Subagents (`SubagentsSection.tsx`) and Results over the existing turn activity, agent run, flow, subagent and result views, with its tabs in the rail's one panel bar (`RightRailPanelHeader`), each tab's mark chosen by `task-panel-marks.ts`, and `TaskPanelEmpty.tsx` when no task is open; `src/store/layout.utils.ts` keeps the selected tab; Results' Show the turn is `RunTurnDialog.tsx` over `src/lib/reviews/run-turn.ts`, and quoted answers use `src/components/ai-elements/collapsible-response.tsx` | `tests/task-panel.test.tsx`, `tests/task-panel-marks.test.ts`, `tests/layout-utils.test.ts`, `tests/task-result-reviews-render.test.tsx`, `tests/run-turn.test.ts`, `tests/collapsible-response.test.tsx` |
| Subagents                        | `electron/providers/caller-grants.ts` mints the per-turn caller grant and `electron/main/stave-mcp-caller.ts` resolves it for the Local MCP subagent tools; `src/lib/agents/native-subagents.ts` compiles a lead agent's in-turn subagents; `electron/main/runs/delegated-task-coordinator.ts` owns durable subagents, their worktree default, `wait` and recorded answers; `src/lib/task-context/delegated-task-receipts.ts` builds Subagent results | `tests/caller-grants.test.ts`, `tests/delegated-task-coordinator.test.ts`, `tests/delegated-task-receipts.test.ts`, `tests/agent-runtime-options.test.ts` |
| Agent run surfaces                 | `src/components/agent-runs/` (bar, panel, sign-off, Fleet strip) over `src/store/agent-runs-store.ts` and `src/store/fleet-agent-runs-store.ts`; `StageTrack` draws a run's stages as one `DitherProgress` track, from `src/lib/agent-runs/stage-progress.ts` | `tests/agent-run-bar.test.tsx`, `tests/agent-run-panel.test.tsx`, `tests/stage-progress.test.tsx`, `tests/agent-run-start-consent.test.ts`, `tests/agent-run-start-at-stage.test.ts`, `tests/agent-run-fleet-attention.test.ts` |
| Agent workflows                  | `src/lib/agents/schema.ts` validates an agent's `workflow` with the stage schema in `src/lib/workflows/schema.ts`; `src/lib/agents/builtin-workflows.ts` holds the built-ins' stages; `src/lib/workflows/library.ts` edits stages and `src/components/agents/AgentWorkflowField.tsx` (over `src/components/workflows/StageList.tsx`) is the editor's Workflow section | `tests/workflow-library.test.ts`, `tests/agent-config.test.ts`, `tests/agent-builtins.test.ts` |
| Agents                           | `src/lib/agents/schema.ts` validates; `compile.ts` compiles a snapshot per role and provider; `library.ts` lists agents and edits custom ones; `import.ts` and `repository.ts` read repository agent files; Kickoff starts assigned work and `assign-runtime.ts` records it over `electron/persistence/agent-assignment-store.ts`; `src/components/agents/` is the Agents tab (its list is resized by `AgentsListResizeHandle.tsx` over the shared `src/components/layout/PanelResizeHandle.tsx`, which also sizes the repository sidebar and the right-hand panel, and its width is `agentsListWidth` in `src/store/layout.utils.ts`) and the flow view in the Task panel's Progress tab; `selector-choice.ts` plans what a choice in the composer's Models and Agents selector does (Chat, Agent mode, pin) and `src/components/ai-elements/agent-choice-actions.ts` applies it | `tests/agent-config.test.ts`, `tests/agent-import.test.ts`, `tests/agent-repository.test.ts`, `tests/agent-library.test.ts`, `tests/agent-assign.test.ts`, `tests/agent-boundaries.test.ts`, `tests/agent-flow-view.test.tsx`, `tests/agents-tab.test.tsx`, `tests/layout-utils.test.ts`, `tests/agent-selector-choice.test.ts`, `tests/agent-choice-actions.test.ts`, `tests/agent-model-selector.test.tsx`, `tests/e2e/agents.e2e.ts` |
| Project memory export (temporary) | `electron/persistence/legacy-project-memory-export.ts` writes each removed project's memories once to `<user data>/exports/project-memory/<project id>.md` on host start, called from `electron/host-service.ts`; an existing file is never rewritten. Temporary migration `project-memory-export` | `tests/legacy-project-memory-export.test.ts` |

For a structure inventory, run `node scripts/codebase-structure.mjs`. Use
`--ref HEAD` for a stable Git-tree baseline and `--json` for deterministic
per-file rows. It counts physical lines in selected tracked and non-ignored
untracked text files, separating declarations and generated files. Its listed
roots and extensions define the coverage; binary assets and lockfiles are
excluded. `bun run check:max-lines-ratchet` remains the enforcement gate.
