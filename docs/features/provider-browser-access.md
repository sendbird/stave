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

## Automatic fallback

`Settings > Providers > Browser access > Automatic browser fallback` is off by
default. Turning it on lets Stave arm the provider browser for an interactive
turn that did not say `@web`, in two places:

- **Up front**, when the prompt contains a URL on a host that a token-less
  fetch cannot read. Stave ships with `claude.ai` and `claudeusercontent.com`;
  the settings field takes additional hosts, and subdomains of each entry
  match. This is the only path that helps a page whose fetched HTML is a
  client-rendered shell rather than an error, because nothing in a 200-with-no-
  content response identifies it as blocked.
- **After a failure**, when a `WebFetch` during the turn comes back as a login
  wall or a bot check (401/403, a Cloudflare interstitial, an explicit sign-in
  demand). Stave then sends one follow-up turn whose prompt contains `@web`.

The follow-up is capped at one attempt by construction rather than by a
counter: its own prompt contains `@web`, and a turn that already asked for the
browser never qualifies for another fallback. Stave also holds off when the
turn was aborted, when the user has a queued follow-up of their own, when the
turn is not the task's own dialogue (compare arms, kickoffs), and whenever the
three hard blocks above apply. The follow-up runs as a utility turn, so it
never re-runs the task's armed Advisor.

While the fallback is on and the browser is not attached, a blocked `WebFetch`
also gets a note telling the model to stop retrying the host and report what is
missing, instead of spending the rest of the turn on fetches that cannot
succeed.

## Settings

Settings > Providers > Browser access shows the latest connection state
recorded in the active workspace, together with the setup and recheck path for
Claude Code and Codex. `Not checked` means the workspace has no recorded
`@web` request. `No recent result` means the other provider owns the single
latest result; run this provider with `@web` to check it again. Because the
extension is provider-owned, Stave cannot install it, enable it, or grant site
access from Settings.

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
- The integration is opt-in per interactive prompt through `@web`. Automatic
  fallback widens that to a per-host and post-failure opt-in, and is itself
  off by default and configured only in Settings.
- Stave does not expose a separate browser-control IPC or Local MCP tool.
