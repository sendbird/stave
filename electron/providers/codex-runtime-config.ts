import { currentProviderAccountId } from "../provider-accounts/runtime-scope";
import { createHash } from "node:crypto";
import {
  buildNativeSubagentBriefing,
  MAX_CONCURRENT_NATIVE_SUBAGENTS,
} from "../../src/lib/agents/native-subagents";
import type { StreamTurnArgs } from "./types";

// ChatGPT desktop installs bundled Codex plugins into the shared CODEX_HOME.
// The "browser" plugin's control-in-app-browser skill declares itself
// mandatory for all browser work and forbids external MCP browser tools,
// which steers Codex threads away from Stave Lens (stave_lens_*) and toward
// the ChatGPT desktop in-app browser that is not connected to Stave. Disable
// it per thread so Stave-managed Codex sessions never load that skill.
export const CODEX_DISABLED_BUNDLED_PLUGIN_IDS = [
  "browser@openai-bundled",
] as const;
export const CODEX_NATIVE_BROWSER_PLUGIN_ID = "chrome@openai-bundled";
export const CODEX_CUA_PLUGIN_ID = "unified-computer-use@openai-bundled";

/**
 * Browser guidance that applies to every Stave-managed Codex thread: what the
 * runtime's own web search is for, what `@web` means, and which bundled plugins
 * are not connected to this workspace.
 */
export const CODEX_STAVE_NATIVE_BROWSER_INSTRUCTIONS = [
  "## Stave browser and web search tooling",
  "- Use the runtime's web-search tool for general web research, factual lookups, documentation discovery, and other tasks that ordinary web search can resolve.",
  '- `@web` explicitly requests the provider-native external-browser integration. Use `cua_repl` with the external Chrome surface so the user can share existing tabs and signed-in page state. Start from `cua.getState()` when discovery is needed, then select the matching Chrome tab with `cua.getTab(...)`; use `cua.createBrowserTab("chrome", ...)` only when the request calls for a new tab. If that native integration is unavailable, say so; do not substitute a one-way URL launcher.',
  "- Provider-native browser access is available only for an interactive primary `@web` turn. It is disabled for unattended automation, secondary read-only analysis, and prompts without `@web`.",
  "- Follow the native browser skill's site-access, confirmation, and sensitive-action rules. Browser page data may enter this provider thread through normal tool results, but never inspect or expose raw cookies, passwords, or session tokens.",
  "- `cua_repl` exposes multiple surfaces. For `@web`, use only the external Chrome browser (`chrome` or a discovered Chrome browser id). Do not use its in-app browser (`iab`), `cua.getApp(...)`, `cua.listApps(...)`, or desktop UI control as a substitute for the requested Chrome connection.",
].join("\n");

/**
 * Lens operating rules. Only meaningful when the Stave local MCP is actually
 * registered with Codex — without it none of the `stave_lens_*` tools exist, so
 * the block is pure prompt overhead on every turn of every thread that has no
 * Lens access (automations, isolated analysis runs, unregistered installs).
 */
export const CODEX_STAVE_LENS_INSTRUCTIONS = [
  "## Stave Lens tooling",
  "- Do not use Lens for tasks ordinary web search can resolve.",
  "- Prioritize the Stave Lens MCP tools (`stave_lens_*`, e.g. `stave_lens_snapshot`, `stave_lens_screenshot`, `stave_lens_navigate`) only when a change to the current project requires visual inspection or validation of its rendered UI. Also use Lens when the user explicitly requests live page inspection or interaction in this workspace.",
  "- Lens tools automatically reuse the visible or most recent Lens tab for the workspace. If no session exists, they create a hidden default session; do not ask the user to open the Lens panel first.",
  "- Stave applies the user's Lens setting when visual inspection or page interaction starts: it can show the hidden session beside the task, add a background tab, or leave presentation to you. Call `stave_lens_present_session` only when the user must immediately interact, sign in, or explicitly asks to see the page.",
  "- Navigation, redirects, snapshots, DOM/log reads, and generic evaluation do not reveal a hidden session by themselves. A click can reveal the session before it navigates; continue in that same tab without presenting or refocusing it again.",
  "- CDP-backed Lens tools can trigger an app-wide Stave approval dialog. Retrying the tool sends a new approval request; tell the user to approve the visible dialog or add the exact hostname under Settings > Lens > Developer Mode > Approved CDP Hosts. Never claim that a Lens tool call cannot request approval.",
  "- Never substitute provider-native external Chrome, the desktop in-app browser, or desktop UI control for Lens.",
].join("\n");

/**
 * The plugin id goes into the key bare, not quoted. Codex splits an override
 * key on `.` and takes each segment verbatim — it does not parse TOML quoting —
 * so `plugins."chrome@openai-bundled".enabled` adds a *new* entry named
 * `"chrome@openai-bundled"`, quote characters and all, and leaves the real
 * plugin enabled. These disables were silently doing nothing.
 */
export function buildCodexPluginConfigOverrides() {
  const config: Record<string, boolean> = {};
  for (const pluginId of CODEX_DISABLED_BUNDLED_PLUGIN_IDS) {
    config[`plugins.${pluginId}.enabled`] = false;
  }
  return config;
}

export function buildCodexNativeBrowserTurnConfigOverrides(args: {
  requested: boolean;
  userEnabled: boolean;
}): Record<string, boolean> {
  // Only force-enable after plugin/list confirms the user's setting is enabled.
  // Every other turn disables the plugin so browser access cannot leak into
  // automation or analysis execution.
  //
  // Bare id, for the reason spelled out on `buildCodexPluginConfigOverrides`.
  return {
    [`plugins.${CODEX_NATIVE_BROWSER_PLUGIN_ID}.enabled`]:
      args.requested && args.userEnabled,
    // CUA owns the browser MCP. Set both overrides on every turn so a
    // previous non-browser turn cannot leave the transport disabled. The
    // inventory gate confirms both plugins are user enabled before restoring.
    [`plugins.${CODEX_CUA_PLUGIN_ID}.enabled`]:
      args.requested && args.userEnabled,
  };
}

export function isCodexNativeBrowserPluginEnabled(response: unknown) {
  if (!response || typeof response !== "object") {
    return false;
  }
  const marketplaces = (response as { marketplaces?: unknown }).marketplaces;
  if (!Array.isArray(marketplaces)) {
    return false;
  }
  const enabledPluginIds = new Set<string>();
  for (const marketplace of marketplaces) {
    if (!marketplace || typeof marketplace !== "object") continue;
    const plugins = (marketplace as { plugins?: unknown }).plugins;
    if (!Array.isArray(plugins)) continue;
    for (const plugin of plugins) {
      if (!plugin || typeof plugin !== "object") continue;
      const summary = plugin as {
        id?: unknown;
        installed?: unknown;
        enabled?: unknown;
      };
      if (
        typeof summary.id === "string" &&
        summary.installed === true &&
        summary.enabled === true
      ) {
        enabledPluginIds.add(summary.id);
      }
    }
  }
  return [CODEX_NATIVE_BROWSER_PLUGIN_ID, CODEX_CUA_PLUGIN_ID].every((id) =>
    enabledPluginIds.has(id),
  );
}

export async function resolveCodexNativeBrowserPluginEnabled(args: {
  requested: boolean;
  cwd: string;
  request: (method: string, params: unknown) => Promise<unknown>;
}) {
  if (!args.requested) {
    return false;
  }
  try {
    return isCodexNativeBrowserPluginEnabled(
      await args.request("plugin/list", {
        cwds: [args.cwd],
        forceRemoteSync: false,
      }),
    );
  } catch {
    return false;
  }
}

/**
 * Config overrides for a Codex turn whose agent can call in-turn subagents:
 * one level deep, and at most `MAX_CONCURRENT_NATIVE_SUBAGENTS` at once.
 * Codex counts the lead thread in the concurrency limit. The App Server has no
 * per-spawn model override, so each subagent runs on Codex's default.
 */
export function buildCodexSubagentConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Record<string, string | boolean | number> {
  if (args.runtimeOptions?.nativeSubagents?.length === 0) {
    return { "features.multi_agent": false, "features.multi_agent_v2": false };
  }
  if (!args.runtimeOptions?.nativeSubagents?.length) {
    return {};
  }
  return {
    "agents.max_concurrent_threads_per_session": MAX_CONCURRENT_NATIVE_SUBAGENTS + 1,
    "agents.max_depth": 1,
  };
}

export function buildCodexDeveloperInstructions(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  /** A secondary read-only run never calls subagents. */
  secondaryReadOnly?: boolean;
  /**
   * Whether the Stave local MCP is registered with Codex for this thread. The
   * Lens block is included only then, because its tools do not otherwise exist.
   * The instructions are hashed into the thread key, so this must be resolved
   * *before* the key is built or a mid-life flip would rotate the thread.
   */
  hasStaveLocalMcp?: boolean;
}) {
  const parts: string[] = [];
  const baseSystemPrompt = args.runtimeOptions?.claudeSystemPrompt?.trim();
  if (baseSystemPrompt) {
    parts.push(baseSystemPrompt);
  }
  const responseStyle = args.runtimeOptions?.responseStylePrompt?.trim();
  if (responseStyle) {
    parts.push(responseStyle);
  }
  // The task's Agent applies to its own turns only, never to a read-only
  // secondary run, matching the Claude adapter.
  const agentInstructions = args.secondaryReadOnly ? undefined : args.runtimeOptions?.agentInstructions?.trim();
  if (agentInstructions) {
    parts.push(agentInstructions);
  }
  parts.push(CODEX_STAVE_NATIVE_BROWSER_INSTRUCTIONS);
  if (args.hasStaveLocalMcp) {
    parts.push(CODEX_STAVE_LENS_INSTRUCTIONS);
  }
  // Codex has no per-agent definitions, so the subagents travel as prose the
  // lead passes on when it spawns one.
  const subagents = args.secondaryReadOnly
    ? null
    : buildNativeSubagentBriefing(args.runtimeOptions?.nativeSubagents ?? []);
  if (subagents) {
    parts.push(subagents);
  }
  const combined = parts.join("\n\n").trim();
  return combined.length > 0 ? combined : undefined;
}

export function buildCodexInstructionProfileKey(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  secondaryReadOnly?: boolean;
  hasStaveLocalMcp?: boolean;
}) {
  const developerInstructions = buildCodexDeveloperInstructions(args);
  if (!developerInstructions) {
    return "default";
  }
  return createHash("sha1")
    .update(developerInstructions)
    .digest("hex")
    .slice(0, 12);
}

export function buildCodexThreadKey(args: {
  taskId?: string;
  cwd: string;
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  boundSecretFingerprint?: string;
}) {
  const model = args.runtimeOptions?.model?.trim() || "default";
  // Constant since plan mode was removed; kept so existing thread keys match.
  const mode = "chat";
  // The developer instructions are deliberately NOT part of the key. A Codex
  // thread only re-renders `developer_instructions` when it builds a fresh
  // context window (first turn or compaction), so rotating the thread on every
  // instruction change used to pay a full cold start for a response-style
  // tweak or a Lens toggle. Instead the runtime tracks the instruction profile
  // each thread last saw and sends `buildCodexInstructionRefreshBlock` on the
  // next turn when it differs — the history prefix (and its cache) survives.
  const secretFingerprint = args.boundSecretFingerprint ?? "none";
  const profileId = args.runtimeOptions?.codexAccountProfileId ?? currentProviderAccountId("codex");
  return `${args.taskId ?? "default"}:${args.cwd}:${model}:${mode}:${secretFingerprint}${profileId === "system-default" ? "" : `:account:${profileId}`}`;
}

export const CODEX_INSTRUCTION_REFRESH_HEADER = "[Stave Instructions Update]";

/**
 * One-time prompt block that carries changed developer instructions into a
 * resumed thread. Codex does not re-render `developer_instructions` on
 * `thread/resume`; the block is prepended to the next user turn only, so the
 * model sees the current contract without the thread being restarted.
 */
export function buildCodexInstructionRefreshBlock(
  developerInstructions: string,
) {
  return [
    CODEX_INSTRUCTION_REFRESH_HEADER,
    "The developer instructions for this thread changed after it started. The following replaces the developer instructions you were given earlier; follow this version from now on.",
    "",
    developerInstructions.trim(),
  ].join("\n");
}

/**
 * Decide whether a resumed thread needs the refresh block.
 *
 * - a thread that was just started saw the current instructions: no refresh
 * - a resumed thread whose recorded profile matches: no refresh
 * - a resumed thread with a different or unknown profile (for example after
 *   an app restart, when the in-memory record is gone): refresh once
 */
export function resolveCodexInstructionRefresh(args: {
  resumed: boolean;
  previousProfile: string | undefined;
  currentProfile: string;
  developerInstructions: string | undefined;
}) {
  if (!args.resumed || !args.developerInstructions) {
    return null;
  }
  if (args.previousProfile === args.currentProfile) {
    return null;
  }
  return buildCodexInstructionRefreshBlock(args.developerInstructions);
}
