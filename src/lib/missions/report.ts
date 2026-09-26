/**
 * The mission report: what the mission did, why, and what proves it. Built
 * once a mission ends, whether it completed, was cancelled or was stopped. A
 * partial report also lists what the mission left behind.
 */
import type { AcceptanceCriterion } from "@/lib/playbooks/stage-prompt";
import {
  latestStageRecord,
  type MissionAggregate,
  type StageStatus,
} from "./domain";
import {
  classifyStageEvidence,
  describeActionEvidence,
  type ClassifiedEvidence,
  type EvidenceSource,
} from "./evidence";

export interface MissionReportStage {
  stageId: string;
  title: string;
  kind: "ai" | "action";
  /** The latest attempt's status; `pending` with zero attempts when never reached. */
  status: StageStatus;
  attempts: number;
  summary: string | null;
  decisions: Array<{ decision: string; reason: string }>;
  evidence: ClassifiedEvidence[];
  /** The sentence behind a blocked, stuck, skipped or cancelled stage. */
  detail: string | null;
}

export interface MissionReportLink {
  label: string;
  url: string;
  source: EvidenceSource;
}

export interface MissionReport {
  missionId: string;
  playbookName: string;
  assignment: string;
  outcome: "completed" | "cancelled" | "stopped";
  reason: string | null;
  startedAt: string;
  endedAt: string;
  turnCount: number;
  stages: MissionReportStage[];
  acceptanceCriteria: AcceptanceCriterion[];
  links: MissionReportLink[];
  /** Only on a partial report: work that outlives the mission. */
  leftBehind: string[];
}

/** What the workspace holds when the mission ends, read by the runtime. */
export interface MissionWorkspaceState {
  branch: string | null;
  branchPushed: boolean;
  openPullRequest: { url: string; number: number; isDraft: boolean } | null;
}

export function buildMissionReport(args: {
  aggregate: MissionAggregate;
  workspace: MissionWorkspaceState;
  endedAt: Date;
}): MissionReport {
  const { mission, stages: records } = args.aggregate;
  if (mission.state !== "completed" && mission.state !== "cancelled" && mission.state !== "stopped") {
    throw new Error(`Mission ${mission.id} is still ${mission.state}; report it once it ends.`);
  }

  let acceptanceCriteria: AcceptanceCriterion[] = [];
  const links = new Map<string, MissionReportLink>();
  const addLink = (link: MissionReportLink) => {
    const existing = links.get(link.url);
    if (!existing || (existing.source === "agent" && link.source === "stave")) {
      links.set(link.url, link);
    }
  };

  const stages = mission.playbook.stages.map((stage): MissionReportStage => {
    const record = latestStageRecord(records, stage.id);
    const attempts = records.filter((candidate) => candidate.stageId === stage.id).length;
    const report = record?.report?.outcome === "complete" ? record.report : null;
    const evidence: ClassifiedEvidence[] = report
      ? classifyStageEvidence(report, record?.facts ?? null)
      : [];
    const action = record?.facts?.action ?? null;
    if (action) {
      const actionEvidence = describeActionEvidence(action);
      evidence.unshift(actionEvidence);
      if (actionEvidence.ref) {
        addLink({ label: actionEvidence.label, url: actionEvidence.ref, source: "stave" });
      }
    }
    for (const artifact of report?.artifacts ?? []) {
      addLink({ label: artifact.label, url: artifact.url, source: "agent" });
    }
    if (report?.acceptanceCriteria?.length) {
      acceptanceCriteria = report.acceptanceCriteria;
    }
    return {
      stageId: stage.id,
      title: stage.title,
      kind: stage.kind,
      status: record?.status ?? "pending",
      attempts,
      summary:
        report?.summary ??
        (record?.report?.outcome === "blocked" ? `Blocked: ${record.report.missing}` : null),
      decisions: report?.decisions ?? [],
      evidence,
      detail: record?.detail ?? null,
    };
  });

  const leftBehind: string[] = [];
  if (mission.state !== "completed") {
    const { branch, branchPushed, openPullRequest } = args.workspace;
    if (branch && branchPushed) leftBehind.push(`Branch ${branch} is pushed.`);
    if (openPullRequest) {
      leftBehind.push(
        `${openPullRequest.isDraft ? "Draft PR" : "PR"} #${openPullRequest.number} is still open: ${openPullRequest.url}`,
      );
    }
  }

  return {
    missionId: mission.id,
    playbookName: mission.playbook.name,
    assignment: mission.assignment,
    outcome: mission.state,
    reason: mission.reasonDetail,
    startedAt: mission.createdAt,
    endedAt: args.endedAt.toISOString(),
    turnCount: mission.turnCount,
    stages,
    acceptanceCriteria,
    links: [...links.values()],
    leftBehind,
  };
}
