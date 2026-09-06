import type { BridgeEvent } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** Pair the last primary API request with its model's reported context window.
 * SDK result.usage/modelUsage counters accumulate across tool loops and are billing,
 * not context occupancy. Child assistant messages must not replace the primary sample.
 */
export function createClaudeContextUsageTracker() {
  let sample: { model: string; usedTokens: number } | undefined;
  return (value: unknown): BridgeEvent | null => {
    const message = record(value);
    if (message.type === "system" && message.subtype === "compact_boundary")
      sample = undefined;
    if (message.type === "assistant" && message.parent_tool_use_id === null) {
      const assistant = record(message.message);
      const usage = record(assistant.usage);
      const input = count(usage.input_tokens);
      if (typeof assistant.model === "string" && input !== undefined) {
        sample = {
          model: assistant.model,
          usedTokens:
            input +
            (count(usage.cache_read_input_tokens) ?? 0) +
            (count(usage.cache_creation_input_tokens) ?? 0) +
            (count(usage.output_tokens) ?? 0),
        };
      }
    }
    if (message.type !== "result" || !sample) return null;
    const model = record(record(message.modelUsage)[sample.model]);
    const sizeTokens = count(model.contextWindow);
    return sizeTokens
      ? { type: "context_usage", usedTokens: sample.usedTokens, sizeTokens }
      : null;
  };
}
