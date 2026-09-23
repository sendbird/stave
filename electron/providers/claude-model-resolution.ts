import type { BridgeEvent } from "./types";
import { getClaudeModelVersionGuidance } from "../../src/lib/providers/claude-model-requirements";

function modelId(value: unknown): string | undefined {
  return typeof value === "string" && /^claude-[a-z0-9.-]+(?:\[1m\])?$/.test(value)
    ? value : undefined;
}
function baseModel(model: string) {
  return model.replace(/\[1m\]$/, "").replace(/-\d{8}$/, "");
}

/** Observe actual assistant models too: some CLI versions omit fallback system messages. */
export function createClaudeModelResolutionTracker(requestedModel?: string) {
  let currentModel = modelId(requestedModel);
  return (message: unknown): BridgeEvent[] => {
    if (!message || typeof message !== "object") return [];
    const record = message as Record<string, unknown>;
    const fallback = record.type === "system" && record.subtype === "model_fallback";
    const assistant = record.type === "assistant" && record.parent_tool_use_id == null && !record.error;
    const body = record.message as { model?: unknown } | undefined;
    const actual = fallback ? modelId(record.fallbackModel) : assistant ? modelId(body?.model) : undefined;
    if (!actual) return [];
    const previous = currentModel ?? (fallback ? modelId(record.originalModel) : undefined);
    if (previous && baseModel(previous) === baseModel(actual)) return [];
    currentModel = actual;
    const events: BridgeEvent[] = [{ type: "model_resolved", resolvedProviderId: "claude-code", resolvedModel: actual }];
    if (!previous) return events;
    const content = typeof record.content === "string" ? record.content : "";
    const versionError = content.includes("claude_code_version_too_old");
    const installed = content.match(/Claude Code (\d+\.\d+\.\d+) does not support/);
    const minimum = content.match(/version (\d+\.\d+\.\d+) or newer is required/);
    const reason = versionError
      ? `The Claude Code version${installed ? ` (${installed[1]})` : ""} does not support the requested model.`
      : fallback ? "Claude reported a provider error and switched models." : "Claude returned a different model; the runtime did not report a reason.";
    const guidance = versionError && minimum
      ? `Requires Claude Code ${minimum[1]} or newer. Run \`claude update\`, or update the Claude desktop app, then retry.`
      : getClaudeModelVersionGuidance(previous);
    events.push({ type: "system", content: `Model changed: ${previous} → ${actual}.\n${reason}${guidance ? ` ${guidance}` : ""}` });
    return events;
  };
}
