# Provider Session Stability Guide

This document captures known hanging/leak vectors in Stave's provider runtime
layer and the patterns that prevent them. Use it as a checklist when modifying
provider runtimes, the IPC bridge, or renderer-side turn tracking.

---

## Architecture overview

```
Renderer (app.store.ts)          IPC bridge             Host service (runtime.ts)
┌──────────────────────┐   ┌───────────────┐   ┌──────────────────────────────┐
│ activeTurnIdsByTask   │──▶│ provider:*    │──▶│ activeSessions Map           │
│ providerTurnActivity  │   │ IPC channels  │   │ activeStreams Map             │
│ stall indicator       │   └───────────────┘   │                              │
│ timers                │                       │ streamClaudeWithSdk()        │
│                       │                       │ streamCodexWithSdk()         │
│                       │                       │ streamCodexWithAppServer()   │
└──────────────────────┘                       └──────────────────────────────┘
```

A turn is "alive" when:
1. Host side: an entry exists in `activeSessions` for the `turnId`.
2. Renderer side: `activeTurnIdsByTask[taskId]` points to the `turnId`.
3. The underlying SDK stream/async-iterable is still yielding events.

A turn is "done" when:
- A `{ type: "done" }` event is emitted by the provider runtime.
- The host clears `activeSessions` (via `finally` → `clearActiveTurnState`).
- The renderer clears `activeTurnIdsByTask` upon receiving the `done` event.

---

## Common hanging vectors

### 1. Pending approval/input resolvers survive abort

**Symptom**: Turn appears stuck after user presses Esc. No further events
arrive. UI may show "Stalled" indefinitely.

**Cause**: The SDK's `canUseTool` callback creates a `Promise` that blocks
until the user responds to an approval or user-input request. If the turn is
aborted while this promise is pending:
- `stream.close()` stops the iteration loop, but the resolver callback
  inside the SDK's `canUseTool` may never resolve or reject.
- The `for await` loop hangs because the callback hasn't returned.

**Fix (applied)**: The `finally` block in `streamClaudeWithSdk` now forcibly
resolves all entries in `pendingApprovalResolvers` (with `false`) and
`pendingUserInputResolvers` (with `{ denied: true }`). This acts as a safety
net even if the SDK's internal abort signal doesn't reach the callback.

For the Codex app-server runtime, the `finally` block sends explicit
`decline` / `cancel` responses via `client.respond()` for every pending
request before unsubscribing.

**Reference pattern**: Production-grade implementations use a
`Deferred + AbortSignal` pattern where the abort signal listener both
deletes the pending entry from the map and resolves/rejects the deferred.
This guarantees no promise hangs regardless of SDK internals.

---

### 2. Catch block treats abort as failure

**Symptom**: "Claude runtime failure" or "Codex runtime failure" error
message appears in the chat when the user simply presses Esc.

**Cause**: The catch block around the stream iteration treats all exceptions
uniformly. An `AbortError` (or SDK abort message) is indistinguishable from
a real network/process failure.

**Fix (applied)**: Both `claude-sdk-runtime.ts` and `codex-sdk-runtime.ts`
now check for `AbortError` (by name or message pattern) before falling
through to the generic error path. On abort, a clean
`{ type: "done", stop_reason: "user_abort" }` is emitted instead.

The Codex app-server runtime applies the same pattern.

**Detection heuristic**:
```typescript
const isAbort =
  (error instanceof Error && error.name === "AbortError") ||
  (error instanceof Error && /aborted|cancel/i.test(error.message));
```

---

### 3. Busy-wait loop with no exit condition

**Symptom**: `streamCodexWithAppServer` never returns. CPU shows 25 ms
polling loop running indefinitely.

**Cause**: The function uses `while (!completed) { await sleep(25); }` to
wait for the subscription listener to set `completed = true`. If the "done"
JSON-RPC notification is never received (process crash, network drop), the
loop runs forever.

**Fix (applied)**:
- The runtime now waits on a completion promise that resolves from
  `turn/completed` instead of polling every 25 ms.
- `turn/interrupt` starts a short interrupt-grace fallback so user aborts do
  not hang forever if the completion notification is lost.
- **Process-death detection**: `CodexAppServerClient.onProcessExit()` fires
  when the child process exits. The turn registers a listener that emits
  an error + done event and calls `finishTurnWait()`, so the wait never
  hangs on a dead process.
- **Abort during `turn/start`**: `registerAbort` is registered _before_
  `turn/start`. The `turn/start` request races against
  `waitForTurnCompletion`, so an abort (or process death) during the
  request unblocks immediately instead of waiting for the outer timeout.
  If `turn/start` resolves after abort, the orphaned turn is interrupted
  fire-and-forget.
- Catastrophic hangs are bounded by the outer `providerTimeoutMs` watchdog in
  `runtime.ts`; the adapter itself does not add a second 5-minute timer.
- The Codex app server still maintains its own internal completion-timeout
  accounting. When Stave surfaces approval or user-input prompts outside the
  app-server request loop, the adapter must pause that accounting via
  `thread/increment_elicitation` and resume it via
  `thread/decrement_elicitation`.

---

### 4. Thread/client cache grows unbounded

**Symptom**: Memory usage increases over long sessions. Each unique
`(taskId, cwd, runtimeOptions)` combination creates a new cached thread
that is never evicted.

**Cause**: `threadByTask` (Codex SDK) and `clientByExecutablePath`
(Codex app-server) are global `Map`s with no size limit or TTL.

**Fix (applied)**: `threadByTask` now has LRU eviction with a cap of 24
entries. On insert, if the cache is full, the least-recently-used entry
is removed. `threadLastUsedAt` tracks access timestamps.

---

### 5. activeTurnIdsByTask not cleared on silent provider failure

**Symptom**: Tab shows "responding" spinner but nothing is happening.
Starting a new turn on the same task appears to do nothing.

**Cause**: If the provider process crashes without emitting a `done` event,
`activeTurnIdsByTask[taskId]` remains set. The renderer still thinks a turn
is active.

**Mitigation**: All three provider runtimes guarantee a `done` event:
- Normal path: checked before return (`events[last]?.type !== "done"`).
- Error path: catch block always includes `{ type: "done" }`.
- Abort path: `{ type: "done", stop_reason: "user_abort" }`.

Additionally, `startTurnStream`'s `.finally()` calls
`clearActiveTurnState()` on the host side.

---

### 6. IPC push-mode event loss on renderer crash

**Symptom**: Host service continues processing but renderer never receives
events. Turn appears stuck from the user's perspective.

**Cause**: `onHostServiceEvent("provider.stream-event", ...)` silently
drops events when the target `WebContents` is destroyed. The host side
marks the stream as done, but the renderer never learns about it.

**Mitigation (applied)**:
- Push-mode turns are now started with a replayable host-side buffer so the
  same `streamId` can be read later via `readTurnStream`.
- If the renderer receives no push events for 15 seconds, it stops trusting
  the push bridge and switches that turn to poll mode using the buffered
  `streamId` cursor, instead of aborting the turn.
- The stall timer remains a UI-only warning signal. It no longer owns
  recovery or abort behavior.

---

## Stall indication

### How it works

1. **Turn starts** → `startProviderTurnActivity` records the timestamp.
2. **Events arrive** → `applyProviderTurnActivityEvents` resets the timer.
3. **Quiet window expires** → `markProviderTurnStalled` fires. UI shows
   "Stalled" badge and warning banner after 5 minutes of silence.
4. **User choice** → The user can keep waiting or manually stop the turn.

### Exclusions

Stall detection is **suppressed** when a pending interaction
(`approval` or `user_input`) is active, because the provider is
legitimately waiting for user input.

### Constants

| Constant | Value | Location |
|---|---|---|
| `PROVIDER_TURN_STALL_THRESHOLD_MS` | 300 000 ms | `turn-status.ts` |

---

## Checklist: modifying provider runtimes

When editing `claude-sdk-runtime.ts`, `codex-sdk-runtime.ts`, or
`codex-app-server-runtime.ts`:

- [ ] **finally block cleans up all Maps**: pending resolvers, trackers,
      and cached state must be cleared or resolved.
- [ ] **AbortError is distinguished from real errors** in catch blocks.
- [ ] **`done` event is always emitted** — check normal, error, and abort
      paths.
- [ ] **stream.close() is called in finally** (idempotent, wrapped in
      try-catch).
- [ ] **Symmetry**: changes to one runtime should be mirrored to the
      other(s) where the same pattern applies.
- [ ] **Cache eviction**: any new Map/cache must have either a max-size
      cap or TTL-based cleanup.
- [ ] **Busy-wait loops** must be replaced with event-driven completion or a
      clearly owned outer timeout.

---

## Reference architecture patterns

These patterns are drawn from analysis of production-grade desktop AI
agent implementations and represent industry best practices.

### Pattern A: Deferred + AbortSignal for pending interactions

```
                   ┌─────────────────┐
                   │  SDK canUseTool  │
                   │   callback       │
                   └───────┬─────────┘
                           │ creates Deferred + registers abort listener
                           ▼
              ┌────────────────────────┐
              │  pendingMap.set(id, {  │
              │    deferred,           │
              │    abortCleanup        │
              │  })                    │
              └───────────┬────────────┘
                          │
            ┌─────────────┼──────────────┐
            │             │              │
       User responds   Abort fires    Turn ends
            │             │              │
       deferred.resolve  deferred.resolve("cancel")
       map.delete(id)    map.delete(id)
```

**Key**: The abort listener both resolves the deferred AND removes the
map entry, so no promise can hang.

### Pattern B: Error classification for clean abort

```typescript
function classifyStreamError(error: unknown): "abort" | "failure" {
  if (error instanceof Error && error.name === "AbortError") return "abort";
  if (error instanceof Error && /aborted|cancel|interrupt/i.test(error.message)) return "abort";
  return "failure";
}
```

Use in catch blocks to emit clean `done` events on abort vs. error+done
on real failures.

### Pattern C: LRU cache with idle TTL

```
Cache insert → if size > MAX_ENTRIES:
  → find entry with oldest lastUsedAt
  → evict it (delete from all tracking Maps)

Optional: periodic sweep removes entries idle > TTL
```

### Pattern D: Turn correlation timeout

When starting a turn, set a timeout (e.g., 30 s). If no `stream-start`
event arrives before the timeout, reject the turn and clean up. Prevents
silent hangs when the provider process fails to start.

### Pattern E: Decoupled async queues for backpressure

For high-volume event paths (e.g., terminal output, streaming tokens),
use a bounded async queue between the event producer and consumer.
Drop non-critical events under backpressure while preserving terminal
events (done, error, approval).

---

## Debugging tips

### Identify a hanging turn

1. Check `activeTurnIdsByTask` in the store:
   ```
   useAppStore.getState().activeTurnIdsByTask
   ```
2. If a turnId is present but no events are flowing, the turn is stuck.

### Check host-side state

Via the Electron dev console (main process):
- `activeSessions` Map shows all live turns with their abort handlers.
- `activeStreams` Map shows buffered poll-mode streams.

### Force-recover a stuck turn

From the renderer console:
```typescript
useAppStore.getState().abortTaskTurn({ taskId: "<stuck-task-id>" });
```

### JSONL session forensics

Claude Code sessions are stored as JSONL in `~/.claude/projects/`:
```bash
# Find a session by ID
ls ~/.claude/projects/<project-dir>/<session-id>.jsonl

# Check the last few events
tail -5 <file>.jsonl | python3 -c "
import sys, json
for line in sys.stdin:
    obj = json.loads(line)
    msg = obj.get('message', {})
    print(msg.get('role', '?'), msg.get('stop_reason', ''), str(msg.get('content', ''))[:200])
"
```

A session ending with `stop_reason: "tool_use"` and no subsequent
`tool_result` indicates a hung subagent or lost approval response.
