# Conversation Flow

Stave keeps a single task chat UI by separating app-owned conversation state from provider-owned wire formats.

## High-level flow

1. The renderer builds a `CanonicalConversationRequest` from the task history, current user input, selected file contexts, and any persisted provider-native conversation id. Task turns also attach Stave-owned retrieved context for the current task/workspace plus bounded workspace-information snapshots. Provider runtimes may filter MCP-specific awareness context back out before rendering the final provider prompt when Stave Local MCP is not actually connected, so non-MCP users do not pay unnecessary prompt overhead. Oversized historical payloads such as `file_context` content, tool outputs, and diff bodies are sanitized before the request crosses IPC so broken replay data does not block later turns.
2. The provider bridge sends that canonical request plus a small fallback prompt across preload into Electron main, which validates the payload and forwards provider execution into the dedicated desktop `host-service` child runtime. The main-process bridge and `host-service` exchange framed JSON messages over stdio so large payloads are not coupled to newline-delimited transport limits.
3. `electron/providers/runtime.ts` mints a caller grant for every task turn (`caller-grants.ts`): a per-task key in the turn's Local MCP connection headers, never in the prompt or tool arguments, that names the calling task to the subagent and `stave_run_task` tools while the turn runs. A task that runs as an agent also gets its in-turn subagents compiled from the agent's `canCall` list; the renderer cannot supply them.
4. A parent's next turn carries a `Subagent results` retrieved-context part with each subagent's state and the bounded answers no earlier turn carried (`src/lib/runs/delegated-task-answers.ts`). The turn request names the carried answers (`subagentAnswers`); when the provider accepts the turn's prompt (the adapter's `onPromptAccepted`), the host writes a delivery record for each (`electron/persistence/delegated-answer-store.ts`). An answer without one is still owed.
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

Turn completion drains the queue in the task's owning workspace session. A
background follow-up uses that workspace's working directory and project
context even when another project is open.

When a workspace switch or refresh observes the completion before the stream
does, it can also drain the queue. Recovery requires a successful terminal
receipt and the final persisted reply for that exact turn. A receipt whose
reply is still missing leaves the stream eligible to settle the turn. Older
completion updates cannot clear a newer renderer-owned turn.

Queued follow-ups remain in `promptDraftByTask`, including their attachments
and captured runtime choices. `task-work-pause.ts` distinguishes entries from
the previous renderer session by `queuedAt`; `queued-task-turn-dispatch.ts`
holds them until the user releases the restored queue or a reserved usage-limit
resume releases it. A newly queued entry cannot jump past an older held entry.

For a conversation turn, the terminal event is replayed into the task's
messages before `task-work-pause-wiring.ts` checks whether a usage-limit error
ended the turn. A queued send refused by `account-usage-guard.ts` reaches the
same pause through the dispatcher's blocked-result callback. Utility turns
neither create nor release this conversation pause.

Each new pause retains the stopped turn or refused queue item's identity and
the execution's provider, model and account. Resume runs on the account selected for that provider when it
resumes, because switching accounts is how the user gets past a limit: the
continuation keeps the recorded provider and model but takes the selected
account, and the queued turns the pause held are retargeted to the selected
accounts before the queue drains. Turns queued later behind a running turn
keep their queue-time accounts. An automatic resume reads the selected
account through the account guard's bounded provider read and never replaces
the store's meter with that response. An automatic resume with missing
account identity stays paused and drops its reservation. One with unreadable
usage stays paused and moves its reservation `USAGE_LIMIT_UNAVAILABLE_RETRY_MS`
(five minutes) later, the same first retry an agent run's usage-limit wait
uses. Consecutive unreadable reads double that wait up to
`UNREADABLE_USAGE_RETRY_MAX_MS` (30 minutes), because each forced read can
launch a provider CLI. The count is stored on the pause, so it ends with the
pause (resume, dismiss, task archive); Cancel and any readable verdict clear it.
An older pause with no account can only resume manually.

`app-store-task-pause-actions.ts` owns pause, cancellation and resume. The
renderer timer in `use-usage-limit-auto-resume.ts` runs only while the app is
open. An automatic resume refreshes usage, checks that the user has not
cancelled or resumed during that read, and either moves to the next exhausted
window's reset or releases the pause. When a limit interrupted a turn, resume
uses the normal send path for a continuation asking the agent to reconcile
completed work before proceeding; it does not replay the original prompt.

App-store persistence saves the pause, its reservation ID, the next check and
the read backoff. Cancel durably disarms the reservation and leaves the pause
available for manual resume. Dismiss and archive clear the pause. Startup
rehydrates pending reservations and checks for work due while the app was
closed.

The reservation ID also serves as the turn ID through ordinary send and host
admission. A queued reservation remains eligible after a restart and stays out
of generic queued-turn recovery. Before dispatching to the provider, the host
claims the ID in SQLite. This claim survives loss of the renderer response,
including a crash around provider acceptance. The app reconciles a claimed
reservation without sending again. If the host crashed after claiming it and
delivery is uncertain, Stave leaves the remaining queue idle until there is a
successful terminal receipt or the user acts. On admission, the renderer saves
removal of any dispatched queue item before clearing the pause. The saved
queue release applies only to entries already queued when the pause was released.

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
