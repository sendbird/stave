/**
 * Browser guidance for Stave-managed Claude sessions.
 *
 * The Codex side of this lives in `codex-runtime-config.ts`. Both providers get
 * the same policy — what ordinary web search is for, what `@web` means, which
 * surfaces are *not* a substitute for the requested external Chrome connection,
 * and that Lens stays the path for validating this project's own dev UI — but
 * the tool contracts differ, so the concrete tool names cannot be shared:
 *
 * - Codex reaches external Chrome through `cua_repl` (a multi-surface tool that
 *   also exposes an in-app browser and desktop UI control).
 * - Claude reaches it through its own built-in Chrome integration, which Stave
 *   arms with the `--chrome` CLI flag and which surfaces as MCP tools under the
 *   `claude-in-chrome` server (`mcp__claude-in-chrome__*`). Those tools may be
 *   deferred rather than listed up front, so the model may have to look them up
 *   before calling them.
 *
 * Verified against Claude Code 2.1.267 and claude-agent-sdk 0.3.197: the
 * `claude-in-chrome` server name, the `mcp__claude-in-chrome__*` tool prefix,
 * and the `--chrome` / `--no-chrome` flags are all still current.
 */
export const CLAUDE_STAVE_NATIVE_BROWSER_INSTRUCTIONS = [
  "## Stave browser and web search tooling",
  "- Use WebSearch for general web research, factual lookups, documentation discovery, and other tasks that ordinary web search can resolve. Use WebFetch for pages that a token-less request can actually read.",
  "- `@web` explicitly requests the provider-native external-browser integration: the user's own Chrome. Use the built-in Chrome tools (the `claude-in-chrome` MCP server, tools named `mcp__claude-in-chrome__*`) so existing tabs and signed-in page state can be referenced; if they are deferred rather than listed, look them up before calling. Prefer reading or reusing an existing tab over opening a new one. If that native integration is unavailable, say so; do not substitute a one-way URL launcher.",
  "- Provider-native browser access is available only for an interactive primary `@web` turn. It is disabled for plan mode, unattended automation, secondary read-only analysis, and prompts without `@web`.",
  "- Follow Chrome's site-access, confirmation, and sensitive-action rules; those approvals stay provider-owned. Browser page data may enter this thread through normal tool results, but never inspect or expose raw cookies, passwords, or session tokens.",
  "- `@web` means external Chrome only. Do not substitute Stave Lens, a desktop in-app browser, or desktop/computer UI control for the requested Chrome connection, and do not treat a success on one of those surfaces as Chrome access.",
].join("\n");

/**
 * Lens operating rules. Only meaningful when the Stave local MCP is actually
 * registered for the session — without it none of the `stave_lens_*` tools
 * exist, so the block is pure prompt overhead on every turn of every session
 * that has no Lens access (routines, isolated analysis runs, unregistered
 * installs).
 */
export const CLAUDE_STAVE_LENS_INSTRUCTIONS = [
  "## Stave Lens tooling",
  "- Do not use Lens for tasks ordinary web search can resolve.",
  "- Prioritize the Stave Lens MCP tools (`stave_lens_*`, e.g. `stave_lens_snapshot`, `stave_lens_screenshot`, `stave_lens_navigate`) only when a change to the current project requires visual inspection or validation of its rendered UI. Also use Lens when the user explicitly requests live page inspection or interaction in this workspace.",
  "- Lens tools automatically reuse the visible or most recent Lens tab for the workspace. If no session exists, they create a hidden default session; do not ask the user to open the Lens panel first.",
  "- Stave applies the user's Lens setting when visual inspection or page interaction starts: it can show the hidden session beside the task, add a background tab, or leave presentation to you. Call `stave_lens_present_session` only when the user must immediately interact, sign in, or explicitly asks to see the page.",
  "- Navigation, redirects, snapshots, DOM/log reads, and generic evaluation do not reveal a hidden session by themselves. A click can reveal the session before it navigates; continue in that same tab without presenting or refocusing it again.",
  "- CDP-backed Lens tools can trigger an app-wide Stave approval dialog. Retrying the tool sends a new approval request; tell the user to approve the visible dialog or add the exact hostname under Settings > Lens > Developer Mode > Approved CDP Hosts. Never claim that a Lens tool call cannot request approval.",
  "- Never substitute provider-native external Chrome, a desktop in-app browser, or desktop UI control for Lens.",
].join("\n");
