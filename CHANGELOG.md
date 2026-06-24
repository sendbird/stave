# Changelog

All notable changes to Stave are documented in this file.

## [0.8.0](https://github.com/sendbird/stave/compare/v0.7.1...v0.8.0) (2026-06-24)

### Notes

* No user-facing code changes have landed since `v0.7.1`; this release advances the current main line to the next minor version.

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
