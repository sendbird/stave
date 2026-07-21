import { createHash } from "node:crypto";
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
  "## Stave browser tooling",
  "- Inspect and interact with web pages through the Stave Lens MCP tools (`stave_lens_*`, e.g. `stave_lens_snapshot`, `stave_lens_screenshot`, `stave_lens_navigate`) on the `stave-local` MCP server whenever they are available.",
  "- The ChatGPT desktop in-app browser plugin (`control-in-app-browser`), Computer Use, and `node_repl` browser clients are not connected to this Stave workspace. Never use them for browser inspection or automation here, and never treat their skills as required reading.",
].join("\n");

export function buildCodexPluginConfigOverrides() {
  const config: Record<string, boolean> = {};
  for (const pluginId of CODEX_DISABLED_BUNDLED_PLUGIN_IDS) {
    config[`plugins."${pluginId}".enabled`] = false;
  }
  return config;
}

export function buildCodexDeveloperInstructions(args: {
  runtimeOptions?: StreamTurnArgs["runtimeOptions"];
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
  return createHash("sha1").update(developerInstructions).digest("hex").slice(0, 12);
}
