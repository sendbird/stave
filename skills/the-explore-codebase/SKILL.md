---
name: the-explore-codebase
description: Explore an unfamiliar area of the Stave codebase quickly. Use when the request asks for workspace structure, architecture overview, relevant files, entrypoints, "where should I look first", "관련 코드 확인", "구조 파악", or broad code search before implementation.
compatible-tools: [claude, codex]
category: navigation
test-prompts:
  - "이 레포 구조 좀 빠르게 파악하고 싶어"
  - "chat panel 관련된 파일들 어디야"
  - "where should I start reading for the IPC layer"
  - "stave auto 구현 어디에 있어"
---

# The Explore Codebase

Start narrow, not broad.

## Workflow

1. Read `AGENTS.md` and the architecture docs before loading large implementation files.
2. Use `docs/architecture/index.md` to choose the right subsystem.
3. Use `docs/architecture/entrypoints.md` to identify the first files to inspect.
4. Prefer the `Agent` tool with `subagent_type: "Explore"` for open-ended searches across the repo — it is faster and keeps the main agent's context clean. Reserve manual `rg` / `Glob` chains for pinpoint lookups when the target is already known.
5. Read only the slices that answer the current question.

## Context Already Available

Before issuing a broad search, check whether retrieved context already contains the answer:

- `stave:repo-map` retrieved context — condensed codebase map (hotspots, entrypoints, guides). Read this **before** launching an exploration agent.
- `stave:current-task-awareness` retrieved context — the current workspace/task, visible tasks, and workspace information panel.

If the retrieved context pinpoints the subsystem, jump straight to targeted reads.

## Stave Hotspots

- `src/store/app.store.ts` is a coordinator (~2 100 lines), not a good first file for broad scanning. Read targeted slices with `offset`/`limit`.
- `electron/main/ipc/schemas.ts` is the first stop for schema-ish regressions.
- `electron/providers/claude-sdk-runtime.ts` and `electron/providers/codex-sdk-runtime.ts` should be checked together when behavior is provider-adapter-specific.
- `src/lib/providers/schemas.ts` is the Zod discriminated union mirror of `NormalizedProviderEvent` — always inspect alongside `src/lib/providers/provider.types.ts`.
- `src/lib/session/provider-event-replay.ts` is where normalized events become shared chat state.
- `src/types/window-api.d.ts` is the renderer-visible IPC contract.

## Output

Return:

- the subsystem you inspected
- the first files to read
- the key contract boundaries
- the smallest next search queries or follow-up files

## Avoid

- loading entire large files when a narrower slice is enough
- treating `projectFiles` as a semantic code index
- explaining the whole repo when the user asked about one path or feature
- chaining manual `rg`/`Glob` when an `Agent`/`Explore` subagent would answer the same question with one call
