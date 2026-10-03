# Conversation Flow

Stave keeps a single task chat UI by separating app-owned conversation state from provider-owned wire formats.

## High-level flow

1. The renderer builds a `CanonicalConversationRequest` from the task history, current user input, selected file contexts, and any persisted provider-native conversation id. Task turns also attach Stave-owned retrieved context for the current task/workspace plus bounded workspace-information snapshots. Provider runtimes may filter MCP-specific awareness context back out before rendering the final provider prompt when Stave Local MCP is not actually connected, so non-MCP users do not pay unnecessary prompt overhead. Oversized historical payloads such as `file_context` content, tool outputs, and diff bodies are sanitized before the request crosses IPC so broken replay data does not block later turns.
2. The provider bridge sends that canonical request plus a small fallback prompt across preload into Electron main, which validates the payload and forwards provider execution into the dedicated desktop `host-service` child runtime. The main-process bridge and `host-service` exchange framed JSON messages over stdio so large payloads are not coupled to newline-delimited transport limits.
3. `electron/providers/runtime.ts` mints a caller grant for every task turn (`caller-grants.ts`): a per-task key in the turn's Local MCP connection headers, never in the prompt or tool arguments, that names the calling task to the subagent and `stave_run_task` tools while the turn runs. A task that runs as an agent also gets its in-turn subagents compiled from the agent's `canCall` list; the renderer cannot supply them.
4. A parent's next turn carries a `Subagent results` retrieved-context part with each subagent's state and the bounded answer of every one that finished since its previous turn.
5. Provider-specific translators rebuild the exact native prompt or ACP content blocks from the canonical request inside the runtime.
6. Claude, Codex, Cursor, and Kiro stream back normalized `BridgeEvent` records such as `text`, `thinking`, `tool`, `approval`, `user_input`, `diff`, and `done`.
7. The renderer replays those normalized events into one shared message model and one shared chat surface.

This keeps the task thread as Stave's source of truth while still letting each provider preserve its own native conversation id when available.

## Persistence

The user-visible source of truth now stays split across three layers:

- `messages` and `message.parts` for chat history, CoT, tool rows, and step detail
- `turns` for lifecycle state such as active/completed turn tracking
- workspace shell persistence for active task/session state and provider-native conversation ids

Large payloads are no longer expected to stay in a raw turn journal for replay.
Workspace restore and recent-turn summaries now rely on the smaller chat,
lifecycle, and shell shapes instead of eagerly loading giant per-turn payload
rows.

## Paused Work And Queue Recovery

Queued follow-ups remain in `promptDraftByTask`, including their attachments
and captured runtime choices. `task-work-pause.ts` distinguishes entries from
the previous renderer session by `queuedAt`; `queued-task-turn-dispatch.ts`
holds them until the user releases the restored queue. A newly queued entry
cannot jump past an older held entry.

For a conversation turn, the terminal event is replayed into the task's
messages before `task-work-pause-wiring.ts` checks whether a usage-limit error
ended the turn. A queued send refused by `account-usage-guard.ts` reaches the
same pause through the dispatcher's blocked-result callback. Utility turns
neither create nor release this conversation pause.

`app-store-task-pause-actions.ts` owns pause, cancellation and resume. The
renderer timer in `use-usage-limit-auto-resume.ts` runs only while the app is
open. An automatic resume refreshes usage, checks that the user has not
cancelled or resumed during that read, and either moves to the next exhausted
window's reset or releases the pause. When a limit interrupted a turn, resume
uses the normal send path for a continuation asking the agent to reconcile
completed work before proceeding; it does not replay the original prompt.

Pause records, reset-time reservations and restored-queue release flags are
renderer memory only. They are not persisted or scheduled through the
host-service. After a restart, saved queue entries wait for the user again;
the queue's Resume action alone does not recreate a lost continuation record.

## Attached Task Context

The composer records a task attachment's workspace id, task id, title and
scope. Title search offers eligible tasks in the current workspace; a task
row drag can carry an identity from another workspace. Neither action copies
the transcript into the draft.

At dispatch, `attached-task-context-runtime.ts` collects attachments from both
the draft and prompt-batch items. It reads loaded task messages or falls back
to `loadTaskMessagesPage` in `src/lib/db/workspaces.db.ts`. In the desktop app
that read crosses `window.api.persistence.loadTaskMessages`, preload,
`persistence:load-task-messages` validation, and the SQLite persistence store.

`attached-task-context.ts` bounds the selected text and marks it as user-chosen
background, not instructions. The send action includes the result as
`stave:attached-task-context` retrieved context in the canonical request,
which follows the normal provider bridge and runtime translation path.
The sent message keeps a display-only `task_context` part. Canonical history
conversion excludes that chip, so it does not independently replay the
attachment into future turns.
