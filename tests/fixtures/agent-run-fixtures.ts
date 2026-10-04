import {
  createAgentRun,
  listExternalEffectStages,
  replaceStageRecord,
  type AgentRunAggregate,
  type AgentRunChange,
  type AgentRunConsent,
  type AgentRunStageRecord,
} from "../../src/lib/agent-runs/domain";
import type { AgentRunObservation, ObservedTurn } from "../../src/lib/agent-runs/policy";
import type { Workflow } from "../../src/lib/workflows/schema";
import {
  createWorkflowFromStarter,
  findWorkflowStarter,
} from "../../src/dev/fixtures/legacy-workflow-starters";

export const AGENT_RUN_NOW = new Date("2026-09-26T10:00:00.000Z");

export function starterWorkflow(id: string): Workflow {
  return createWorkflowFromStarter(findWorkflowStarter(id)!, {
    now: AGENT_RUN_NOW,
    id: `workflow_${id.replaceAll("-", "_")}`,
  });
}

/** An agent run on the Request → PR starter with every external effect authorized. */
export function agentRunFixture(
  overrides: {
    workflow?: Workflow;
    consent?: Partial<AgentRunConsent>;
    maxTurns?: number;
    expiresAt?: string | null;
    id?: string;
    leadTaskId?: string;
  } = {},
): AgentRunAggregate {
  const workflow = overrides.workflow ?? starterWorkflow("request-to-pr");
  const change = createAgentRun({
    id: overrides.id ?? "agent-run-1",
    input: {
      workspaceId: "ws-1",
      leadTaskId: overrides.leadTaskId ?? "task-1",
      workflow,
      assignment: "Add CSV export to the billing page.",
      consent: {
        checkIns: workflow.checkIns,
        permissionMode: "guided",
        authorizedEffectStageIds: listExternalEffectStages(workflow).map((stage) => stage.id),
        ...overrides.consent,
      },
      maxTurns: overrides.maxTurns,
      expiresAt: overrides.expiresAt ?? null,
    },
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    now: AGENT_RUN_NOW,
  });
  return { agentRun: change.agentRun, stages: change.upserts };
}

export function applyChange(aggregate: AgentRunAggregate, change: AgentRunChange): AgentRunAggregate {
  let stages = aggregate.stages;
  for (const record of change.upserts) stages = replaceStageRecord(stages, record);
  return { agentRun: change.agentRun, stages };
}

export function patchCurrent(
  aggregate: AgentRunAggregate,
  patch: Partial<AgentRunStageRecord>,
): AgentRunAggregate {
  const stageId = aggregate.agentRun.workflow.stages[aggregate.agentRun.currentStageIndex]!.id;
  const record = [...aggregate.stages]
    .filter((candidate) => candidate.stageId === stageId)
    .sort((a, b) => b.attempt - a.attempt)[0]!;
  return { ...aggregate, stages: replaceStageRecord(aggregate.stages, { ...record, ...patch }) };
}

export function turn(overrides: Partial<ObservedTurn> = {}): ObservedTurn {
  return {
    turnId: "turn-1",
    startedBy: "agentRun",
    startedAt: "2026-09-26T10:01:00.000Z",
    ...overrides,
  };
}

export function observe(
  overrides: Partial<Omit<AgentRunObservation, "leadTask">> & {
    leadTask?: Partial<AgentRunObservation["leadTask"]>;
  } = {},
): AgentRunObservation {
  const { leadTask, ...rest } = overrides;
  return {
    leadTask: {
      workspaceAvailable: true,
      taskExists: true,
      taskArchived: false,
      identity: { ok: true },
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      activeTurn: null,
      pendingApprovalCount: 0,
      pendingUserInputCount: 0,
      activeDelegatedTaskCount: 0,
      ...leadTask,
    },
    reportingAvailable: true,
    lastEndedTurn: null,
    userTurnIntent: null,
    actionOutcome: null,
    ...rest,
  };
}

export const COMPLETE_REPORT = {
  outcome: "complete" as const,
  summary: "Restated the request and wrote criteria.",
  decisions: [],
  evidence: [],
  artifacts: [],
  acceptanceCriteria: [{ text: "Export button exists", status: "unverified" as const }],
  reportedAt: "2026-09-26T10:02:00.000Z",
  turnId: "turn-1",
};

let eventSequence = 0;

/** An agent run event for view tests. */
export function agentRunEvent(
  kind: import("../../src/lib/agent-runs/domain").AgentRunEventKind,
  detail: Record<string, unknown>,
  overrides: { idempotencyKey?: string | null; createdAt?: string } = {},
): import("../../src/lib/agent-runs/domain").AgentRunEvent {
  eventSequence += 1;
  return {
    id: `event-${eventSequence}`,
    agentRunId: "agent-run-1",
    sequence: eventSequence,
    kind,
    idempotencyKey: overrides.idempotencyKey ?? null,
    detail,
    createdAt: overrides.createdAt ?? AGENT_RUN_NOW.toISOString(),
  };
}

/** An `AgentRunDetail` as the renderer receives it. */
export function agentRunDetail(
  aggregate: AgentRunAggregate,
  events: import("../../src/lib/agent-runs/domain").AgentRunEvent[] = [],
  report: import("../../src/lib/agent-runs/report").AgentRunReport | null = null,
): import("../../src/lib/agent-runs/api").AgentRunDetail {
  return { agentRun: aggregate.agentRun, stages: aggregate.stages, events, report };
}
