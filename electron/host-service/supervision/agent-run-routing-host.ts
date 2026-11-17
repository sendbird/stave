import type { AgentConfig } from "../../../src/lib/agents/schema";
import type { AgentRunStore } from "../../persistence/agent-run-store";
import type { AgentAssignmentStore } from "../../persistence/agent-assignment-store";
import type { TarsStore } from "../../persistence/tars-store";
import type { AgentRouteSettings } from "../../../src/lib/routing/agent-run-route";
import type { PromptDraftRuntimeOverrides } from "../../../src/types/chat";
import { exclusiveGatewayModels } from "../../../src/lib/providers/api-connection-routing";
import { currentProviderAccountId } from "../../provider-accounts/runtime-scope";
import { assertTarsAssignment, assertTarsRun } from "../tars-ownership";
import { createConstrainedHostRouter } from "./constrained-route-host";
import { freezeAdaptivePolicy } from "./adaptive-policy";
import type { AgentRunRuntimeDependencies } from "./agent-run-runtime";

type RoutePorts = Omit<Parameters<typeof createConstrainedHostRouter>[0], "parentPolicy">;

/** The helper admission router and the run router read the same durable parent policy. */
export function createHostConstrainedRouter(args: RoutePorts & { runs: Pick<AgentRunStore, "getActiveAgentRunForTask" | "resourceConfig"> }) {
  return createConstrainedHostRouter({ ...args, parentPolicy: (taskId) => {
    const run = args.runs.getActiveAgentRunForTask(taskId);
    return run ? args.runs.resourceConfig(run.id)?.policy : undefined;
  } });
}

/** Production resource admission, shared with the integration harness rather than reimplemented there. */
export function createHostResourceFreezer(args: {
  assignments: Pick<AgentAssignmentStore, "getByTaskId" | "getByRequestId">;
  tars: Pick<TarsStore, "get">;
  taskAgent: (taskId: string) => AgentConfig | null;
  draft: (workspaceId: string, taskId: string) => PromptDraftRuntimeOverrides | undefined;
  settings: () => AgentRouteSettings | null;
  profiles: RoutePorts["profiles"];
}): NonNullable<AgentRunRuntimeDependencies["freezeResources"]> {
  return ({ run, authority, routingIntent, accounts, admission }) => {
    const providerId = run.fingerprint.providerId;
    if (providerId !== "codex" && providerId !== "claude-code") throw new Error("Team limits require a supported provider.");
    let automatic: true | undefined;
    if (admission) {
      const row = args.tars.get(admission.tarsResponsibilityId);
      if (!row) throw new Error("The Tars admission is unavailable.");
      assertTarsRun(row, run);
      if (!assertTarsAssignment(row, args.assignments.getByTaskId(run.leadTaskId), args.assignments.getByRequestId(`tars-${row.id}`)))
        throw new Error("The Tars assignment is unavailable.");
      // Only the host's admitted Automatic execution overrides the live global toggle.
      // A pinned root leaves it absent so helpers retain live Auto effort selection.
      if (!row.model && routingIntent?.autoRouting === true) automatic = true;
    }
    return freezeAdaptivePolicy({ providerId, model: run.fingerprint.model,
      agent: args.taskAgent(run.leadTaskId), draft: authority ? null : routingIntent ?? args.draft(run.workspaceId, run.leadTaskId),
      autoRouting: automatic, settings: args.settings(), maxTurns: run.maxTurns,
      exclusiveModels: exclusiveGatewayModels(args.profiles(), accounts ?? {
        claudeAccountProfileId: currentProviderAccountId("claude-code"), codexAccountProfileId: currentProviderAccountId("codex"),
      })[providerId], delegated: Boolean(authority), effort: authority?.effort,
      modelPinned: authority?.modelPinned, effortPinned: authority?.effortPinned, ...(accounts ? { accounts } : {}),
    });
  };
}
