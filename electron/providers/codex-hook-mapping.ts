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
  // `hookName` carries the handler's kind and `hookSource` the file it came
  // from, rather than one pre-joined `command: /abs/path` string. The activity
  // shelf titles rows from the normalized hook event and renders these as
  // provider-specific detail, so it needs them apart. `run.command` and
  // `run.entries` stay omitted: hook commands and output must not reach the
  // renderer.
  return {
    type: "hook_activity",
    hookId,
    hookName: handlerType,
    hookEvent,
    ...(sourcePath ? { hookSource: sourcePath } : {}),
    status,
  };
}
