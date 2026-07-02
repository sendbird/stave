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
