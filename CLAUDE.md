<!-- Claude Code project instructions -->

See [AGENTS.md](./AGENTS.md) for the authoritative repository policy.

## Practical Notes

- Read targeted sections of [`src/store/app.store.ts`](src/store/app.store.ts) instead of loading the whole file at once.
- When changing provider runtimes, review both [`electron/providers/claude-sdk-runtime.ts`](electron/providers/claude-sdk-runtime.ts) and [`electron/providers/codex-sdk-runtime.ts`](electron/providers/codex-sdk-runtime.ts) for symmetry unless the change is intentionally provider-specific.
- Use Bun commands and `bunx --bun`.
- After code changes, run `bun run typecheck` plus the smallest relevant focused tests before finishing.
- For UI work, follow the theme guardrails in [AGENTS.md](./AGENTS.md).
- For provider, IPC, terminal, or hot Zustand surface changes, follow the corresponding guardrails in [AGENTS.md](./AGENTS.md).
- For explicit PR requests, use `skills/stave-worktree-pr-flow/SKILL.md` when available.
- For explicit release requests, use `skills/stave-release/SKILL.md` when available.
