# Stave CLI roadmap

The CLI is intentionally documentation-only in the Phase 1–4 terminal and
workflow implementation. No CLI binary, command entry point, or transport
adapter is included in this change.

## Proposed Phase 5 shape

The first CLI should be a thin client for the existing Stave MCP/RPC surface:

- `stave status` — report the active workspace, tasks, provider availability,
  and running terminal slots.
- `stave task list` — list tasks and their current turn state.
- `stave task run --task <id> --prompt <text>` — start a provider turn and
  stream normalized events as newline-delimited JSON when stdout is not a TTY.
- `stave terminal list` — inspect terminal slot ownership and exit state.
- `stave terminal attach --slot <slot>` — request a resumable terminal stream;
  interactive attachment remains a later transport concern.

## Contract requirements

1. Reuse the same method names and schemas as the Electron host service. The
   CLI must not grow a second provider or terminal protocol.
2. Support a stable `--json` mode with one JSON object per line, deterministic
   exit codes, and structured errors on stderr.
3. Make retries idempotent with request IDs and sequence cursors. A reconnect
   must use `getMissedSince(seq)`-style catch-up semantics before accepting live
   events.
4. Resolve authentication and the MCP endpoint from configurable environment
   variables or flags. Product defaults must not depend on a private home
   directory layout.
5. Keep interactive terminal attach behind an explicit capability check; the
   initial release may expose status and replay without claiming a full PTY
   over stdio.

## Transport decision deferred to Phase 5

The local MCP HTTP transport is the lowest-cost first implementation. A
WebSocket push transport can be added later for remote clients, using the same
sequence/catch-up contract. Mobile control, remote authentication, and
multi-user authorization are product decisions and are not implemented here.

## Acceptance checklist

- [ ] Command taxonomy and JSON schemas are reviewed against the MCP registry.
- [ ] Human-readable and JSON output have stable exit codes.
- [ ] Network/API errors are redacted and machine-readable.
- [ ] Terminal stream replay is bounded and sequence-aware.
- [ ] Documentation includes install, auth, local development, and recovery
      examples using placeholders only.
