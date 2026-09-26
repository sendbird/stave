/**
 * What a mission tells the lead task's agent: the stage prompt, the reminder
 * after a turn that ended without a report, the retrieved-context part that
 * names the mission, and the read-only briefing `stave_get_mission` returns.
 *
 * Mission and stage identity never appear in any of these. The host resolves
 * them from the turn's mission grant, so a model cannot report for another
 * stage.
 *
 * Pure. Used by `electron/host-service/supervision/mission-runtime.ts`.
 */
import type { AutomationPermissionMode } from "@/lib/automations";
import {
  compileStagePrompt,
  type AcceptanceCriterion,
  type PriorStageSummary,
} from "@/lib/playbooks/stage-prompt";
import type {
  CanonicalRetrievedContextPart,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  currentStageRecord,
  latestStageRecord,
  playbookStageAt,
  type MissionAggregate,
  type StageStatus,
} from "./domain";
import { describeActionEvidence } from "./evidence";
import type { StageTurnReason } from "./policy";

export const MISSION_TOOL_NAMES = Object.freeze({
  get: "stave_get_mission",
  report: "stave_report_stage",
  block: "stave_block_stage",
});

export const MISSION_CONTEXT_SOURCE_ID = "stave:mission";

/** Why the supervisor started a turn: a stage turn or the one reminder. */
export type MissionTurnReason = StageTurnReason | "nudge";

const TURN_REASON_LINES: Record<MissionTurnReason, string> = {
  "stage-start": "This turn starts the stage.",
  "continue-after-user":
    "The user replied during this stage. Treat their latest message as guidance and continue the stage.",
  "reporting-restored":
    "Stave's local tools are reachable again, so this turn resumes the stage.",
  nudge: "The previous turn ended without a stage report.",
};

/** Summaries of the stages before the current one, in playbook order. */
export function collectPriorStageSummaries(
  aggregate: MissionAggregate,
): PriorStageSummary[] {
  const { mission, stages } = aggregate;
  const summaries: PriorStageSummary[] = [];
  for (let index = 0; index < mission.currentStageIndex; index += 1) {
    const stage = playbookStageAt(mission, index);
    const record = latestStageRecord(stages, stage.id);
    if (record?.status === "skipped") {
      summaries.push({ title: stage.title, summary: "Skipped by the user." });
      continue;
    }
    if (record?.status !== "completed") continue;
    if (record.facts?.action) {
      summaries.push({
        title: stage.title,
        summary: describeActionEvidence(record.facts.action).label,
      });
      continue;
    }
    if (record.report?.outcome === "complete") {
      summaries.push({ title: stage.title, summary: record.report.summary });
    }
  }
  return summaries;
}

/**
 * The acceptance criteria the current stage is judged against: the latest
 * ones an earlier stage reported. A later stage's statuses are not carried
 * back when "Ask for changes" reruns an earlier stage, because the change can
 * invalidate them.
 */
export function collectAcceptanceCriteria(
  aggregate: MissionAggregate,
): AcceptanceCriterion[] {
  const { mission, stages } = aggregate;
  let criteria: AcceptanceCriterion[] = [];
  for (let index = 0; index < mission.currentStageIndex; index += 1) {
    const record = latestStageRecord(stages, playbookStageAt(mission, index).id);
    if (record?.report?.outcome === "complete" && record.report.acceptanceCriteria?.length) {
      criteria = record.report.acceptanceCriteria;
    }
  }
  return criteria;
}

/** The prompt of a turn for the mission's current AI stage. */
export function compileMissionStagePrompt(aggregate: MissionAggregate): string {
  const record = currentStageRecord(aggregate);
  return compileStagePrompt({
    playbook: aggregate.mission.playbook,
    stageIndex: aggregate.mission.currentStageIndex,
    assignment: aggregate.mission.assignment,
    priorStages: collectPriorStageSummaries(aggregate),
    acceptanceCriteria: collectAcceptanceCriteria(aggregate),
    attempt: record.attempt,
    ...(record.feedback ? { feedback: record.feedback } : {}),
  });
}

/** The one reminder after a mission turn ended without a stage report. */
export function buildStageNudgePrompt(aggregate: MissionAggregate): string {
  const stage = playbookStageAt(aggregate.mission, aggregate.mission.currentStageIndex);
  return [
    `You ended the last turn without reporting the stage "${stage.title}".`,
    `If the stage is done, call \`${MISSION_TOOL_NAMES.report}\` now with a summary, the evidence you gathered, and the status of each acceptance criterion.`,
    `If you cannot finish it, call \`${MISSION_TOOL_NAMES.block}\` and name exactly what is missing.`,
    "Do not start later stages.",
  ].join("\n\n");
}

/**
 * Tells the agent a mission started this turn and why. Without it a mission
 * turn reads like the user typing, and the agent asks questions nobody is
 * present to answer.
 */
export function buildMissionTurnContextPart(args: {
  aggregate: MissionAggregate;
  reason: MissionTurnReason;
}): CanonicalRetrievedContextPart {
  const { mission } = args.aggregate;
  const stage = playbookStageAt(mission, mission.currentStageIndex);
  const record = currentStageRecord(args.aggregate);
  return {
    type: "retrieved_context",
    sourceId: MISSION_CONTEXT_SOURCE_ID,
    title: "Mission Stage",
    content: [
      "A Stave mission started this turn. The user did not type this message and may not be watching.",
      `Playbook: ${mission.playbook.name}. Stage ${mission.currentStageIndex + 1} of ${mission.playbook.stages.length}: ${stage.title}, attempt ${record.attempt}.`,
      TURN_REASON_LINES[args.reason],
      `Before this turn ends, report through \`${MISSION_TOOL_NAMES.report}\`, or \`${MISSION_TOOL_NAMES.block}\` when you cannot finish. Do not ask a question you cannot get answered.`,
    ].join("\n"),
  };
}

export interface MissionBriefingStage {
  position: number;
  title: string;
  kind: "ai" | "action";
  status: StageStatus;
  current: boolean;
}

/** What `stave_get_mission` returns: read-only, and without any ids. */
export interface MissionBriefing {
  playbook: { name: string; purpose: string; constraints: string | null };
  assignment: string;
  stages: MissionBriefingStage[];
  currentStage: {
    position: number;
    title: string;
    instruction: string | null;
    doneWhen: string | null;
    attempt: number;
    feedback: string | null;
  };
  earlierStages: PriorStageSummary[];
  acceptanceCriteria: AcceptanceCriterion[];
  reporting: string;
}

export function buildMissionBriefing(aggregate: MissionAggregate): MissionBriefing {
  const { mission } = aggregate;
  const current = playbookStageAt(mission, mission.currentStageIndex);
  const record = currentStageRecord(aggregate);
  return {
    playbook: {
      name: mission.playbook.name,
      purpose: mission.playbook.purpose,
      constraints: mission.playbook.constraints?.trim() || null,
    },
    assignment: mission.assignment,
    stages: mission.playbook.stages.map((stage, index) => ({
      position: index + 1,
      title: stage.title,
      kind: stage.kind,
      status: latestStageRecord(aggregate.stages, stage.id)?.status ?? "pending",
      current: index === mission.currentStageIndex,
    })),
    currentStage: {
      position: mission.currentStageIndex + 1,
      title: current.title,
      instruction: current.kind === "ai" ? current.instruction : null,
      doneWhen: current.kind === "ai" ? current.doneWhen : null,
      attempt: record.attempt,
      feedback: record.feedback,
    },
    earlierStages: collectPriorStageSummaries(aggregate),
    acceptanceCriteria: collectAcceptanceCriteria(aggregate),
    reporting: `Call \`${MISSION_TOOL_NAMES.report}\` before this turn ends, or \`${MISSION_TOOL_NAMES.block}\` when you cannot finish the stage.`,
  };
}

/**
 * The provider permissions a mission turn runs with, from the permission mode
 * the user chose at start. Guided asks before sensitive actions, and the
 * mission waits on the approval in the task; Auto runs without prompts; Manual
 * keeps the runtime's own settings.
 */
export function missionPermissionRuntimeOptions(
  providerId: ProviderId,
  permissionMode: AutomationPermissionMode,
): ProviderRuntimeOptions {
  if (permissionMode === "manual") return {};
  if (providerId === "codex") {
    return { codexApprovalPolicy: permissionMode === "auto" ? "never" : "untrusted" };
  }
  return permissionMode === "auto"
    ? { claudePermissionMode: "bypassPermissions", claudeAllowDangerouslySkipPermissions: true }
    : { claudePermissionMode: "default", claudeAllowDangerouslySkipPermissions: false };
}
