import { i18n } from "../../../src/i18n/runtime";
import { freezeWorkspaceChecks, withWorkspaceCheck, workspaceRevisionProblem } from "../../../src/lib/agent-runs/workspace-check";
import { WorkflowSchema, type Workflow } from "../../../src/lib/workflows/schema";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { FrozenWorkspaceScript, WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";

/** Invalid or unreadable default checks must never create an unreadable Run row. */
export async function admitWorkspaceCheck(args: {
  workflow: Workflow; agent: AgentConfig | null; scripts: FrozenWorkspaceScript[];
  readRevision: () => Promise<WorkspaceRevision>;
  wait?: (ms: number) => Promise<void>;
}): Promise<{ workflow: Workflow; notice?: string }> {
  const bound = freezeWorkspaceChecks(args.workflow, args.scripts);
  const candidate = withWorkspaceCheck(bound, args.agent, args.scripts);
  if (candidate === args.workflow) return { workflow: args.workflow };
  const parsed = WorkflowSchema.safeParse(candidate);
  if (!parsed.success) return { workflow: WorkflowSchema.safeParse(bound).success ? bound : args.workflow, notice: i18n.t("agentRuns:workspaceCheck.skippedInvalid", { reason: parsed.error.issues[0]?.message }).slice(0, 500) };
  if (candidate === bound) return { workflow: parsed.data };
  const read = () => args.readRevision().catch(() => ({ status: "unknown" as const, reason: "unavailable" as const }));
  let revision = await read();
  if (revision.status === "unknown" && revision.reason !== "limit") {
    await (args.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(100);
    revision = await read();
  }
  return revision.status === "unknown" && revision.reason === "limit"
    ? { workflow: bound, notice: i18n.t("agentRuns:workspaceCheck.skippedRevision", { reason: workspaceRevisionProblem(revision, "workspace") }).slice(0, 500) }
    : { workflow: parsed.data };
}
