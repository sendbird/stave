import { createHash } from "node:crypto";
import {
  buildWorkerPrimaryInstructions,
  resolveWorkerProfile,
} from "../../src/lib/providers/worker-mode";
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

export const CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS = [
  "## Stave browser and web search tooling",
  "- Use the runtime's web-search tool for general web research, factual lookups, documentation discovery, and other tasks that ordinary web search can resolve. Do not use Lens for those tasks.",
  "- Prioritize the Stave Lens MCP tools (`stave_lens_*`, e.g. `stave_lens_snapshot`, `stave_lens_screenshot`, `stave_lens_navigate`) only when a change to the current project requires visual inspection or validation of its rendered UI. Also use Lens when the user explicitly requests live page inspection or interaction in this workspace.",
  "- Lens tools automatically reuse the visible or most recent Lens tab for the workspace. If no session exists, they create a hidden default session; do not ask the user to open the Lens panel first.",
  "- Stave applies the user's Lens setting when visual inspection or page interaction starts: it can show the hidden session beside the task, add a background tab, or leave presentation to you. Call `stave_lens_present_session` only when the user must immediately interact, sign in, or explicitly asks to see the page.",
  "- Navigation, redirects, snapshots, DOM/log reads, and generic evaluation do not reveal a hidden session by themselves. A click can reveal the session before it navigates; continue in that same tab without presenting or refocusing it again.",
  "- CDP-backed Lens tools can trigger an app-wide Stave approval dialog. Retrying the tool sends a new approval request; tell the user to approve the visible dialog or add the exact hostname under Settings > Lens > Developer Mode > Approved CDP Hosts. Never claim that a Lens tool call cannot request approval.",
  "- The ChatGPT desktop in-app browser plugin (`control-in-app-browser`), Computer Use, and `node_repl` browser clients are not connected to this Stave workspace. Never use them for browser inspection or automation here, and never treat their skills as required reading.",
].join("\n");

export function buildCodexPluginConfigOverrides() {
  const config: Record<string, boolean> = {};
  for (const pluginId of CODEX_DISABLED_BUNDLED_PLUGIN_IDS) {
    config[`plugins."${pluginId}".enabled`] = false;
  }
  return config;
}

/**
 * Resolves Worker mode for a Codex turn.
 *
 * Codex has no per-spawn model override reachable from the App Server, so the
 * worker is pinned through `[agents]` defaults instead and the primary is told
 * to delegate through developer instructions. Both halves resolve from this one
 * function so the config and the prose can never describe different workers.
 */
export function resolveCodexWorkerProfile(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}) {
  const intent = args.runtimeOptions?.workerIntent;
  if (!intent) {
    return null;
  }
  const resolution = resolveWorkerProfile({
    providerId: "codex",
    primaryModel: args.runtimeOptions?.model ?? "",
    intent,
  });
  return resolution.status === "ready" ? resolution.profile : null;
}

/**
 * Config overrides that pin the Codex worker.
 *
 * Verified against codex-cli 0.145.0's `AgentsToml`. `default_subagent_model`
 * is the documented way to pin a spawned agent's model — `spawn_agent`'s own
 * tool description states that spawned agents inherit the preferred default
 * unless an explicit override is given, and the App Server exposes no way to
 * give that override.
 */
export function buildCodexWorkerConfigOverrides(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
}): Record<string, string | boolean | number> {
  const profile = resolveCodexWorkerProfile(args);
  if (!profile) {
    return {};
  }
  return {
    "agents.default_subagent_model": profile.resolvedWorkerModel,
    ...(profile.resolvedWorkerEffort
      ? {
          "agents.default_subagent_reasoning_effort":
            profile.resolvedWorkerEffort,
        }
      : {}),
    // MVP ceiling. One foreground worker keeps Stop coherent: there is exactly
    // one child to cancel before the parent is considered stopped.
    // Codex counts the primary thread in this limit.
    "agents.max_concurrent_threads_per_session": profile.maxConcurrency + 1,
    // Depth 1 stops a worker from spawning its own workers, which would escape
    // the concurrency cap and make attribution meaningless.
    "agents.max_depth": 1,
  };
}

export function buildCodexDeveloperInstructions(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
  /** See `buildCodexConfigOverrides`: a secondary read-only run never delegates. */
  secondaryReadOnly?: boolean;
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
  parts.push(CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS);
  const workerProfile = args.secondaryReadOnly
    ? null
    : resolveCodexWorkerProfile(args);
  if (workerProfile) {
    parts.push(buildWorkerPrimaryInstructions(workerProfile));
    // Codex cannot enforce a per-worker tool allowlist, so the preset's brief
    // has to travel as prose the primary passes on.
    parts.push(
      [
        "### Worker brief",
        "",
        `When you delegate, hand the worker this contract verbatim as part of its task:`,
        "",
        workerProfile.instructions,
      ].join("\n"),
    );
  }
  const combined = parts.join("\n\n").trim();
  return combined.length > 0 ? combined : undefined;
}

export function buildCodexInstructionProfileKey(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
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
