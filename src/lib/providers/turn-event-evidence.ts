import type { NormalizedProviderEvent } from "./provider.types";

/**
 * Work that shows the turn kept going after an earlier provider error.
 * Usage and other metadata do not count: they arrive on failed turns too.
 */
export function isProviderTurnContinuationEvent(event: NormalizedProviderEvent) {
  if (event.type === "tool") {
    return event.state !== "output-error";
  }
  if (event.type === "tool_result") {
    return !event.isError;
  }
  if (event.type === "hook_activity") {
    return event.status === "running" || event.status === "completed";
  }
  if (event.type === "text" || event.type === "thinking") return event.text.trim().length > 0;
  return (
    event.type === "tool_progress" ||
    event.type === "subagent_progress" ||
    event.type === "diff" ||
    event.type === "approval" ||
    event.type === "user_input"
  );
}
