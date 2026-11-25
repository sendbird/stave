import type { ProviderId } from "@/lib/providers/provider.types";
import type { AgentStep, AgentStepStatus } from "./agent-progress.types";
import type { AgentHistoryItem } from "./history-items";
import {
  isSubagentToolName,
  readSpawnedAgentId,
  subagentStep,
  textStep,
  thinkingStep,
  toolStep,
} from "./step-builders";

export interface AgentStepsResult {
  /** The instruction the agent started from. */
  ask?: string;
  steps: AgentStep[];
  /** Its final answer, once it settled. */
  result?: string;
}

/**
 * Merges pages read at different times: a later read of the same item
 * replaces the earlier one in place, so a call that finished keeps its row.
 */
export function mergeHistoryItems(...pages: readonly (readonly AgentHistoryItem[])[]): AgentHistoryItem[] {
  const byId = new Map<string, AgentHistoryItem>();
  for (const page of pages) for (const item of page) byId.set(item.id, item);
  return [...byId.values()];
}

/**
 * A saved subagent transcript (Claude) or thread (Codex) as progress steps.
 * The first message is the ask; once the agent settled, its last words are
 * the answer. A call without a result is still running while the agent is
 * live, and simply done once it is not.
 */
export function stepsFromHistoryItems(
  items: readonly AgentHistoryItem[],
  options: { live: boolean; cwd?: string; providerId?: ProviderId },
): AgentStepsResult {
  const results = new Map<string, AgentHistoryItem>();
  for (const item of items) {
    if (item.kind === "tool_result" && item.toolUseId) results.set(item.toolUseId, item);
  }
  let ask: string | undefined;
  const steps: AgentStep[] = [];
  for (const item of items) {
    switch (item.kind) {
      case "user":
        if (ask === undefined && steps.length === 0) {
          ask = item.text ?? "";
        } else if (item.text?.trim()) {
          steps.push(textStep({ id: `history:${item.id}`, kind: "user", text: item.text }));
        }
        break;
      case "text":
        if (item.text?.trim()) steps.push(textStep({ id: `history:${item.id}`, kind: "text", text: item.text }));
        break;
      case "thinking":
        if (item.text?.trim()) steps.push(thinkingStep({ id: `history:${item.id}`, text: item.text, running: false }));
        break;
      case "tool": {
        const result = item.toolUseId ? results.get(item.toolUseId) : undefined;
        const failed = item.isError || result?.isError;
        const status: AgentStepStatus = failed
          ? "error"
          : item.status ?? (result ? "done" : options.live ? "running" : "done");
        const output = result?.output ?? item.output;
        const base = {
          id: `history:${item.id}`,
          toolName: item.toolName ?? "tool",
          input: item.input ?? "",
          ...(output !== undefined ? { output } : {}),
          status,
          ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
          ...(item.truncated || result?.truncated ? { truncated: true } : {}),
          cwd: options.cwd,
        };
        steps.push(isSubagentToolName(base.toolName)
          ? subagentStep({
              ...base,
              ...(item.toolUseId ? { toolUseId: item.toolUseId } : {}),
              ...(options.providerId ? { providerId: options.providerId } : {}),
              ...((item.childAgentIds?.[0] ?? readSpawnedAgentId(output))
                ? { agentId: item.childAgentIds?.[0] ?? readSpawnedAgentId(output) }
                : {}),
            })
          : toolStep(base));
        break;
      }
      case "tool_result":
        break;
    }
  }
  // A settled agent's last words are its answer, not one more step.
  const last = steps.at(-1);
  if (!options.live && last?.kind === "text") {
    steps.pop();
    return { ...(ask !== undefined ? { ask } : {}), steps, result: last.text ?? "" };
  }
  return { ...(ask !== undefined ? { ask } : {}), steps };
}
