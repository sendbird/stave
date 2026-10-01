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
