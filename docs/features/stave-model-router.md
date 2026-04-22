# Stave Model Router

The Stave Model Router is a built-in meta-provider that selects the best AI model for every prompt automatically, without requiring the user to switch providers manually.

## Selecting Stave

In the model selector, choose **Stave** from the provider list. The task is then stored with `provider: "stave"` and every subsequent turn in that task goes through the router.

By default, `Alt+3` also selects the same `Stave Auto` prompt target immediately. You can remap that slot, along with `Alt+1..0`, in **Settings -> Command Palette**.

The model selector shows **Stave Auto** as the single model option. The chat surface shows a compact Stave routing card at the beginning of each assistant turn with the chosen model, strategy, short reason, and whether fast mode was requested vs actually applied. Expanded orchestration progress is shown in its own card. Raw routing JSON is treated as diagnostics data, not normal chat content.

## How the router works

Routing happens in two stages:

If the Stave task is explicitly in plan mode, the router short-circuits these stages and sends the turn directly to the configured `staveAutoPlanModel`. This bypasses classifier, skill fast-path, and orchestration so plan-mode turns do not fall through to implementation routes. If that plan model resolves to Codex, Stave also enables Codex plan mode for the rewritten direct turn so the underlying runtime stays read-only. For the practical effect of that runtime rewrite, see [Provider Sandbox And Approval Guide](provider-sandbox-and-approval.md).

### Stage 1 — Pre-processor (LLM)

Every turn is first analysed by a lightweight classifier model (`claude-haiku-4-5` by default). The Pre-processor receives the user's prompt, conversation history length, and attached file count, then returns JSON that is either:

- `"direct"` with an intent: `plan`, `analyze`, `implement`, `quick_edit`, or `general`
- `"orchestrate"` when the request should be split into multiple phases

**Pre-processor model selection priority:**

1. `staveAutoClassifierModel` setting (default: `claude-haiku-4-5`)
2. `gpt-5.3-codex` — if the primary model's provider is unavailable
3. Regex fallback — if both providers are unavailable (see Stage 1b below)

The Pre-processor always runs with `codexFastMode: true`, a 10-second hard timeout, no file/tool access, and a single turn (`claudeMaxTurns: 1`).

### Stage 1b — Regex fallback

If the Pre-processor LLM is unreachable (network error, timeout, quota exhausted), the router falls back to deterministic intent heuristics in `stave-router.ts`. This guarantees zero-downtime degradation: users on environments without any LLM access still get sensible routing.

### Stage 2a — Direct (single model)

The Pre-processor selected one direct intent. The routing runtime resolves that intent to the configured model from the active Stave Auto profile, then:

1. Checks provider availability for the chosen model.
2. If unavailable, substitutes an automatic fallback (see table below).
3. Forwards the turn to the selected model with fast mode applied when either the Pre-processor requested urgency or the Stave Auto Fast Mode setting is enabled.

**Default direct intent palette:**

| Intent       | Model               | Notes                                       |
| ------------ | ------------------- | ------------------------------------------- |
| `quick_edit` | `claude-haiku-4-5`  | rename, typo, tiny targeted change          |
| `general`    | `claude-sonnet-4-6` | balanced default                            |
| `implement`  | `gpt-5.3-codex`     | code generation, patching, refactors        |
| `analyze`    | `claude-opus-4-7`   | debugging, review, architecture, root cause |
| `plan`       | `opusplan`          | planning-only, no file edits intended       |

Urgency signals that trigger `fastMode: true`: _빠르게, 빨리, quick, fast, ASAP, urgent, 즉시_.

**Automatic availability fallbacks:**

| Chosen model        | Fallback when unavailable |
| ------------------- | ------------------------- |
| `claude-opus-4-7`   | `gpt-5.4`                 |
| `claude-sonnet-4-6` | `gpt-5.4`                 |
| `claude-haiku-4-5`  | `gpt-5.3-codex`           |
| `gpt-5.4`           | `claude-opus-4-7`         |
| `gpt-5.3-codex`     | `claude-haiku-4-5`        |

### Stage 2b — Orchestrate (multi-model)

When the Pre-processor judges that the request genuinely requires multiple specialised agents (e.g. "analyse the auth module, then rewrite it, then add tests"), it returns `strategy: "orchestrate"`. The Orchestrator takes over:

1. **Supervisor decompose** — The Supervisor model (default `claude-sonnet-4-6`) breaks the request into 1–`staveAutoMaxSubtasks` role-based subtasks with `dependsOn` edges.
2. **Parallel execution** — Subtasks are grouped by topological level; independent subtasks run in parallel up to `staveAutoMaxParallelSubtasks`. Prior results are injected into subsequent prompts via `{subtask-id}` placeholders.
3. **Supervisor synthesise** — The Supervisor merges all worker outputs into a single coherent response streamed back to the user.

Worker roles are resolved through settings, not hardcoded model IDs:

- `plan`
- `analyze`
- `implement`
- `verify`
- `general`

Orchestration is only active when **Stave Auto** is selected and `staveAutoOrchestrationMode` is not `off`. If orchestration mode is `off`, the Pre-processor's `"orchestrate"` decision is downgraded to the direct fallback path.

## Provider availability cache

Both stages consult a 30-second TTL in-process cache (`stave-availability.ts`) to avoid redundant availability checks. The cache is non-persistent: each new Stave session re-checks on the first request. The cache can be invalidated programmatically after quota-exhaustion errors.

## Per-turn routing

The router re-evaluates every turn independently. Within a single task, different messages can be routed to different models. Provider-native conversation IDs (Claude session ID, Codex thread ID) are preserved separately per provider, so switching between providers within a task does not lose context.

Codex threads remain model-sensitive. If a task previously used one Codex model and the next turn resolves to another, Stave starts a fresh Codex thread and replays task history instead of resuming the older thread.

## Settings

Stave Auto now uses presets plus role-based settings under **Settings → Providers → Stave Auto**. Picking a preset rewrites the full role map, and you can still fine-tune any individual role afterwards through the same searchable model dropdown used in PromptInput, excluding the `stave-auto` meta-model.

### Presets

| Preset             | Summary                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Recommended`      | Current mixed default. Uses Claude for classifier/planning/analysis, Sonnet for supervisor, Codex for implementation, and `gpt-5.4` for verify.                   |
| `Recommended (1M)` | Same as Recommended, but switches supervisor, analyze, and general to the `[1m]` variants.                                                                        |
| `Claude Only`      | Keeps every role on Claude models only, with supervisor on Claude Sonnet.                                                                                         |
| `Codex Only`       | Keeps every role on Codex models only, using `gpt-5.4-mini` for lightweight classifier/general/quick-edit/supervisor work and `gpt-5.3-codex` for implementation. |

### Role settings

| Setting                              | Default             | Description                                                                         |
| ------------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `staveAutoClassifierModel`           | `claude-haiku-4-5`  | Lightweight classifier for direct vs orchestration                                  |
| `staveAutoSupervisorModel`           | `claude-sonnet-4-6` | Decompose/synthesise orchestration runs                                             |
| `staveAutoPlanModel`                 | `opusplan`          | Planning-only requests                                                              |
| `staveAutoAnalyzeModel`              | `claude-opus-4-7`   | Debug/review/explanation/root cause                                                 |
| `staveAutoImplementModel`            | `gpt-5.3-codex`     | Implement/build/patch/refactor                                                      |
| `staveAutoQuickEditModel`            | `claude-haiku-4-5`  | Tiny edits                                                                          |
| `staveAutoGeneralModel`              | `claude-sonnet-4-6` | Balanced default                                                                    |
| `staveAutoVerifyModel`               | `gpt-5.4`           | Validation/review step in orchestration                                             |
| `staveAutoOrchestrationMode`         | `auto`              | `off`, `auto`, or `aggressive`                                                      |
| `staveAutoFastMode`                  | `false`             | Request fast execution for Stave Auto turns when supported by the resolved provider |
| `staveAutoMaxSubtasks`               | `3`                 | Max subtasks per orchestration run                                                  |
| `staveAutoMaxParallelSubtasks`       | `2`                 | Max concurrent independent subtasks                                                 |
| `staveAutoAllowCrossProviderWorkers` | `true`              | Allow Claude + Codex workers in the same orchestration                              |

### Per-role runtime overrides

Each Stave Auto role has provider-aware runtime defaults in **Settings → Providers → Stave Auto**. The settings UI starts from explicit provider defaults for every role instead of an `inherit` placeholder, and when a role switches providers it shows only the controls relevant to that provider.

- Claude-backed roles can override `Permission Mode`, `Thinking`, `Effort`, and `Fast`.
- Codex-backed roles can override `Approvals`, `Effort`, and `Fast`.
- Overrides apply to the selected role when Stave resolves that role's model during direct routing or orchestration worker execution.
- Classifier and supervisor roles also expose these overrides, but they still keep their single-turn orchestration-specific defaults unless a role override replaces them.
- In the chat composer, Stave Auto keeps only the `Plan` toggle in the toolbar. Other runtime controls now live in the Stave Auto provider settings.

## BridgeEvents emitted by Stave

Stave emits its own meta-events (prefixed `stave:`) alongside the provider's native events:

| Event                            | When                                                                       |
| -------------------------------- | -------------------------------------------------------------------------- |
| `stave:execution_processing`     | Pre-processor returns the routing decision (before the actual turn starts) |
| `stave:orchestration_processing` | Supervisor returns the subtask breakdown                                   |
| `stave:subtask_started`          | A worker agent begins its subtask                                          |
| `stave:subtask_done`             | A worker agent finishes                                                    |
| `stave:synthesis_started`        | Supervisor begins merging worker outputs                                   |

## Extending the router

**Fallback intent rules:** edit `stave-router.ts` — add or tune the intent pattern sets.

**Classifier criteria:** edit `buildPreprocessorSystemPrompt(...)` in `stave-preprocessor.ts`.

**Supervisor prompts:** edit `buildSupervisorBreakdownPrompt(...)` / `SUPERVISOR_SYNTHESIS_PROMPT` in `stave-orchestrator.ts`.

**New model tier:** add it to `CLAUDE_SDK_MODEL_OPTIONS` or `CODEX_MODEL_OPTIONS` in `model-catalog.ts`, then map it into the Stave Auto role settings.

## Limitations

- The Stave provider does not expose a native command catalog. Use `claude-code` or `codex` directly if you need provider-specific slash commands.
- Orchestration adds latency proportional to the number of subtasks × model round-trips. For time-sensitive work, prefer direct mode or disable orchestration in settings.
- Per-task routing history is not exposed in a dedicated turn-inspection UI; the transcript still shows the routing card for each assistant turn.
- The Pre-processor timeout is 10 seconds. On slow networks, frequent Pre-processor timeouts will cause all turns to fall back to regex routing.
