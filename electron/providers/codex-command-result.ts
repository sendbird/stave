import type { BridgeEvent } from "./types";

/** Preserve structured process status; output text cannot establish an exit code. */
export function buildCodexCommandResult(item: { id?: string; status?: string; exitCode?: number | null }, output: string): Extract<BridgeEvent, { type: "tool_result" }> {
  return {
    type: "tool_result", tool_use_id: item.id ?? "", output,
    ...(item.exitCode === null || (typeof item.exitCode === "number" && Number.isInteger(item.exitCode)) ? { exitCode: item.exitCode } : {}),
    ...(item.status === "failed" || item.status === "declined" || (typeof item.exitCode === "number" && item.exitCode !== 0) ? { isError: true } : {}),
  };
}
