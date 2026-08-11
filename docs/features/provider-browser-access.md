# Provider Browser Access

`@web` lets an interactive Stave task use the active provider's native browser
integration. It does not launch a Stave-managed Chrome profile and it does not
copy browser credentials into Stave.

## Provider behavior

- Claude Code starts the turn with its native Chrome integration enabled. The
  Claude browser extension decides which existing Chrome tabs are available
  and keeps its own site-access and sensitive-action confirmations. Stave
  explicitly disables the integration on turns without interactive `@web`.
- Codex uses its installed Chrome plugin and extension-backed browser runtime.
  Stave disables that plugin for turns without interactive `@web`, and does
  not force-enable a plugin that the user disabled.

The browser extension, provider CLI, and the user's existing Chrome profile own
the live connection. Stave only asks the provider to use that connection for
the current turn.

## Using `@web`

Mention `@web` in an interactive task prompt when the answer depends on an
existing tab, signed-in page state, or another browser extension. The provider
may ask for site access or confirmation before it reads or changes a page.

`@web` is intentionally unavailable to unattended routines, plan-mode turns,
and secondary read-only analysis. Use ordinary web search for public research,
or Lens when the current project's rendered UI needs workspace-scoped visual
inspection.

## Information panel

After an `@web` request, the Information panel shows a `Connected browser tab`
card with the provider and one of these states:

- `Connecting`: the provider-native browser connection was requested.
- `Connected`: the provider confirmed that its browser runtime was available.
- `Unavailable`: the provider could not confirm the connection during the turn.

This card is connection metadata, not a tab mirror. Stave stores no page URL,
DOM snapshot, cookie, password, or session token in workspace Information.
Page content returned by a provider browser tool can still become part of the
provider turn and task transcript, just like any other tool result.

## Security boundary

- Native extension site permissions and sensitive-action confirmations remain
  provider-owned.
- Stave never asks the model to inspect or reveal raw cookies, passwords, or
  session tokens.
- The integration is opt-in per interactive prompt through `@web`.
- Stave does not expose a separate browser-control IPC or Local MCP tool.
