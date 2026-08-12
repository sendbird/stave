## [0.14.5](https://github.com/sendbird/stave/compare/v0.14.4...v0.14.5) (2026-08-12)

### Features

* Let explicit interactive `@web` turns use the active provider's native browser integration, with connection status in Settings and Information while plan, unattended, and secondary turns remain fail-closed.
* Add restart-safe, cross-provider child-task delegation with parent-side steering, scheduled and completion heartbeats, and ghost-session protection.
* Show nested agent work in Turn Activity with docked, draggable floating, and right-rail placement modes.
* Add opt-in Martin workspace sync with context snapshots and a durable outbox for pull request, task, resource, and turn-summary events when server support is enabled.
* Attach selected pull request review threads and failed-CI excerpts as bounded external context, with individual removal and a clear-all action.
* Add a persisted sidebar Work queue with Action required, In progress, In review, and Idle lanes, plus clearer labels and a three-column Fleet board cap.

### Bug Fixes

* Improve provider and MCP startup reliability, apply managed-task permissions, reduce repeated prompt context, and fix checkpoint, model-shortcut, Lens-divider, branch-menu, sidebar-spacing, and public-doc link regressions.

### References

* [#345](https://github.com/sendbird/stave/pull/345), [#346](https://github.com/sendbird/stave/pull/346), [#347](https://github.com/sendbird/stave/pull/347), [#348](https://github.com/sendbird/stave/pull/348), [#349](https://github.com/sendbird/stave/pull/349), [#350](https://github.com/sendbird/stave/pull/350), [#351](https://github.com/sendbird/stave/pull/351), [#352](https://github.com/sendbird/stave/pull/352), [#353](https://github.com/sendbird/stave/pull/353), [#355](https://github.com/sendbird/stave/pull/355), [#356](https://github.com/sendbird/stave/pull/356), [#357](https://github.com/sendbird/stave/pull/357), [#358](https://github.com/sendbird/stave/pull/358), [#359](https://github.com/sendbird/stave/pull/359), [#360](https://github.com/sendbird/stave/pull/360), [#361](https://github.com/sendbird/stave/pull/361), [#362](https://github.com/sendbird/stave/pull/362), [#363](https://github.com/sendbird/stave/pull/363), [#364](https://github.com/sendbird/stave/pull/364), [#365](https://github.com/sendbird/stave/pull/365), [#366](https://github.com/sendbird/stave/pull/366), [#367](https://github.com/sendbird/stave/pull/367), [#368](https://github.com/sendbird/stave/pull/368), [#369](https://github.com/sendbird/stave/pull/369)

## [0.14.4](https://github.com/sendbird/stave/compare/v0.14.3...v0.14.4) (2026-08-06)

### Features

* Allow the active Lens page to play audio, capture microphone input, and select an audio output device, while continuing to reject camera, popup, unrelated, and stale-view permission requests.
* Add the macOS microphone usage description and audio-input entitlements so packaged builds can prompt for and use the microphone.
* Document the Lens media-permission behavior and cover it with focused policy and packaging tests.

### References

* [#341](https://github.com/sendbird/stave/pull/341)

## [0.14.3](https://github.com/sendbird/stave/compare/v0.14.2...v0.14.3) (2026-08-05)

### Features

* Add line-anchored inline diff comments with hover actions, persistent task-scoped threads, and support for added-file review surfaces.
* Let users hide low-urgency rows from the active workspaces list, persist those dismissals, and restore them from Settings.
* Surface project-level attention alerts for blocked or unreviewed workspace activity in the sidebar.
* Make Worker mode observable and recoverable with receipts for actual native delegation, resolved model and effort metadata, Codex child-thread activity, and one-time continuation for incomplete foreground workers.

### Bug Fixes

* Keep the conversation turn rail from intercepting text selection, links, and scrolling except on its visible tick controls, while revealing its backdrop only on hover or preview.
* Restrict Stave tool branding to managed namespaces and known bare tools so similarly named third-party tools retain their own identity.
* Bound Lens console and network event floods, summarize dropped traffic, and stop full CDP diagnostics when capture budgets are exceeded.
* Extend Advisor deadlines according to resolved effort and preserve Claude runtime diagnostics until a final SDK result is available.
* Restore provider turn liveness and stall recovery when renderer scheduling, interaction state, or persisted managed turns diverge from runtime activity.
* Deduplicate Claude MCP connector probes, wait for connector readiness before primary turns, and roll up connector status across providers.

### References

* [#330](https://github.com/sendbird/stave/pull/330), [#331](https://github.com/sendbird/stave/pull/331), [#332](https://github.com/sendbird/stave/pull/332), [#333](https://github.com/sendbird/stave/pull/333), [#334](https://github.com/sendbird/stave/pull/334), [#335](https://github.com/sendbird/stave/pull/335), [#336](https://github.com/sendbird/stave/pull/336), [#337](https://github.com/sendbird/stave/pull/337), [#338](https://github.com/sendbird/stave/pull/338), [#339](https://github.com/sendbird/stave/pull/339)

## [0.14.2](https://github.com/sendbird/stave/compare/v0.14.1...v0.14.2) (2026-08-05)

### Bug Fixes

* Restore startup for packaged desktop builds by avoiding a duplicate `require` declaration in the ESM main-process bundle.

### References

* [#328](https://github.com/sendbird/stave/pull/328)

## [0.14.1](https://github.com/sendbird/stave/compare/v0.14.0...v0.14.1) (2026-08-05)

### Features

* Add a persisted Chat setting to show or hide the conversation Turn Rail while preserving the existing visible default.
* Upgrade turn activity presentation with the `thinking-orbs` 0.2.0 lifecycle states for clearer connection, planning, agent, and work progress.

### Bug Fixes

* Snapshot the provider and model for each queued turn so changing the composer selection cannot retarget prompts already waiting to run.
* Harden Lens teardown across renderer reloads and session disposal by reconciling stale overlays, draining CDP work, bounding diagnostics and screenshots, and maintaining SQLite storage safely.
* Restore Claude usage reporting with account-aware keychain lookup, system CA support, a non-interactive CLI fallback, and parsers for current usage and reset formats.

### References

* [#320](https://github.com/sendbird/stave/pull/320), [#321](https://github.com/sendbird/stave/pull/321), [#322](https://github.com/sendbird/stave/pull/322), [#323](https://github.com/sendbird/stave/pull/323), [#324](https://github.com/sendbird/stave/pull/324), [#325](https://github.com/sendbird/stave/pull/325), [#326](https://github.com/sendbird/stave/pull/326)
## [0.14.0](https://github.com/sendbird/stave/compare/v0.13.7...v0.14.0) (2026-08-04)

### Features

* Add configurable Worker mode with composer controls, Settings, keyboard shortcuts, per-task persistence, and provider-specific profiles for Claude and Codex.
* Route Worker intents through strict IPC/runtime contracts and provider-native execution, with semantic re-resolution against the active primary model and installed runtime.

### Bug Fixes

* Improve Claude usage tracking for current limits responses, absolute and relative reset times, usage percentages, and stale OAuth credentials repaired through the CLI fallback.
* Prevent duplicate system trace headings by rendering only the remaining lines in expanded generic system-event details while preserving the specialized compaction surface.

### References

* [#316](https://github.com/sendbird/stave/pull/316), [#317](https://github.com/sendbird/stave/pull/317), [#318](https://github.com/sendbird/stave/pull/318)
## [0.13.7](https://github.com/sendbird/stave/compare/v0.13.6...v0.13.7) (2026-08-03)

### Features

* Refine assistant trace and tool presentation with calmer state-aware rendering, Stave-specific MCP identity, readable link chips, and an explicit provider-event UX catalog; suppress duplicate one-line system trace content.
* Add independently configurable attention sounds for AI questions and approvals, separate from task-completion sounds.
* Surface host-owned Advisor exchanges and primary tool activity live alongside renderer-started turns.

### Bug Fixes

* Keep snapshot diff tabs read-only and independent from working-tree polling, while adding revision-based conflict protection to live diff tabs.
* Resolve configured MCP credential environment variables from the login shell for Claude and Codex without exposing values to the renderer, model, transcript, or logs.
* Harden provider turns by dropping legacy persisted parts before strict IPC validation and restoring Claude automatic task-title inference.

### Refactors / Chores

* Add frontend CODEOWNERS and publish Advisor Interaction Map and Agent Message UX documentation and reference assets, including Pages deployment improvements.

### References

* [#304](https://github.com/sendbird/stave/pull/304), [#306](https://github.com/sendbird/stave/pull/306), [#307](https://github.com/sendbird/stave/pull/307), [#308](https://github.com/sendbird/stave/pull/308), [#309](https://github.com/sendbird/stave/pull/309), [#310](https://github.com/sendbird/stave/pull/310), [#311](https://github.com/sendbird/stave/pull/311), [#312](https://github.com/sendbird/stave/pull/312), [#313](https://github.com/sendbird/stave/pull/313), [#314](https://github.com/sendbird/stave/pull/314)

## [0.13.6](https://github.com/sendbird/stave/compare/v0.13.5...v0.13.6) (2026-08-03)

### Features

* Improve agent trace surfaces with reusable reasoning, thinking, tool-result, preview, and reduced-motion presentation patterns.

### Bug Fixes

* Keep long Ask User Question requests scrollable so their response actions remain reachable.
* Bound persistence, host-service, Lens diagnostics, and commit graph resource usage to reduce stuck loading, stale processes, and excessive memory pressure.
* Show closed-but-not-archived tasks in Task History with the correct Open or Restore behavior and preserve open-task state in workspace summaries.

### References

* [#300](https://github.com/sendbird/stave/pull/300), [#301](https://github.com/sendbird/stave/pull/301), [#302](https://github.com/sendbird/stave/pull/302), [#303](https://github.com/sendbird/stave/pull/303)

## [0.13.5](https://github.com/sendbird/stave/compare/v0.13.4...v0.13.5) (2026-08-03)

### Features

* Expand Fleet and composer workflows with workspace cards, a persistent attention rail, provider-neutral task controls, Advisor exchanges, and configurable composer controls.
* Add provider-native conversation history actions and capability-aware Claude/Codex runtime parity, including fork, rollback, rename, and safe fallbacks.
* Rebuild Commit graph as a persistent editor surface with filtering, search, paging, commit details, and readable branch and tag labels.
* Add reviewed MCP server management for Claude and Codex, including configuration CRUD, OAuth recovery, and per-server connection diagnostics.

### Bug Fixes

* Harden Lens tab teardown and diagnostics against stale traffic, WebContents lifecycle failures, and unbounded console/CDP overload; also preserve open task-pane messages and keep local change review dialogs scrollable.
* Make task-bound secrets available to Codex MCP servers through scoped primary-turn processes while keeping shared and secondary read-only processes secret-free.

### Refactors / Chores

* Add a production dependency license-compliance gate and refresh agent/provider guardrails, path checks, and runtime baseline documentation.

### References

* [#284](https://github.com/sendbird/stave/pull/284), [#285](https://github.com/sendbird/stave/pull/285), [#286](https://github.com/sendbird/stave/pull/286), [#287](https://github.com/sendbird/stave/pull/287), [#288](https://github.com/sendbird/stave/pull/288), [#289](https://github.com/sendbird/stave/pull/289), [#290](https://github.com/sendbird/stave/pull/290), [#291](https://github.com/sendbird/stave/pull/291), [#292](https://github.com/sendbird/stave/pull/292), [#293](https://github.com/sendbird/stave/pull/293), [#294](https://github.com/sendbird/stave/pull/294), [#295](https://github.com/sendbird/stave/pull/295), [#296](https://github.com/sendbird/stave/pull/296), [#297](https://github.com/sendbird/stave/pull/297), [#298](https://github.com/sendbird/stave/pull/298)
## [0.13.4](https://github.com/sendbird/stave/compare/v0.13.3...v0.13.4) (2026-07-31)

### Features

* Move the Git Graph entry point out of the Source Control panel into a dedicated right-rail button and command palette command.
* Rework git graph lane layout and edge rendering to vscode-git-graph-style geometry, confining bends to a single row near fork/merge points instead of long shallow curves spanning the whole edge.

### Bug Fixes

* Make task-bound secrets reach Codex MCP servers that authenticate through `bearer_token_env_var`, by running secret-bound primary turns in a disposable App Server process carrying the bound environment.
* Keep shared and secondary read-only Codex App Server processes secret-free and dispose the scoped process once the turn ends.
* Clarify the Settings and composer guidance for binding secrets to a task.

### References

* [#282](https://github.com/sendbird/stave/pull/282), [#284](https://github.com/sendbird/stave/pull/284)
## [0.13.3](https://github.com/sendbird/stave/compare/v0.13.2...v0.13.3) (2026-07-31)

### Features

* Bind vault secrets to tasks by environment-variable name and inject them only into agent shell processes, preserving overrides across Claude and Codex launches and thread resumes while keeping plaintext out of runtime options, prompts, transcripts, diagnostics, and logs.
* Add a `Fetch & checkout origin/main` action that fetches the remote default branch, guards dirty trees, detaches HEAD safely, and renders detached checkouts clearly across workspace surfaces.

### Bug Fixes

* Redesign the pending Ask User Question experience with accessible radio and checkbox controls, custom answers, explicit Continue and Decline actions, responsive spacing, and compact settled-state summaries.
* Scope unattended automation approvals to each run, isolating provider, Stave Local MCP, and Lens access and revoking the run's authorization when it ends.
* Keep active turns alive when the selected model changes during a conversation.
* Prevent Lens resize sash borders from overlapping adjacent surfaces.

### References

* [#275](https://github.com/sendbird/stave/pull/275), [#276](https://github.com/sendbird/stave/pull/276), [#278](https://github.com/sendbird/stave/pull/278), [#279](https://github.com/sendbird/stave/pull/279), [#280](https://github.com/sendbird/stave/pull/280), [#281](https://github.com/sendbird/stave/pull/281)
## [0.13.2](https://github.com/sendbird/stave/compare/v0.13.1...v0.13.2) (2026-07-29)

### Bug Fixes

* Stop the Stave host-service from leaking orphaned /dev/ptmx master file descriptors by releasing the pty master on teardown: the usage rate-limit CLI fallback now disposes its onData/onExit subscriptions and calls destroy() across every exit path, and the terminal runtime closes the session (running pty.destroy()) when a flow-paused child exits.

### References

* [#273](https://github.com/sendbird/stave/pull/273)
## [0.13.1](https://github.com/sendbird/stave/compare/v0.13.0...v0.13.1) (2026-07-29)

### Features

* Show the latest automation run's status, trigger, timing, result or error summary, and task or run-detail actions, hiding task navigation when no task was created.

### Bug Fixes

* Refresh stale workspace state before resolving notification deep links so tasks created in another Stave window open in the correct workspace.
* Route general web research through runtime web search and reserve Stave Lens for current-project UI validation or explicitly requested live page inspection, while keeping the unrelated bundled browser plugin disabled.
* Align unattended Automation provider behavior by auto-approving only Stave Local MCP tools, persisting the global provider timeout, and keeping isolated Codex Advisor threads gated.

### References

* [#267](https://github.com/sendbird/stave/pull/267), [#268](https://github.com/sendbird/stave/pull/268), [#269](https://github.com/sendbird/stave/pull/269), [#270](https://github.com/sendbird/stave/pull/270)
## [0.13.0](https://github.com/sendbird/stave/compare/v0.12.3...v0.13.0) (2026-07-28)

### Bug Fixes

* Automatically abort Claude and Codex turns that remain silent past the stall grace window, including backgrounded workspaces, and auto-decline unanswered Codex approvals and user-input requests.
* Keep completed Turn Activity rows in their keyed chronological positions and return the shelf to its natural height, removing completion-group flicker and blank reserved space.

### Refactors / Chores

* Split non-core App Store responsibilities and shared contracts into focused modules while preserving the existing orchestration and lowering the app-store max-lines ratchet.

### References

* [#260](https://github.com/sendbird/stave/pull/260), [#264](https://github.com/sendbird/stave/pull/264), [#265](https://github.com/sendbird/stave/pull/265)
## [0.12.3](https://github.com/sendbird/stave/compare/v0.12.2...v0.12.3) (2026-07-28)

### Features

* Replace the stacked Routines panel with a full-window Automation Center for managing automations and inspecting run history, including cadence presets, multi-day schedules, provider-aware permission modes, and model effort controls.
* Add an OS-encrypted global Secrets manager with explicit reveal and copy actions, plus per-row host editing for Lens saved accounts.

### Bug Fixes

* Preserve provider-native MCP servers by merging Claude and Codex global, project, and workspace configuration layers, refreshing sessions when resolved configuration changes while keeping Stave's authenticated server authoritative on collisions.
* Route managed-task approvals and user-input responses through the host runtime, add authoritative Stop and Take Over handling, and ignore late provider events after interruption.

### Refactors / Chores

* Refresh the README and landing page with the current Lens, Compare Runs, Local Change Review, Crane, and Fleet feature set, along with an updated hero screenshot.

### References

* [#256](https://github.com/sendbird/stave/pull/256), [#257](https://github.com/sendbird/stave/pull/257), [#258](https://github.com/sendbird/stave/pull/258), [#259](https://github.com/sendbird/stave/pull/259), [#261](https://github.com/sendbird/stave/pull/261), [#262](https://github.com/sendbird/stave/pull/262)

## [0.12.2](https://github.com/sendbird/stave/compare/v0.12.1...v0.12.2) (2026-07-27)

### Features

* Let Compare Runs and Local Change Review choose a model-specific reasoning effort, carry it into candidate, judge, and review turns, and show the selected effort in results.
* Expand Local Change Review guidance with UI and accessibility plus error-handling focus areas and descriptions for each review focus.

### Bug Fixes

* Stabilize the Turn Activity shelf while streamed content, completed work, and interaction cards update, preserving row order, height, and state-aware headlines.
* Use the nearest project's `.nvmrc` for integrated terminals, workspace scripts, Claude and Codex sessions, and browser development commands, including the resolved Node path and NVM variables.
* Let users dismiss notification-backed approval items in Fleet View so stale approvals no longer remain actionable after a session completes or is archived.

### Refactors / Chores

* Add shared model-effort and project Node environment helpers with focused regression coverage across Compare, Review, Turn Activity, provider launch, shell execution, and Fleet approval paths.
* Stabilize project-NVM validation by keeping the terminal runtime within the existing max-lines ratchet, making provider timeouts explicit in tests, and isolating executable discovery from login-shell state.

### References

* [#250](https://github.com/sendbird/stave/pull/250), [#251](https://github.com/sendbird/stave/pull/251), [#252](https://github.com/sendbird/stave/pull/252), [#253](https://github.com/sendbird/stave/pull/253), [#255](https://github.com/sendbird/stave/pull/255)
## [0.12.1](https://github.com/sendbird/stave/compare/v0.12.0...v0.12.1) (2026-07-27)

### Features

* Make Task Activity expanded and easier to scan by default, with richer tool, agent, progress, and severity details plus a Chat setting to opt out.
* Present classified Lens agent activity beside the active task without unexpectedly stealing navigation focus.

### Bug Fixes

* Render terminal cells at native and bold font weights so CJK text is legible and Latin bold output is visible.
* Persist outgoing workspace changes, keep empty task panes empty after restart, and explicitly delete archived workspace branches with verified failure feedback.
* Synchronize Crane host task turns with the renderer and carry approved model, reasoning effort, autonomy, and fast-mode settings into dispatches.
* Keep host-owned questions and approvals visible and answerable, clear orphaned Fleet attention counts, and let completed-task toasts open their originating task.
* Render Markdown frontmatter as structured editor preview content instead of treating it as ordinary document text.

### Refactors / Chores

* Normalize the Node 22 pin in `.nvmrc` to the workspace-standard `v22` notation.

### References

* [#237](https://github.com/sendbird/stave/pull/237), [#238](https://github.com/sendbird/stave/pull/238), [#239](https://github.com/sendbird/stave/pull/239), [#240](https://github.com/sendbird/stave/pull/240), [#241](https://github.com/sendbird/stave/pull/241), [#242](https://github.com/sendbird/stave/pull/242), [#243](https://github.com/sendbird/stave/pull/243), [#244](https://github.com/sendbird/stave/pull/244), [#245](https://github.com/sendbird/stave/pull/245), [#246](https://github.com/sendbird/stave/pull/246), [#247](https://github.com/sendbird/stave/pull/247), [#248](https://github.com/sendbird/stave/pull/248)
## [0.12.0](https://github.com/sendbird/stave/compare/v0.11.10...v0.12.0) (2026-07-27)

### Features

* Add Lens, Advisor, read-only Compare Judge runs, Fleet Needs me, and Crane workflows with local approval and bounded execution.
* Promote Claude Opus 5 and its 1M variant to the current Opus defaults, with Opus 4.8 fallback and persisted preset migration.
* Add anchored start times and weekdays for daily and weekly routines while preserving legacy routine history records.
* Migrate shared UI primitives to Base UI and refresh app-shell, compare-run, task-activity, and related surfaces.

### Bug Fixes

* Stabilize Lens hidden and visible sessions and bound mid-turn steering acknowledgement waits.
* Preserve task-specific chat scroll anchors and stick-to-bottom behavior across session and workspace switches.
* Prevent archived tasks from being resurrected by stale host-service workspace snapshots.
* Keep Local MCP endpoints and host-service requests recoverable with manifest refresh, retry, deadlines, and bounded shutdown cleanup.
* Make Crane dispatch and Fleet approval/result lifecycles task-authoritative and recoverable, including legacy managed-task takeover support.
* Correct Crane connector setup links and improve workspace icons, Create PR layout, Plans spacing, and Turn Activity layering.

### Refactors / Chores

* Split max-lines ratchet hotspots into cohesive modules and lower their baselines without changing public entry points or behavior.

### References

* [#220](https://github.com/sendbird/stave/pull/220), [#222](https://github.com/sendbird/stave/pull/222), [#223](https://github.com/sendbird/stave/pull/223), [#224](https://github.com/sendbird/stave/pull/224), [#225](https://github.com/sendbird/stave/pull/225), [#226](https://github.com/sendbird/stave/pull/226), [#227](https://github.com/sendbird/stave/pull/227), [#228](https://github.com/sendbird/stave/pull/228), [#229](https://github.com/sendbird/stave/pull/229), [#230](https://github.com/sendbird/stave/pull/230), [#231](https://github.com/sendbird/stave/pull/231), [#232](https://github.com/sendbird/stave/pull/232), [#233](https://github.com/sendbird/stave/pull/233), [#234](https://github.com/sendbird/stave/pull/234), [#235](https://github.com/sendbird/stave/pull/235)
## [0.11.10](https://github.com/sendbird/stave/compare/v0.11.9...v0.11.10) (2026-07-24)

### Features

* Support multiple hosts per Lens saved account with transparent vault migration and shared-host auto-fill handling.
* Show the effective model, effort, and fast-mode metadata for each assistant turn in the model chip.

### Bug Fixes

* Preserve UTF-8 input in PTY-spawned shells when Stave is launched without a locale environment.
* Restore the latest chat message and selected task surface after pane, workspace, or layout activation.
* Prevent Lens CDP calls from waiting on an approval prompt while approved-host settings are synchronizing.
* Restore model shortcut handling across the prompt input and chat input surfaces.
* Keep generated Create PR summaries grounded in the actual branch diff, commits, and tracked or untracked files.
* Improve macOS text legibility and add Geist and Inter font presets in Settings.

### References

* [#210](https://github.com/sendbird/stave/pull/210), [#211](https://github.com/sendbird/stave/pull/211), [#212](https://github.com/sendbird/stave/pull/212), [#213](https://github.com/sendbird/stave/pull/213), [#214](https://github.com/sendbird/stave/pull/214), [#215](https://github.com/sendbird/stave/pull/215), [#216](https://github.com/sendbird/stave/pull/216), [#217](https://github.com/sendbird/stave/pull/217), [#218](https://github.com/sendbird/stave/pull/218)
## [0.11.9](https://github.com/sendbird/stave/compare/v0.11.8...v0.11.9) (2026-07-24)

### Features

* Manage OS-encrypted Lens saved accounts through Local MCP CRUD tools while returning account metadata without passwords.
* Add Plan a feature, Fix an issue, and Review the code starting points that populate and focus the empty-task composer.

### Bug Fixes

* Redact nested passwords, tokens, and other sensitive values from Local MCP request logs while keeping credential mutations approval-gated.
* Keep the Kickoff dialog open while source resolution or workspace creation is busy, preserving the explicit resolution-cancel action.
* Refine Claude and Codex effort heatmap contrast with surface-based provider ramps and larger, brighter Thinking Orbs.

### References

* [#205](https://github.com/sendbird/stave/pull/205), [#206](https://github.com/sendbird/stave/pull/206), [#207](https://github.com/sendbird/stave/pull/207), [#208](https://github.com/sendbird/stave/pull/208)

## [0.11.8](https://github.com/sendbird/stave/compare/v0.11.7...v0.11.8) (2026-07-24)

### Features

* Open Task History directly from each workspace's kebab menu, including workspaces with no open tabs.
* Load archived tasks from live workspace state or persistence, and switch projects and workspaces before restoring a task from another workspace.
* Refresh provider effort heatmaps with branded Claude and Codex color ramps, animated Thinking Orbs, and a distinct Stave Auto cell.

### Bug Fixes

* Remove the legacy heatmap particle layers and respect reduced-motion preferences for effort indicators and preview transitions.

### References

* [#202](https://github.com/sendbird/stave/pull/202), [#203](https://github.com/sendbird/stave/pull/203)

## [0.11.7](https://github.com/sendbird/stave/compare/v0.11.6...v0.11.7) (2026-07-24)

### Features

* Add local Stave MCP tools to list, create, update, remove, enable, and run routines, plus manage Information attachments; managed routine configuration tools are auto-allowed for Claude while manual runs remain approval-gated.

### Bug Fixes

* Align Claude and Codex model-effort heatmaps with clearer provider color anchors, effort gradients, tooltips, keyboard navigation, responsive layout, and Auto selection behavior.

### Refactors / Chores

* Remove unused settings and dead thinking-phrase animation variants, while discarding removed legacy keys during rehydration and preserving the active Codex fast-mode migration.

### References

* [#198](https://github.com/sendbird/stave/pull/198), [#199](https://github.com/sendbird/stave/pull/199), [#200](https://github.com/sendbird/stave/pull/200)
## [0.11.6](https://github.com/sendbird/stave/compare/v0.11.5...v0.11.6) (2026-07-24)

### Bug Fixes

* Polish the combined model and effort heatmap selector with provider-specific controls, clearer previews, selected/highest-effort states, and narrow-viewport support.
* Preserve focus when opening the selector, improve keyboard and pointer feedback, and respect reduced-motion preferences.
* Enable grayscale font smoothing in the renderer for cleaner UI text on macOS and other supported platforms.

### References

* [#195](https://github.com/sendbird/stave/pull/195), [#196](https://github.com/sendbird/stave/pull/196)
## [0.11.5](https://github.com/sendbird/stave/compare/v0.11.4...v0.11.5) (2026-07-23)

### Features

* Replace separate model and effort controls with a combined Claude and Codex heatmap selector, including keyboard navigation, context-window, and fast-mode controls.
* Add a discoverable Compare Runs action to the composer and persist recent compare-run history across app restarts.
* Keep the active model picker focused on current-generation Claude and Codex models while retaining legacy names for history and migration compatibility.

### Bug Fixes

* Keep Claude AskUserQuestion prompts visible when option descriptions are omitted or options arrive as strings or `value` objects, and continue finding pending questions after later messages land.

### References

* [#191](https://github.com/sendbird/stave/pull/191), [#192](https://github.com/sendbird/stave/pull/192), [#193](https://github.com/sendbird/stave/pull/193)
## [0.11.4](https://github.com/sendbird/stave/compare/v0.11.3...v0.11.4) (2026-07-23)

### Features

* Render Figma, Jira, and Confluence links as compact service badges in chat messages and the prompt input, preserving useful service labels and raw URLs.
* Add scheduled repository routines with configurable provider settings, resource creation and attachment, manual execution, pause/resume controls, and one missed occurrence after app restart.
* Persist provider session cursors and send safe history deltas when switching back to a resumable native Claude or Codex session, falling back to full history when needed.

### Bug Fixes

* Prevent duplicate GitHub pull requests in the workspace Information panel by canonicalizing linked and current-branch identities and rejecting duplicate manual links.
* Bound Codex App Server JSON-RPC and MCP payloads, resynchronize after oversized lines, and reject affected pending responses instead of leaving sessions waiting indefinitely.
* Keep Lens CDP approvals app-wide, queued until the renderer is ready, normalized across host formats, and available when the related Lens tab is hidden or closed.

### Refactors / Chores

* Add regression coverage and documentation for service-link tokenization, scheduled routines, Lens CDP approvals, Codex transport bounds, and provider session cursor compatibility.

### References

* [#183](https://github.com/sendbird/stave/pull/183), [#184](https://github.com/sendbird/stave/pull/184), [#185](https://github.com/sendbird/stave/pull/185), [#186](https://github.com/sendbird/stave/pull/186), [#187](https://github.com/sendbird/stave/pull/187), [#188](https://github.com/sendbird/stave/pull/188), [#189](https://github.com/sendbird/stave/pull/189)

## [0.11.3](https://github.com/sendbird/stave/compare/v0.11.2...v0.11.3) (2026-07-23)

### Bug Fixes

* Restore Dockview tab context menus above pane content in custom themes by defining the missing overlay z-index token.
* Preserve the existing semantic context-menu colors while restoring the custom theme's overlay fallback.
* Wait for the Archive context-menu item to be visible in the last-active-task E2E flow before activating it.

### References

* [#181](https://github.com/sendbird/stave/pull/181)

## [0.11.2](https://github.com/sendbird/stave/compare/v0.11.1...v0.11.2) (2026-07-22)

### Bug Fixes

* Load the latest persisted task messages when activating an unloaded task pane, so restored or compacted panes show current conversation content instead of only the older-message backfill button.
* Retry latest task-message hydration when reselecting an active task with no resident messages, keeping pane activation reliable after persistence restores.
* Add persistence regression coverage for task-pane message hydration.

### References

* [#179](https://github.com/sendbird/stave/pull/179)

## [0.11.1](https://github.com/sendbird/stave/compare/v0.11.0...v0.11.1) (2026-07-22)

### Bug Fixes

* Preserve the active task chat surface when switching workspaces with terminal tabs open, preventing blank panes caused by transient Dockview focus changes.
* Fall back to an available non-terminal pane when persisted active-surface state points at a missing panel, and align pane tabs and context menus with Stave semantic theme tokens.
* Return normal command failures from the browser dev bridge when process spawning fails so clients can degrade gracefully.

### References

* [#177](https://github.com/sendbird/stave/pull/177)
## [0.11.0](https://github.com/sendbird/stave/compare/v0.10.7...v0.11.0) (2026-07-22)

### Features

* Add universal pane tabs for tasks, editors, terminals, CLI sessions, compare runs, and Lens sessions, with splits, persistence, and session-scoped state.
* Add OS-encrypted Lens saved accounts with multiple accounts per hostname, automatic field filling, and explicit MCP fill controls.
* Review local working-tree or branch changes before push with selectable provider/model overrides while preserving the active composer draft.

### Bug Fixes

* Keep background workspace turns' activity and stall tracking alive so queued follow-ups can continue after a workspace switch.
* Restore pasted Finder file attachments on Electron 32+ and prevent stale model-selector reopen events after composer remounts.
* Improve kickoff loading and first-task provider/model/effort setup, and skip automatic Information panel resource filling for default workspaces.

### References

* [#168](https://github.com/sendbird/stave/pull/168), [#169](https://github.com/sendbird/stave/pull/169), [#170](https://github.com/sendbird/stave/pull/170), [#171](https://github.com/sendbird/stave/pull/171), [#172](https://github.com/sendbird/stave/pull/172), [#173](https://github.com/sendbird/stave/pull/173), [#174](https://github.com/sendbird/stave/pull/174), [#175](https://github.com/sendbird/stave/pull/175)
## [0.10.7](https://github.com/sendbird/stave/compare/v0.10.6...v0.10.7) (2026-07-21)

### Features

* Add a source-aware workspace kickoff flow that classifies briefs, resolves proposals with provider fallback, creates branches, seeds first tasks, and carries linked resources into workspace context.
* Add configurable Information panel sections and per-project kickoff settings for branch naming, source, model, and prompt controls.

### Bug Fixes

* Remember Claude and Codex runtime preferences per selected model, including mode, effort, and fast-mode controls.
* Keep Claude subagent results inside the active Stave turn by forcing built-in Agent calls into the foreground.
* Let Codex `/compact` use native App Server compaction while preserving manual boundary events and summarized thread history.
* Prefer Stave Lens for Codex browser inspection by disabling the bundled browser plugin and adding explicit Lens guidance.
* Auto-detect and idempotently upsert Jira, GitHub PR, Confluence, Figma, Slack, Storybook, and Amplify resources from prompts.
* Display Claude Fable weekly limits in the status bar, and wrap long links and inline code tokens in chat messages.
* Remove the redundant task title bar while keeping Managed Task takeover in the task tab overflow menu.

### References

* [#158](https://github.com/sendbird/stave/pull/158), [#159](https://github.com/sendbird/stave/pull/159), [#160](https://github.com/sendbird/stave/pull/160), [#161](https://github.com/sendbird/stave/pull/161), [#162](https://github.com/sendbird/stave/pull/162), [#163](https://github.com/sendbird/stave/pull/163), [#165](https://github.com/sendbird/stave/pull/165), [#166](https://github.com/sendbird/stave/pull/166), [#167](https://github.com/sendbird/stave/pull/167)
## [0.10.6](https://github.com/sendbird/stave/compare/v0.10.5...v0.10.6) (2026-07-16)

### Features

* Add manual “Send now” dispatch for queued chat turns while idle or after a stalled turn, preserving composer drafts and preventing duplicate sends.
* Improve Fleet View triage with clickable task rows, filters, collapsible sections, keyboard navigation, and loaded-workspace attention status.
* Harden terminal and provider session reliability with bounded output flow control, PTY acknowledgements, bounded transcripts, restart snapshots, OSC 133 status, persistence hydration, and Codex checkpoint provenance.

### Bug Fixes

* Prevent concurrent in-app update helpers and archived worktree revival by coordinating installation locks, managed symlink cleanup, and archive tombstone reconciliation.
* Make Create PR safer with change-aware file selection, batch staging, repository merge-method settings, cached GitHub authentication, and retained PR URLs when auto-merge setup fails.
* Make skill autocomplete rank exact slugs first, including immediate Enter/Tab selection, and document that behavior.
* Make CI deterministic with isolated Bun test execution and reliability checks that prevent process-global mock leakage and catch structural regressions.

### References

* [#149](https://github.com/sendbird/stave/pull/149), [#150](https://github.com/sendbird/stave/pull/150), [#151](https://github.com/sendbird/stave/pull/151), [#152](https://github.com/sendbird/stave/pull/152), [#153](https://github.com/sendbird/stave/pull/153), [#154](https://github.com/sendbird/stave/pull/154), [#155](https://github.com/sendbird/stave/pull/155), [#156](https://github.com/sendbird/stave/pull/156)
## [0.10.5](https://github.com/sendbird/stave/compare/v0.10.4...v0.10.5) (2026-07-13)

### Bug Fixes

* Keep queued follow-up turns attached to their task-owned workspace when the user switches workspaces during asynchronous auto-routing.
* Restore direct Create PR with explicit staged-file selection, preflight review, workspace-safe async guards, configurable descriptions, and repository-aware auto-merge methods.
* Use a compact, left-aligned embedded layout for Notes markdown previews in the Information panel.
* Highlight selected Settings options with the existing primary action color for clearer radio-style controls.

### References

* [#144](https://github.com/sendbird/stave/pull/144), [#145](https://github.com/sendbird/stave/pull/145), [#146](https://github.com/sendbird/stave/pull/146), [#147](https://github.com/sendbird/stave/pull/147)
## [0.10.4](https://github.com/sendbird/stave/compare/v0.10.3...v0.10.4) (2026-07-13)

### Features

* Link an existing git worktree from the New Workspace dialog by entering or browsing to its path, including worktrees owned by another clone.
* Persist linked workspaces without duplicating them during discovery, and archive them safely by removing only Stave's symlink while preserving the external worktree and branch.
* Add the original Stave Score light theme and Stave Nocturne dark theme with complete core and extended token coverage.

### References

* [#141](https://github.com/sendbird/stave/pull/141), [#142](https://github.com/sendbird/stave/pull/142)
## [0.10.3](https://github.com/sendbird/stave/compare/v0.10.2...v0.10.3) (2026-07-13)

### Features

* Add persisted per-slot effort overrides to Alt+1..0 model shortcuts, scope choices to each provider and Codex model capability, and show configured effort in the keyboard shortcut reference.

### Bug Fixes

* Route Create PR through the active workspace's shared `ship` skill, removing renderer-owned draft orchestration and making the ready-PR plus auto-merge workflow workspace-safe.

### References

* [#138](https://github.com/sendbird/stave/pull/138), [#139](https://github.com/sendbird/stave/pull/139)
## [0.10.2](https://github.com/sendbird/stave/compare/v0.10.1...v0.10.2) (2026-07-10)

### Bug Fixes

* Refresh Claude and Codex MCP sessions only when their configuration changes, while deferring Codex restarts until active turns finish.
* Add read-only MCP server discovery in Settings → MCP without exposing secrets or command details to the renderer.
* Prevent the prompt composer from inserting an extra line break after a message is sent.

### References

* [#135](https://github.com/sendbird/stave/pull/135), [#136](https://github.com/sendbird/stave/pull/136)
## [0.10.1](https://github.com/sendbird/stave/compare/v0.10.0...v0.10.1) (2026-07-10)

### Bug Fixes

* Scope every Codex reasoning-effort picker (preset editor, chat-input cycle, settings default, providers-section help) to what the currently selected model actually supports, clamping to the nearest valid effort on model switch instead of always offering the full scale.
* Default Codex effort now prefers the model's own recommended default, falling back to `medium` only when unknown.
* Add the missing `max`/`ultra` reasoning-effort entries to the providers-section reasoning help list.
* Merge the Codex App Server's live `model/list` catalog with the static GPT-5.6 catalog so newer models stay selectable even against an older installed Codex binary.
* Fix the preset-edit popover in the preset bar closing itself immediately due to Radix's default focus-return stealing focus from the freshly opened editor.

### References

* [#133](https://github.com/sendbird/stave/pull/133)

## [0.10.0](https://github.com/sendbird/stave/compare/v0.9.1...v0.10.0) (2026-07-10)

### Features

* Adopt the GPT-5.6 model family for Codex: add `gpt-5.6-sol`/`gpt-5.6-terra`/`gpt-5.6-luna`, make `gpt-5.6-terra` the new Codex default (shortcuts, task presets, recommended selector), and extend `codexReasoningEffort` with `max`/`ultra` tiers; retire `gpt-5.4`/`gpt-5.4-mini`/`gpt-5.3-codex-spark` from the picker and switch the turn-summary light model default to `gpt-5.6-luna`.

### Bug Fixes

* Fix Claude usage reset time showing "unknown" when the OAuth endpoint returns `resets_at` as an ISO-8601 or numeric string instead of a JS number.
* Show the normal pointer cursor on sidebar project/workspace rows, keeping the grab cursor only during an active long-press drag.
* Align the project workspace count badge to the far right and keep row actions overlaid on hover/focus without reserving layout space.

### References

* [#128](https://github.com/sendbird/stave/pull/128), [#129](https://github.com/sendbird/stave/pull/129), [#130](https://github.com/sendbird/stave/pull/130), [#131](https://github.com/sendbird/stave/pull/131)
## [0.9.1](https://github.com/sendbird/stave/compare/v0.9.0...v0.9.1) (2026-07-09)

### Bug Fixes

* Restore the Information panel's horizontal content padding dropped by the long-press-drag change, and darken the sidebar background so it reads as a distinct layer from the GNB/chat panel across the default and built-in themes.
* Fix Settings cards stacking duplicate padding on top of the base card style, unify three hand-rolled selection-button grids into a shared toggle-chip control, and widen the Settings content column.
* Fix the status bar showing `—` for both Claude and Codex usage: map the credits-based `individualLimit` response shape for business-plan Codex accounts, probe `CLAUDE_CONFIG_DIR`-aware keychain/credential paths for Claude, and make the CLI `/usage` fallback parser more robust (strip ANSI escapes, wait for an idle prompt, raise the timeout); also swap the bar order so usage sits left of memory.

### References

* [#124](https://github.com/sendbird/stave/pull/124), [#125](https://github.com/sendbird/stave/pull/125), [#126](https://github.com/sendbird/stave/pull/126)

## [0.9.0](https://github.com/sendbird/stave/compare/v0.8.7...v0.9.0) (2026-07-09)

### Features

* Add a VSCode-style bottom status bar showing live Codex and Claude usage/rate-limit meters, polled every 60s; relocate the sidebar's memory/CPU popover into the bar as its first segment.
* Read Claude usage via the Claude Code CLI's own OAuth token (macOS Keychain, falling back to `~/.claude/.credentials.json`) with a hidden-CLI `/usage` fallback when the OAuth endpoint is unavailable — no separate API key needed.
* Replace the sidebar's dedicated "edit mode" reorder UI with press-and-hold drag directly on rows and section headers, applied to both the project/workspace sidebar and the Information panel's sections.
* Add `sidebarShowFleetView`, `sidebarShowActiveWorkspaces`, and `sidebarActiveWorkspaceLimit` settings to control sidebar display.
* Reorganize Settings into a searchable sidebar (command palette and Lens under Interface, provider sections under AI & Agents), standardize settings cards/fields, and move active-turn steering into Chat.

### Fixes

* Restore keyboard-accessible drag reordering via a shared `useLongPressSortableSensors()` hook, since removing the drag-handle buttons had left the pointer-only sensors with no accessible fallback.
* Guard the sidebar row's click-to-open and the Information panel section header's accordion toggle against firing right after a completed drag reorder.
* Skip the active-workspace status computation entirely when the "Active Workspaces" sidebar section is hidden, instead of only hiding it at render time.
* Mark Codex raw config as Advanced and remove an unused Rules section from Settings.

### References

* [#120](https://github.com/sendbird/stave/pull/120), [#121](https://github.com/sendbird/stave/pull/121), [#122](https://github.com/sendbird/stave/pull/122)

## [0.8.7](https://github.com/sendbird/stave/compare/v0.8.6...v0.8.7) (2026-07-08)

### Features

* Add a Settings toggle (Settings → Steer / Queue) as the primary on/off control for mid-turn steering, keeping the `STAVE_ENABLE_MID_TURN_STEERING` env var as a backward-compatible fallback; hide the steer option in chat input entirely when the setting is off.
* Add an `@lens` prompt mention that injects the live Lens browser state (current URL, page title, loading status) as retrieved context, with an `@info:browser` alias and a fallback message when the panel is closed or empty.
* Flatten the app shell to a Superset/Orca-style flat UI: remove glassmorphism app-wide, add a Fleet View entry and "Active workspaces" list above the project list, convert Settings into a full-screen surface, and extend the Information panel with an Amplify Link section, drag-to-reorder sections, markdown-rendered Notes, and a header-integrated Plans count/refresh.
* Add a "cover chat" display mode to Lens alongside the existing fullscreen mode.

### Fixes

* Redesign the Steer/Queue composer into a single morphing Send/Stop button (Codex-style), remove the floating "Adjust current work" secondary button and its dual-key tooltips, add Esc-to-stop while composing, and restyle queued-turn cards as floating hover-revealed cards.
* Interrupt the Claude provider turn as soon as `ExitPlanMode` is detected so a plan-mode turn always reaches a final `result`/`done` state instead of getting stuck "in progress".
* Stabilize the `@`-mention autocomplete palette so it only closes on outside pointer-down clicks, not transient focus changes, fixing autocomplete item clicks inside the portaled popover.

### References

* [#114](https://github.com/sendbird/stave/pull/114), [#115](https://github.com/sendbird/stave/pull/115), [#116](https://github.com/sendbird/stave/pull/116), [#117](https://github.com/sendbird/stave/pull/117), [#118](https://github.com/sendbird/stave/pull/118)

## [0.8.6](https://github.com/sendbird/stave/compare/v0.8.5...v0.8.6) (2026-07-07)

### Features

* Add explicit mid-turn steer controls so users can choose per message whether to queue a follow-up or inject it into the currently running turn, with a Settings option to swap the Enter/Tab mapping.
* Add token-budget guidance to injected Stave task awareness context, make Lens MCP reads cheaper by default with bounded HTML/log outputs, and document low-token Local MCP usage patterns.
* Improve the `stave-worktree-pr-flow` skill by reducing redundant guardrails and extracting PR/commit conventions for better progressive disclosure.

### Fixes

* Preserve pasted image MIME metadata through provider image contexts and stop transport compaction from sending empty image payload metadata.
* Fix preset settings behavior across the settings dialog, task preset editor, and app store.

### References

* [#109](https://github.com/sendbird/stave/pull/109), [#110](https://github.com/sendbird/stave/pull/110), [#111](https://github.com/sendbird/stave/pull/111), [#112](https://github.com/sendbird/stave/pull/112), [#18](https://github.com/sendbird/stave/pull/18)

## [0.8.5](https://github.com/sendbird/stave/compare/v0.8.3...v0.8.5) (2026-07-02)

### Features

* Replace the prompt textarea with a Lexical-backed editor that renders slash commands, skills, and Information references as inline chips.
* Add Information autocomplete via `@`, with support for section/item references included in provider context.
* Support chip stability across multiple insertions, Enter/Tab chip selection, Backspace chip deletion, and updated placeholder hint (`@ for Information`).

### Fixes

* Remove the accidental `packageManager` field that pinned the project to Yarn so the release build again follows the Bun dependency traversal path used by electron-builder.

### References

* [#104](https://github.com/sendbird/stave/pull/104), [#107](https://github.com/sendbird/stave/pull/107)

# Changelog

All notable changes to Stave are documented in this file.

## [0.8.3](https://github.com/sendbird/stave/compare/v0.8.2...v0.8.3) (2026-07-02)

### Fixes

* Add direct Settings navigation for Models and keep Auto routing model controls discoverable from the command palette.
* Move script editing into a dedicated Scripts settings section with reusable script manager tabs for actions, services, hooks, targets, environment values, and logs.
* Add command-palette actions for runnable workspace scripts and hooks, backed by the active workspace scripts runtime.
* Improve workspace script runtime state, origin handling, ANSI log rendering, and panel behavior for running, stopping, and inspecting scripts.
* Reduce terminal panel inset padding for both docked terminals and CLI session terminals.

### References

* [#100](https://github.com/sendbird/stave/pull/100), [#101](https://github.com/sendbird/stave/pull/101), [#102](https://github.com/sendbird/stave/pull/102)

## [0.8.2](https://github.com/sendbird/stave/compare/v0.8.1...v0.8.2) (2026-07-02)

### Features

* Add editable workspace labels in the project sidebar, including inline rename support for active workspaces.
* Allow optional labels when creating a workspace while preserving the underlying git branch name.
* Filter project workspaces by label or branch name.

### Fixes

* Constrain the New Workspace dialog to the viewport height and allow the form content to scroll when it grows taller than the screen.

### References

* [#97](https://github.com/sendbird/stave/pull/97), [#98](https://github.com/sendbird/stave/pull/98)

## [0.8.1](https://github.com/sendbird/stave/compare/v0.8.0...v0.8.1) (2026-07-02)

### Features

* Add Auto Routing with deterministic heuristics, optional Claude classification, provider stickiness, objective tuning, safety escalation, and eligible-model controls.
* Add a per-workspace settings dialog from workspace rows, grouping sync status and workspace scripts while simplifying the global Tooling settings section.
* Add Claude Sonnet 5, Claude Sonnet 5 (1M), and Claude Fable 5 to the model catalog while upgrading settings-scoped legacy Sonnet aliases.
* Preserve image attachments through prompt batch staging and provider context, with Lens visual comment screenshots gated by the image-context setting.

### Fixes

* Interrupt stalled provider turns when the user sends a new message and add Claude turn-behavior guardrails against impossible autonomous follow-up promises.
* Preserve bottom inset padding in docked terminals by moving terminal shell padding onto `.xterm`.
* Refine workspace-row action placement so expanded workspace rows keep title padding and hover controls aligned.

### References

* [#88](https://github.com/sendbird/stave/pull/88), [#89](https://github.com/sendbird/stave/pull/89), [#90](https://github.com/sendbird/stave/pull/90), [#91](https://github.com/sendbird/stave/pull/91), [#92](https://github.com/sendbird/stave/pull/92), [#93](https://github.com/sendbird/stave/pull/93), [#94](https://github.com/sendbird/stave/pull/94), [#95](https://github.com/sendbird/stave/pull/95)

## [0.8.0](https://github.com/sendbird/stave/compare/v0.7.7...v0.8.0) (2026-06-30)

### Features

* Queue multiple follow-up prompts while a task is running, with FIFO delivery, inline edit/delete controls, and automatic send of the next queued prompt after the active turn completes.
* Stage prompt fragments with `Shift+Enter` and merge the staged batch with the composer body on send.
* Attach Lens visual comments from the browser annotation overlay through Lens, chat state, assistant traces, and the composer as compact structured chips.
* Strengthen Lens element picker and box-inspect flows across browser session events, IPC, preload, and the Lens panel.

### Changes

* Extend prompt draft persistence for multi-turn queues, staged prompt batches, and structured annotation attachments while preserving legacy `queuedNextTurn` compatibility.

### References

* [#86](https://github.com/sendbird/stave/pull/86)

## [0.7.7](https://github.com/sendbird/stave/compare/v0.7.6...v0.7.7) (2026-06-30)

### Features

* Add a Git Graph editor view with lane visualization, commit detail/diff loading, and commit/ref context-menu actions backed by shell-safe git invocation.
* Add configurable Claude plan-mode approval scopes so read-only Bash, Task, and MCP tool classes can be auto-allowed while mutating tools stay denied.
* Open Markdown files in preview mode by default and add a persisted workspace-sidebar row display mode for expanded or compact workspace rows.

### Fixes

* Stop Claude plan-mode turns from continuing to run tools after `ExitPlanMode`, allowing the user to review the presented plan immediately.
* Preserve serialized tool input on approval message parts so approval history includes the full command or argument context.
* Improve Lens element picking and annotation prompts with compact selector/style/source summaries, safer picker teardown, and no raw HTML payload injection.
* Keep Lens visible only when floating surfaces actually intersect the preview, and move toast placement away from the embedded browser surface.

### References

* [#77](https://github.com/sendbird/stave/pull/77), [#78](https://github.com/sendbird/stave/pull/78), [#79](https://github.com/sendbird/stave/pull/79), [#80](https://github.com/sendbird/stave/pull/80), [#81](https://github.com/sendbird/stave/pull/81), [#82](https://github.com/sendbird/stave/pull/82), [#83](https://github.com/sendbird/stave/pull/83), [#84](https://github.com/sendbird/stave/pull/84)

## [0.7.6](https://github.com/sendbird/stave/compare/v0.7.5...v0.7.6) (2026-06-30)

### Fixes

* Prevent archived workspaces from reappearing after restart by persisting archived workspace paths and filtering them during store hydration.
* Keep file opening fast in large workspaces by removing project-wide source and `node_modules` type graph mirroring from the built-in Monaco path.

### Changes

* Remove the Zen Mode feature, including its layout components, command palette action, keyboard shortcut, tests, and public docs.
* Clarify language intelligence docs so project-wide module resolution and navigation are described as Project Language Server behavior.

### References

* [#73](https://github.com/sendbird/stave/pull/73), [#74](https://github.com/sendbird/stave/pull/74), [#75](https://github.com/sendbird/stave/pull/75)

## [0.7.5](https://github.com/sendbird/stave/compare/v0.7.4...v0.7.5) (2026-06-29)

### Fixes

* Speed up file opening by excluding `.stave` worktree data from filesystem and source-file scans.
* Avoid reloading shared workspace TypeScript declaration libraries for every focused source file while still refreshing file-specific source models.

### References

* [#71](https://github.com/sendbird/stave/pull/71)

## [0.7.4](https://github.com/sendbird/stave/compare/v0.7.3...v0.7.4) (2026-06-29)

### Features

* Add a Lens box-model inspector for content, padding, border, and margin, including MCP tools for element inspection and spacing measurement.

### Fixes

* Surface Codex goal progress near the prompt composer without redundant `/goal` transcript messages, while keeping turn and tool running indicators separate.
* Open generated Orbit service URLs in Lens by default, with external browser open and copy URL kept as secondary actions.

### References

* [#67](https://github.com/sendbird/stave/pull/67), [#68](https://github.com/sendbird/stave/pull/68), [#69](https://github.com/sendbird/stave/pull/69)

## [0.7.3](https://github.com/sendbird/stave/compare/v0.7.2...v0.7.3) (2026-06-25)

### Fixes

* Normalize Codex App Server `minimal` reasoning effort to `low` to avoid API rejections, and extract nested error messages for clearer inline display.
* Prevent application freeze when loading large files by checking file size before reading; oversized files report a `too-large` state with actionable size metadata instead of blocking the renderer.

### References

* [#64](https://github.com/sendbird/stave/pull/64)
* [#65](https://github.com/sendbird/stave/pull/65)

## [0.7.2](https://github.com/sendbird/stave/compare/v0.7.1...v0.7.2) (2026-06-24)

### Fixes

* Improve Lens browser session handling by using a project-scoped profile by default, with a workspace-isolated option.
* Route OAuth and SSO popup windows through the Lens browser profile and add clear-session controls.
* Hide the native Lens view behind app dialogs and overlays while simplifying the Lens toolbar layout.

### References

* [#61](https://github.com/sendbird/stave/pull/61)

## [0.7.1](https://github.com/sendbird/stave/compare/v0.7.0...v0.7.1) (2026-06-24)

### Bug Fixes

* Fix the packaged desktop white screen by resolving preload and renderer entries from emitted main chunks.
* Add regression coverage for packaged Electron asset paths from both `out/main` and `out/main/chunks`.

### References

* [#59](https://github.com/sendbird/stave/pull/59)

## [0.7.0](https://github.com/sendbird/stave/compare/v0.6.0...v0.7.0) (2026-06-24)

### Features

* Expand Lens with MCP-managed browser sessions, visual annotations, screenshots, downloads, CDP-gated inspection, console/network panels, fullscreen mode, and updated user docs.
* Add workspace and fleet workflows for verification runs, structured todos, checks, fix-with-agent/review flows, progress and failure notifications, and top-level fleet lanes.
* Persist turn events and workspace task context more durably, including current task awareness, richer Information panel resources, and stale workspace result fencing.
* Move Codex to the App Server protocol surface with the 0.142.0 baseline, plan-mode config overrides, slash-command handling, goal lifecycle, trusted tools, approval/elicitation mapping, and longer provider timeouts.
* Add source-control branch fetch/pull actions, PR opening and review surfaces, and intent-guard checks against pinned product intent.
* Improve terminal, layout, and sidebar UX with xterm.js dock rendering for zoom/DPR stability, unclipped toolbar buttons, and refined Information panel spacing and ordering.

### Bug Fixes

* Surface chat truncation warnings and keep persisted message IDs anchored to durable turn totals with a capped resident window.
* Preserve Lens annotation sessions and prevent Local MCP task starts from crashing when task message counts are forwarded.
* Keep archived or stale workspace task results from resurfacing and let Codex continue after `/goal` commands.
* Restore Pages build/typecheck CI and release-commit-only Pages deployment behavior.

### References

* [#21](https://github.com/sendbird/stave/pull/21), [#22](https://github.com/sendbird/stave/pull/22), [#23](https://github.com/sendbird/stave/pull/23), [#31](https://github.com/sendbird/stave/pull/31), [#32](https://github.com/sendbird/stave/pull/32), [#33](https://github.com/sendbird/stave/pull/33), [#34](https://github.com/sendbird/stave/pull/34), [#35](https://github.com/sendbird/stave/pull/35), [#36](https://github.com/sendbird/stave/pull/36), [#37](https://github.com/sendbird/stave/pull/37), [#38](https://github.com/sendbird/stave/pull/38), [#39](https://github.com/sendbird/stave/pull/39), [#40](https://github.com/sendbird/stave/pull/40), [#41](https://github.com/sendbird/stave/pull/41), [#42](https://github.com/sendbird/stave/pull/42), [#43](https://github.com/sendbird/stave/pull/43), [#44](https://github.com/sendbird/stave/pull/44), [#45](https://github.com/sendbird/stave/pull/45), [#46](https://github.com/sendbird/stave/pull/46), [#47](https://github.com/sendbird/stave/pull/47), [#48](https://github.com/sendbird/stave/pull/48), [#49](https://github.com/sendbird/stave/pull/49), [#50](https://github.com/sendbird/stave/pull/50), [#51](https://github.com/sendbird/stave/pull/51), [#52](https://github.com/sendbird/stave/pull/52), [#53](https://github.com/sendbird/stave/pull/53), [#54](https://github.com/sendbird/stave/pull/54), [#55](https://github.com/sendbird/stave/pull/55), [#56](https://github.com/sendbird/stave/pull/56), [#57](https://github.com/sendbird/stave/pull/57)

## [0.6.0](https://github.com/sendbird/stave/compare/v0.5.1...v0.6.0) (2026-06-17)

### Features

* Revamp Claude and Codex provider runtime integration, IPC schemas, runtime options, and model defaults.
* Streamline app surfaces by removing legacy Stave Auto, Muse, and Coliseum fan-out UI, docs, screenshots, helpers, and tests.
* Refresh workspace/task shell behavior, provider settings, prompt presets, command palette entries, and shared shadcn motion primitives.
* Update release workflow test coverage for the current GitHub CLI release upload path.

### References

* [#19](https://github.com/sendbird/stave/pull/19)

## [0.5.1](https://github.com/sendbird/stave/compare/v0.5.0...v0.5.1) (2026-04-29)

### Features

* **workspace:** improve branch selector ([#14](https://github.com/sendbird/stave/issues/14)) ([bc20e96](https://github.com/sendbird/stave/commit/bc20e967b9463d9cb254f2346c4409895c48b6f7))

### Bug Fixes

* **install:** point release flow to sendbird repo ([#12](https://github.com/sendbird/stave/issues/12)) ([329c284](https://github.com/sendbird/stave/commit/329c284ab3e21e14e6c0c43d4f7fbb239651d5a3))
* prefer gpt-5.5 defaults ([#13](https://github.com/sendbird/stave/issues/13)) ([dccd55e](https://github.com/sendbird/stave/commit/dccd55e5be0ee243f0eb13b8506ed707ab4158c9))
* **scripts:** use node-compatible entrypoint guards ([#15](https://github.com/sendbird/stave/issues/15)) ([4075cd5](https://github.com/sendbird/stave/commit/4075cd51fff7aa80e2e1c8284af38bb19164f988))

## [0.5.0] - 2026-04-22

### Highlights

- Open-source baseline release for `sendbird/stave` under Apache License 2.0.
- Desktop AI coding workspace with task-oriented Claude and Codex chats, editor and terminal surfaces, workspace memory, and local automation.
- GitHub-release-based macOS installer, in-app update flow, public docs site, and cleaned contributor documentation for the initial OSS release.

### Notes

- This release establishes the clean public starting point for the `sendbird/stave` repository.
