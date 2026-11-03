import { DelegatedTaskSummarySchema, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { DelegatedTaskBlockedKind } from "@/lib/runs/delegated-task-view";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import { parseToolInput } from "@/lib/providers/subagent-identity";
import { fromDelegatedTask, type DelegationExchange } from "./exchange";
import { selectTaskSubagents, type SubagentMessage } from "./subagent-summary";

/** Read only an accepted delegation receipt, including the two MCP envelopes. */
function readChild(value: unknown, depth = 0): DelegatedTaskSummary | null {
  if (depth > 5 || !value) return null;
  if (typeof value === "string") {
    try { return readChild(JSON.parse(value), depth + 1); } catch { return null; }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const child = readChild(item, depth + 1);
      if (child) return child;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const delegation = record.delegation as { accepted?: unknown; duplicate?: unknown; child?: unknown } | undefined;
  if (delegation?.accepted === true && delegation.duplicate !== true) {
    const parsed = DelegatedTaskSummarySchema.safeParse(delegation.child);
    if (parsed.success) return parsed.data;
  }
  for (const key of ["structuredContent", "content", "text", "result"]) {
    const child = readChild(record[key], depth + 1);
    if (child) return child;
  }
  return null;
}

function sameExecution(recorded: DelegatedTaskSummary, live: DelegatedTaskSummary) {
  return recorded.runId === live.runId && recorded.stepId === live.stepId &&
    recorded.parentTaskId === live.parentTaskId && recorded.delegationKey === live.delegationKey &&
    recorded.delegatedTaskId === live.delegatedTaskId && recorded.attempt === live.attempt &&
    recorded.delegatedTurnId === live.delegatedTurnId;
}

/** A message owns only the children its tool calls actually launched. */
export function selectMessageSubagents(args: {
  message: SubagentMessage;
  taskId: string;
  children?: readonly DelegatedTaskSummary[];
  blocked?: Readonly<Record<string, DelegatedTaskBlockedKind>>;
  graph?: WorkGraph | null;
}): DelegationExchange[] {
  const { message } = args;
  if (message.role === "user") return [];
  const tools = message.parts.filter((part) => part.type === "tool_use");
  const toolIds = new Set(tools.map((part) => part.toolUseId).filter(Boolean));
  const graph = args.graph?.turnId === message.turnId ? args.graph : null;
  const rows = selectTaskSubagents({ messages: [message], workGraph: graph, includeSubagents: true })
    .filter((row) => row.ref.toolUseId && toolIds.has(row.ref.toolUseId));
  const seen = new Set<string>();
  for (const part of tools) {
    if (!part.toolName.endsWith("stave_delegate_task")) continue;
    const recorded = readChild(part.output);
    if (!recorded || recorded.parentTaskId !== args.taskId || seen.has(recorded.delegationKey)) continue;
    seen.add(recorded.delegationKey);
    const live = args.children?.find((child) => sameExecution(recorded, child));
    const input = parseToolInput(part.input);
    const row = fromDelegatedTask(live ?? recorded, {
      prompt: typeof input?.prompt === "string" ? input.prompt : undefined,
      blockedKind: live ? args.blocked?.[recorded.delegationKey] : recorded.waitsForPerson ? "agent-run" : undefined,
    });
    rows.push({ ...row,
      // An admission snapshot is not evidence that the child is still running.
      ...(!live && ["running", "queued", "waiting", "needs_user"].includes(row.outcome.status) ? {
        outcome: { ...row.outcome, status: "unresolved" as const },
        timing: { ...row.timing, observed: false as const },
      } : {}),
      title: typeof input?.title === "string" ? input.title : row.title,
      ref: { ...row.ref, toolUseId: part.toolUseId, turnId: message.turnId },
    });
  }
  return rows;
}
