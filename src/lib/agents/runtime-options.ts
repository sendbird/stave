import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import type { CompiledPrimary } from "./compile";

/**
 * The runtime options a task running as an Agent adds to its usual ones.
 *
 * - `agentInstructions` carries the Agent's instructions to the Claude and
 *   Codex instruction channels.
 * - A Claude denylist is merged into `claudeDisallowedTools`, never replacing
 *   what the user or Stave already disallowed. A limit can only narrow.
 * - Cursor and Kiro get nothing here: intake prepends `promptPreamble` to the
 *   first message instead.
 */
export function agentRuntimeOptions(
  compiled: CompiledPrimary,
  base: Pick<ProviderRuntimeOptions, "claudeDisallowedTools"> = {},
): Pick<ProviderRuntimeOptions, "agentInstructions" | "claudeDisallowedTools"> {
  if (compiled.promptPreamble) return {};
  const disallowed = compiled.disallowedTools?.length
    ? [...new Set([...(base.claudeDisallowedTools ?? []), ...compiled.disallowedTools])]
    : undefined;
  return {
    agentInstructions: compiled.instructions,
    ...(disallowed ? { claudeDisallowedTools: disallowed } : {}),
  };
}
