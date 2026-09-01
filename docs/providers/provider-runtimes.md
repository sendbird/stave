# Provider Runtimes

For a task-oriented guide to choosing Claude and Codex sandbox, approval, and plan settings in the UI, see [Provider Sandbox And Approval Guide](../features/provider-sandbox-and-approval.md).

Stave supports four task providers directly:

- `claude-code` for Claude Code SDK turns.
- `codex` for Codex App Server turns.
- `cursor` for interactive Cursor Agent ACP turns.
- `kiro` for interactive Kiro CLI ACP turns.

Upgrade reviews use
[Claude Agent SDK Upgrade Checklist](./claude-sdk-upgrade-checklist.md) and
[Codex Upgrade Checklist](./codex-upgrade-checklist.md). Cursor runtime reviews
use the [Cursor Agent Upgrade Checklist](./cursor-upgrade-checklist.md). Cross-provider feature
decisions are recorded in
[H1 2026 Runtime Feature Adoption Plan](./runtime-feature-adoption-plan.md).

The renderer submits a selected provider and model with each turn. `electron/main/ipc/provider.ts` validates the request, forwards it into the dedicated desktop `host-service` child process, and `electron/providers/runtime.ts` dispatches to the matching provider runtime.

## Cursor Agent ACP runtime

Cursor is available for interactive primary task turns. Stave starts a
disposable `agent acp` process for each prompt, negotiates ACP v1, reuses the
Agent CLI login, and creates or loads the task's native session. The process is
closed after the turn while the native session id remains in workspace
persistence for the next prompt.

The shared ACP layer used by Cursor and Kiro owns bounded NDJSON framing, JSON-RPC request lifecycle,
schema validation, cancellation, and stable session-update mapping. The Cursor
profile owns executable discovery, authentication, mode and model selection,
and namespaced question, plan, todo, task, and image notifications. Renderer
and IPC contracts continue to use normalized Stave events rather than exposing
ACP wire payloads.

Cursor supports `agent`, `plan`, and `ask` session modes. At app startup, Stave
loads the model values advertised by an authenticated ACP session and shows
the effort, context, thinking, and fast parameters encoded in those accepted
values. The composer groups accepted values with the same base model into one
row and selects the exact advertised value when a context, thinking, fast, or
effort control is used. Unsupported combinations remain visibly unavailable;
Stave does not synthesize them. The broader `agent --list-models` output is not
used because the ACP server rejects variants it did not advertise. `Auto`
remains the offline fallback; a configured model is applied only when the
active ACP session advertises the same value. Tool permissions use one-turn
allow or reject choices, questions preserve provider option ids, and plan
creation can pause the active turn for approval or revision in the plan
viewer. Approval option ids are selected by the protocol `kind`, not by id text,
because Cursor advertises `allow-once`/`reject-once` while Kiro advertises
`allow_once`/`reject_once`.

Cursor parameters that the session advertises only one value for render as plain
labels instead of controls. `session/set_model` rejects any value the session
did not advertise, so a segmented control with one reachable value would imply a
choice the runtime does not accept.

Cursor approval autonomy is a process flag on the ACP subcommand, not an ACP
parameter, so it applies for the whole session:

- `Manual`: no flags. Every tool call raises `session/request_permission`.
- `Guided`: `--auto-review`. Cursor's server-side classifier runs what it judges
  safe and asks for the rest. Which calls that covers is decided by Cursor, so
  Stave cannot predict it; shell execution was still prompted when this was
  verified.
- `Auto`: `--force --approve-mcps`. No permission requests are sent at all.

These flags are accepted by `agent acp` even though `agent acp --help` does not
list them. Verify them against the installed CLI on upgrade. Worker runs always
use `Manual` so a nested Worker cannot inherit the primary turn's grant.

The composer consumes a provider-neutral model-catalog interface. Static
catalogs and runtime adapters are normalized before the searchable provider
list is rendered, so adding another provider does not require another fixed
matrix in the composer.

Cursor Agent does not report turn usage over ACP: its `session/prompt` result
carries only a stop reason, and it never sends a `usage_update`. Token counts
exist in the CLI's non-ACP print mode, which Stave does not drive. The post-turn
usage control therefore states that the provider reported no usage rather than
showing a zero-token turn. That fallback is scoped to the ACP providers; the
native runtimes keep rendering whatever usage record they report, including a
zero one. The shared ACP layer accepts prompt usage in either
the snake_case or camelCase spelling and under `_meta`, so a later Cursor build
that starts reporting usage is picked up without a runtime change.

Cursor is intentionally excluded from Advisor, secondary and unattended runs,
routines, standalone CLI tabs, native thread actions, and mid-turn steering.
Utility inference can still use Cursor Ask as a last-resort read-only runner when
Claude and Codex are unavailable. Worker mode is the one delegated exception: an interactive primary can call a
turn-scoped Local MCP tool that starts or resumes a same-provider, task-scoped
ACP Worker session. Bound
secrets are resolved only in the main runtime path and injected into the
disposable primary-turn process environment; the Worker receives none.

## Kiro CLI ACP runtime

Kiro is available for interactive primary task turns. Stave resolves an
authenticated `kiro-cli`, starts `kiro-cli acp` as a disposable ACP v1 process,
and creates or loads the task's native session. Stable ACP updates pass through
the same bounded transport, lifecycle, permission, cancellation, and normalized
event contracts as Cursor. Kiro-specific `_kiro.dev/*` notifications stay in a
namespaced extension mapper instead of leaking into shared schemas.

At app startup, Stave reads `kiro-cli chat --list-models --format json` through
the normalized runtime catalog bridge after a non-interactive authentication
check. `Auto` is the offline fallback. When the
active ACP session exposes a stable model configuration option, Stave uses it;
otherwise the Kiro profile uses the documented `session/set_model` method.
`session/prompt` carries the blocks under both the spec-standard `prompt` key
and Kiro's documented `content` key. `kiro-cli 2.20.1` reads `prompt` and never
answers a request that carries only `content`, so that request shape stalls the
turn until the decision timer fires rather than failing loudly; older builds
read only `content`. Sending both keys keeps either build working. Kiro
reasoning effort is independent of the model value and is passed to the ACP
process with `--effort`; the composer remembers that choice per Kiro model.

Kiro approval autonomy is also a process flag:

- `Manual`: no flag. Every tool call raises `session/request_permission`.
- `Auto`: `--trust-all-tools`. No permission requests are sent at all.

There is deliberately no middle tier. `--trust-tools` accepts unknown tool names
without reporting an error, so a partial-trust preset could silently trust
nothing while presenting as a middle ground. Worker runs always use `Manual`.

Kiro's ACP `modes` are agent personas (`kiro_default`, `kiro_planner`,
`kiro_guide`, and any user-defined agents), not approval modes, and depend on the
user's own Kiro configuration. Stave does not map its plan toggle onto them.

Kiro reports turn usage on its namespaced `_kiro.dev/metadata` notification
rather than the stable ACP `usage_update`: a context-window percentage without
the window size, plus metered spend in the plan's own unit (credits). The
extension mapper normalizes that into a `context_usage` event, so the post-turn
usage control shows a percentage and a credit amount instead of token counts.

Kiro is intentionally excluded from Advisor, secondary and unattended runs,
routines, standalone CLI tabs, native thread actions, and mid-turn steering.
Utility inference can still use Kiro as a last-resort read-only runner when
Claude and Codex are unavailable. Worker mode uses the same bounded, turn-scoped Local MCP bridge as Cursor and a
task-scoped same-provider ACP session. Bound secrets are resolved only for the
disposable interactive primary-turn process; the Worker receives none. Runtime
upgrades should recheck ACP initialization, session create/load, prompt,
cancellation, permissions, model selection, and the JSON model-catalog shape
against the installed CLI before broadening this capability boundary.

## On-demand Advisor consults

`Settings → Providers → Advisor` arms an isolated read-only Advisor that the
**primary model consults on demand during its turn** via the
`stave_consult_advisor` Local MCP tool. The primary provider and Advisor are
independent: Claude can advise Codex, Codex can advise Claude, and either
provider can advise another model from its own catalog. Fable is a normal
Claude model choice, not a special Advisor mode. The intended asymmetry is a
cheap primary consulting an expensive Advisor only when it needs a second
opinion — the consult carries the primary's framed question plus minimal
quoted context, not the whole conversation.

Control is split deliberately: the **user** decides who answers, at what
effort, and how often (the per-turn consult budget,
`advisorConsultLimit`, default 5, clamp 1–20); the **model** decides when a
question is worth asking. When a turn starts with an armed Advisor, the shared
runtime mints a turn-scoped `consultKey` (a capability honoured only while
that turn is alive), registers a consult grant, and injects a briefing
`retrieved_context` part (source id `stave:advisor-consult`) telling the
primary how to call the tool. The tool is auto-approved
(`stave-local-mcp-approval.ts`) because the spend was authorised at arm time
and each call is read-only and budget-bounded.

The Advisor target is stored as
`advisorTarget: { providerId, model, effort? } | null` and the grant is only
minted for the main user-turn request. Summary generation, routing
classifiers, task naming, PR helpers, native slash-command turns, and other
internal one-shot calls never carry it.

The Settings default is three fields, the same shape a task keeps (see
[Per-task arming](#per-task-arming)):

- `advisorEnabled: boolean` — whether new tasks start armed.
- `advisorTarget: AdvisorTarget | null` — the remembered pick, kept while the
  default is off so turning it back on is one click.
- `advisorTargetByProvider` — the default model and effort per provider.

Arming and configuring are therefore separate acts in Settings too: the
provider, model, and effort rows stay editable while the default is off, and
each provider keeps its own pick, so both can be set up before either is armed
and switching provider is not a destructive edit. A snapshot written before the
switch existed is read the old way — a configured target meant armed — so an
existing default keeps arming.

### Advisor effort

`effort` is optional; absent means "follow the model's provider default", which
is what every target did before the tier became selectable. Because the primary
waits on each consult it makes, the tier is a latency-per-consult choice, so the
composer and Settings both show what the default resolves to rather than only
the word "Auto".

`resolveAdvisorEffort` in `src/lib/providers/advisor.ts` is the single
resolution point, shared by the renderer that labels the tier and the main
process that requests it, so the composer can never promise a tier the call
would not use. It defaults an absent tier and clamps a pinned one down to what
the model accepts (Luna caps at `max`, Claude has no `ultra`), rather than
sending a value the provider would reject. `normalizeAdvisorTarget` drops a tier
the provider does not have at all while keeping the target: losing the tier
costs latency, losing the target would silently disarm an Advisor the user
believes is on. Codex's legacy `minimal` is not selectable and collapses to
`low` before the call, so it never appears as a pin or in a reported event.

Each consult's deadline follows the resolved effort rather than sharing the
primary provider timeout: `low` gets 2 minutes, `medium` 3 minutes, `high` 5
minutes, and `xhigh`/`max`/`ultra` 10 minutes. The lifecycle `started` event
reports that same resolved deadline, so the exchange monitor countdown and the
runtime enforcement cannot drift. The monitor's Cancel-consult control drops
only the in-flight consult; the grant (and the turn) keep going.

That deadline is only meaningful if every layer wrapping it outlasts it, so the
consult path keeps an explicitly ordered ladder — innermost first:

| Layer | Deadline | Defined in |
| --- | --- | --- |
| One advisor call | 2–10 min by effort tier | `resolveAdvisorTimeoutMs` |
| Host-service backstop | 15 min | `HOST_SERVICE_ADVISOR_CONSULT_TIMEOUT_MS` |
| MCP tool call (client) | 16 min | `STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS` |

The outermost rung is the one that has to be stated rather than inherited: the
Claude Agent SDK defaults a tool call to a **hard 60-second** wall clock that
progress notifications do not extend, so leaving it unset silently capped every
Stave tool at a minute. A consult past that mark still ran to completion, still
billed, and still emitted its `completed` trace to the turn — while the client
had already aborted and the MCP SDK discarded the reply with no error, no log,
and no metric. Only the UI ever saw the advice.

Keeping the ladder ordered is what prevents that, and it is the *only* thing
that prevents it: a consult cannot notice its caller leaving. The tool handler
runs in the Electron main process while the grant registry lives in the
host-service child, so the caller's `AbortSignal` cannot reach the run — it
does not survive the JSON IPC hop. An abandoned consult therefore runs to its
own deadline and bills for it, and because the grant serializes consults, it
also blocks the rest of that turn's budget until it finishes. The fix is to
never abandon a healthy consult, not to cancel one after the fact.

Because a consult can legitimately think for minutes, the runtime also emits an
`advisor_activity` `progress` heartbeat — throttled to one tick every 5 seconds
— naming what the provider was last seen doing (`Codex item: reasoning`,
`Claude event: assistant`, `Loading the Claude runtime`). Both providers resolve
only once generation has finished, so without it a consult is indistinguishable
from a wedged thread for its whole duration. The heartbeat is deliberately not a
lifecycle stage: the reducer folds it into `lastProgressAt`/`progressDetail`
rather than appending to the bounded `stages` list, so a chatty provider cannot
evict the steps that matter or make `settledConsults` depend on tick timing. A
late heartbeat from an abandoned runner cannot reopen a settled consult.

The same ladder governs `stave-mcp-stdio-proxy`, which shares
`STAVE_LOCAL_MCP_TOOL_TIMEOUT_MS` rather than setting its own deadline.

One tool escapes the outermost rung: `stave_create_workspace` blocks on the
project's configured init command (typically a dependency install) with no
deadline of its own, so a cold monorepo can exceed the server-wide cap. That is
not a regression — the previous effective cap was 60 seconds — but the ladder
holds by construction only for the consult path, and a per-server timeout
cannot be right for a tool set spanning "read a note" and "run npm install".

### Per-task arming

The Settings target is the **default**, not the whole story. Each task can arm
or disarm the Advisor from its composer, next to the plan and thinking toggles,
via `src/components/ai-elements/prompt-input-advisor-mode.tsx`.

Arming lives in the task's `PromptDraftRuntimeOverrides` as three fields:

- `advisorEnabled?: boolean` — absent inherits `settings.advisorEnabled`.
- `advisorTarget?: AdvisorTarget` — the task's own target, including its pinned
  effort, kept task-local so arming one task never changes which model advises
  another.
- `advisorTargetByProvider?` — the task's remembered model and effort per
  provider, so switching provider and back is not a destructive edit. The flat
  target can only hold one provider's choice, and the two catalogs and effort
  scales share nothing.

Arming is its own field rather than a nullable target on purpose: turning the
Advisor off keeps the remembered target, so switching it back on is one click
instead of re-picking a model. A target without `advisorEnabled` never arms
anything, so a hand-edited or partially migrated snapshot cannot start paying
for an Advisor the user did not turn on.

`targetByProvider` on the resolved state is always populated for every
provider, in priority order: the task's remembered pick, the task's current
target, the Settings default for that provider, the Settings pick, then the
provider's catalog default. That is what lets the composer offer a model and
tier for a provider that is not armed — configuring the Advisor must not
require paying for it first — while a provider the task never touched still
starts from the default configured for *that* provider.

`resolveAdvisorArmState` in `src/lib/providers/advisor.ts` is the single
resolution point, and it re-normalizes the persisted target, so a corrupt
per-task value falls back to the Settings default instead of reaching the
runtime. `buildProviderRuntimeOptions` calls it behind `includeAdvisor`, which
keeps every utility turn advisor-free by construction.

Turning the Advisor off while a consult is running also issues
`provider.skip-advisor`, so the control means "now" at the one moment the user
needs it to, rather than silently meaning "next turn". The composer also warns
before the turn is spent when the target is off-catalog (consults would fail)
or identical to the model running the turn (the second opinion is the same
model) — the arm-time counterpart to the monitor's post-hoc checklist. A
pinned tier the model cannot run is reported separately from those, as a note
rather than a warning: the Advisor still advises correctly, just one tier down.

`Alt+A` toggles the Advisor and `Alt+Shift+A` opens its picker, joining the
`Alt`-modifier family the composer already uses for model-adjacent controls.

### Crane dispatch approvals

The Crane dispatch approval dialog is the third Advisor surface, and it reads
the same three fields through `resolveAdvisorArmState`. It seeds once per
approval — from a fresh store read, so changing a setting in another window
cannot overwrite a choice already made in the open dialog — and never writes
back: approving one dispatch must not redefine the global default.

Precedence is the Crane team's remembered pick, then the Stave default. The
remembered value is deliberately three states rather than two: an absent
`advisor` key on a `CraneTeamRuntimeMemory` means the team has no preference and
inherits the default, `null` means the team explicitly wants no Advisor, and a
target means it explicitly wants that one. Collapsing absent into `null` would
silently disarm the default for every team mapped before the Advisor became
rememberable.

The approval payload carries `advisorTarget` and `advisorConsultLimit` as a
pair, enforced both by the schema in `src/lib/crane-connector/types.ts` and
structurally by `buildCraneDispatchRuntimeChoice`, which takes one
`CraneDispatchAdvisorChoice` instead of two independent arguments. A target
without its budget is the failure the pairing prevents: the runtime would
substitute its own default of 5 and ignore a ceiling the user lowered on
purpose. The schema also accepts the target's optional `effort`, so the
dialog's effort row is not a promise the IPC boundary strips.
`src/lib/advisor-shortcuts.ts` matches on `event.code` because macOS composes
`Option+A` into `å`. The control installs its own window listener, gated by the
same `windowShortcutsEnabled` flag the host computes for the active task, which
keeps the Advisor out of `PromptInput`'s prop surface.

`electron/providers/advisor-consult.ts` owns the per-turn grant (key, budget,
one consult at a time, revocation on turn end) and calls
`electron/providers/advisor-runtime.ts` for each consult:

- Claude uses a dedicated Advisor SDK session with `tools: []`, no setting
  sources, no skills, and no MCP servers. Later consults in the same task,
  provider, model, effort, and workspace lane may resume that session.
- Codex uses a dedicated Advisor App Server thread with read-only sandboxing,
  approvals disabled, network and web search disabled, plus isolated
  instructions that prohibit tools, apps, plugins, shells, and subagents.
  Because `isolated` only instructs the model to avoid MCP, every registered
  MCP server is additionally disabled per thread via config overrides. If the
  server catalog cannot be read, the isolated call is refused rather than run
  with weaker isolation than it advertises.
- Advisor role sessions are separate from the primary conversation and from
  every other task. Stave keeps at most 64 recently used lanes for 30 minutes;
  changing provider, model, effort, or workspace starts another lane. A failed
  resume is discarded so the next consult can start cleanly.
- Successful advice is bounded, stripped of any `[Section]` header lines so it
  cannot forge a higher-trust prompt section, and returned to the primary as
  the consult tool's own result with an explicit low-trust preamble.
- A compact `system` trace records each consult's completion, cancellation, or
  recoverable failure. Advisor text is not persisted as a separate assistant
  response.
- Every consult's usage (including late usage from a cancelled consult's
  abandoned runner) is accumulated and merged into the visible primary turn
  usage exactly once, including when the primary turn ends without emitting its
  own usage event.
- A separate `delegated_usage` receipt preserves the Advisor identity, model,
  cache-read/cache-write counts, cost, and whether its role session was resumed.
  This is a breakdown of the turn total, not an additional amount to add to it.
- A failed, timed-out, or cancelled consult returns a structured refusal to the
  primary and never stops the turn; the tool result tells the model to proceed
  with its own judgment. Turn end revokes the grant, so a consult can never
  outlive or bill into a finished turn.
- Claude timeout diagnostics retain content-free SDK progress metadata: whether
  the runtime was still loading or the last SDK event type seen while waiting
  for the final result. Partial model text is never applied as advice.
- Each consult pauses the primary provider's generation timeout while it runs
  (a per-exchange phase pause), so another model's latency cannot consume the
  primary turn's budget.

### Advisor lifecycle events

Each consult emits structured `advisor_activity` events on the normalized
provider event union rather than requiring the renderer to sniff the `system`
trace string. Phases are `started`, `completed`, `failed`, `timeout`,
`aborted`, and `skipped`, and every event of one consult shares an
`exchangeId` plus `consultIndex`/`consultLimit` so the monitor can show
"Consult 2/5". `started` also carries a bounded copy of the question the
primary asked. (The preflight-era `applied`/`primary_started` phases are gone:
advice now reaches the primary as the tool call's own result, so "returned"
and "seen" are the same event.)

Events carry the primary and advisor provider/model plus the isolation mode and
the effort tier actually applied by the runtime, so the UI never infers either
from a provider id or from the target it can see. The reported tier is the
resolved one, so a pin that was defaulted or clamped shows the value the call
carried rather than the value that was asked for. `src/lib/providers/advisor-activity.ts` folds them into a
per-task `advisorExchangeSnapshot` held in its own store slice, never in
`messagesByTask`, so the advice text is not persisted as an assistant response
and the surface does not depend on transcript rendering.

Completed assistant messages also persist each confirmed `delegated_usage`
receipt. Authentication failures and pre-session Worker placeholders do not
create usage rows. The
post-turn usage control shows a delegated count and exposes the per-execution
breakdown on focus or hover. When a provider does not expose per-execution token
or cache counters, the receipt still shows its role, provider, model, and
session reuse status instead of fabricating a cache hit.

`provider.skip-advisor` cancels only the in-flight consult: the primary turn
continues with a `skipped` phase and the tool returns a structured
cancellation. It is distinct from `abortTurn`, so escaping a slow advisor never
costs the user their turn. It reports `ok: false` when no consult is running.

The user-facing surface is `src/components/session/AdvisorExchangeMonitor.tsx`,
a floating card at the top-right of the chat stage that shows the current
consult (with its question) and the per-turn count. Expanded, it renders a
checklist computed only from reported fields — separate model, tool isolation,
advice returned, usage counted — which is the acceptance criteria for the
event contract, not decoration. It also reports the isolation mode, effort
tier, and deadline the call actually used.
`ideas/advisor-ux-lens/harness.html` renders that real component over real
reducer output for every terminal scenario, plus the real composer pill over
the real arm resolver for every arming state.

Bounded secondary turns, such as Compare Judge, use the same provider adapters
through a separate durable contract. Electron main records the run before the
host-service starts a fresh read-only turn, and provider-specific restrictions
are selected by an internal execution policy. See
[Run Core And Secondary Execution](../architecture/run-core.md).

## Worker mode

Worker mode has a primary orchestrate one same-provider task executor: the
primary plans, delegates a bounded brief, then reviews the diff and integrates.
Claude and Codex use their native subagent facilities. Cursor and Kiro use a
Stave-owned, task-scoped ACP Worker session reached through a turn-scoped Local MCP
grant. Worker mode is off by default and is armed per task from the composer
(`Alt+W`, picker on `Alt+Shift+W`), with a global default under Settings →
Providers → Worker mode.

The provider-neutral core is `src/lib/providers/worker-mode.ts`. It owns the
preset catalog, the capability table, and `resolveWorkerProfile` — the single
semantic gate that both the renderer (for labels and availability) and the
provider runtime (for execution) resolve through. Zod proves payload *shape* at
the IPC boundary; this resolver proves the payload makes sense for the
provider, primary model, and installed runtime.

The renderer sends only an intent (`ProviderRuntimeOptions.workerIntent`), never
a resolved profile. Renderer-supplied model ids are not trusted: the main
process re-resolves against the real primary model and installed model catalog
before building the call.

### Supported combinations

| | Claude | Codex | Cursor | Kiro |
| --- | --- | --- | --- | --- |
| orchestrating primaries | Fable 5, Opus 5 (+1M), Sonnet 5 (+1M) | GPT-5.6 Sol, GPT-5.6 Terra | runtime ACP catalog | runtime model catalog |
| worker models | Sonnet 5 (+1M), Haiku 4.5, Opus 5, Fable 5 | Terra, Sol | runtime ACP catalog | runtime model catalog |
| execution adapter | native named agent | native spawned agent | task-scoped ACP role session | task-scoped ACP role session |
| worker model pinning | `AgentDefinition.model` | `agents.default_subagent_model` | ACP config option | ACP model selection |
| worker effort pinning | `AgentDefinition.effort` | `agents.default_subagent_reasoning_effort` | encoded in the selected model variant | ACP process `--effort` |
| description / instructions | `description` + `prompt` | `developer_instructions` | turn briefing + standalone Worker prompt | turn briefing + standalone Worker prompt |
| tool bounding | `tools` — hard-enforced | guidance | guidance | guidance |

Codex primaries are limited to Sol and Terra because they are the only models
whose live catalog advertises the `ultra` tier, described by that catalog as
"Maximum reasoning with automatic task delegation" — i.e. the only Codex models
that delegate natively. `ThreadStartParams.multiAgentMode` is deprecated and
ignored on the supported baseline, and the App Server exposes no subagent RPC,
so Stave pins the worker through `[agents]` config instead. That is the
documented path: `spawn_agent`'s own tool description states that spawned agents
inherit the preferred default unless given an explicit override.

Luna remains available as a top-level Codex model, but codex-cli 0.145/0.146
rejects it in the V2 `spawn_agent` pool, which currently accepts only Sol and
Terra. Stave blocks Luna as a Worker before dispatch instead of promising a
worker the runtime will fail to create.

Worker config travels on both `thread/start` and `thread/resume`, and the worker
model and effort are part of the developer instructions that feed
`buildCodexInstructionProfileKey`, so changing the worker rotates the thread key
and cannot resume a thread configured for a different worker.
Codex counts the primary in its session concurrency limit, so Stave configures
two total slots: one primary plus the single foreground Worker.

Arming Worker mode does not prove delegation. When a Worker is actually
started, Stave persists an immutable receipt on that tool event and shows the
preset, resolved worker model, and effort in the conversation trace and live
activity shelf. Native child-thread activity and ACP Worker activity are
correlated back to the receipt, so a completed card means the Worker returned
control to the primary. It does not claim that the primary reviewed the result,
because provider events cannot prove that semantic step.

Every Worker execution that establishes a provider session also creates a
persisted `delegated_usage` receipt. ACP
workers resume only a matching task/provider/model/effort/preset/instructions/
tools/turn-budget/workspace lane, bounded to 64 recently used lanes and 30
minutes. If the ACP agent reports prompt usage or the optional ACP session usage
update, Stave records its input, output, reasoning, context-window, cache-read,
cache-write, and cost fields, preserves them across workspace reloads, and folds
them into the turn total once. Native Worker runtimes
whose usage is only available as part of the parent total retain the execution
receipt without claiming an unreported per-worker cache count.

### Auto resolution and explicit failures

`Auto` is a deterministic per-preset, per-provider default — not a difficulty
classifier. Static providers resolve it to the preset's named default; Cursor
and Kiro resolve it through the runtime-advertised `auto` model. Explicit
Cursor and Kiro selections must exist in the current runtime catalog.

An explicit choice that is no longer valid returns an `unavailable` reason code
and disables execution. It is never silently replaced, because a swap would bill
a different tier than the one on screen:

- `primary_not_supported` — the active primary cannot orchestrate.
- `worker_model_not_found` — not a known model for this provider.
- `worker_model_not_supported` — known, but not worker-capable, or absent from
  the installed runtime.
- `provider_capability_unavailable` — the provider has no Worker-mode support.

Effort is clamped, not rejected, when a model's ceiling is lower than the
request. It is dropped entirely for models that reject the field — Claude's API
errors on `effort` for Haiku-class models, so a Haiku worker runs at its own
default and the UI says so rather than showing a dead select. Cursor model
variants already encode properties such as reasoning or speed in the model id.
Kiro exposes a separate effort scale, so the Worker role session is started with
the resolved Kiro effort.

### Presets

Presets bundle a role, a tool bound, and per-provider model/effort defaults.
Each one's description is written as a delegation trigger, because on Claude that
string is what the primary reads to decide whether to delegate.

| preset | intent |
| --- | --- |
| Patch hand | Applies a decided edit exactly. No verification. |
| Verified patch (default) | Applies the edit, then runs typecheck/tests until green. |
| Sweep | One mechanical transformation across many files. |
| Scout | Read-only investigation returning a conclusion. |
| Deep packet | Owns one bounded unit of real work at maximum effort. |
| Second pair of eyes | Reviews a diff for correctness; never edits. |

Description, instructions, tool list, and max turns are editable per provider in
Settings. An empty field means "use the preset", which is what stops a preset
improvement from being shadowed by a stale copy of its previous text; switching
preset therefore clears hand-edited copy rather than carrying it over.

When Worker mode is armed, delegation is the default for repository
investigation, implementation, verification, and review. Conversation-only
requests and truly atomic one-step actions may remain on the primary. A worker
that returns no output or stops before required verification is continued once
when the provider exposes a continuation handle; otherwise the primary finishes
the missing verification in the same turn rather than ending with a promise to
resume later. The default Verified patch budget is 60 agentic turns so ordinary
edit-and-test loops do not commonly exhaust the worker before verification.

The native-provider defaults pair bounded work with an economical model and a
higher effort tier. Cursor and Kiro keep their runtime `auto` selection unless
the user explicitly chooses another advertised model.

### Safety

- One foreground worker at a time (`maxConcurrency: 1`, plus Codex
  `agents.max_concurrent_threads_per_session = 2` — parent plus worker — and
  `agents.max_depth = 1`).
- Native workers inherit the parent turn's permission mode and sandbox, so a
  plan or read-only turn cannot gain write access by delegating. On Claude the
  nested subagent's tool calls still pass through the same `canUseTool` gate.
- Cursor and Kiro workers run in a dedicated ACP role session in the same
  workspace. They never receive the parent's resume id, bound secrets, or Local
  MCP servers. Only a matching task-scoped Worker lane can be resumed,
  and therefore cannot recursively launch another Worker. Nested permission
  requests are routed to the parent turn's approval UI.
- ACP Worker grants contain an unguessable turn-scoped key, permit one in-flight
  call, and are revoked when the parent turn ends. A stale transcript cannot
  reuse one.
- `background` is never set on the Claude worker: Stave's turn loop cannot
  deliver a background-completion notification, and background subagents lose
  most tools anyway.
- Utility, control, and secondary read-only turns never register a worker.
  Registration is opt-in via `workerModeEligible` on the conversation turn only,
  and each runtime additionally refuses on a `secondary-read-only` policy: Claude
  gates `buildClaudeWorkerAgents` behind `!secondaryReadOnly`, and Codex threads
  a `secondaryReadOnly` flag into `buildCodexConfigOverrides` so neither the
  `agents.*` overrides nor the worker brief in `developer_instructions` are sent.
  A secondary run is a bounded analysis pass; delegating would escape both its
  turn budget and its read-only contract.
- Cross-provider or durable delegation remains a Child Task. Worker mode never
  switches provider, and its bounded role-session reuse is not a durable child
  task or an independently scheduled execution.
- Only per-turn and per-thread runtime configuration is used. No provider config
  file in the user's home is written.

## Image attachment transport

Stave keeps image attachments in the shared canonical conversation contract,
then converts them into each provider's structured image input at the runtime
boundary. Workspace images selected from disk stay path-backed; pasted images
stay as data URLs until that conversion. Image bytes are omitted from the text
prompt when the native input is available. Codex native inputs request
low-detail processing to reduce image-token usage.

Claude receives image content blocks in the initial SDK user message. Codex
receives `localImage` or `image` items in `turn/start` after Stave confirms that
the selected catalog model advertises image input. Unsupported inline formats,
capability-check failures, and unreadable local paths retain the existing
text or file-tool fallback instead of being silently discarded.

## Claude runtime

Claude turns are handled in `electron/providers/claude-sdk-runtime.ts`.

Current baseline: exact pin `@anthropic-ai/claude-agent-sdk@0.3.197` with bundled Claude Code `2.1.197` support.

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
- MCP elicitation and supported user dialogs -> `user_input`
- provider-native message UUID -> `history_boundary`
- sandbox and auto-mode denial -> `permission_denial`
- hook start, progress, response, or blocking feedback -> `hook_activity`
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
- sandbox credential file paths and environment-variable names (deny-only)
- setting sources
- task budget
- prompt suggestions
- agent progress summaries
- subagent text forwarding
- file checkpointing
- session fork / resume-at-message controls
- message-boundary task branching and checkpointed file rewind
- skill, local plugin, main-agent, and fallback-model hints
- strict MCP config
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
- Mode presets
  - `Manual`: `default` + sandbox on + unsandboxed off + dangerous skip off
  - `Guided`: `acceptEdits` + sandbox off + unsandboxed on + dangerous skip off
  - `Auto`: `auto` + sandbox off + unsandboxed on + dangerous skip off
  - `bypassPermissions`, `plan`, and `dontAsk` are reachable only from the
    Permission Mode field and always present as `Custom`.

In the chat composer, Stave now shows the active provider mode as a pill beside the model selector and keeps the detailed runtime values in the `Runtime` drawer. Inline runtime adjustments no longer happen there; the editable controls live in Settings.

When Claude `agentProgressSummaries` is enabled, Stave forwards the SDK flag explicitly and renders incoming `task_progress.summary` updates as inline system events in the active assistant message.

Stave maps Claude Agent SDK MCP elicitation requests and the `refusal_fallback_prompt` user dialog into the same Stave `user_input` card used by provider tools. URL elicitations render as confirmation prompts; form elicitations are coerced back to the SDK's requested schema before Stave responds.

Stave now forwards Claude `settingSources` explicitly. The default Stave setting enables `project`, which allows `CLAUDE.md`, project settings, and project-native slash commands to participate in turns; `local` and `user` can be toggled from Settings.

When Stave passes its local MCP server through the SDK, it also merges Claude's
file-backed MCP servers into the same programmatic config so they are not
replaced. The merge includes user servers from Claude's `.claude.json`,
project servers from `.mcp.json`, and the matching workspace-local entry under
`projects`; precedence is local > project > user, with Stave's authenticated
loopback server winning any final name collision. Collision logs contain only
the server name and source, never headers or environment values. Enabling
`Strict MCP Config` keeps the existing isolated behavior and skips file-backed
servers.

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
- Interactive prompts containing `@web` opt that turn into Claude Code's native
  Chrome integration through the SDK `extraArgs` equivalent of `--chrome`.
  Stave explicitly passes the native no-Chrome flag on other turns, including
  plan mode, unattended automation, and secondary read-only analysis. Claude's
  extension owns site access and sensitive-action
  confirmation; Stave records only normalized connection status in workspace
  Information.

Compaction checkpoint UI support:

- Compact boundaries render as a dedicated checkpoint divider card in the chat timeline.
- Stave captures `git rev-parse HEAD` at each Claude `compact_boundary` event and stores it on the matching system event.
- The checkpoint card can run `git restore --source=<gitRef> --staged --worktree .` to restore the workspace to that boundary.
- This restore only affects workspace files. It does not rewind provider-native session state.

## Codex runtime

Codex turns are handled in `electron/providers/codex-app-server-runtime.ts`.

High-level flow:

1. The renderer submits a turn through the same provider bridge.
2. `streamCodexWithAppServer(...)` resolves a local `codex` binary and starts or reuses a singleton `codex app-server --listen stdio://` subprocess.
3. Stave calls `account/read` so an existing CLI login can be reused without extra setup when possible.
4. Stave starts or resumes an App Server thread for the current task and runtime configuration.
5. `turn/start` streams App Server notifications into the same `BridgeEvent` format used by Claude.
6. File changes are post-processed through `turn-diff-tracker.ts` so the UI can render diffs.

Codex prompt injection note:

- Stave now forwards response-style and project/system prompt overrides through Codex `developer_instructions` config instead of prepending visible `<system>` blocks to each user turn.
- Task history, selected text-file context, skill context, and retrieved context still render into the provider prompt body because they are part of the actual turn payload rather than hidden session config. Supported image attachments use the native image items described above, while the prompt keeps only their labels and fallback instructions.
- Stave always appends browser-tooling guidance to `developer_instructions`. It directs Codex to use ordinary web search for general research, its installed native Chrome plugin for explicit interactive `@web` requests, and the Stave Lens MCP tools (`stave_lens_*`) only when the current project's rendered UI needs visual inspection or validation, or when the user explicitly requests live page inspection or interaction. The provider-native browser stays unavailable to plan mode, unattended automation, and secondary read-only analysis. Stave does not force-enable a disabled Chrome plugin, and records only normalized connection status in workspace Information. It still disables the unrelated ChatGPT desktop bundled `browser@openai-bundled` plugin per thread via the `plugins."browser@openai-bundled".enabled = false` config override. See `electron/providers/codex-runtime-config.ts` and [Provider Browser Access](../features/provider-browser-access.md).

Codex event mapping:

- native `agentMessage` items -> `text`
- native `reasoning` items -> `thinking`
- native `mcpServer/elicitation/request` form prompts -> shared `user_input` UI
- URL-mode elicitation requests are surfaced through the same `user_input` card with an external-link action and an explicit continue / decline decision
- native `plan` items and `item/plan/delta` -> `plan_ready`
- command execution -> `tool`
- MCP tool calls -> `tool`
- web search -> `tool`
- provider-native browser selection -> `browser_connection` metadata in workspace Information
- file changes -> diff events
- hook lifecycle -> `hook_activity`
- acknowledged turn id -> assistant `history_boundary`
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

- When `codexPlanMode` is enabled, Stave forwards the App Server thread
  config override `collaboration_mode_kind = "plan"`.
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

Codex checkpoint and compaction support:

- The App Server path does not emit the same `compact_boundary` notification as
  Claude. Stave records a lightweight checkpoint boundary immediately before
  each normal Codex turn, including the current Git `HEAD` when the working
  directory is a repository.
- Typing `/compact` in a Codex chat is intercepted before `turn/start` and
  forwarded to the App Server's `thread/compact/start` RPC. Stave then emits a
  manual compact-boundary event and keeps the same thread available for the
  next turn with its server-side summarized history.
- These boundaries are conversation provenance markers, not restore
  operations; Stave does not claim that Codex can restore the App Server
  thread to a checkpoint.

Conversation history actions are tracked separately from checkpoints and
compaction:

- Claude and Codex can fork a new native session or thread from a recorded
  assistant turn, creating a new Stave task while leaving workspace files and
  the source task unchanged.
- Codex can roll its App Server thread back to a recorded turn. Stave removes
  later task messages only after the native rollback succeeds. Claude exposes
  no equivalent in-place rollback API, so the UI keeps the action visible but
  explains why it is unavailable.
- Manual task rename updates every linked Claude session and Codex thread. The
  Stave task title remains authoritative if a provider rename request fails.
- The renderer derives action availability from a shared provider capability
  descriptor and persisted native session/turn metadata. Legacy, streaming,
  stale-session, and latest-turn cases remain visible with a reason instead of
  silently hiding the control.

Codex-specific runtime controls come from the UI and runtime options:

- network access
- file access
- shell approval policy (`never`, `on-request`, `untrusted`, plus persisted
  legacy `on-failure` compatibility)
- App/MCP tool approval (`inherit`, `auto`, `prompt`, `writes`, `approve`)
- web search (`disabled`, `cached`, `live`, `indexed` when supported)
- reasoning effort
- reasoning summary and raw reasoning toggles
- plan mode
- binary path override
- provider timeout
- debug stream logging

Before a normal Codex turn, Stave reads App Server's resolved config-layer
metadata for the active workspace and fingerprints the MCP-bearing sources.
Global sources such as system, user, selected-profile, and managed config files
are tracked once per Codex executable and `CODEX_HOME`; project
`.codex/config.toml` candidates are tracked per workspace. When a source changes,
Stave restarts the App Server when safe and begins fresh native threads so the
next turn receives the updated MCP catalog.

Codex slash-command behavior:

- The current Codex App Server/CLI path does not expose a native slash-command catalog that Stave can enumerate.
- Stave therefore shows a bundled Codex slash-command reference and does not block unlisted commands locally.
- Slash-command-only turns are sent without Stave's normal context wrapper so provider-native command parsers can see the leading `/command` token.
- Stave handles Codex `/goal` through the App Server `thread/goal/*` RPCs so users can set, view, pause, resume, or clear the active thread goal from the chat composer.
- After `/goal <objective>` sets a new objective, Stave queues that objective as the next user turn so work continues under the newly active goal instead of stopping at the status update.
- Stave also listens for Codex App Server `thread/goal/updated` and `thread/goal/cleared` notifications, stores the current task goal as runtime state, and shows the active goal status/progress near the chat input.
- The Settings developer surface mirrors the native Codex MCP/runtime status rather than synthesizing a Claude-style plugin list.

Stave uses `never`, `on-request`, and `untrusted` for selectable Codex shell
approval policies. It preserves persisted `on-failure` values for compatibility
but does not use that legacy mode as a new default.

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
  - `low`: fastest.
  - `medium`: balanced default.
  - `high` / `xhigh`: slower, more deliberate.
  - `max` / `ultra`: deepest reasoning tiers introduced with the GPT-5.6
    Codex CLI scale.
  - `minimal` is a legacy persisted value that is no longer selectable in the
    UI; Codex App Server turns normalize it to `low` because the upstream
    model API rejects built-in tools such as `image_gen` and `web_search`
    with `reasoning.effort = minimal`.
- `reasoning summary`
  - `auto`: let Codex decide.
  - `concise`: short summary.
  - `detailed`: fuller summary.
  - `none`: no summary.
- `web search mode`
  - `disabled`: fully local.
  - `cached`: App Server-aligned default; lower-volatility search path when available.
  - `indexed`: use the indexed corpus when the selected runtime supports it.
  - `live`: allow current web lookup.
- Example mode presets
  - `Manual`: `read-only` + `on-request` + network off + web search disabled
  - `Guided`: `workspace-write` + `untrusted` + network off + web search cached
  - `Auto`: `danger-full-access` + `never` + network on + web search live

Current Codex defaults follow the App Server-aligned baseline in Stave: `workspace-write` file access, `untrusted` approvals, `network access = off`, `web search = cached`, `reasoning effort = xhigh` (the current server-catalog default for the GPT-5.6 family), raw reasoning off, and reasoning summary auto-detection enabled.

Stave now forwards an explicit `show_raw_agent_reasoning: false` override when the Codex UI toggle is off, so local CLI defaults or config files do not leave raw reasoning enabled unexpectedly.

Codex threads are keyed by task/cwd plus the active file-access, network, approval, model, reasoning, web-search, experimental App Server capability, and developer-instruction settings so Stave can preserve thread context without mixing incompatible runtime modes.

When a task switches from one Codex model to another, Stave does not attempt to resume the older native thread. Instead it replays the task history into a fresh Codex thread so model-bound session errors do not break the next turn.

## Codex verification baseline

- Codex App Server transport: local `codex app-server` from Codex CLI `0.145.0`
- Current schema verification baseline: `0.145.0` (verified July 31, 2026)
- Current Stave-supported Codex model IDs: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5` (default: `gpt-5.6-terra`)

Stave requires a user-installed Codex CLI. Users must have Codex CLI available in their PATH or configured via `runtimeOptions.codexBinaryPath` / `STAVE_CODEX_CLI_PATH`. A user-configured binary path still takes precedence over auto-discovery. Stave does not currently enforce a semantic-version floor, so controls for newly adopted features must be capability-gated for older executables.

The Codex App Server adapter advertises the `experimentalApi` capability during initialization for App Server features that require it, but thread and turn request payloads are kept within the generated `0.145.0` protocol surface.

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
