---
name: the-provider-runtime-symmetry
description: Keep Stave's Claude and Codex provider runtimes in sync when editing one of them. Use when a change touches `electron/providers/claude-sdk-runtime.ts`, `electron/providers/codex-sdk-runtime.ts`, `electron/providers/codex-app-server-runtime.ts`, executable lookup, env construction, CLI session launch env, tooling status probes, or any provider-agnostic behavior. Trigger on phrases like "provider runtime", "claude adapter", "codex adapter", "sibling adapter", "PATH env", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "tooling status", "어댑터 대칭", "양쪽 프로바이더 확인".
compatible-tools: [claude, codex]
category: safety
test-prompts:
  - "Claude 어댑터만 바꿨는데 Codex도 확인해야 하나"
  - "audit both provider runtimes for this env change"
  - "PATH가 GUI에서만 잘 안 먹히는 것 같은데"
  - "tooling-status probe랑 실제 turn 실행 동작이 다르게 나와"
  - "codex runtime option 하나 추가했어 — claude 쪽도 맞춰야 해?"
---

# The Provider Runtime Symmetry

When Stave's provider runtimes diverge, regressions surface as "works in Claude, broken in Codex" (or vice versa) and are often found only in production by users who exercise the non-default path.

This skill codifies the AGENTS.md rules in one place:

- **Architecture → Boundaries**: "Provider runtimes live in `electron/providers/`. When modifying one adapter, check the other for symmetry."
- **Provider CLI Environment Parity**: shared env-builder contract across Claude, Codex, CLI sessions, and tooling-status probes.

Use alongside `the-ipc-contract-audit` when the change also crosses IPC.

## Use This Skill When

- Editing `electron/providers/claude-sdk-runtime.ts` or `electron/providers/codex-sdk-runtime.ts`.
- Editing `electron/providers/codex-app-server-runtime.ts` or `electron/providers/runtime.ts`.
- Editing executable lookup (`electron/providers/executable-path.ts`) or CLI env builder (`electron/providers/cli-path-env.ts`).
- Editing CLI session launch env in host-service terminal surfaces.
- Editing `electron/main/utils/tooling-status.ts` or any provider availability probe.
- Adding a runtime option that should apply to both providers.
- Changing how `permissionMode`, `sandbox`, `thinking`, `dangerous_skip`, model selection, or error handling propagates inside one adapter.

## Do Not Use When

- The change is intentionally provider-specific (e.g. a Claude-only feature). In that case, state the asymmetry explicitly in code comments or the PR body — silence is the bug.
- The change is only in the renderer-side provider abstraction (`src/lib/providers/`) and does not touch either runtime file.
- The change is Stave Auto routing logic (use `the-provider-router` instead — it covers orchestration, not adapter parity).

## Required Check Files

| File | Role |
|---|---|
| `electron/providers/claude-sdk-runtime.ts` | Claude SDK adapter (~1 200 lines) |
| `electron/providers/codex-sdk-runtime.ts` | Codex SDK adapter (~800 lines) |
| `electron/providers/codex-app-server-runtime.ts` | Codex app-server variant |
| `electron/providers/runtime.ts` | Shared provider runtime entry |
| `electron/providers/executable-path.ts` | CLI binary lookup |
| `electron/providers/cli-path-env.ts` | Env-builder (PATH, config homes) |
| `electron/providers/adapter.factory.ts` | Event normalization entry (`parseNormalizedEvent`) |
| `electron/main/utils/tooling-status.ts` | Provider availability probes |
| `electron/providers/types.ts` | Shared runtime option types |
| `src/lib/providers/provider.types.ts` | Renderer-facing TS union |
| `src/lib/providers/schemas.ts` | Zod discriminated union mirror |

## Symmetry Checklist

Run this before considering an adapter change complete.

### 1. Behavior parity

- [ ] If the change is meant to apply to both providers, does the **sibling adapter** have the matching code?
- [ ] If the behavior is provider-agnostic, should it move into `runtime.ts` or a shared helper instead of being duplicated?
- [ ] If the change is intentionally provider-specific, is that stated explicitly in a comment or the PR body?

### 2. Runtime options

- [ ] Added a new `runtimeOptions` field? Check it is wired through **both** adapters, the shared type in `electron/providers/types.ts`, the renderer-side type in `src/lib/providers/provider.types.ts`, the preload/window-api contract, and the strict Zod schema in `electron/main/ipc/schemas.ts`.
- [ ] Renamed or removed a field? Grep across `electron/providers/`, `src/store/app.store.ts`, and session/input UI producer sites.

### 3. Event emission

- [ ] New or renamed `NormalizedProviderEvent` variant? Both `src/lib/providers/provider.types.ts` (TS) and `src/lib/providers/schemas.ts` (Zod) updated in the same change, plus every emitter across `electron/providers/`.
- [ ] Replay handlers in `src/lib/session/provider-event-replay.ts` updated.

### 4. CLI environment parity

- [ ] `PATH` handling: GUI-launched Stave must resolve the same executables a login shell resolves. Cloned env objects must not drop login-shell `PATH` entries.
- [ ] `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / auth-related vars: the same precedence rules apply to runtime execution **and** tooling-status probes.
- [ ] Claude runtime, Codex runtime, app-server runtime, CLI sessions, and tooling-status probes all route through the **same** env-builder. Do not fork the rule in one adapter.

### 5. Probe vs runtime mismatch

`claude auth status` / `codex --version` probe success is **not** sufficient verification. Environment parity bugs often show:

- probe: success, actual turn-start: `env: node: No such file or directory`
- probe: success, actual turn-start: "Not logged in" only inside Stave

Verify both paths explicitly.

### 6. SDK upgrade hygiene

When upgrading `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, or the Claude/Codex CLI expectations:

- [ ] Confirm new option names and object shapes against installed package types in `node_modules`, not memory.
- [ ] For Codex upgrades, read `docs/providers/codex-upgrade-checklist.md`, including Guardian reviewer status.
- [ ] Apply the same upgrade discipline to the sibling provider if the upgrade introduces shared concepts.

## Common Failure Modes

1. **Claude-only fix**: a bug reproduced in both providers, but only Claude's adapter was patched.
2. **Forked env**: a new env var added to `cli-path-env.ts` but the Codex app-server runtime still builds env inline.
3. **Probe/runtime drift**: `tooling-status.ts` uses a different PATH resolution than the actual turn-start path, so "Claude is available" reports true while turns fail.
4. **Option leak**: new `runtimeOptions.foo` wired through the Claude adapter only; Codex silently ignores it.
5. **Event variant in one adapter only**: emitter added to Claude runtime; Codex runtime never emits it, so downstream UI works for Claude and looks broken for Codex.

## Verification

- `bun run typecheck` — always.
- Start a turn with the **Claude** provider, confirm it completes and the new behavior is visible.
- Start a turn with the **Codex** provider, confirm it completes and the new behavior is visible (or that the intentional asymmetry is documented).
- If CLI env changed: launch Stave from the GUI (not a terminal) at least once and confirm the affected CLI resolves.
- If tooling-status changed: open Settings → Providers (or the equivalent probe surface) and confirm status matches the runtime execution result.

## Output

Return:

- which adapter(s) you changed
- which sibling files you confirmed
- any intentional asymmetry, with a one-line reason
- verification commands run and their results

## Integration With Other Skills

- `the-ipc-contract-audit` — when the symmetry check also crosses IPC layers.
- `the-provider-router` — when the change affects Stave Auto routing, not adapter parity.
- `the-terminal-surface-guard` — when CLI session launch env changes ripple into docked terminal surfaces.

## Guardrails

- Do not ship a "fix in one adapter" without verifying or documenting the sibling.
- Do not verify env changes with probes only — always include the real turn-start path.
- Do not assume TypeScript is enough; strict Zod in `electron/main/ipc/schemas.ts` and `src/lib/providers/schemas.ts` still rejects or drops fields silently.
- Do not centralize provider-specific code in `runtime.ts`; conversely, do not duplicate provider-agnostic code across both adapters.
