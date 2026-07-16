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
