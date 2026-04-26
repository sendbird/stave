# Provider Runtimes

For a task-oriented guide to choosing Claude and Codex sandbox, approval, and plan settings in the UI, see [Provider Sandbox And Approval Guide](../features/provider-sandbox-and-approval.md).

## Stave Model Router

The Stave Model Router is a meta-provider that sits above the real Claude and Codex runtimes. When a task uses the `stave` provider, Stave Auto classifies each prompt by intent and either routes it directly to a single model or escalates it into orchestration.

High-level flow:

1. The renderer submits a turn with `providerId: "stave"`.
2. `electron/main/ipc/provider.ts` validates the request and forwards it into the dedicated desktop `host-service` child process.
3. `electron/providers/runtime.ts` inside that child detects the `stave` provider and builds the active `staveAuto` profile from settings.
4. If the task is in Stave plan mode (`claudePermissionMode: "plan"`), Stave bypasses classifier / skill fast-path / orchestration and routes the turn directly to the profile `planModel`.
5. Otherwise, `electron/providers/stave-preprocessor.ts` asks a lightweight classifier to return either `strategy: "direct"` with an intent (`plan`, `analyze`, `implement`, `quick_edit`, `general`) or `strategy: "orchestrate"`.
6. For direct execution, Stave resolves the configured model for that intent from the profile, emits `stave:execution_processing`, rewrites the `StreamTurnArgs`, and re-enters the normal provider runtime.
7. For orchestration, `electron/providers/stave-orchestrator.ts` asks the supervisor to produce role-based subtasks (`plan`, `analyze`, `implement`, `verify`, `general`), resolves each role to a configured model, executes subtasks, then synthesises the result.

When Stave plan mode resolves to a Codex-family `planModel`, Stave also forces `codexPlanMode: true` on the rewritten direct turn so the underlying Codex runtime still gets `read-only` sandboxing plus `approvalPolicy = never`.

### Direct intent table

| Intent       | Default model       | Typical work                                    |
| ------------ | ------------------- | ----------------------------------------------- |
| `plan`       | `opusplan`          | design, strategy, planning-only requests        |
| `analyze`    | `claude-opus-4-7`   | explanation, debugging, review, root cause      |
| `implement`  | `gpt-5.3-codex`     | feature work, patching, refactors, test writing |
| `quick_edit` | `claude-haiku-4-5`  | rename, typo, tiny targeted changes             |
| `general`    | `claude-sonnet-4-6` | balanced default path                           |
| `verify`     | `gpt-5.5`           | orchestration-only validation/review step       |

### Complexity signals

- **Prompt length > 1 200 characters** → treated as complex
- **Attached files ≥ 4** → treated as complex
- **Conversation history ≥ 8 messages** → treated as complex
- **Prompt length < 350 characters** → treated as short / quick

### Availability check

The Stave router is considered available when at least one underlying provider is available. Direct execution uses profile-aware fallback pairs when the chosen provider is unavailable; orchestration can optionally fall back to same-provider workers when cross-provider workers are disabled.

### Native command catalog

The Stave provider does not expose a native command catalog. Switching to `claude-code` or `codex` directly gives access to the provider-native command behavior for that runtime. Claude currently exposes a catalog through the SDK; Codex does not, so Stave forwards Codex slash commands unchanged.

### Source file

Core files:

- `electron/providers/stave-router.ts` — deterministic fallback intent router
- `electron/providers/stave-preprocessor.ts` — LLM classifier
- `electron/providers/stave-orchestrator.ts` — role-based orchestration runner
- `src/lib/providers/stave-auto-profile.ts` — settings-derived profile helpers

---

## Claude runtime

Claude turns are handled in `electron/providers/claude-sdk-runtime.ts`.

High-level flow:

1. The renderer submits a turn through `window.api.provider.streamTurn(...)`.
2. `electron/main/ipc/provider.ts` validates the request and forwards it into the dedicated desktop `host-service` child process.
3. `electron/providers/runtime.ts` inside that child selects the Claude path and calls `streamClaudeWithSdk(...)`.
4. `streamClaudeWithSdk(...)` imports `@anthropic-ai/claude-agent-sdk` and runs the turn from the host-service process instead of the Electron main-process event loop.
5. Claude SDK messages are converted into Stave `BridgeEvent` records.
6. The renderer consumes those normalized events and renders chat text, thinking, tools, approval prompts, user-input prompts, plans, and completion state.

Claude event mapping:

- assistant text -> `text`
- thinking or thinking delta -> `thinking`
- tool use -> `tool`
- `ExitPlanMode` tool payload -> `plan_ready`
- `task_progress.summary` -> `system` when Claude agent progress summaries are enabled
- `compact_boundary` -> `system` with `compactBoundary.trigger` and `compactBoundary.gitRef` metadata
- `status: compacting` -> `system` (`Compacting conversation context…`)
- stream or runtime failures -> `error`

Claude text-boundary note:

- Claude usually streams text through `stream_event.content_block_delta` and
  then emits a later assembled `assistant` message.
- Stave drops the later assembled text/thinking when streamed deltas were
  already observed, which avoids the most common duplicate-text merge path.
- Unlike Codex, Claude does not currently attach a Stave `segmentId` to text
  events.
- If Claude ever starts surfacing multiple unrelated text sequences in one
  assistant turn, inspect `mapClaudeMessageToEvents(...)` and
  `provider-event-replay.ts` before blaming the markdown renderer. The likely
  fix is to preserve a provider-side text boundary, not to special-case markdown
  parsing.

Claude SDK prewarm:

- At host-service startup, Stave calls `prewarmClaudeSdk()` which eagerly
  imports the `@anthropic-ai/claude-agent-sdk` module and resolves the Claude
  executable path. This front-loads the two most expensive initialization costs
  so the first `query()` call in the dedicated provider runtime is faster.
- Subsequent SDK calls reuse the cached module and executable path rather than
  repeating the dynamic import and filesystem probing.

Claude-specific runtime controls come from the UI and runtime options:

- permission mode (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`)
- dangerous skip permissions
- sandbox enabled
- allow unsandboxed commands
- setting sources
- task budget
- agent progress summaries
- provider timeout
- debug stream logging

### Claude settings quick guide

If you want the user-facing setup workflow instead of the runtime internals, use [Provider Sandbox And Approval Guide](../features/provider-sandbox-and-approval.md).

- `permission mode`
  - `default`: use Claude's standard behavior.
  - `acceptEdits`: good default for normal implementation work with guardrails.
  - `bypassPermissions`: highest-autonomy Claude path; use carefully.
  - `plan`: planning-only flow in Stave.
  - `dontAsk`: avoid interactive permission pauses during the turn.
  - `auto`: let Claude choose.
- `setting sources`
  - `project`: load repo-local Claude config such as `CLAUDE.md`.
  - `local`: load machine-local or workspace-local runtime settings.
  - `user`: load user-wide Claude settings.
- `thinking mode`
  - `adaptive`: think more only when useful.
  - `enabled`: always request extra thinking.
  - `disabled`: prefer direct answers.
- `effort`
  - `low`: fastest.
  - `medium`: balanced default.
  - `high`: more deliberate, slower, better for hard tasks.
  - `xhigh`: deeper than `high` when supported by the active Claude model.
  - `max`: highest deliberation and the most latency on models that support it.
- Example mode presets
  - `Manual`: `acceptEdits` + sandbox on + unsandboxed off
  - `Guided`: `auto` + sandbox off + unsandboxed on
  - `Auto`: `bypassPermissions` + dangerous skip on + unsandboxed on

In the chat composer, Stave now shows the active provider mode as a pill beside the model selector and keeps the detailed runtime values in the `Runtime` drawer. Inline runtime adjustments no longer happen there; the editable controls live in Settings.

When Claude `agentProgressSummaries` is enabled, Stave forwards the SDK flag explicitly and renders incoming `task_progress.summary` updates as inline system events in the active assistant message.

Stave now forwards Claude `settingSources` explicitly. The default Stave setting enables `project`, which allows `CLAUDE.md`, project settings, and project-native slash commands to participate in turns; `local` and `user` can be toggled from Settings.

Stave also forwards Claude `taskBudget` when configured, and the `Settings → Providers → Claude` tab now exposes two Claude SDK control helpers directly:

- `getContextUsage()` for inspecting current workspace/session context pressure
- `reloadPlugins()` for refreshing plugin-provided commands, agents, and MCP state

After a plugin reload, Stave invalidates the Claude command-catalog view so the chat composer re-fetches the latest native slash commands.

When the user explicitly references `stave task id` values in the prompt, Stave injects the latest loaded assistant replies for those task IDs as retrieved context and instructs the provider not to scan the filesystem or home directory to discover task history.

When the active provider runtime actually has Stave Local MCP connected, task turns also carry a Stave-owned "current task awareness" retrieved-context block in the rendered provider prompt. That block anchors the owning workspace id/path, the current task id/title, visible sibling tasks, and a bounded snapshot of the current workspace Information panel. The prompt text explicitly tells providers that unqualified phrases such as "this workspace" or "Information panel" refer to the workspace that owns the current task unless the user clearly scopes the request elsewhere.

Claude path and approval handling:

- Stave runs Claude with the active workspace `cwd`
- workspace-root guidance is appended so relative paths stay rooted correctly
- approval and user-input responses are validated before they are returned to the SDK

Compaction checkpoint UI support:

- Compact boundaries render as a dedicated checkpoint divider card in the chat timeline.
- Stave captures `git rev-parse HEAD` at each Claude `compact_boundary` event and stores it on the matching system event.
- The checkpoint card can run `git restore --source=<gitRef> --staged --worktree .` to restore the workspace to that boundary.
- This restore only affects workspace files. It does not rewind provider-native session state.

## Codex runtime

Codex turns are handled in `electron/providers/codex-app-server-runtime.ts`.
The older `electron/providers/codex-sdk-runtime.ts` path remains available only
as a rollback target behind `STAVE_CODEX_RUNTIME=legacy-sdk`.

High-level flow:

1. The renderer submits a turn through the same provider bridge.
2. `streamCodexWithAppServer(...)` resolves a local `codex` binary and starts or reuses a singleton `codex app-server --listen stdio://` subprocess.
3. Stave calls `account/read` so an existing CLI login can be reused without extra setup when possible.
4. Stave starts or resumes an App Server thread for the current task and runtime configuration.
5. `turn/start` streams App Server notifications into the same `BridgeEvent` format used by Claude.
6. File changes are post-processed through `turn-diff-tracker.ts` so the UI can render diffs.

Codex prompt injection note:

- Stave now forwards response-style and project/system prompt overrides through Codex `developer_instructions` config instead of prepending visible `<system>` blocks to each user turn.
- Task history, selected file context, image attachments, skill context, and retrieved context still render into the provider prompt body because they are part of the actual turn payload rather than hidden session config.

Codex event mapping:

- native `agentMessage` items -> `text`
- native `reasoning` items -> `thinking`
- native `mcpServer/elicitation/request` form prompts -> shared `user_input` UI
- URL-mode elicitation requests are surfaced through the same `user_input` card with an external-link action and an explicit continue / decline decision
- native `plan` items and `item/plan/delta` -> `plan_ready`
- command execution -> `tool`
- MCP tool calls -> `tool`
- web search -> `tool`
- file changes -> diff events
- failures -> `error`

Codex text-boundary note:

- Codex can emit multiple top-level `agent_message` items in one turn, including
  commentary-like text before the final response.
- Stave now preserves those boundaries with `segmentId = item.id` on normalized
  text events for `agent_message` and `plan`.
- Replay merges adjacent text parts only when the `segmentId` matches.
- This rule prevents in-place `TodoWrite` updates from causing an earlier
  commentary block and a later final response block to collapse into one
  markdown segment.

Codex plan mode:

- When `codexPlanMode` is enabled, Stave forwards
  `collaborationMode.mode = "plan"` on the App Server turn.
- Stave also forces Codex plan turns onto `read-only` file access, even if the
  normal Codex runtime setting is `workspace-write` or `danger-full-access`, so
  plan turns cannot mutate the workspace.
- Stave also forces the effective Codex approval policy to `never` during plan
  turns so read-only planning does not keep stopping on inline approval prompts.
- The App Server path exposes first-class `plan` items and streaming
  `item/plan/delta` events, so the primary runtime no longer relies on the old
  final-agent-message promotion fallback.
- Stave still keeps plan threads separate from normal Codex turns so planning
  context does not get mixed into implementation threads.
- Native plan turns stay open after the final plan item is emitted. Stave
  interrupts the active turn once the plan is complete so the thread returns to
  idle and the UI can treat the plan response as terminal.
- Finalized plan reviews are persisted as workspace markdown files under
  `.stave/context/plans/<taskId>_<timestamp>.md`.
- The workspace information panel indexes those saved plan files, keeps the
  newest plan at the top, shows at most the latest five entries, and also
  continues to show legacy `.stave/plans/*.md` entries for backward
  compatibility.
- Saved plan files can be previewed, edited, opened in the editor, and sent to
  the active task as file context directly from the Information panel.

Codex checkpoint support:

- The App Server path still does not expose checkpoint/compaction boundary
  events equivalent to Claude `compact_boundary`.
- Stave therefore does not expose restore-to-checkpoint behavior for Codex turns yet.

Codex-specific runtime controls come from the UI and runtime options:

- network access
- file access
- approval policy (`never`, `on-request`, `untrusted`)
- reasoning effort
- reasoning summary and raw reasoning toggles
- plan mode
- binary path override
- provider timeout
- debug stream logging

Codex slash-command behavior:

- The current Codex App Server/CLI path does not expose a native slash-command catalog that Stave can enumerate.
- Stave therefore forwards Codex slash commands unchanged instead of trying to validate or block them locally.
- The Settings developer surface mirrors the native Codex MCP/runtime status rather than synthesizing a Claude-style plugin list.

Stave only accepts the canonical Codex approval policies: `never`,
`on-request`, and `untrusted`.

### Codex settings quick guide

If you want the user-facing setup workflow instead of the runtime internals, use [Provider Sandbox And Approval Guide](../features/provider-sandbox-and-approval.md).

- `file access`
  - `read-only`: inspect only, no writes.
  - `workspace-write`: edit inside the workspace / writable roots.
  - `danger-full-access`: broad filesystem access; highest risk.
- `approval policy`
  - `never`: do not pause for approval.
  - `untrusted`: App Server-aligned low-friction default; pause only for actions treated as untrusted.
  - `on-request`: ask when approval is needed.
- `reasoning effort`
  - `minimal` / `low`: fastest.
  - `medium`: balanced default.
  - `high` / `xhigh`: slower, more deliberate.
- `reasoning summary`
  - `auto`: let Codex decide.
  - `concise`: short summary.
  - `detailed`: fuller summary.
  - `none`: no summary.
- `web search mode`
  - `disabled`: fully local.
  - `cached`: App Server-aligned default; lower-volatility search path when available.
  - `live`: allow current web lookup.
- Example mode presets
  - `Manual`: `read-only` + `on-request` + network off + web search disabled
  - `Guided`: `workspace-write` + `untrusted` + network off + web search cached
  - `Auto`: `danger-full-access` + `never` + network on + web search live

Current Codex defaults follow the App Server-aligned baseline in Stave: `workspace-write` file access, `untrusted` approvals, `network access = off`, `web search = cached`, `reasoning effort = medium`, raw reasoning off, and reasoning summary auto-detection enabled.

Stave now forwards an explicit `show_raw_agent_reasoning: false` override when the Codex UI toggle is off, so local CLI defaults or config files do not leave raw reasoning enabled unexpectedly.

Codex threads are keyed by task/cwd plus the active file-access, network, approval, model, reasoning, and web-search settings so Stave can preserve thread context without mixing incompatible runtime modes.

When a task switches from one Codex model to another, Stave does not attempt to resume the older native thread. Instead it replays the task history into a fresh Codex thread so model-bound session errors do not break the next turn.

## Supported Codex baseline

- Codex App Server transport: local `codex app-server` from Codex CLI `0.125.0`
- Legacy rollback path: `@openai/codex-sdk@0.121.0`
- Codex CLI baseline: `0.125.0`
- Current Stave-supported Codex model IDs: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`

Stave requires a user-installed Codex CLI (`codex` ≥ 0.125.0). Users must have Codex CLI available in their PATH or configured via `runtimeOptions.codexBinaryPath` / `STAVE_CODEX_CLI_PATH`. A user-configured binary path still takes precedence over auto-discovery.

Claude follows the same pattern. Users can force a specific local `claude` install via `runtimeOptions.claudeBinaryPath` or the Settings dialog's Claude Binary override before Stave falls back to environment-based discovery.

## Executable path resolution

Stave does not hardcode one binary path. It probes a small set of candidates, merges the Electron process PATH with the user's login-shell PATH plus common homebrew/home-bin locations, and accepts only executable files.

### Codex CLI lookup order

1. `runtimeOptions.codexBinaryPath`
2. `STAVE_CODEX_CLI_PATH`
3. explicit probes of `<user-home>/.bun/bin/codex` and `<user-home>/.local/bin/codex`
4. `codex` binaries found under Node version manager bin directories (nvm, fnm, volta) — e.g. `$NVM_DIR/versions/node/*/bin/codex`
5. the user's login-shell `command -v codex` result (picks up asdf, mise, chruby, and any custom shell PATH tweaks)
6. `STAVE_CODEX_CMD` resolved through the merged PATH
7. default `codex` resolved through the merged PATH

If multiple executable candidates exist, Stave runs `candidate --version`, parses semver, and prefers the newest valid version.

### Claude CLI lookup candidates

1. `runtimeOptions.claudeBinaryPath`
2. `STAVE_CLAUDE_CLI_PATH`
3. `CLAUDE_CODE_PATH`
4. `<user-home>/.claude/local/claude`
5. `<user-home>/.bun/bin/claude`
6. `<user-home>/.local/bin/claude`
7. `claude` binaries found under Node version manager bin directories (nvm, fnm, volta)
8. the user's login-shell `command -v claude` result (asdf/mise/chruby/custom PATH)
9. `STAVE_CLAUDE_CMD` resolved through the merged PATH
10. default `claude` resolved through the merged PATH

Each candidate must be executable and respond successfully to `--version`. If multiple valid candidates exist, Stave sorts them by parsed version and chooses the newest one.

### How version-manager-installed CLIs are discovered

GUI-launched Electron apps on macOS start with a minimal launchd PATH that typically excludes `nvm`/`fnm`/`volta` directories. To make `npm install -g @openai/codex` "just work" regardless of install method, Stave does three things in addition to the normal PATH merge:

1. Scans `$NVM_DIR/versions/node/*/bin`, `$FNM_DIR/node-versions/*/installation/bin` (and `~/.local/share/fnm/...`), and `$VOLTA_HOME/bin` for each CLI name.
2. Spawns the user's login shell (`zsh -ilc` on macOS) once and asks `command -v <cli>`, caching the answer. This covers any tool manager or custom shell setup that only injects PATH at shell init time.
3. Uses the login-shell PATH itself (cached) when building the environment for child processes, so `which codex` inside the merged env also succeeds.

You do not need to symlink anything into `/usr/local/bin` or set `STAVE_CODEX_CLI_PATH` for an nvm-installed codex to be discovered — the explicit override remains available if you want to force a specific install.

## Useful environment variables

- `STAVE_PROVIDER_TIMEOUT_MS`
- `STAVE_CLAUDE_CLI_PATH`
- `STAVE_CLAUDE_CMD`
- `CLAUDE_CODE_PATH`
- `STAVE_CLAUDE_DEBUG`
- `STAVE_CODEX_CLI_PATH`
- `STAVE_CODEX_CMD`
- `STAVE_CODEX_SANDBOX_MODE`
- `STAVE_CODEX_NETWORK_ACCESS`
- `STAVE_CODEX_APPROVAL_POLICY`
- `STAVE_CODEX_DEBUG`

Most per-turn runtime settings can also be changed from the Settings dialog, and those UI values override the environment defaults for active turns.
