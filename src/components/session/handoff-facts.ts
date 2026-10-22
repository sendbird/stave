import { i18n } from "@/i18n";
import { listTaskTurnHistory, readTaskTurnRecord } from "@/lib/db/turn-history.db";
import { formatToolDisplayName } from "@/lib/providers/subagent-identity";
import { describeToolOperationLabel } from "@/lib/providers/tool-activity";
import {
  buildHandoffSuggestions,
  type HandoffDraft,
  type HandoffFacts,
} from "@/lib/task-context/handoff-record";
import { isApprovalYouAnswered } from "@/lib/task-context/return-summary";
import type { ChatMessage } from "@/types/chat";

/**
 * Approvals the user granted in this task's loaded conversation, oldest first;
 * not those a Stave rule or the provider's permission mode decided.
 */
export function collectGrantedApprovals(messages: readonly ChatMessage[]): HandoffFacts["approvals"] {
  const approvals: Array<{ tool: string; description: string }> = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "approval" || part.state !== "approval-responded" || !isApprovalYouAnswered(part)) continue;
      const tool = describeToolOperationLabel(part.toolName) ?? formatToolDisplayName(part.toolName) ?? part.toolName;
      approvals.push({ tool, description: part.description.trim().split("\n")[0] ?? "" });
    }
  }
  return approvals;
}

/** The checks Stave ran after the task's latest turn that ran any, from its turn record. */
async function readLatestChecks(args: { workspaceId: string; taskId: string }): Promise<HandoffFacts["checks"]> {
  const page = await listTaskTurnHistory({ workspaceId: args.workspaceId, taskId: args.taskId, limit: 50 });
  const turn = page.turns.find((entry) => entry.digest?.checks);
  if (!turn) return null;
  const record = await readTaskTurnRecord({ workspaceId: args.workspaceId, taskId: args.taskId, turnId: turn.id });
  const entries = record?.digest?.entries ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === "checks") {
      return { status: entry.status, passed: entry.executed, total: entry.total, failures: entry.failures };
    }
  }
  return null;
}

/**
 * What "Fill from this task" offers: Stave's latest checks, the approvals the
 * user granted, and the task's linked plans, worded for the record in the
 * user's language. The user reads them in the editor before anything is saved.
 */
export async function collectHandoffSuggestions(args: {
  workspaceId: string;
  taskId: string;
  messages: readonly ChatMessage[];
  planFilePaths: readonly string[];
}): Promise<Partial<HandoffDraft>> {
  const checks = await readLatestChecks(args).catch(() => null);
  return buildHandoffSuggestions(
    { checks, approvals: collectGrantedApprovals(args.messages), planFilePaths: args.planFilePaths },
    {
      checksPassed: (passed, total) => i18n.t("session:handoff.facts.checksPassed", { passed, count: total }),
      checksFailed: (failures) => i18n.t("session:handoff.facts.checksFailed", { failures }),
      approval: (tool, description) =>
        description
          ? i18n.t("session:handoff.facts.approval", { tool, description })
          : i18n.t("session:handoff.facts.approvalTool", { tool }),
      plan: (path) => i18n.t("session:handoff.facts.plan", { path }),
    },
  );
}
