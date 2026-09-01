# Cursor Agent Upgrade Checklist

Use this checklist whenever Stave changes its supported Cursor Agent CLI
baseline or its ACP integration.

## Adopted baseline

- Cursor Agent CLI: `2026.08.25-3e8eec8`
- ACP protocol: version `1`
- Executable aliases: `agent`, `cursor-agent`
- Authentication method: `cursor_login`
- Session resume: `session/load` when `loadSession` is advertised
- Modes: `agent`, `plan`, `ask`
- Model config id: `model`; Stave defaults to `auto`
- Model catalog: the `model` options returned by `session/new`; only advertised
  values are selectable, including any encoded effort and fast parameters
- Permission choices used by Stave: `allow-once` / `allow_once` and
  `reject-once` / `reject_once`
- Cancellation: `session/cancel`, with final `stopReason: cancelled`

## Upgrade verification

1. Record `agent --version` and verify `agent status` succeeds without logging
   account details.
2. Start `agent acp` and verify initialization accepts ACP v1, advertises
   `cursor_login`, and reports the expected prompt and session capabilities.
3. Create a session and record only the structural mode ids, config ids, and
   option values. Remove prompt text, generated text, account identifiers,
   tokens, personal paths, and unrelated MCP configuration from fixtures.
   Confirm that every model shown by Stave is one of the values advertised by
   this session; do not substitute the broader non-ACP CLI model list.
4. Run one representative prompt and verify stable ACP updates for text,
   reasoning, tool calls, tool results, diffs, plans, and usage metadata.
   When `promptCapabilities.image` is advertised, attach an image and confirm
   the prompt carries one native image block without repeating its data URL in
   the text block.
5. Verify `cursor/ask_question`, `cursor/create_plan`,
   `cursor/update_todos`, `cursor/task`, and `cursor/generate_image` still use
   the schemas expected by the Cursor profile.
6. Verify permission option ids and kinds before changing any approval mapping.
   Missing one-turn allow or reject options must fail closed.
7. Resume the session in a fresh ACP process and confirm `session/load`
   preserves its native identity. The required history replay must not appear
   on the follow-up turn; only updates after the load response belong to that
   turn.
8. Cancel an active prompt and confirm the provider returns `cancelled` before
   the process-kill fallback is needed.
9. Run the ACP protocol, Cursor runtime, IPC, persistence, replay, secret, and
   desktop build checks.

## Product boundaries

- Do not advertise mid-turn steering for Cursor. The ACP method table in this
  baseline is `session/prompt` plus `session/cancel`; there is no inject or
  steer request, and a cancel-then-reprompt is not steering.
- Cursor remains limited to interactive primary task turns until each broader
  execution surface has its own capability and safety review.
- Do not infer token counts from ACP context-usage data.
- Do not expose provider payloads, credentials, login details, or resolved
  secret values through renderer, logs, transcripts, or fixtures.
- Do not edit user or project MCP configuration automatically. The Cursor ACP
  runtime does not claim support for team-dashboard MCP servers.
