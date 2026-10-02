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

### Optional provider discovery

Cursor and Kiro model options and account usage meters follow the native status
shown in Settings > Tooling. Discovery checks the executable, ACP support, and
native login together, sharing a bounded probe and a one-minute cache. Missing,
unsupported, logged-out, and initially unverified providers have no new model
options or account-usage reads. Tooling remains available to diagnose and repair
them. Existing tasks retain their selected provider, model, and effort.

A failed status check after a successful one retains the last catalog and usage
as unverified, pauses reads, and excludes the provider from new automatic
selection. A usage endpoint failure alone does not hide authenticated models;
exhausted quota remains visible. Startup, window focus, binary changes, periodic
discovery, and Tooling Refresh update status. Late replies cannot repopulate a
catalog or usage meter after a detected logout or configuration change.

### Native account profiles and execution

The desktop bridge exposes `window.api.providerAccounts` for Claude and Codex
profile registration, renaming, removal, and native login. Each provider keeps
an immutable **System default** profile that follows the existing environment
and native login. Registration creates an app-managed configuration directory
or references an existing absolute directory in place. Profile IDs are opaque;
labels can change, while a registered directory stays attached to its ID.

Electron main stores only nonsecret metadata in
`<app-data>/provider-accounts.json`, using an atomic replacement and restrictive
file permissions. Native credentials and session files stay in the provider's
directory. Removing a registration retains that directory and its contents.
Duplicate directories, including symlink aliases, are rejected. Invalid storage
and missing, removed, mismatched, or redirected profiles fail explicitly.

`providerAccounts.login` starts `claude auth login` or `codex login` in a dedicated
terminal session with that profile's `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. It returns
only a terminal session ID. The existing terminal bridge owns output, input,
attachment, and closure. Login sessions buffer output until attached and use
separate slots for each resolved profile and executable. Their output is retained
in memory while alive and excluded from persisted terminal snapshots. A launch failure leaves
other profiles and running sessions intact. Native login itself remains owned
by the provider; Stave does not read or copy its credential files.

Custom profile environments select their configuration directory before MCP
environment discovery and reapply it after hydration. They omit inherited
provider API keys, OAuth tokens, and endpoint overrides. System default preserves
those existing settings. Bound vault secrets cannot override `STAVE_USER_DATA_PATH`,
`CLAUDE_CONFIG_DIR`, `CLAUDE_SECURESTORAGE_CONFIG_DIR`, or `CODEX_HOME`.

Conversation requests accept `claudeAccountProfileId` and
`codexAccountProfileId`. Omitted IDs retain System default behavior. The host
captures both selections in request-local async context, and each primary turn
captures its selection before asynchronous dispatch. Native child environments,
Codex App Server clients, Claude session maps, MCP observations, model catalog
cache keys, and usage reads are separated by profile. Reusing a Codex client
revalidates the registration; removing a profile prevents new requests without
terminating a turn already running on it.

Native session cursors for custom profiles are stored under
`providerSession.accounts[profileId][providerId]`; existing top-level entries
remain System default. Session and terminal events carry their originating
profile ID, including synthesized terminal failures. Queue entries capture both
profile IDs, including explicit System default, so changing a selection does not
retarget an already queued turn. Account selection changes invalidate that
provider's displayed usage only (other providers keep their readings), and late
usage responses cannot replace the new selection's readings.
Custom Claude usage reads search only the selected configuration directory and
its scoped keychain service, without falling back to default credentials.

Settings > Tooling provides account registration, label editing, removal, and
native sign-in terminals for Claude and Codex. **Add and sign in** creates a
managed profile and immediately opens its sign-in terminal; registering an
existing absolute configuration directory is under **Advanced: reuse a folder
you already use** and skips the sign-in step. Removing a profile keeps its local
files. The Tooling account selector and the status bar usage meter set the
global default for **new turns** for that provider across tasks; running turns,
queued messages, and open CLI sessions retain their captured account. The
meter, the Tooling selector, and the Standalone CLI tab selector draw a choice
only when a provider has more than one account (the selectors also stay when the
selected account was removed, as the way back), and the meter names the account
beside the provider only when it is not System default or is an API
connection. API connections are listed beside sign-in accounts; see
[API connections](#api-connections-claude-code-and-codex). The user guide is
[Accounts and API connections](../features/accounts-and-gateways.md). An unavailable registration fails explicitly rather than silently
switching to System default.

Message provenance carries the originating profile for native fork, rollback,
file rewind, and saved agent-history reads. Task rename updates each linked
native session. Claude SDK filesystem operations run in disposable Node workers
with isolated environments because the SDK helpers do not accept a configuration
directory. They never change the host process environment.

Workspace and standalone CLI tabs persist the account they first launched with.
Legacy resumed tabs use System default. Live slot reuse checks account identity
and registration; Codex session discovery reads the launched `CODEX_HOME`.
Closing and reopening an existing tab does not switch it to the latest default.
Create a new workspace CLI tab to use a different account.

The login bridge reports process creation, not authentication success. Complete
the native flow and close its terminal to refresh status and usage. Login output
is not stored as a terminal transcript. Real multi-account login, cancellation,
expiry, and restart flows require separate desktop verification.

## Cursor Agent ACP runtime

Cursor is available for interactive primary task turns. Stave starts a
disposable `agent acp` process for each prompt, negotiates ACP v1, reuses the
Agent CLI login, and creates or loads the task's native session. The process is
closed after the turn while the native session id remains in workspace
persistence for the next prompt. ACP v1 `session/load` replays the prior
conversation as `session/update` notifications before it answers; Stave already
has that transcript, so the shared ACP runtime discards everything the agent
sends while that load request is in flight and only maps updates that arrive
after the session is open. Provider-namespaced notifications outside the load
window are unaffected, because MCP startup reports arrive during `session/new`.

The shared ACP layer used by Cursor and Kiro owns bounded NDJSON framing, JSON-RPC request lifecycle,
schema validation, cancellation, and stable session-update mapping. Official
ACP v1 does not define a message-size cap or a client setting that shrinks
`session/update` payloads. Stave therefore accepts NDJSON lines up to 32 MiB
and drops a larger line without closing the process, so a large tool result,
diff, or `session/load` replay cannot poison every follow-up turn. Dropped
JSON-RPC responses fail that one request; notifications are skipped. The Cursor
profile owns executable discovery, authentication, mode and model selection,
and namespaced question, plan, todo, task, and image notifications. Renderer
and IPC contracts continue to use normalized Stave events rather than exposing
ACP wire payloads.

Cursor Agent can also stall when its Connect-RPC HTTP/2 stream to the Agent
backend fails. The CLI writes a `RetriableError` envelope — `PING timed out`,
`NGHTTP2_INTERNAL_ERROR`, a generic `[unavailable]` / `[internal]` drop, or
`[resource_exhausted]` — either on stderr or as the last line of an ACP
assistant text chunk that still answers `session/prompt` with `end_turn`.
That is an Agent-to-backend network drop, not an ACP framing error and not a
Stave setting. The Cursor profile classifies the envelope, does not append
`agent login` help, and does not keep the raw line as assistant text.
Stderr drops fail the turn immediately because the process is already dying.
A last-line text `stream_drop` gets one same-session continuation; capacity
does not auto-retry. Either way a terminal transport or capacity failure
offers Resume, which starts a new turn that inspects the workspace before
continuing unfinished work. There is no ACP option that selects HTTP/1.1 or
relaxes the Agent ping timeout.

ACP tool calls are also renamed before they reach the renderer. Agents put prose
in `toolCall.title` — usually the whole shell command or an absolute path —
while Claude and Codex send a canonical tool name and leave the target to the
input. `acp-tool-naming.ts` maps the ACP `kind` onto the same canonical names
(`execute` → `Bash`, `read` → `Read`, `search` → `Search`, …), renames
agent-specific input keys onto the keys the trace chip reads, and moves the
title into the input when the agent sent no structured target. Trace rows and
approval headers therefore read as a short title plus one target chip on every
provider. Short label-like titles (MCP tool names) stay as the tool name.

Cursor supports `agent`, `plan`, and `ask` session modes. At app startup, Stave
loads the model values advertised by an authenticated ACP session. Current
Cursor builds honor `clientCapabilities._meta.parameterizedModelPicker`, so
the catalog is bare model ids and effort/fast are independent session config
options, the same way Claude, Codex, and Kiro expose those controls. The effort
config id depends on the selected model (`effort`, `reasoning`, or
`reasoning_effort`), and a session left on Auto advertises no effort option at
all. The composer still offers the effort scale for those bare model ids; a
turn applies a value only when the selected model's live session config
advertises it. Older builds still encode effort, context, thinking, and fast
in the model id; the composer then groups those accepted values by base model
and only selects an advertised combination. The broader `agent --list-models` output is not
used because the ACP server rejects variants it did not advertise. `Auto`
remains the offline fallback; a configured model is applied only when the
active ACP session advertises the same value. Tool permissions use one-turn
allow or reject choices, questions preserve provider option ids, and plan
creation can pause the active turn for approval or revision in the plan
viewer. Approval option ids are selected by the protocol `kind`, not by id text,
because Cursor advertises `allow-once`/`reject-once` while Kiro advertises
`allow_once`/`reject_once`.

Any request that blocks a turn — a permission, a question, or a plan review —
registers its resolver before the event is announced. Announcement is
synchronous all the way to the listener, so a listener that decides inside that
call would otherwise reach the responder before the request existed and be told
the request is unknown, leaving the turn to hang until the decision timer fired.
The Claude runtime takes the same ordering through the `announce` hook on
`waitForClaudeToolDecision`, which additionally skips announcing a request whose
signal already aborted.

When a runtime also advertises an `allow_always` option, the approval card shows
an `Always allow` action alongside approve and reject, and the decision is sent
with `scope: "always"`. Cursor persists that choice as a rule in its own
permissions allowlist, so later turns stop asking for the same command. Stave
never synthesizes the scope: the button appears only when the option was
advertised, and an `always` scope for a request that did not advertise it
narrows to allow-once rather than failing the turn. For those approvals Stave
hides its own client-side trusted-tools shortcut. That shortcut keys on the
serialized tool input, so it re-matches only that exact payload, while the
provider rule generalizes to the command.

Cursor parameters that the session advertises only one value for render as plain
labels instead of controls. The ACP session rejects any model value it did not
advertise, so a segmented control with one reachable value would imply a
choice the runtime does not accept.

Cursor approval autonomy is a process flag on the ACP subcommand, not an ACP
parameter, so it applies for the whole session:

- `Manual`: no flags. Every tool call raises `session/request_permission`
  unless it matches Cursor's own permissions allowlist.
- `Guided`: `--auto-review`. Cursor's server-side classifier runs what it judges
  safe and asks for the rest. Which calls that covers is decided by Cursor, so
  Stave cannot predict it; shell execution was still prompted when this was
  verified with an empty allowlist.
- `Auto`: `--force --approve-mcps`. No permission requests are sent at all.

Primary Cursor turns load user and workspace entries from Cursor's native
`mcp.json` files. Primary Kiro turns likewise retain Kiro's native
`~/.kiro/settings/mcp.json` and `<workspace>/.kiro/settings/mcp.json` routes.
Stave can manage `~/.cursor/mcp.json` and
`<workspace>/.cursor/mcp.json`, plus Kiro's corresponding user and workspace
files. Remote OAuth is started with Cursor's own
`agent mcp login <server>` command so the authentication remains in Cursor's
storage. Stave does not copy OAuth sessions between providers. Target-native
entries are not also sent in `session/new`, avoiding duplicate registration and
preserving native OAuth metadata.

Primary Cursor and Kiro turns may additionally receive compatible file-backed
Claude and Codex MCP entries through `session/new` / `session/load`. Before
injection, Stave reads the target's native user and workspace files and removes
shared entries with a matching name or credential-free connector fingerprint.
Unreadable or invalid target-native files fail closed to avoid duplicate or
silently re-enabled routes. Stave can forward stdio commands and HTTP URLs, but
it cannot forward provider-hosted account connectors or plugin runtimes because
their OAuth session and transport are not present in native configuration. SSE
servers are not forwarded through this shared projection.

Cursor's config carries a third, finer lever that is independent of the preset:
`approvalMode` (`allowlist` by default, plus `unrestricted` and `auto-review`)
and a `permissions.allow` / `permissions.deny` rule list. Rules parse as
`/^\s*(Shell|Bash)\s*\((.*)\)\s*$/`; a `:` splits the body into a command
glob and an argument glob, and otherwise the body matches as a glob, a command
prefix, or the bare base command. `Shell(echo)` therefore covers
`echo anything`. A matching rule suppresses the prompt under `Manual` and under
`Guided` alike, which is why an `Always allow` answer makes a later identical
command run unattended. `Read`, `Write`, `Grep`, `WebFetch`, `WebSearch`, and
`Task` are the other rule kinds.

Rules live in the CLI's global config, and a project may add
`<repo>/.cursor/cli.json`, whose schema is strict and carries only
`permissions`. Project files are merged from the git root down to the working
directory, and the merge replaces arrays rather than unioning them, so a project
file that declares `deny: []` clears the user's global deny list for that
project. Stave does not write either file; it lets Cursor persist its own rules.

The preset flags are accepted by `agent acp` even though `agent acp --help` does
not list them. Verify them against the installed CLI on upgrade.

The composer consumes a provider-neutral model-catalog interface. Static
catalogs and runtime adapters are normalized before the searchable provider
list is rendered, so adding another provider does not require another fixed
matrix in the composer.

Cursor Agent does not report turn usage over ACP: its `session/prompt` result
carries only a stop reason, and it never sends a `usage_update`. Token counts
exist in the CLI's non-ACP print mode, which Stave does not drive. The post-turn
usage control stays hidden on those turns rather than repeating "usage not
reported" on every Cursor message. That empty-state badge is reserved for
providers that sometimes report usage (Kiro); the native runtimes keep
rendering whatever usage record they report, including a zero one. The shared
ACP layer accepts prompt usage in either the snake_case or camelCase spelling
and under `_meta`, so a later Cursor build that starts reporting usage is
picked up without a runtime change.

Cursor is intentionally excluded from subagents, secondary and unattended runs,
automations, native thread actions, and mid-turn steering. It does have a
Standalone CLI tab: that surface runs `agent` directly over a PTY and does not
go through the ACP runtime, so none of the ACP limitations apply to it.
ACP v1 `session/prompt` is blocking, and the Cursor Agent ACP dispatcher
(`2026.08.25-3e8eec8`) has no steer or inject method. Cancelling the prompt
and sending a new one aborts in-flight work, so Stave does not present that
as steering.
Utility inference can still use Cursor Ask as a last-resort read-only runner when
Codex and Claude are unavailable or not signed in. Bound secrets are resolved
only in the main runtime path and injected into the disposable primary-turn
process environment.

## Kiro CLI ACP runtime

Kiro is available for interactive primary task turns. Stave resolves an
authenticated `kiro-cli`, starts `kiro-cli acp` as a disposable ACP v1 process,
and creates or loads the task's native session. `session/load` history replay is
discarded by the shared ACP runtime, the same way Cursor follow-up turns drop
it. Stable ACP updates pass through
the same bounded transport, lifecycle, permission, cancellation, and normalized
event contracts as Cursor. Kiro-specific `_kiro.dev/*` notifications stay in a
namespaced extension mapper instead of leaking into shared schemas.

At app startup, Stave reads `kiro-cli chat --list-models --format json` through
the normalized runtime catalog bridge after a non-interactive authentication
check. The CLI 2.20 catalog uses snake_case keys (`model_id`, `model_name`,
`default_model`); the parser accepts those alongside camelCase. `Auto` is the
offline fallback. When the
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
usage control and the turn-activity Headroom/Usage tiles show a percentage and
a credit amount instead of a zero-token turn.

Kiro is intentionally excluded from subagents, secondary and unattended runs,
automations, and native thread actions. It does have a Standalone CLI tab: that
surface runs `kiro-cli chat` directly over a PTY and does not go through the
ACP runtime, so none of the ACP limitations apply to it. Interactive primary
turns can steer mid-turn: while `session/prompt` is in flight, Stave sends the
Kiro ACP extension `_session/steer` with the session id and a text prompt
block. That method is present in `kiro-cli` 2.20.2; if the agent answers
method-not-found or any other error, the steer is rejected and the original
turn keeps running. Steers are text-only. Cursor stays excluded because its
ACP agent has no equivalent method.
Utility inference can still use Kiro as a last-resort read-only runner when
Codex, Claude, and Cursor are unavailable or not signed in. Bound secrets are
resolved only for the disposable interactive primary-turn process. Runtime
upgrades should recheck ACP initialization, session create/load, prompt,
`_session/steer`, cancellation, permissions, model selection, and the JSON
model-catalog shape against the installed CLI before broadening this
capability boundary.

## Subagents

A subagent is any agent a task calls. Stave has two kinds, and both read as a
Subagent in the Task panel:

- **In-turn subagents.** A task that runs as an agent registers the agents in
  its `canCall` list (any agent usable as a subagent when the list is absent,
  at most eight) for that turn only. The host compiles them in
  `src/lib/agents/native-subagents.ts`; the renderer cannot supply them. Claude
  receives them as `agents` definitions (foreground, the lead's permission
  mode, the agent's model, effort, tools and turn limit). Codex has no
  per-agent definitions over the App Server, so the developer instructions
  list them and the lead starts them with `spawn_agent`, at most four at once
  and one level deep (`agents.max_depth = 1`); they run on Codex's default
  subagent model. Cursor and Kiro have none.
- **Durable subagents.** `stave_delegate_task` starts a real Stave task,
  optionally on the other provider, recorded on the run ledger
  (`electron/main/runs/delegated-task-coordinator.ts`). A read-only subagent
  runs beside other work in the caller's workspace; a writing subagent gets
  its own worktree by default. A read-only call waits for the answer (up to
  180 seconds) and returns it inline; any answer that arrives later is part of
  the caller's next turn as **Subagent results**. See
  [Delegated tasks](../features/delegated-tasks.md).

Every task turn carries a host-minted caller key on its Local MCP connection
(`electron/providers/caller-grants.ts`). The subagent tools take the calling
task from it and refuse a `parentTaskId` that names another task, and
`stave_run_task` caps the turn it starts at the caller's autonomy. The key is
derived per task, so a resumed Codex thread that kept its headers still names
the same task and the key never rotates a thread.

## Image attachment transport

Stave keeps image attachments in the shared canonical conversation contract,
then converts them into each provider's structured image input at the runtime
boundary. Workspace images selected from disk stay path-backed; pasted images
stay as data URLs until that conversion. Image bytes are omitted from the text
prompt when the native input is available. Codex native inputs request
original-detail processing so screenshots and document images retain the
fidelity needed for accurate inspection.

Claude receives image content blocks in the initial SDK user message. Codex
receives `localImage` or `image` items in `turn/start` after Stave confirms that
the selected catalog model advertises image input. Unsupported inline formats,
capability-check failures, and unreadable local paths retain the existing
text or file-tool fallback instead of being silently discarded.

Cursor and Kiro receive ACP `image` prompt blocks only when initialization
advertises `promptCapabilities.image`. Supported image data is removed from the
text prompt so it is not sent twice; unsupported formats retain their data URL
fallback. ACP path-backed images are limited to 5 MiB each and 10 MiB per turn,
with oversized files left path-backed for the agent's file tools. Kiro's legacy
`content` compatibility key stays text-only so image bytes are not duplicated
on the wire.

## Prompt context budget

Stave wraps every turn's user message with retrieved-context blocks, so anything
attached here is paid for again on each turn unless it is gated. Blocks carry a
stable `sourceId` and the gating decision is made in one place — the prompt
funnel `buildLegacyPromptFromCanonicalRequest` — rather than at each builder.

| Source id                      | Contents                                                        | Sent when                               |
| ------------------------------ | --------------------------------------------------------------- | --------------------------------------- |
| `stave:current-task-awareness` | Project/workspace/task identity, other visible tasks            | Every turn, deduplicated when unchanged |
| `stave:workspace-guidance`     | Workspace conventions, token-budget guidance, handoff procedure | First turn only                         |
| `stave:workspace-information`  | The Information panel dump                                      | Every turn, deduplicated when unchanged |
| `stave:latest-turn-summary`    | The Information panel's latest-turn recap                       | First turn only                         |

Rules:

- **First-turn-only** means "whenever the runtime reports an unprimed provider
  session". The funnel keys off `includeHistory === false`, which is the
  runtime's real resume decision. Do not gate on in-memory history length: it is
  paged (`TASK_MESSAGES_PAGE_SIZE`) and misfires on resumed tasks.
- Membership lives in `FIRST_TURN_ONLY_RETRIEVED_CONTEXT_SOURCE_IDS`
  (`src/lib/providers/canonical-request.ts`). Adding a block that never changes
  turn-to-turn means adding its id there, not adding a new call-site condition.
- `stave:workspace-information` is rebuilt from live state every turn but is
  usually byte-identical. `dedupeRetrievedContextForSession`
  (`electron/providers/retrieved-context-dedup.ts`) replaces an unchanged copy
  with a one-line pointer, keyed `taskId:sessionId:sourceId`. It never
  substitutes on a fresh session, and its hashes are committed only after the
  prompt is accepted by the provider — a failed dispatch must not convince the
  next turn that the content was delivered.
- Blocks in `STAVE_MCP_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS` are dropped entirely
  when the Stave local MCP is not attached, since the agent cannot act on them.
- The Information panel body is capped
  (`MAX_WORKSPACE_INFORMATION_CHARS`) on whole-line boundaries and points at
  `stave_get_workspace_information` for the rest. It carries no raw timestamp,
  so an idle turn's block stays byte-identical and stays deduplicated.
- `stave:project-memory` contains curated project knowledge recalled from SQLite
  for the current request, plus at most three explicit core entries. Automatic
  summary candidates stay out of recall until curated. The block is capped at
  `PROJECT_MEMORY_INJECTION_MAX_ITEMS` rows / `PROJECT_MEMORY_INJECTION_MAX_CHARS`
  characters, and deduplicated per session like the Information panel block.
  See [Repository memory](../features/repository-memory.md),
  `src/lib/task-context/repository-memory.ts` and
  `electron/persistence/repository-memory-store.ts`.

Claude's system prompt keeps its own cache boundary
(`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`); nothing here changes that.

## Turn autonomy and hard guardrails

`runProviderTurn` (`electron/providers/runtime.ts`) resolves one turn policy
for every turn before it reaches a provider, through
`electron/providers/turn-policy-entry.ts` and the pure resolver
`src/lib/policy/turn-policy.ts`. Composer, agent, delegated, mission, wake-up
and `stave_run_task` turns all pass through it; secondary read-only runs keep
their fixed posture. The resolved policy rides on the host-owned
`StreamTurnArgs.turnPolicy` field (never part of the renderer IPC schema), and
its option overrides are merged into `runtimeOptions`. The resolved options are
what delegation records as the parent's effective policy, so helpers inherit
the parent's autonomy and never more.

| Autonomy | Claude | Codex |
| --- | --- | --- |
| `ask` (your preset prompts) | Your settings, unchanged | Your settings, unchanged |
| `autonomous` (Auto/Bypass, Codex `never`, or an agent task) | Bypass stays Bypass; Plan and Don't Ask stay; otherwise `auto`. Stave's `canUseTool` allows any handed-over call that is not a guardrail, a user ask rule, a question or a Stave respond tool. Sandboxed turns set `sandbox.autoAllowBashIfSandboxed`. | `approvalPolicy: never`; `workspace-write` rooted at the workspace, or your `danger-full-access`; network as set; Stave Local MCP tools auto-approved except respond tools |
| `read-only` (read-only agent or delegation) | The read-only delegation posture (`dontAsk`, edit tools off, read-only sandbox) | `read-only`, `never`, network off |

A main Agent's saved permission is no longer a ceiling: `read-only` maps to
the read-only posture, any other saved value to full access (no data
migration). A delegated Agent's read-only permission becomes `access:
"read-only"`; cross-provider helpers of an autonomous parent are lifted to the
target provider's autonomous options (`electron/host-service/delegation-policy.ts`).
Cursor and Kiro keep the user's settings except for a read-only agent.

Hard guardrails (provider-specific enforcement):

- **Claude**: `electron/providers/claude-guardrail-hook.ts` registers a
  PreToolUse hook first in `hooks.PreToolUse` for every non-read-only primary
  turn. It returns `ask` (never `deny`) for G1 writes outside the workspace
  root (temp dirs allowed), G2 protected credential paths and variables (the
  user's sandbox credential lists plus a baseline such as `~/.ssh`, `~/.aws`,
  `~/.netrc`), and G3 irreversible remote effects (force-push to a default or
  protected branch, `git push --delete`/`:ref`/`--mirror`/`--prune`, package
  publishing, `gh release create|delete|upload|edit`, `gh repo delete`,
  `gh api -X DELETE`, `sudo`). Hooks run before the permission mode, so the
  `ask` reaches `canUseTool` under Bypass too (verified live with Claude Code
  2.1.286); `canUseTool` re-checks the guardrail and skips every automatic
  answer for it. Bash matching is literal (quotes, `cd`, redirects and
  here-documents are understood; variables and scripts are not); the sandbox
  bounds the rest when enabled.
- **Codex**: G1 is the `workspace-write` sandbox root; G4
  (`request_user_input`) is native. The App Server protocol (schema checked
  against Codex CLI 0.159.3; the recorded baseline is 0.145.0) exposes exec
  policy only as approval-time amendments and rule files under the Codex home,
  not as per-thread config, so Stave does not enforce G2 reads or G3 for Codex.
  With network on, an autonomous Codex turn can push or publish. This is a
  known gap.

Stave Local MCP: `stave_run_task` rejects permission runtime options
(`PERMISSION_RUNTIME_OPTION_KEYS`), automations created by MCP are saved
paused and cannot be unattended or bypass, `stave_respond_approval` is not
served, and Claude's prompt-free modes no longer allow every Stave tool
(`isPromptFreeStaveLocalMcpTool`: `auto` excludes respond tools, `dontAsk`
allows only read tools).

## Claude runtime

Claude turns are handled in `electron/providers/claude-sdk-runtime.ts`.

Current baseline: exact pin `@anthropic-ai/claude-agent-sdk@0.3.284` with bundled Claude Code `2.1.284` support.

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
- read-only sandbox (`claudeSandboxReadOnly`, restrictive only and set by
  read-only delegated tasks): forces the sandbox on with no unsandboxed escape,
  denies writes to the workspace from sandboxed commands (the CLI's own temp
  directory stays writable so each command can record its working directory),
  fails closed when the
  sandbox is unavailable, and turns off the SDK's `autoAllowBashIfSandboxed`
  default so only the turn's allowlist runs. Codex needs no equivalent: its
  `read-only` file access is already a write-denying sandbox.
- setting sources
- task budget
- prompt suggestions (Settings toggle, default on; it can only turn suggestions off — background lanes, secondary runs, and control queries never request them regardless of the setting)
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
- in `auto` mode, a call the CLI hands to Stave instead of deciding with its own
  classifier (the classifier is unavailable for the model or plan, or it chose
  to ask) is auto-allowed when it is one of the read-only built-ins plan mode
  also allows (Read, Grep, Glob, LS, NotebookRead, WebFetch, WebSearch,
  BashOutput, TodoRead, TodoWrite). It still prompts when a user ask rule forced
  the prompt, the CLI marked it default-to-no, the tool is disallowed, or it
  reads or searches a protected credential path. Bash and every other tool keep
  the prompt. Disallowed tools and settings deny rules are applied by the CLI
  before Stave is asked; the sandbox credential list guards sandboxed commands.
- when an `auto` turn first prompts and the SDK reports that the classifier is
  not running (the init message reports another mode, or the model list's
  `supportsAutoMode` flag is absent for the session's model), the turn shows one
  notice that Auto is unavailable and Claude will ask. Stave shows nothing when
  the SDK reports nothing usable.
- Interactive prompts containing `@web` opt that turn into Claude Code's native
  Chrome integration through the SDK `extraArgs` equivalent of `--chrome`.
  Stave explicitly passes the native no-Chrome flag on other turns, including
  plan mode, unattended automation, and secondary read-only analysis. Claude's
  extension owns site access and sensitive-action
  confirmation. Browser failures are reported in the turn instead of being
  persisted as workspace connection status.

Compaction checkpoint UI support:

- Compact boundaries render as a dedicated checkpoint divider card in the chat timeline.
- Stave captures `git rev-parse HEAD` at each Claude `compact_boundary` event and stores it on the matching system event.
- The checkpoint card can run `git restore --source=<gitRef> --staged --worktree .` to restore the workspace to that boundary.
- This restore only affects workspace files. It does not rewind provider-native session state.

## Codex runtime

Codex turns are handled in `electron/providers/codex-app-server-runtime.ts`. Thread start and resume, including the one retry from GPT-6.1 Sol onto GPT-6 Sol, live in `electron/providers/codex-ensure-thread.ts`.

High-level flow:

1. The renderer submits a turn through the same provider bridge.
2. `streamCodexWithAppServer(...)` resolves a local `codex` binary and starts or reuses a singleton `codex app-server --listen stdio://` subprocess.
3. Stave calls `account/read` so an existing CLI login can be reused without extra setup when possible.
4. Stave starts or resumes an App Server thread for the current task and runtime configuration.
5. `turn/start` streams App Server notifications into the same `BridgeEvent` format used by Claude.
6. File changes are post-processed through `turn-diff-tracker.ts` so the UI can render diffs.

Cancellation blocks reuse of the native thread until the matching `turn/completed`
arrives, whether stop happened before or after `turn/start` acknowledged. If the
App Server never confirms completion within the bounded grace period, Stave
quarantines that thread: an explicit resume reports an error and an automatic
retry starts a fresh thread. Pending interrupt RPCs are cleared when the local
turn closes.

Codex prompt injection note:

- Stave now forwards response-style and project/system prompt overrides through Codex `developer_instructions` config instead of prepending visible `<system>` blocks to each user turn.
- Task history, selected text-file context, skill context, and retrieved context still render into the provider prompt body because they are part of the actual turn payload rather than hidden session config. Supported image attachments use the native image items described above, while the prompt keeps only their labels and fallback instructions.
- Stave always appends native browser-tooling guidance (`CODEX_STAVE_NATIVE_BROWSER_INSTRUCTIONS`) to `developer_instructions`. It directs Codex to use ordinary web search for general research and, for explicit interactive `@web` requests, to use `cua_repl` with only the external Chrome surface. The in-app browser and desktop UI surfaces exposed by that tool do not satisfy `@web`. The provider-native browser stays unavailable to plan mode, unattended automation, and secondary read-only analysis. Stave does not force-enable a disabled Chrome plugin and does not persist a browser connection status. It still disables the unrelated ChatGPT desktop bundled `browser@openai-bundled` plugin per thread via the `plugins."browser@openai-bundled".enabled = false` config override. See `electron/providers/codex-runtime-config.ts` and [Provider Browser Access](../features/provider-browser-access.md).
- Lens guidance (`CODEX_STAVE_LENS_INSTRUCTIONS`) is appended **only when the thread will actually see `stave_lens_*` tools**: the local MCP must be registered with Codex *and* `browserToolsEnabled` must still be on. Without it there are no `stave_lens_*` tools, so the block would describe tools that do not exist. `hasStaveLocalMcp` is resolved before the thread is keyed and is part of `buildCodexInstructionProfileKey`, so toggling it is detected like any other instruction change.
- The developer instructions are **not** part of the Codex thread key. Codex only re-renders `developer_instructions` when it builds a new context window (first turn or compaction), never on a plain `thread/resume`, so a key that included them paid a full cold start — the entire history re-sent with no prompt cache — for a response-style edit, a Lens toggle, or a subagent change. Instead the runtime remembers the instruction profile each live thread last received (`buildCodexInstructionProfileKey`). When a resumed thread's profile differs, or is unknown because the app restarted, the next user turn is prefixed once with `[Stave Instructions Update]` followed by the current developer instructions, marked as replacing the earlier ones. The block is attached only to what the model receives; slash-command detection still runs on the bare prompt. Model, plan mode, cwd, and bound-secret fingerprint still rotate the thread.

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
  forwarded to the App Server's `thread/compact/start` RPC. Its empty response
  acknowledges acceptance only. Stave subscribes before dispatch and waits for
  `contextCompaction` item completion plus a successful `turn/completed` before
  emitting a manual compact boundary. Failure, process exit, timeout, and
  cancellation do not report success. The Runtime settings action uses the same
  completion contract. Duplicate compaction requests for a session are rejected
  while the operation is pending.
- Native automatic `contextCompaction` items also produce progress and compact
  boundaries. Automatic compaction does not end the surrounding normal turn.
- Compaction requires an existing resumable session; it cannot bootstrap task
  history into a fresh thread. Native command turns preserve the session's sync
  cursor, so pending cross-provider history reaches the next normal turn.
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

### Account usage refresh cadence

The status bar shows ChatGPT rate limits for Codex, but it must not turn into a
steady stream of authenticated requests against the user's account. Two layers
keep it quiet:

- **Push first.** The App Server sends `account/rateLimits/updated` on every
  model response during a turn. The Codex runtime records that payload in a
  host-side cache (`electron/providers/codex-rate-limits-cache.ts`), so an
  active session refreshes the status bar without any extra request.
- **Active read as fallback.** `account/rateLimits/read` runs only when the
  cached reading is older than 15 minutes, or when the caller passes `force`
  (the status-bar refresh button and the ≥97% pre-send dispatch guard).

Codex is the only provider with a push path. The cadence, caching, and backoff
rules that apply to every provider are described in
[Account usage reads](#account-usage-reads).

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
- Current Stave-supported Codex model IDs: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-5.6-terra`, `gpt-6-luna` (default: `gpt-6.1-sol`; `gpt-6-sol` is the fallback when 6.1 is unavailable; `gpt-6-astra` is the frontier tier)

### Default-effort ladder

Default reasoning effort follows each vendor's own recommendation for the
model; smaller models are not handed a deeper budget to compensate:

| Rung     | Claude         | Codex         | Default effort |
| -------- | -------------- | ------------- | -------------- |
| frontier | Fable 5.1      | GPT-6 Astra   | `medium`       |
| flagship | Opus 5.5 (+1M) | GPT-6.1 Sol   | Opus `medium`; Sol 6.1 `high` |
| balanced | Sonnet 5.5 (+1M) | GPT-5.6 Terra | Sonnet `high`; Terra `xhigh` |
| light    | —              | GPT-6 Luna    | `xhigh`        |

A frontier model pinned to `xhigh` mostly buys latency — codex-cli 0.153.2
reports `defaultReasoningEffort: "medium"` for Astra itself. Both vendors
advise lowering effort before lowering the model: a model switch always
invalidates the prompt cache, Anthropic positions Fable at low effort as
cheaper per task than a smaller model at high effort, and Luna's long-context
recall collapses (MRCR 8-needle 41%) whatever the effort. Raising or lowering
the tier stays a deliberate per-turn choice.

Sonnet 5.5's composer default is `high`. Its list price is half of Opus 5.5,
so ordinary Auto routes use the balanced rung at `high`. GPT-6.1 Sol lists at
the same price and keeps the same composer default as GPT-6 Sol, `high`.
GPT-6 Sol remains available as the fallback and keeps `high`. Terra sits one step
higher, at `xhigh`. Luna's composer default is `xhigh`, and Auto's bounded
route uses that same effort. A turn sends the effort stored in Stave. GPT-6.1
Sol, GPT-6 Sol, Terra, and Luna keep those Stave defaults after the App Server
catalog is fetched.
Other Codex models still follow that catalog's
`defaultReasoningEffort` when the stored effort is still the previous
default. `xhigh` and `max` stay off Sonnet and Sol. High complexity and
uncertain intent stay on Opus 5.5 at `high` effort. Safety-critical work stays on Fable. Cost-saver still steps that
ordinary route down one effort level.

Claude Haiku 4.5 is deliberately absent: the Claude API rejects `effort`
outright for Haiku-class models, so Stave drops the field rather than clamping
it. Legacy `gpt-5.5` keeps the `xhigh` cap it was verified at.

One knock-on effect worth knowing:

- Fresh-install `claudeEffort` / `codexReasoningEffort` seeds track the default
  model's rung. Existing users are carried over by the one-time settings
  migration in `src/lib/providers/settings-model-migration.ts`, which moves a
  stored effort only when it still matched that model's _old_ default — an
  effort the user actually tuned is left alone. The same migration moves the
  previous per-provider default models (Sonnet 5 → Opus 5, Terra → Sol) and is
  gated by `settings.settingsModelMigrationVersion` so it runs exactly once.
  A later step moves a selected Sonnet 5 id to Sonnet 5.5 and leaves effort
  unchanged, because `high` is the default for both. Another step moves GPT-6
  Sol from `medium` to `high` when the stored effort is still that old default.
  A further step moves Luna from `medium` to `xhigh` and Terra from `high` to
  `xhigh` on the same rule. The latest step moves a selected GPT-6 Sol to
  GPT-6.1 Sol and leaves the stored effort unchanged.

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

## Account usage reads

The status bar's usage meters are the only part of Stave that talks to a
provider without the user asking. Every read is an authenticated request against
the user's own subscription, and two of the paths can launch a provider CLI, so
the read policy is deliberately conservative on four axes.

### A tier decides how often to think; a reason decides whether to read

`src/lib/providers/rate-limits-poll-policy.ts` splits the decision in two,
because evaluating a cadence is free and issuing a request is not.

The **tier** sets how often the loop wakes up. First match wins:

| Condition | Interval |
| --- | --- |
| Window hidden | no read; slow recheck only |
| Usage meter open, or closed within 5 min | 2 min |
| Turn activity within 5 min | 5 min |
| Interaction within 1 h | 5 min |
| Interaction 1-4 h ago | 15 min |
| Interaction over 4 h ago | 30 min |

Only the meter unlocks the 2-minute tier. Refocusing the window records
ordinary attention and lands in the 5-minute tier: moving between apps while
coding says the user is working, not that they are watching a quota.

The **per-provider reason** decides whether that wake-up actually reads
anything. A provider's numbers cannot move unless something spends its quota or
its window rolls over, and Stave can observe both locally — it is the agent
client, so it knows which provider every turn belongs to, and the previous
snapshot already carries `resetsAt`. First match wins:

| Reason | Required freshness |
| --- | --- |
| No reading yet | read now |
| This provider's meter is open | 2 min |
| A known window boundary has passed since the last read | read now |
| A turn spent this provider within 15 min | 5 min |
| Nothing local, but the app was used within 4 h | 60 min (drift floor) |
| Nothing local, app unused over 4 h | no read |

The tier interval is a floor on every reason, so no signal can out-run the
current tier. The drift floor exists because usage spent outside Stave — a bare
`claude` in a terminal, the ChatGPT web app — is invisible here; it bounds that
staleness at an hour without becoming a poll.

Practical effect: a hidden window issues nothing, an open app with no turns
running issues one read per provider per hour, and a provider being actively
spent refreshes every 5 minutes. The old fixed 60-second timer issued 1,440 per
provider per day regardless.

The timer reschedules from each decision rather than running at a fixed period,
and opening the meter or starting the first turn after a quiet stretch re-arms
the loop immediately (`subscribeRateLimitsPollWake`) so a user never waits out a
30-minute timer for a number they just asked for. All of this state is in-memory
only; it is a freshness hint, not persisted state.

### Turn completion is the primary trigger

A finished turn is the one moment a provider's usage is known to have changed,
so `src/store/app.store.ts` refreshes that provider — and only that provider —
from the `turnCompleted` branch. This is what makes the meter correct; the timer
above is only there to catch drift. Bursts of short turns collapse into one
request because the host-side per-provider cache floor still applies.

### Reads are cached and back off on failure

`electron/providers/rate-limits/usage-read-policy.ts` wraps all four providers:

- A background read inside 2 minutes of the last one is served from cache.
- Consecutive failures back off geometrically — 5, 10, 20, 40 minutes, capped at
  1 hour. During a backoff the meter keeps showing the last successful reading
  rather than reissuing a request that is expected to fail again. A stale
  credential can no longer produce an authentication failure on every tick.
- A read that throws is accounted for as a failure too, so a throwing fetcher
  cannot escape the backoff.
- Concurrent reads of the same provider share one request.

The fetchers report failure as an `unavailable` snapshot rather than by
throwing, so the wrapper is told which is which by an explicit `classify`.

### `force` is bounded

`force` marks a read a user action is waiting on, and `reason` says which
action. A `manual` refresh — the meter's refresh button — bypasses the cache and
the backoff but never more than once per minute per provider, so the button
cannot be held down. A `dispatch-guard` read, the pre-send check when the
tightest window is at or above 97%, is not floored: its only job is to be
correct at the instant a turn is dispatched, and floored to a minute it would
wave a second send through on a reading it had already decided was too close to
call. It is still one read per send and still coalesced with any read already in
flight, which is interactive traffic rather than a background poll.

`force` is also the only thing allowed to launch a provider CLI. Background
polls pass `allowCliFallback: false`, so Claude's `claude -p /usage` panel is
never spawned by a timer; a failing OAuth read reports its error and lets the
backoff slow it down. `tests/usage-read-cli-boundary.test.ts` pins this.

### Stave identifies itself

Usage reads name Stave (`electron/providers/rate-limits/usage-client-identity.ts`).
The Claude OAuth usage endpoint needs only the bearer token and the
`anthropic-beta` header, so the request carries a `stave/<version>` user agent
rather than presenting another vendor's client string; Cursor's dashboard
request does the same, and the Kiro ACP session initializes as `stave-usage`.
Third-party traffic that names itself is attributable to a legitimate
integration; traffic that impersonates a first-party client is not.

### Turn traffic reports usage for free

Two providers report their own limits as a side effect of traffic the user has
already paid for, which is strictly better than any poll: newer, authoritative,
and free.

- **Codex.** The App Server pushes `account/rateLimits/updated` on every model
  response, recorded in `electron/providers/codex-rate-limits-cache.ts`.
- **Claude.** The SDK emits `rate_limit_event` carrying the utilization and
  reset time of the currently binding window — the same numbers Anthropic
  returns in its `anthropic-ratelimit-unified-*` response headers.
  `electron/providers/rate-limits/claude-rate-limits-observation.ts` folds that
  into the cached snapshot and moves `updatedAt` forward, which suppresses the
  next read.

The Claude path is deliberately an overlay, never a source: one event describes
one window, so it is applied only on top of a snapshot a real read established,
and only for windows it can name unambiguously. Model-scoped weekly limits and
the extra-usage credit budget are skipped rather than guessed into
`fableWeekly`. The event reports a 0-1 fraction while the snapshot is on the
0-100 scale, and that conversion lives in one place for the same reason.

Cursor and Kiro have no push path, so for them every reading costs a request and
the cadence above is the only thing bounding it.

### No long-lived probe sessions

Reading Kiro usage requires an ACP session. That session is closed 90 seconds
after the last read (`KIRO_USAGE_SESSION_IDLE_MS`) instead of being held for the
lifetime of the app, which is long enough for a forced read to reuse a
background one but short enough that no agent session sits open with no user
behind it. Shutdown still closes it explicitly.

### What this does not change

Behavior the user depends on is unaffected: workspace turn summaries, the
warning as a window approaches its limit, and the setting that blocks starting a
turn once an account limit is reached all keep working. The block decision reads
from the cached snapshot and only pays for a fresh read near the limit, which is
the case the floor above still allows.

## Status bar usage strip

Each connected provider gets one segment in the bottom status bar. When the bar
has room for every connected provider, a segment shows the full strip:

- One entry per quota window: a ring, the percent used in bold, then the window
  and its countdown (`5h · resets 1h 7m`). The ring's arc is the share used,
  toned at the shared thresholds (under 60% ok, under 85% warn, then danger).
  Inside the ring is the time-left clock: its hand marks how far the window has
  run, so an arc past the hand is usage running ahead of time. Claude shows its
  5-hour, weekly and, when reported, weekly Fable windows; Codex shows its first
  bucket's windows, named by their length; Cursor and Kiro show the monthly
  included usage.
- A spend entry, only for a provider that reported a cost: today's amount in
  bold, then this month's. It sums the cost reported on turns run in Stave by
  the local day and month (`persistence:summarize-turn-spend`, read from the
  `turns` table; no provider request). For a subscription account this is the
  API value the CLI estimates, not a charge. For an API-billing gateway it is
  spend, with the gateway's invoice as the final amount. Turns do not record
  their account, so the totals cover every account of that provider. Codex
  reports tokens only, so it gets no spend entry rather than `$0.00`.

When the bar is narrower, segments fall back to the compact meter: dot, name and
`5h 42%` with the time-left clock, without spend. The choice is a container
query on the bar's left group: `resolveUsageStripBreakpoint` estimates the full
width from each segment's name, windows and spend (using the widest percent and
countdown, so it does not flip as numbers tick) and picks a precompiled step.
The group clips rather than grows, so the bar stays one line and the right-hand
segments keep their place.

Hovering an entry explains it: what the window is, when it resets (countdown and
wall-clock time), and what happens at 100%. With Stop turns at 100% usage on
(the default), Stave holds new turns for that provider until the window resets
and running turns finish; with it off, Stave keeps sending turns. Stave does not
switch accounts on its own; the popover says so and offers the account switch.
The popover lists every window, the same 100% rule, and the spend breakdown with
the number of turns behind it. When a provider has more than one account, it
names the account the numbers belong to.

While a provider has no reading for its current account yet (at startup or right
after an account switch) and a read is in flight, its segment shows a spinner and
the popover says it is reading that account's usage, instead of "unavailable".
`rateLimitsInFlightByProvider` counts reads per provider for this; the switch
clears and re-reads only the provider whose account changed
(`src/store/rate-limits-account-reset.ts`).


## September 2026 model catalog

The primary Codex catalog includes GPT-6 Astra, GPT-6.1 Sol, GPT-5.6 Terra
(the balanced tier), and GPT-6 Luna. New tasks default to GPT-6.1 Sol.
When that model is unavailable, Stave starts the turn on GPT-6 Sol instead.
Utility inference and light-tier routing use GPT-6 Luna. Codex Sol supports
Low through Ultra, while Luna caps at Max. GPT-6.1 Sol and GPT-6 Sol both
start at High. Luna and Terra start at Extra High. GPT-6.1 Sol
was present in the Codex CLI 0.159.1 bundled catalog; no minimum client
version is assigned. See the [Codex model guide](https://learn.chatgpt.com/docs/models).

Claude defaults to `claude-opus-5-5` at Medium effort. The existing 1M variant
and Opus 4.8 overload fallback remain available. Opus 5.5 rejects disabled or
budget-based thinking, so the SDK adapter sends adaptive thinking for this
model even when an older setting requests another mode. See the
[Opus 5.5 migration guide](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide).

The balanced Claude rung is `claude-sonnet-5-5` at High effort, including the
1M variant. Sonnet 5.5 is for well-scoped everyday coding, documents, and
repeated agent tasks such as workers. Long-horizon and high-complexity turns
stay on Opus 5.5, and safety-critical turns stay on Fable. Sonnet 5.5 thinks
with adaptive thinking; disabled or budget-based thinking is not sent. It has
no fast mode, so a saved fast-mode setting is omitted for this model. Per-token
price matches Sonnet 5. See
[Building with Claude Sonnet 5.5](https://claude.dev/blog/building-with-claude-sonnet-5-5/).

A one-time settings migration updates previous default models and untouched
shortcut/preset seeds. A selected Sonnet 5 id, including one stored on a
shortcut or task preset, moves to Sonnet 5.5. That step does not rewrite
effort. A selected GPT-6 Sol whose effort is still `medium` moves to `high`.
A selected Luna whose effort is still `medium` moves to `xhigh`, and a selected
Terra whose effort is still `high` moves to `xhigh`. A selected GPT-6 Sol then
moves to GPT-6.1 Sol, and that step leaves the stored effort unchanged.
Other selected models, tuned efforts, and historical turns keep their saved
values. Cursor and
Kiro continue to use their own runtime-advertised catalogs. Provider account
and client rollout still determine whether a newly listed model can run.

Opus 5.5 (including the 1M variant) requires Claude Code **2.1.280 or newer**.
Sonnet 5.5 (including the 1M variant) requires Claude Code **2.1.284 or newer**.
Run `claude update`, or update the Claude desktop app, then retry. A catalog
entry does not establish compatibility with the installed runtime. Stave shows
this requirement in the model selector and Tooling settings. When Claude reports
a fallback, the conversation records the requested and actual models, with
version requirements when the provider supplies them. Actual assistant model
changes are also surfaced when the CLI omits a fallback event; in that case,
the cause is explicitly unknown. The response model label follows the actual
model. This fallback observation is specific to Claude.

When Codex reports that GPT-6.1 Sol is unavailable, Stave retries the thread
once on GPT-6 Sol and records that substitution. Codex also surfaces model
changes from `thread/start` and `thread/resume`
responses and `model/rerouted` notifications, updating the response model label.
Notifications are scoped to the active thread and turn. Recognized reroute reasons
are shown without treating policy routing as a version failure. Unsupported-model
and outdated-client errors retain the provider's message (including any minimum
version) and add installation-specific update guidance. No unverified minimum
version is assigned to GPT-6.1 Sol, GPT-6 Sol, or Luna. See the [CLI installation guide](https://learn.chatgpt.com/docs/codex/cli).

Model selection remains non-blocking when runtime support is unknown. Codex
picker descriptions distinguish entries advertised by the current runtime from
static entries whose support is unconfirmed; an advertised entry is not a
promise of account access. Installation guidance remains in Tooling settings
and compatibility errors rather than being repeated on every picker row.
Provider model-change events also carry optional `modelExecution` evidence
(requested model, reported model, and reason). Replay and saved messages preserve
it across same-turn message splits. The run overview exposes the evidence inside
a closed Model details disclosure without adding a confirmation step. Older
messages remain valid without this optional evidence.

### API connections (Claude Code and Codex)

An API connection is one app-level gateway key, billed per token, that Claude
Code and Codex share. `window.api.apiConnections` lists, creates, edits,
removes, checks, and discovers models for connections
(`src/lib/providers/api-connections.ts` owns the schemas and channels). The
record is `{ id, label, kind, secretId, endpoints, models }`: `kind` is
`vercel-ai-gateway` (endpoints derived) or `custom`; `endpoints` has an
optional HTTPS base URL per runtime (`claude-code`, `codex`); `models` is the
pinned shortlist, shared by both runtimes, with optional name, context window,
and per-token prices. Only the Secrets reference is stored or crosses IPC.
Electron main resolves the key and passes it to the host in the private
`gatewayCredential` envelope, one credential per runtime, never through
renderer runtime options, provider events, or diagnostics. Name, key
reference, and models can be edited; endpoints cannot. Records live in
`<app-data>/provider-accounts.json` under `connections`.

A connection is selected through the account machinery: the registry lists one
entry per runtime it serves, with the connection id as the profile id and a
`gateway` field (that runtime's endpoint, key reference, and model IDs), so
`claudeAccountProfileId` / `codexAccountProfileId`, queue capture, session
cursors, usage invalidation, and CLI-tab persistence work unchanged. Each
runtime gets its own managed configuration directory under
`<app-data>/provider-accounts/connections/<id>/<runtime>`. Selecting an entry
explicitly selects API billing: subscription usage endpoints are not queried,
the status bar shows **API billing** and reported spend, and Stave never
switches to a connection on its own. Removed registrations and missing or
locked keys stop new inference rather than falling back to subscription auth.
Running turns and open CLI sessions keep their launch connection.

Claude adapter: the child environment sets `ANTHROPIC_BASE_URL` to the Claude
Code endpoint (Vercel: `https://ai-gateway.vercel.sh/claude-code`, no `/v1`),
`ANTHROPIC_AUTH_TOKEN` to the key, and `ANTHROPIC_API_KEY=""`, following
[Vercel's Claude Code setup](https://vercel.com/docs/ai-gateway/coding-agents/claude-code).
Implicit model aliases and the subagent model are pinned to the first pinned
Claude model (else the first pinned model). Gateway queries and CLI sessions
disable native settings sources so local environment or credential helpers
cannot override the connection. Model IDs may be `creator/model`; non-Claude
models are labeled **Experimental in Claude Code**, because Anthropic
[does not support routing Claude Code to non-Claude models through a gateway](https://code.claude.com/docs/en/llm-gateway)
and Claude Code sends adaptive thinking and beta fields to model IDs it does not
recognize ([compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol)).

Codex adapter: Codex reads provider routing from config, not from
`OPENAI_BASE_URL`. Every `thread/start` and `thread/resume` on a connection
carries `model_provider = "stave-api-connection"` and a
`model_providers.stave-api-connection` table (`base_url` = the Codex endpoint,
Vercel `https://ai-gateway.vercel.sh/codex/v1`; `env_key =
"STAVE_API_CONNECTION_KEY"`; `wire_api = "responses"`; no
`supports_websockets`, which Vercel serves for OpenAI models only), per
[Vercel's Codex setup](https://vercel.com/docs/ai-gateway/coding-agents/openai-codex).
The key reaches the App Server through that variable at spawn; tool shells get
it masked to an empty value. A connection turn checks the key instead of
`account/read`, which reports `requiresOpenaiAuth: true` under thread-level
routing. A shared App Server spawned with an older key retires once idle. The
thread model must be pinned on the connection (empty picks the first pinned
OpenAI model, else the first pinned model). Codex CLI tabs get the same table as
`-c` overrides plus `--model`. Verified against codex-cli 0.159.3 with a local
endpoint: thread-level config routes `POST <base_url>/responses` with
`Authorization: Bearer <key>`, including after `thread/resume` in a new process.

Only pinned models appear in a connection's catalog. The model picker groups
them under the runtime as **<connection> · API billing**, with context and price,
and tags non-Claude models in Claude Code. Native Claude IDs resolve to a pinned
ID for the same model with a routing prefix; a different model is never
substituted. Explicit fallback, subagent, and auxiliary models must also be
pinned. Provider authentication environment names, including
`STAVE_API_CONNECTION_KEY`, are reserved against task-bound secret overrides.

Settings > Tooling > **API connections** adds Vercel AI Gateway connections by
pinning models from the public `GET https://ai-gateway.vercel.sh/v1/models`
catalog (language models with the `tool-use` tag; untagged language models are
kept; past `deprecated_at` dropped), or custom ones by model ID. **Check
connection** never runs inference: for Vercel it sends the key only to
`GET /v1/credits` and compares pins with the public catalog; for a custom
connection it asks the Claude endpoint for `GET /v1/models`, or the Codex
endpoint for `GET /models`. Requests are bounded and do not follow redirects;
raw response bodies are never returned. HTTP 401/403 reads as a rejected key,
402 as a used-up budget (Vercel's `quota_for_entity_exceeded`), and 429 as a rate
or free-tier limit. IDs are compared after removing a leading `claude-code/`
picker prefix and a trailing `[1m]` context marker, which Vercel's Claude Code
endpoint lists but strips before routing; the creator prefix is compared as
written. A successful check does not establish tool, streaming, reasoning,
cancellation, or billing compatibility; those require an authorized real turn.

Claude account profiles that carried a `gateway` field (up to 0.22.2) are read
as connections with the same id, label, key reference, models, and Claude
directory, and Electron main persists that conversion once at startup
(temporary migration `claude-gateway-api-connections`). A migrated Vercel AI
Gateway connection also serves Codex. The older `providerAccounts.create`
request with a `gateway` and the `checkGateway` channel still work and map to a
connection.
Local tests cover the schema and migration, request isolation, missing
credentials, both adapters' environment and config overrides, exclusive
catalogs, discovery filtering, and error mapping. Live gateway turns and
multi-account acceptance remain a separate verification step.
