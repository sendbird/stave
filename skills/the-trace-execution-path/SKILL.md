---
name: the-trace-execution-path
description: Trace a behavior, event, or request path through the Stave codebase. Use when the request asks "where does this happen", "execution path", "call flow", "흐름 추적", "어디서 처리돼", or needs the exact producer -> bridge -> consumer chain.
compatible-tools: [claude, codex]
category: navigation
test-prompts:
  - "이 이벤트가 어디서 어디로 가는지 따라가줘"
  - "trace how a chat turn reaches the Claude adapter"
  - "provider event 렌더까지 어떻게 흘러가는지 확인"
  - "where does the terminal attach IPC end up in main"
---

# The Trace Execution Path

Trace forward and backward across boundaries.

## Workflow

1. Identify the user-facing trigger or event name.
2. Find the producer.
3. Cross the nearest contract boundary:
   - renderer → preload
   - preload → main IPC
   - IPC → provider runtime
   - provider event → Zod validation → replay → UI
4. Confirm the consumer and any replay or persistence path.
5. Check tests that mention the same type, event, or function.

## Stave Contract Boundaries (common crossings)

| Boundary | Files to confirm |
|---|---|
| Renderer → preload | `src/types/window-api.d.ts`, `electron/preload.ts` |
| Preload → main IPC | `electron/main/ipc/*.ts`, strict Zod schemas in `electron/main/ipc/schemas.ts` |
| IPC → provider runtime | `electron/providers/claude-sdk-runtime.ts`, `electron/providers/codex-sdk-runtime.ts`, `electron/providers/adapter.factory.ts` |
| Provider emit → normalize | `src/lib/providers/provider.types.ts` (TS union) + `src/lib/providers/schemas.ts` (Zod union, strictly validated at `parseNormalizedEvent`) |
| Normalized event → UI state | `src/lib/session/provider-event-replay.ts`, `src/store/app.store.ts` consumers, `src/components/session/chat-panel-message-parts.tsx` |
| Terminal IPC | `electron/main/ipc/terminal.ts`, `electron/host-service/terminal-runtime.ts`, `src/components/layout/useTerminalSessionManager.ts` |

## Stave-Specific Guidance

- For provider-turn questions, start with `docs/architecture/conversation-flow.md`.
- For provider output rendering, inspect `src/lib/session/provider-event-replay.ts` and the chat panel components.
- When the trace crosses `electron/host-service/`, remember that async runtime functions (e.g. `attachSession`) must be awaited **before** being passed to `respond()` — `JSON.stringify(Promise)` silently becomes `{}`.

## Output

Return:

- entrypoint
- forward path (producer → consumer)
- reverse path (consumer → producer)
- contract files crossed
- likely breakpoints or tests

## Avoid

- describing only one side of a boundary
- stopping before checking the matching Zod schema or replay consumer
- conflating TypeScript types with the strict Zod validation at `parseNormalizedEvent`
