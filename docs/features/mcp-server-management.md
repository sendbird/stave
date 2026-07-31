# MCP Server Management

Stave can manage native MCP server configuration for both bundled providers
from `Settings > MCP`.

## Supported Operations

- list configured servers alongside live connection status and recent errors
- add stdio or remote HTTP servers for Claude and Codex
- add legacy SSE servers for Claude
- edit a server without exposing stored credential values to the renderer
- rename or delete a server after reviewing the change
- start provider-native OAuth when a configured server reports that sign-in is
  required

Claude supports `user`, `project`, and `local project` scopes. Codex currently
supports `user` scope because its App Server write API applies mutations to the
user configuration layer.

Stave's own `stave-local-mcp` and `stave-local` entries remain owned by the
dedicated Local MCP controls. They are visible in the connection overview but
cannot be edited or deleted through the general manager.

## Add A Server

1. Open `Settings > MCP`.
2. Select `Add server`.
3. Choose Claude or Codex, a supported scope, and the transport.
4. Enter the command and arguments for stdio, or the URL for HTTP/SSE.
5. Enter environment-variable names for authentication or headers. Do not
   enter credential values.
6. Select `Review change` and inspect the provider, scope, transport, and
   binding counts.
7. Select `Apply change`.

The connection list refreshes automatically after the provider configuration
is written.

## Credential Handling

The editor accepts references rather than values:

- Claude stdio environment entries are written as `${ENV_VAR}` references.
- Claude remote headers are written as `${ENV_VAR}` or
  `Bearer ${ENV_VAR}` references.
- Codex stdio inheritance uses `env_vars`.
- Codex remote authentication uses `bearer_token_env_var` and
  `env_http_headers`.

Existing literal environment values, headers, URL query details, and command
arguments are not returned to the renderer. The UI reports only how many
opaque values are hidden. When an edit keeps the same transport, the main
process preserves those values unless the user explicitly replaces the
corresponding field.

Renderer-facing connection diagnostics are bounded and redact credential-like
URL details, bearer values, and token-shaped key/value pairs.

Project-scope Claude writes are refused when the destination contains a
literal credential-like value. Replace it with an environment reference before
using Stave to edit that project file.

## Safe Writes And Conflicts

Every create, update, and delete is a two-step operation:

1. Stave reads the current native provider configuration and returns a
   sanitized preview with a revision.
2. Apply re-reads the destination and rejects the write if the revision has
   changed.

Claude JSON files are replaced with an atomic same-directory write. Codex uses
the App Server's atomic batch-write configuration operation with the user-layer
version, then asks the provider to reload MCP configuration.

If another process changes a provider config after preview, reopen or review
the change again instead of overwriting the newer configuration.
