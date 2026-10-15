import { i18n } from "../../../src/i18n/runtime";
import { withWorkspaceCheck, workspaceRevisionProblem } from "../../../src/lib/agent-runs/workspace-check";
import { WorkflowSchema, type Workflow } from "../../../src/lib/workflows/schema";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { FrozenWorkspaceScript, WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";

/** Invalid or unreadable default checks must never create an unreadable Run row. */
export async function admitWorkspaceCheck(args: {
  workflow: Workflow; agent: AgentConfig | null; scripts: FrozenWorkspaceScript[];
  readRevision: () => Promise<WorkspaceRevision>;
}): Promise<{ workflow: Workflow; notice?: string }> {
  const candidate = withWorkspaceCheck(args.workflow, args.agent, args.scripts);
  if (candidate === args.workflow) return { workflow: args.workflow };
  const parsed = WorkflowSchema.safeParse(candidate);
  if (!parsed.success) return { workflow: args.workflow, notice: i18n.t("agentRuns:workspaceCheck.skippedInvalid", { reason: parsed.error.issues[0]?.message }).slice(0, 500) };
  const revision = await args.readRevision().catch(() => ({ status: "unknown" as const, reason: "unavailable" as const }));
  const reason = workspaceRevisionProblem(revision, "workspace");
  return reason ? { workflow: args.workflow, notice: i18n.t("agentRuns:workspaceCheck.skippedRevision", { reason }).slice(0, 500) } : { workflow: parsed.data };
}
