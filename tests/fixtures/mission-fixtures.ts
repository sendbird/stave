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
import type { Playbook } from "../../src/lib/playbooks/schema";
import {
  createPlaybookFromStarter,
  findPlaybookStarter,
} from "../../src/lib/playbooks/starters";

export const MISSION_NOW = new Date("2026-09-26T10:00:00.000Z");

export function starterPlaybook(id: string): Playbook {
  return createPlaybookFromStarter(findPlaybookStarter(id)!, {
    now: MISSION_NOW,
    id: `playbook_${id.replaceAll("-", "_")}`,
  });
}

/** A mission on the Request → PR starter with every external effect authorized. */
export function missionFixture(
  overrides: {
    playbook?: Playbook;
    consent?: Partial<MissionConsent>;
    maxTurns?: number;
    expiresAt?: string | null;
    id?: string;
    leadTaskId?: string;
  } = {},
): MissionAggregate {
  const playbook = overrides.playbook ?? starterPlaybook("request-to-pr");
  const change = createMission({
    id: overrides.id ?? "mission-1",
    input: {
      workspaceId: "ws-1",
      leadTaskId: overrides.leadTaskId ?? "task-1",
      playbook,
      assignment: "Add CSV export to the billing page.",
      consent: {
        checkIns: playbook.checkIns,
        permissionMode: "guided",
        authorizedEffectStageIds: listExternalEffectStages(playbook).map((stage) => stage.id),
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
  const stageId = aggregate.mission.playbook.stages[aggregate.mission.currentStageIndex]!.id;
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
