import type { BridgeEvent } from "./types";

/** Preserve structured process status; output text cannot establish an exit code. */
export function buildCodexCommandResult(item: { id?: string; status?: string; exitCode?: number | null }, output: string): Extract<BridgeEvent, { type: "tool_result" }> {
  return {
    type: "tool_result", tool_use_id: item.id ?? "", output,
    ...(item.exitCode === null || (typeof item.exitCode === "number" && Number.isInteger(item.exitCode)) ? { exitCode: item.exitCode } : {}),
    ...(item.status === "failed" || item.status === "declined" || (typeof item.exitCode === "number" && item.exitCode !== 0) ? { isError: true } : {}),
  };
}

/** Keep file evidence in the existing command arguments for transcript replay. */
export function buildCodexCommandInput(item: {
  command?: string;
  commandActions?: unknown;
  cwd?: string;
}): string {
  const command = typeof item.command === "string" ? item.command : "";
  const actions = item.commandActions;
  // Combined commands share one stdout stream with no per-action boundaries.
  if (!Array.isArray(actions) || actions.length !== 1) return command;
  const action = actions[0] as { type?: unknown; path?: unknown } | null;
  const path = typeof action?.path === "string" ? action.path.trim() : undefined;
  if (action?.type === "read" && path) {
    return JSON.stringify({ command, fileAction: { kind: "read", path, cwd: item.cwd } });
  }
  if (action?.type === "search" || action?.type === "listFiles") {
    const kind = action.type === "search" ? "grep" : "glob";
    return JSON.stringify({ command, fileAction: { kind, cwd: item.cwd, path } });
  }
  return command;
}
