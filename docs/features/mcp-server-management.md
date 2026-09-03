# MCP Server Management

Stave manages native MCP server configuration from `Settings > MCP` for Claude,
Codex, Cursor, and Kiro. Cursor/Grok and Kiro tasks run through ACP and retain
their own user or workspace MCP files.

## Provider Targets And Sharing

A single add or share action can write provider-native copies of the same
server.

- `Add server` offers Claude, Codex, Cursor, and Kiro as installation targets.
- `Add to Claude`, `Add to Codex`, `Add to Cursor`, and `Add to Kiro` copy a safe,
  renderer-visible description into a missing provider.
- Claude supports `user`, `project`, and `local project` scopes.
- Codex currently supports `user` scope only.
- Cursor supports `user` and `project` scopes, stored in
  `~/.cursor/mcp.json` and `<workspace>/.cursor/mcp.json` respectively.
- Kiro supports `user` and `project` scopes, stored in
  `~/.kiro/settings/mcp.json` and `<workspace>/.kiro/settings/mcp.json`.
- A Claude local-project entry becomes a Cursor or Kiro project entry, or a
  Codex user entry, when copied.
- Codex does not accept SSE entries. Cursor and Kiro can store stdio, HTTP, and
  SSE entries natively.

Cursor- and Kiro-native entries are intentionally not reduced to Stave's ACP
projection. Their ACP runtimes load native files directly, which preserves
provider-owned OAuth metadata and authentication state and avoids registering
the same server twice. Compatible
file-backed Claude and Codex stdio/HTTP entries can still be forwarded to a
primary Cursor or Kiro session only when that target has no native entry with
the same name or connector identity. SSE entries are not forwarded through that
shared projection.

If a target-native MCP file is unreadable or contains invalid JSON, Stave fails
closed and injects only its dedicated Local MCP server for that session. It does
not guess that the native routes are absent and silently reactivate a shared
copy.

Provider-hosted account connectors and plugin runtimes expose neither a reusable
MCP URL nor their provider-owned OAuth session. They remain provider-only.
OAuth authentication is never copied between providers; each provider signs in
independently.

Stave's `stave-local-mcp` and `stave-local` entries remain owned by the
dedicated Local MCP controls and cannot be edited or deleted through the
general manager.

## Supported Operations

- list native Claude, Codex, Cursor, and Kiro configurations
- add, edit, rename, copy, or delete a server after reviewing the destination
- write Cursor or Kiro user/workspace `mcp.json` with revision conflict detection
- preserve unrelated JSON keys and unedited servers
- keep credential values out of the renderer, model text, transcripts, and logs
- start provider-native OAuth; for Cursor this runs
  `agent mcp login <server>` with the configured Cursor Agent executable
- show live Claude/Codex status and configuration-level Cursor/Kiro status

Cursor and Kiro Settings rows report that a server is configured, not that a
remote connection has been live-probed. Use each provider's CLI to inspect
authentication and tools.

## Add A Server

1. Open `Settings > MCP`.
2. Select `Add server`.
3. Select one or more provider targets and a compatible scope.
4. Enter a command and arguments for stdio, or a URL for HTTP/SSE.
5. Enter environment-variable names for inherited variables or headers. Never
   enter a credential value.
6. Select `Review change` and inspect every destination, scope, transport, and
   warning.
7. Select `Apply change`.

The connection list refreshes after the native files are written. Cursor and
Kiro read those files in their own runtimes, so targeted changes also affect the
provider outside Stave.

## Cursor/Grok Slack OAuth Setup

Use this flow when Slack is exposed as a remote MCP endpoint that requires
OAuth. Replace every placeholder with values from the Slack MCP operator; do
not paste OAuth secrets into Stave.

### Dynamic OAuth registration

Dynamic registration needs only the remote endpoint:

1. Open a workspace if the server should be project-scoped.
2. Open `Settings > MCP` and select `Add server`.
3. Enable `Cursor`. Disable the other targets unless they also need their own
   native copy.
4. Choose `User` for all workspaces or `Project` for only the current workspace.
5. Name the server `slack`, choose `HTTP` (or `SSE` only when the endpoint
   requires it), and enter `<slack-mcp-url>`.
6. Leave bearer-token and header fields empty for OAuth.
7. Review and apply the change.
8. On the `slack` row, select `Sign in` in the Cursor card. Stave runs the
   configured Cursor Agent as `agent mcp login slack`; Cursor opens and owns the
   browser flow and stores its OAuth state separately.
9. Complete consent in the browser, then start a new Cursor/Grok task.

Cursor Agent's documented OAuth callback is:

```text
https://www.cursor.com/agents/mcp/oauth/callback
```

Register that callback with the MCP OAuth client when the server requires an
explicit redirect URI.

### Static OAuth client metadata

Some endpoints require a pre-registered client rather than dynamic
registration. Cursor accepts an `auth` object in its native file. Stave safely
preserves an existing `auth` object during same-transport edits, but the current
Settings form does not create or reveal static client metadata. Add it directly
to the chosen Cursor file, using an environment reference for the secret:

```json
{
  "mcpServers": {
    "slack": {
      "url": "<slack-mcp-url>",
      "auth": {
        "CLIENT_ID": "<oauth-client-id>",
        "CLIENT_SECRET": "${env:SLACK_MCP_CLIENT_SECRET}",
        "scopes": ["<required-scope>"]
      }
    }
  }
}
```

Set `SLACK_MCP_CLIENT_SECRET` in the environment that launches Cursor Agent,
then use `Sign in` in Stave or run:

```bash
agent mcp login slack
```

Do not put the literal client secret in `mcp.json`, especially in a project
file. Stave refuses to rewrite a Cursor project file containing a literal
credential-like value.

### Verify and troubleshoot

From the same workspace and environment used by Stave, run:

```bash
agent mcp list
agent mcp list-tools slack
```

Then create a new Stave task, select Cursor and the desired Grok model, and ask
it to list or search Slack through the MCP tools. Existing ACP processes do not
need to be manually edited; each new Cursor task loads the authenticated native
configuration.

If Slack is absent or login fails:

- Confirm the selected scope wrote `~/.cursor/mcp.json` or
  `<workspace>/.cursor/mcp.json`.
- Confirm `Settings > Providers > Cursor` points to the same `agent` executable
  used in the terminal.
- Run `agent mcp list` before retrying `agent mcp login slack`.
- Confirm the endpoint supports Cursor's remote OAuth flow and the callback URL
  above.
- Team-dashboard MCP servers are not available in Cursor ACP mode; use a user or
  workspace native file.
- If Slack exists only as a provider-internal connector and no external MCP URL
  is available, Cursor ACP cannot use it.
- A successful Claude or Codex Slack login does not authenticate Cursor.

## Credential Handling

The editor accepts references rather than values:

- Claude environment and header references use `${ENV_VAR}`.
- Cursor environment and header references use `${env:ENV_VAR}`.
- Kiro environment and header references use `${ENV_VAR}`.
- Codex stdio inheritance uses `env_vars`; remote authentication uses
  `bearer_token_env_var` and `env_http_headers`.

Existing literal environment values, headers, URL query details, command
arguments, Cursor `auth`, and Kiro `oauth` metadata are not returned to the
renderer. The UI reports only how many opaque values are hidden. Same-transport
edits preserve opaque values where possible. Renderer-facing diagnostics are
bounded and redact credential-like URL details, bearer values, and token-shaped
assignments.

One-click sharing refuses a remote URL with hidden user information, query
details, a fragment, or invalid syntax. Add that destination manually so an
opaque URL cannot cross provider boundaries without review.

Project-scope Claude, Cursor, and Kiro writes are refused when the destination
contains a literal credential-like value. Replace it with the provider's
environment-reference syntax before editing the file in Stave.

## Safe Writes And Conflicts

Every create, update, and delete is a two-step operation:

1. Stave reads the current native provider configuration and returns a
   sanitized preview with a revision.
2. Apply re-reads the destination and rejects the write if the revision changed.

Claude, Cursor, and Kiro JSON files use atomic same-directory replacement while
preserving the destination's mode. Codex uses its App Server atomic batch-write
operation and then reloads MCP configuration. Unrelated top-level JSON keys and
unrelated server entries are preserved.

If another process changes a provider config after preview, review the change
again rather than overwriting the newer configuration.

For provider sandbox and approval controls, see
[Provider Sandbox And Approval Guide](./provider-sandbox-and-approval.md).
