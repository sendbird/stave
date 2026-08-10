# Run Core And Secondary Execution

The run core is Stave's smallest durable substrate for bounded, non-interactive,
read-only background provider execution. Its first and current consumer is
Compare Judge. It is not a generic workflow engine or a prerequisite for
Fleet, Advisor, or Crane.

The read-only limit belongs to the executor, not to the ledger: the ledger is
shared bookkeeping and is meant to gain further clients rather than be copied.
See `docs/architecture/agent-platform-taxonomy.md` for where it sits among the
other layers.

## Ownership

- The renderer owns user intent, presentation, and consumer-specific result
  parsing.
- Electron main owns the authoritative SQLite `Run`, `Step`, and `Receipt`
  ledger.
- The host-service owns provider execution and runtime cancellation.
- Provider adapters enforce the provider-specific read-only boundary.

Zustand and local storage may mirror consumer state, but they are not durable
completion truth. A host-service result is not terminal until main accepts the
matching execution identity and persists the transition.

## Durable Records

`src/lib/runs/run-domain.ts` defines the shared Zod schemas and pure
transitions:

- `Run` records the `secondary-provider` kind, origin, project/workspace/task
  ownership, bounded policy, provenance, status, and timestamps.
- `Step` records the `secondary-provider-turn` kind, dependency ids, attempt,
  execution identity, claim idempotency key, SHA-256 input hash, and a bounded
  result artifact reference.
- `Receipt` records a monotonic per-run sequence, transition type, execution
  identity, idempotency key, timestamp, and sanitized diagnostic detail.

Prompts and raw provider event streams are not written to the ledger. The
ledger stores the deterministic input hash and a consumer-owned artifact
reference. Receipt detail accepts only bounded diagnostic fields.

The current lifecycle is:

```text
pending
  -> claim -> running
  -> provider result -> waiting
  -> consumer parse -> completed

running/waiting -> failed | cancelled
running/waiting -> interrupted on main-process restart
failed/interrupted -> a new bounded attempt
```

Every attempt receives a fresh execution identity. Completion, failure, and
expected-execution cancellation reject an older identity, so late provider or
parser results cannot overwrite a retry or cancellation. Reusing the same
claim idempotency key returns the existing claim without starting another
provider turn.

## Process Contract

The request path stays on the established process boundary:

```text
consumer
  -> src/store/secondary-run-executor.ts
  -> window.api.runs
  -> electron/main/ipc/runs.ts
  -> electron/main/runs/secondary-run-coordinator.ts
  -> SQLite ledger
  -> host-service runs.execute-secondary / runs.cancel-secondary
  -> electron/providers/secondary-run-executor.ts
  -> Claude or Codex provider adapter
```

The shared transport schemas live in `src/lib/runs/secondary-run.ts`. The
preload and window declarations expose claim, execute, complete, fail, cancel,
lookup, and receipt-list operations. Main validates every renderer request,
checks that `cwd` belongs to the persisted project path, compares the
deterministic input hash, and awaits host dispatch before accepting the next
transition.

Cancellation is durable-first: main persists `cancelled` before awaiting the
host abort request. A late provider completion is then rejected by execution
identity and state.

At main persistence startup, `running` and `waiting` steps become
`interrupted` with an ordered receipt. The current substrate intentionally has
no resumable provider session path.

## Secondary Provider Policy

`electron/providers/secondary-run-executor.ts` creates a fresh, bounded turn
for an explicit provider and model. The policy limits elapsed time, turns,
events, output bytes, and attempts. It treats approval, user-input, and diff
events as policy violations and returns bounded text plus a sanitized terminal
outcome.

The internal `StreamTurnArgs.executionPolicy` marker is host-owned and is not
accepted from renderer IPC.

Claude secondary turns:

- do not resume or persist a session;
- load no setting sources, skills, plugins, or embedded MCP servers;
- suppress interactive user-dialog and elicitation callbacks;
- require the SDK sandbox and deny filesystem writes, network access, and
  write/web tools;
- permit Bash only through the secondary read-only command guard.

Codex secondary turns:

- use an ephemeral thread that is deleted after the turn;
- use `read-only` file access, `never` approval, disabled network access, and
  disabled web search;
- enumerate configured MCP servers, fail closed if that inventory is
  unavailable, and disable every discovered server for the thread;
- decline interactive or privileged App Server requests immediately instead
  of forwarding them to the renderer.

The ordinary interactive Claude and Codex paths keep their existing runtime
options. Secondary restrictions are activated only by the internal execution
policy.

## Compare Judge

Compare Judge uses deterministic identities:

- run: `compare:<compareRunId>:judge`
- step: `compare:<compareRunId>:judge:step`
- claim key: the step identity plus the local judge attempt

The claim records `compare-run` origin, project/workspace/base-task ownership,
and rubric provenance. The provider still receives the anonymous candidate
prompt. The renderer keeps the existing structured-result parser and only
marks the durable step complete after parsing succeeds. The result artifact
reference points back to the Compare Run judge result; it does not duplicate
the result body in SQLite.

Cancel and retry retain the current Compare Run UI behavior. Cancellation
persists the durable judge transition before candidate workspaces close, and a
retry uses the same run and step with a new attempt key and execution identity.

## Eligibility And Extension Seam

A later consumer is eligible for this substrate only when it has the same
bounded, non-interactive, read-only execution policy as Compare Judge. An
eligible consumer should:

1. Choose its existing `RunOrigin` kind and stable source id.
2. Create deterministic run and step ids plus a per-attempt idempotency key.
3. Supply explicit project/workspace/task ownership, provenance, and bounded
   policy.
4. Call the renderer `executeSecondaryRun` helper with a consumer-specific
   structured parser and bounded artifact reference.
5. Use the receipt-list operation for diagnostics instead of persisting raw
   prompts or provider events elsewhere.

New consumers must not call the host-service provider method directly or make
Zustand authoritative. Capabilities beyond local read-only execution,
including network access, require a separate explicit contract. Arbitrary DAG
fan-out, workflow UI, cross-device Crane transport, and product-specific
lifecycle state remain outside this substrate.

The current planned features intentionally use different paths:

- Fleet projects existing live state, durable notifications, and PR state; it
  does not launch provider work.
- Advisor is an inline preflight in the same normal turn and contributes
  context before primary execution.
- Crane dispatch creates a normal locally approved task that may require
  filesystem writes, provider approvals, and local user input.

Do not make those features depend on Run Core merely to share lifecycle names
or receipt terminology.

## Diagnostics

Use `window.api.runs.getSecondary(...)` for the current aggregate and
`window.api.runs.listReceipts(...)` for its ordered audit trail. Diagnose from
SQLite state first, then the consumer's presentation state. Receipt fields are
intentionally bounded, so deeper provider debugging still uses the existing
provider debug logs rather than expanding durable records with raw output.
