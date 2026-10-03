import {
  createMission,
  listExternalEffectStages,
  replaceStageRecord,
  type MissionAggregate,
  type MissionChange,
  type MissionConsent,
  type MissionStageRecord,
} from "../../src/lib/missions/domain";
import type { MissionObservation, ObservedTurn } from "../../src/lib/missions/policy";
import type { Workflow } from "../../src/lib/workflows/schema";
import {
  createWorkflowFromStarter,
  findWorkflowStarter,
} from "../../src/dev/fixtures/legacy-workflow-starters";

export const MISSION_NOW = new Date("2026-09-26T10:00:00.000Z");

export function starterWorkflow(id: string): Workflow {
  return createWorkflowFromStarter(findWorkflowStarter(id)!, {
    now: MISSION_NOW,
    id: `workflow_${id.replaceAll("-", "_")}`,
  });
}

/** A mission on the Request → PR starter with every external effect authorized. */
export function missionFixture(
  overrides: {
    workflow?: Workflow;
    consent?: Partial<MissionConsent>;
    maxTurns?: number;
    expiresAt?: string | null;
    id?: string;
    leadTaskId?: string;
  } = {},
): MissionAggregate {
  const workflow = overrides.workflow ?? starterWorkflow("request-to-pr");
  const change = createMission({
    id: overrides.id ?? "mission-1",
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
    now: MISSION_NOW,
  });
  return { mission: change.mission, stages: change.upserts };
}

export function applyChange(aggregate: MissionAggregate, change: MissionChange): MissionAggregate {
  let stages = aggregate.stages;
  for (const record of change.upserts) stages = replaceStageRecord(stages, record);
  return { mission: change.mission, stages };
}

export function patchCurrent(
  aggregate: MissionAggregate,
  patch: Partial<MissionStageRecord>,
): MissionAggregate {
  const stageId = aggregate.mission.workflow.stages[aggregate.mission.currentStageIndex]!.id;
  const record = [...aggregate.stages]
    .filter((candidate) => candidate.stageId === stageId)
    .sort((a, b) => b.attempt - a.attempt)[0]!;
  return { ...aggregate, stages: replaceStageRecord(aggregate.stages, { ...record, ...patch }) };
}

export function turn(overrides: Partial<ObservedTurn> = {}): ObservedTurn {
  return {
    turnId: "turn-1",
    startedBy: "mission",
    startedAt: "2026-09-26T10:01:00.000Z",
    ...overrides,
  };
}

export function observe(
  overrides: Partial<Omit<MissionObservation, "leadTask">> & {
    leadTask?: Partial<MissionObservation["leadTask"]>;
  } = {},
): MissionObservation {
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

/** A mission event for view tests. */
export function missionEvent(
  kind: import("../../src/lib/missions/domain").MissionEventKind,
  detail: Record<string, unknown>,
  overrides: { idempotencyKey?: string | null; createdAt?: string } = {},
): import("../../src/lib/missions/domain").MissionEvent {
  eventSequence += 1;
  return {
    id: `event-${eventSequence}`,
    missionId: "mission-1",
    sequence: eventSequence,
    kind,
    idempotencyKey: overrides.idempotencyKey ?? null,
    detail,
    createdAt: overrides.createdAt ?? MISSION_NOW.toISOString(),
  };
}

/** A `MissionDetail` as the renderer receives it. */
export function missionDetail(
  aggregate: MissionAggregate,
  events: import("../../src/lib/missions/domain").MissionEvent[] = [],
  report: import("../../src/lib/missions/report").MissionReport | null = null,
): import("../../src/lib/missions/api").MissionDetail {
  return { mission: aggregate.mission, stages: aggregate.stages, events, report };
}
