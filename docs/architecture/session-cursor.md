# Provider Session Cursor

Stave persists one native session per task and provider. A session cursor records
the last local message known to be represented in that specific native session:

```ts
interface ProviderSessionCursor {
  nativeSessionId: string;
  syncedThroughMessageId?: string;
}
```

Legacy persisted string ids remain valid. They are normalized at read sites and
gain a cursor after the next successfully completed turn.

## Why the cursor exists

A healthy same-provider follow-up already resumes the native session and omits
replayed history. A cursor does not improve that path.

The valuable case is returning to a provider after another provider handled one
or more turns:

1. Claude completes through message `m4`; its cursor is `m4`.
2. Codex handles messages `m5..m8`.
3. The task switches back to Claude and resumes the old Claude session.
4. Stave injects only `m5..m8`, not `m1..m8` and not an empty history.

Without the cursor, step 4 either duplicates the full transcript or silently
hides the intervening Codex turns from Claude.

The cursor does **not** make a new native session incremental. A new session has
no provider-side context, so it must receive all available history. Likewise,
the first switch to a provider with no persisted session still receives full
history.

## Persistence model

`TaskProviderSessionState` accepts both formats:

```ts
type TaskProviderSessionEntry = string | ProviderSessionCursor;

interface TaskProviderSessionState {
  "claude-code"?: TaskProviderSessionEntry;
  codex?: TaskProviderSessionEntry;
}
```

No database migration is required because the workspace shell stores this state
as JSON. Task-context schemas accept both forms, and the window/persistence
contracts share the same TypeScript type.

## Cursor lifecycle

- A `provider_session` event remembers the native id.
- If the native id changes, any cursor belonging to the old id is discarded.
- A successful normal turn's `done` event advances the active provider's cursor
  to the completed assistant message id.
- Interrupted or incomplete turns do not advance the cursor.
- Native slash commands bypass history injection, so their completion does not
  advance the cursor. This includes manual compaction and thread-goal commands.
- Clearing a provider session removes its cursor with the session entry.

Cursor updates happen in shared provider-event replay, so Claude and Codex use
the same state transition instead of maintaining adapter-specific write paths.

## Prompt selection

The provider runtime, not the renderer, is authoritative about whether a native
session was actually resumed. Prompt history is selected after that decision:

1. No active resume: include all available history.
2. Active resume but no cursor: omit history unless it contains another
   provider's assistant messages; then include available history conservatively.
3. Active resume and matching cursor: include messages after the cursor.
4. Cursor missing from loaded history: include all available history.
5. Runtime-local resume id differs from the renderer snapshot: omit history and
   trust the runtime-local session, preserving existing behavior.

The cursor is trusted only when its persisted native id equals the id the
runtime actually resumes.

## Transport safety

History remains in the IPC request until the runtime resolves the effective
resume state. This is required because MCP/config changes can force Claude or
Codex to start a fresh native session even when the renderer supplied a
persisted resume id.

Dropping history in the renderer merely because `resume.nativeSessionId` exists
is unsafe: the runtime may reject that resume intentionally and then have no
history with which to seed the new session. Existing size-driven transport
compaction still applies above the request byte limit.

This means the cursor primarily reduces provider prompt tokens and fixes
cross-provider context gaps. It intentionally does not claim a lossless IPC
serialization reduction for every healthy resume.

## Contract chain

The cursor crosses these boundaries:

- `src/lib/db/workspaces.db.ts`: persisted union type
- `src/lib/task-context/schemas.ts`: legacy and cursor JSON validation
- `src/lib/providers/provider.types.ts`: canonical resume metadata
- `src/lib/providers/canonical-request.ts`: renderer request construction
- `electron/main/ipc/schemas.ts`: strict IPC validation
- `electron/preload.ts` and `src/types/window-api.d.ts`: shared request contract
- Claude and Codex runtimes: effective-resume decision
- `src/lib/session/provider-event-replay.ts`: symmetric cursor advancement

## Validation matrix

- same-provider healthy resume: no replayed history
- provider switch-back: only post-cursor messages
- first provider switch: bounded resident tail (see below)
- MCP/config-forced fresh session: bounded resident tail
- missing cursor anchor: bounded resident tail
- legacy string session: replay conservatively when other providers contributed
- compact after provider switch-back: retain the previous cursor and pending delta
- native id replacement: stale cursor cleared
- failed/interrupted turn: cursor unchanged

"Bounded resident tail" means the most recent `MAX_LOADED_TASK_MESSAGES`
(`src/store/task-message-loading.ts`, currently 400) messages of the task, not
the whole transcript. Both turn entry points send the same window: the renderer
has always sent its resident `messagesByTask` window, and the Local MCP
`run_task` path now reads the same bounded page instead of loading every
message. Older history stays durable in SQLite and is paged in by the UI on
demand.

This can omit context when starting fresh or changing providers. Transport
bounds in `src/lib/providers/transport-bounds.ts` can further reduce oversized
requests, and `src/lib/providers/bounded-history.ts` limits rendered history to
12,000 characters. Over-budget prompts retain the earliest available user
request and recent excerpts with an explicit omission notice; neither is a
lossless summary. Durable storage of older messages does not mean a provider
has seen them. See [Conversation Context](../features/conversation-context.md)
for native compaction scope and long-task limitations.
