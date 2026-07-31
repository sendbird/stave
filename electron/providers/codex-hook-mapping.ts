import type { BridgeEvent } from "./types";

export function mapCodexHookNotificationToBridgeEvent(
  params: Record<string, unknown>,
): Extract<BridgeEvent, { type: "hook_activity" }> | null {
  const run =
    params.run && typeof params.run === "object"
      ? (params.run as Record<string, unknown>)
      : null;
  const hookId = typeof run?.id === "string" ? run.id : "";
  if (!hookId) {
    return null;
  }
  const hookEvent =
    typeof run?.eventName === "string" ? run.eventName : "unknown";
  const handlerType =
    typeof run?.handlerType === "string" ? run.handlerType : "hook";
  const sourcePath = typeof run?.sourcePath === "string" ? run.sourcePath : "";
  const rawStatus = typeof run?.status === "string" ? run.status : "running";
  const status: Extract<BridgeEvent, { type: "hook_activity" }>["status"] =
    rawStatus === "completed"
      ? "completed"
      : rawStatus === "failed"
        ? "failed"
        : rawStatus === "blocked"
          ? "blocked"
          : rawStatus === "stopped"
            ? "cancelled"
            : "running";
  return {
    type: "hook_activity",
    hookId,
    hookName: sourcePath ? `${handlerType}: ${sourcePath}` : handlerType,
    hookEvent,
    status,
  };
}
