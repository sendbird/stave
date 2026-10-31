# Provider Browser Access

`@web` lets an interactive Stave task use the active provider's native browser
integration. It does not launch a Stave-managed Chrome profile and it does not
copy browser credentials into Stave.

## Provider behavior

- Claude Code starts the turn with its native Chrome integration enabled
  (`--chrome`), which surfaces as the `claude-in-chrome` MCP server
  (`mcp__claude-in-chrome__*`). The Claude browser extension decides which
  existing Chrome tabs are available and keeps its own site-access and
  sensitive-action confirmations. Stave explicitly disables the integration
  (`--no-chrome`) on turns without interactive `@web` or automatic activation,
  including every analysis query.
- Codex uses `cua_repl` and selects only its external Chrome surface. The same
  tool can expose an in-app browser and desktop UI control, but those surfaces
  do not satisfy `@web`. Stave disables the Chrome plugin for turns without
  interactive `@web` or automatic activation, and does not force-enable a
  plugin that the user disabled. The shared `unified-computer-use` plugin is also disabled on turns
  without browser access; disabling only the Chrome skill would leave its MCP
  tools available. On a browser turn, Stave checks that both plugins are installed
  and enabled by the user before explicitly restoring both turn overrides.
  When browser access changes between turns, Stave releases the idle native
  thread and resumes the same conversation from disk so its MCP inventory
  reflects the new access. An active thread cannot be reloaded this way.

The browser extension, provider CLI, and the user's existing Chrome profile own
the live connection. Stave only asks the provider to use that connection for
the current turn.

Both providers also receive an injected browser-policy block stating what
`@web` means, that Chrome access exists only on interactive primary turns
(`@web`, automatic activation, or the Always mode), that Chrome tools present
on a turn without `@web` mean the user allowed Stave to attach them, and that
neither an in-app browser nor desktop UI control substitutes for the requested
Chrome connection. The tool names in each block differ
because the provider contracts differ; the policy does not.

## Using `@web`

Mention `@web` in an interactive task prompt when the answer depends on an
existing tab, signed-in page state, or another browser extension. The provider
may ask for site access or confirmation before it reads or changes a page.

`@web` is intentionally unavailable to unattended automations and secondary
read-only analysis. Use ordinary web search for public research,
or Lens when the current repository's rendered UI needs workspace-scoped visual
inspection.

## Browser modes

`Settings > Browser > Mentions > Browser access > When the agent may use Chrome` picks
how far Stave attaches the provider browser without `@web`:

| Mode | Chrome is attached to |
|---|---|
| Only with @web | Interactive prompts that contain `@web`. |
| Lens first (automatic, default) | `@web` prompts and one retry after a blocked fetch or Lens read. Known-host activation is a separate opt-in. See below. |
| Always | Every interactive primary turn. The agent decides when to open the user's Chrome. |

The mode is stored as two settings, `providerBrowserAutoFallback` and
`providerBrowserAlwaysOn`, so a saved Automatic opt-out from before Always mode
existed still reads as Only with @web. Always mode never overrides the hard
blocks: unattended automation and secondary read-only analysis stay without a
browser in every mode.

Automatic mode starts without Chrome so the agent can use Lens for workspace
pages. **Connect Chrome in advance for listed hosts** separately enables
known-host activation; it is off by default, including for existing settings
that have not saved this option. Turning it off keeps the saved host list.
An existing Always selection remains Always until the user changes the mode.

In Always mode the browser is already attached, so the automatic retry never
fires. On Claude Code, a `WebFetch` that hits a login wall or bot check on a
browser-attached turn (Always or `@web`) gets a note pointing the model at the
`mcp__claude-in-chrome__*` tools instead of further fetch attempts. Codex has
no equivalent tool-result hook; its injected policy carries the same guidance.

## Automatic fallback

In Lens-first automatic mode, Stave can arm the provider browser for an interactive turn
that did not say `@web`, in two places:

- **Up front, only with the separate host option enabled**, when the prompt contains a URL on a host that a token-less
  fetch cannot read. Stave ships with `claude.ai` and `claudeusercontent.com`;
  the settings field takes additional hosts, and subdomains of each entry
  match. This path helps a page whose fetched HTML is a
  client-rendered shell rather than an error, because nothing in a 200-with-no-
  content response identifies it as blocked. Leave the option off to try Lens
  before attaching Chrome, including on these hosts.
- **After a failure**, when a `WebFetch` during the turn comes back as a login
  wall or a bot check (401/403, a Cloudflare interstitial, an explicit sign-in
  demand), or a Lens page read encounters a login screen, missing saved account,
  navigation timeout, or browser connection failure. Stave then sends one
  follow-up turn whose prompt contains `@web`, carrying the blocked page URL
  when it is available. It retries the read using an existing signed-in Chrome
  session; it never transfers Lens credentials or replays writes. Ref/selector
  mistakes, denied approvals, site-policy blocks, and user-paused Lens automation
  do not trigger a browser fallback. A later control block also cancels a
  fallback detected earlier in that turn.

The follow-up is capped at one attempt by construction rather than by a
counter: its own prompt contains `@web`, and a turn that already asked for the
browser never qualifies for another fallback. Stave also holds off when the
turn was aborted, when the user has a queued follow-up of their own, when the
turn is not the task's own dialogue (compare arms, kickoffs), and whenever the
three hard blocks above apply. The follow-up runs as a utility turn, so it
never starts a subagent.

While the fallback is on and the browser is not attached, a blocked `WebFetch`
also gets a note telling the model to stop retrying the host and report what is
missing, instead of spending the rest of the turn on fetches that cannot
succeed.

## Settings

Settings > Browser > Mentions lists every prompt mention (`@web`, `@lens`, and the
`@info:<section>` references) with its current status, and its Browser access
card shows the browser mode and the setup path for Claude Code and Codex. Stave does not persist or display a browser connection status: each
`@web` turn attempts Chrome access directly, and any failure is reported in
that conversation. Because the extension is provider-owned, Stave cannot
install it, enable it, or grant site access from Settings.

## Security boundary

- Native extension site permissions and sensitive-action confirmations remain
  provider-owned.
- Stave never asks the model to inspect or reveal raw cookies, passwords, or
  session tokens.
- Stave stores no browser connection status, page URL, DOM snapshot, cookie,
  password, or session token in workspace Information. Page content returned by
  a provider browser tool can still become part of the task transcript like any
  other tool result.
- The integration is opt-in per interactive prompt through `@web`. The default
  Automatic mode additionally allows per-host activation and a post-failure
  retry, and preserves a saved opt-out. Always mode is opt-in and attaches the
  browser to every interactive primary turn; the provider extension's site
  access and confirmations still apply.
- Stave does not expose a separate browser-control IPC or Local MCP tool.

## Initialization troubleshooting

If the tool reports `CUA_REPL_ENABLED_SURFACES is required` before it can list
browsers, check that the installed plugin launcher matches the bundled CUA
runtime. Older launchers can omit the REPL environment forwarding expected by
a newer runtime and call an obsolete initialization API. Refresh the plugin
through its owning application and start a new provider session. Do not fix
this by granting extra browser or desktop permissions. Stave does not rewrite
provider-owned plugin files as part of normal turn startup.
