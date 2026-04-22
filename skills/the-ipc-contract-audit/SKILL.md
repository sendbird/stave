---
name: the-ipc-contract-audit
description: Audit Stave multi-file contracts before or during changes. Use when a task touches provider runtime options, IPC payloads, window.api, schemas, NormalizedProviderEvent, replay payloads, or asks for a contract or sync checklist. Trigger on phrases like "ipc", "schema", "runtimeOptions", "window.api", "provider event", "계약", "스키마", "동기화 체크".
compatible-tools: [claude, codex]
category: safety
test-prompts:
  - "runtimeOptions에 필드 추가했는데 안 먹혀"
  - "audit the IPC chain for this new provider event"
  - "Zod schema 동기화 체크해줘"
  - "window.api 바꿨는데 뭐 놓쳤는지 확인"
---

# The IPC Contract Audit

Treat schema changes as end-to-end runtime changes, not local type edits.

## Required Chain

When the task changes a provider or IPC payload, inspect this full chain:

- `electron/providers/types.ts`
- `src/lib/providers/provider.types.ts`
- `src/lib/providers/schemas.ts` — Zod discriminated union for `NormalizedProviderEvent`
- `src/types/window-api.d.ts`
- `electron/preload.ts`
- `electron/main/ipc/schemas.ts`
- producer call sites (providers, host-service, store actions)
- consumer call sites (replay, chat UI, diagnostics)

Do not assume TypeScript is enough. `electron/main/ipc/schemas.ts` and `src/lib/providers/schemas.ts` both use **strict** Zod — they silently reject extra fields and silently drop unknown event variants at `parseNormalizedEvent`.

## Event Sync Checks

When adding, renaming, or reshaping a normalized event:

- update the TypeScript union in `src/lib/providers/provider.types.ts`
- update the matching Zod object in `src/lib/providers/schemas.ts` (same commit — TS and Zod diverge silently)
- update provider emitters in `electron/providers/`
- update replay handlers in `src/lib/session/provider-event-replay.ts`
- update diagnostics / chat rendering if the event is user-visible

Schema variable names (e.g. `StaveExecutionProcessingEventSchema`) must mirror the TypeScript literal for easy auditing.

## Host-Service Dispatch Pitfall

`electron/host-service.ts` dispatches IPC requests. Async runtime functions (e.g. `attachSession`, `createSession`) **must be awaited** before passing their result to `respond()`. A bare `respond(fn(...))` when `fn` returns a `Promise` becomes `JSON.stringify(Promise) === "{}"` — the renderer sees an empty object with no error.

## Provider CLI Environment Parity

Changes to executable lookup, runtime env, CLI launch env, or tooling status probes must respect the env-builder contract shared across both adapters. Required check files:

- `electron/providers/executable-path.ts`
- `electron/providers/cli-path-env.ts`
- `electron/providers/claude-sdk-runtime.ts`
- `electron/providers/codex-sdk-runtime.ts`
- `electron/providers/codex-app-server-runtime.ts`
- `electron/providers/runtime.ts`
- `electron/main/utils/tooling-status.ts`

A passing `claude auth status` or `codex --version` probe is **not** sufficient — verify the actual turn-start path too. See `the-provider-runtime-symmetry` for the full symmetry protocol.

## Common Failure Modes

1. New field added in TypeScript only — rejected at runtime by strict Zod in `electron/main/ipc/schemas.ts`.
2. New normalized event added without matching Zod entry — silently dropped by `parseNormalizedEvent`.
3. Event renamed on the producer but not on replay or consumer paths.
4. Host-service async result passed to `respond()` without `await`.

## Symmetry Rule

If the behavior is meant to be provider-agnostic, inspect both Claude and Codex adapters. Invoke `the-provider-runtime-symmetry` when the change is adapter-local but the behavior should be shared.

## Verification

- run `bun run typecheck` after contract changes
- if provider runtime behavior changed, smoke-check both Claude and Codex paths (start a turn in each)
- if CLI env changed, verify both the probe path and the actual turn-start path

## Output

Return:

- the contract group you audited
- files confirmed
- files still at risk
- verification still required
