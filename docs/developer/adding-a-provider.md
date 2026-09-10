# Adding A Provider

Checklist for adding a new AI provider (a new `ProviderId`) to Stave.

Read this when `bun run typecheck` breaks on a `Record<ProviderId, …>` or an
`assertNever` after you widened the union — the break is deliberate, and the
sections below say what the missing branch is for.

## 1. Widen The Union

`ProviderId` is declared twice, once per process, and the two must stay
identical:

- [`src/lib/providers/provider.types.ts`](../../src/lib/providers/provider.types.ts)
- [`electron/providers/types.ts`](../../electron/providers/types.ts)

Decide at the same time whether the provider belongs in
`ManagedExecutionProviderId` (native SDK/app-server execution) or is ACP-only.
Then update the Zod mirror `ProviderIdSchema` in
[`electron/main/ipc/schemas.ts`](../../electron/main/ipc/schemas.ts).

Widening the union is what makes the rest of this checklist fail loudly. Work
through the typecheck errors rather than adding fallbacks.

## 2. Executable Discovery And Environment

Add `electron/providers/<provider>-cli-env.ts` exporting a
`resolve<Provider>ExecutablePath({ explicitPath })` and a
`build<Provider>Env({ executablePath })`, modelled on
[`kiro-cli-env.ts`](../../electron/providers/kiro-cli-env.ts). Add the matching
`<provider>BinaryPath` setting to
[`src/store/app-settings.ts`](../../src/store/app-settings.ts),
`ProviderRuntimeOptions` in
[`provider.types.ts`](../../src/lib/providers/provider.types.ts), and
[`src/store/provider-runtime-options.ts`](../../src/store/provider-runtime-options.ts).

## 3. Runtime, Model Catalog, Tooling Status

Follow the existing runtime for the provider's shape — a native runtime
([`claude-sdk-runtime.ts`](../../electron/providers/claude-sdk-runtime.ts),
[`codex-app-server-runtime.ts`](../../electron/providers/codex-app-server-runtime.ts))
or an ACP one (`electron/providers/acp`). Keep the two native runtimes
symmetric; see the `the-provider-runtime-symmetry` skill. Then add the provider
to the model catalog, the provider icon/fallback label, and tooling status.

## 4. Standalone CLI Tab — Required, Not Optional

**Every `ProviderId` gets a Standalone CLI tab.** The surface is a plain PTY
running the provider's own CLI, so it is independent of whether the provider has
a native or ACP runtime, and independent of whatever ACP limitations the provider
has elsewhere.

Start by establishing what the CLI can actually do, because the answer decides
the launch spec:

| Question                                      | Where to look                                             |
| --------------------------------------------- | --------------------------------------------------------- |
| How is a _new_ conversation started?          | `<cli> --help`                                            |
| How is an existing conversation _resumed_?    | a `--resume` / `--resume-id` flag                         |
| Can a session id be chosen _before_ launch?   | a `--session-id`-style flag                               |
| If not, how is the id learned _after_ launch? | local session files, or a `--list-sessions`-style command |

The four current providers cover every shape this has taken so far:

| Provider      | New session           | Resume                  | Id source                                                                   |
| ------------- | --------------------- | ----------------------- | --------------------------------------------------------------------------- |
| `claude-code` | `--session-id <uuid>` | `--resume <id>`         | Stave issues the uuid                                                       |
| `codex`       | no arguments          | `resume <id>`           | post-launch scan of `~/.agents/codex/sessions`                              |
| `kiro`        | `chat`                | `chat --resume-id <id>` | post-launch poll of `kiro-cli chat --list-sessions --format json`           |
| `cursor`      | no arguments          | `--resume <chatId>`     | pre-launch `agent create-chat` (server-side history, nothing local to scan) |

Then make these changes:

1. [`src/lib/terminal/standalone-cli.ts`](../../src/lib/terminal/standalone-cli.ts)
   — add the display title to `STANDALONE_CLI_TAB_TITLE` (typed
   `Record<ProviderId, string>`, so this is the compile error you probably came
   here from) and the id to `STANDALONE_CLI_TAB_IDS`.
2. [`electron/host-service/cli-session-launch.ts`](../../electron/host-service/cli-session-launch.ts)
   — add a `switch` branch returning the executable, args, env, and either a
   pre-known `nativeSessionId` or a `discovery` signal. The `assertNever`
   default is the second compile error.
3. If the id is only knowable after launch, add a discovery routine in
   [`terminal-runtime.ts`](../../electron/host-service/terminal-runtime.ts)
   alongside `startCodexNativeSessionDiscovery` /
   `startKiroNativeSessionDiscovery`: bounded polling, a claim map so two PTYs
   in one folder cannot adopt the same id, and cleanup through
   `disposeNativeSessionDiscovery`.
4. If the id must be issued _before_ launch by an async call, follow the Cursor
   pattern instead: a host helper plus its own IPC
   ([`cursor-chat-id.ts`](../../electron/host-service/cursor-chat-id.ts)), called
   from the renderer ahead of `createCliSession`. Never block the synchronous
   host `createCliSession` on a network call.
5. [`src/lib/terminal/cli-session-runtime-options.ts`](../../src/lib/terminal/cli-session-runtime-options.ts)
   — add the binary-path branch (third compile error).
6. [`StandaloneCliTerminal.tsx`](../../src/components/layout/standalone-cli/StandaloneCliTerminal.tsx)
   — subscribe to the new `<provider>BinaryPath` setting and pass it through
   `buildStandaloneCliCreateSessionArgs`.
7. Tests: `tests/standalone-cli-identity.test.ts` (tab set matches the
   `ProviderId` set), `tests/cli-session-runtime-options.test.ts`,
   `tests/terminal-runtime.test.ts` (spawn args for new and resumed sessions),
   `tests/ipc-schemas.test.ts`.
8. Docs: add the provider to
   [`docs/features/standalone-cli.md`](../features/standalone-cli.md), including
   its resume mechanism and any limitation, and add a row to the table above.

No installation check gates the tab. A provider whose CLI is missing shows the
launch spec's "executable not found" message inside its own tab, which is why
that message should name the CLI and the configurable binary path.

## 5. Verify

```sh
bun run typecheck
bun test tests/standalone-cli-identity.test.ts \
  tests/cli-session-runtime-options.test.ts \
  tests/terminal-runtime.test.ts tests/ipc-schemas.test.ts \
  tests/standalone-cli-terminal.test.tsx
```

Then smoke the desktop app: open the Standalone CLI popover, send one prompt in
the new tab, quit and relaunch, and confirm the conversation resumes.
