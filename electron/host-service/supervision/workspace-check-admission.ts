import { i18n } from "../../../src/i18n/runtime";
import { freezeWorkspaceChecks, withDefaultWorkspaceCheck } from "../../../src/lib/agent-runs/workspace-check";
import { WorkflowSchema, type Workflow } from "../../../src/lib/workflows/schema";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { FrozenWorkspaceScript } from "../../../src/lib/agent-runs/verification-contract";

/**
 * Rebind explicit checks before adding a default; never persist client
 * bindings. Admission reads no workspace revision: a revision that cannot be
 * read is reported when the check runs and when the stage reports, so the
 * gate never silently disappears.
 */
export function admitWorkspaceCheck(args: {
  workflow: Workflow; agent: AgentConfig | null; scripts: FrozenWorkspaceScript[];
}): { workflow: Workflow; notice?: string } {
  const bound = freezeWorkspaceChecks(args.workflow, args.scripts);
  WorkflowSchema.parse(bound);
  const candidate = withDefaultWorkspaceCheck(bound, args.agent, args.scripts);
  if (candidate === args.workflow) return { workflow: args.workflow };
  const parsed = WorkflowSchema.safeParse(candidate);
  if (!parsed.success) return { workflow: bound, notice: i18n.t("agentRuns:workspaceCheck.skippedInvalid", { reason: parsed.error.issues[0]?.message }).slice(0, 500) };
  return { workflow: parsed.data };
}
