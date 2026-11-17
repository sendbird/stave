import type { AgentRunDetail } from "../agent-runs/api";
import { isActiveAgentRunState, latestStageRecord } from "../agent-runs/domain";
import { projectAgentRunRoutes } from "../agent-runs/route-observation";
import { describeAgentIdentity } from "../delegation/format";
import { isTarsWorkRunning } from "./live-progress";
import type { TarsResponsibility } from "./types";

/** The current attempt's latest linked turn selection, never the run's initial fingerprint or a helper's model. */
export function describeTarsModelSelection(
  row: Pick<TarsResponsibility, "state" | "agentRunId">,
  detail: AgentRunDetail | null,
): string | null {
  if (!isTarsWorkRunning(row) || !detail || detail.agentRun.id !== row.agentRunId) return null;
  const run = detail.agentRun;
  if (!isActiveAgentRunState(run.state)) return null;
  const stage = run.workflow.stages[run.currentStageIndex];
  const record = stage && latestStageRecord(detail.stages, stage.id);
  if (!record || record.status !== "running") return null;
  const routes = detail.routing ?? projectAgentRunRoutes({ agentRunId: run.id, events: detail.events, stages: detail.stages });
  const route = routes.find((route) => route.stageId === stage.id && route.attempt === record.attempt && route.latestInAttempt);
  if (!route?.turnId || !route.selection || !["running", "unknown"].includes(route.turnOutcome)) return null;
  return describeAgentIdentity({
    providerId: route.selection.selected.providerId,
    model: route.selection.selected.model,
    effort: route.selection.requestedEffort,
  }).text;
}
