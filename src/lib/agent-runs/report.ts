/**
 * The agent run report: what the agent run did, why, and what proves it. Built
 * once an agent run ends, whether it completed, was cancelled or was stopped. A
 * partial report also lists what the agent run left behind.
 */
import type { AcceptanceCriterion } from "@/lib/workflows/stage-prompt";
import type { AgentRunUsage } from "./usage";
import { collectAcceptanceCriteria } from "./briefing";
import {
  latestStageRecord,
  type AgentRunAggregate,
  type AgentRunEvent,
  type StagePlan,
  type StageStatus,
} from "./domain";
import {
  classifyStageEvidence,
  describeActionEvidence,
  type ClassifiedEvidence,
  type EvidenceSource,
} from "./evidence";

export interface AgentRunReportStage {
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
  /** The agent's own to-do list as its last turn in the stage left it. */
  plan: StagePlan["items"] | null;
}

export interface AgentRunReportLink {
  label: string;
  url: string;
  source: EvidenceSource;
}

/**
 * How much the agent run needed you and how it went, from its events: the
 * figures the design asks to watch per provider when tuning nudges and
 * check-ins.
 */
export interface AgentRunMetrics {
  providerId: string;
  /** Messages you sent in the lead task while the agent run ran. */
  userReplies: number;
  /** Reminders to report a stage after a turn ended without one. */
  nudges: number;
  stuckStages: number;
  signOffs: number;
  /** Average and longest time a sign-off waited for you. */
  signOffWaitAverageMs: number | null;
  signOffWaitLongestMs: number | null;
}

export interface AgentRunReport {
  agentRunId: string;
  workflowName: string;
  assignment: string;
  outcome: "completed" | "cancelled" | "stopped";
  reason: string | null;
  startedAt: string;
  endedAt: string;
  turnCount: number;
  stages: AgentRunReportStage[];
  acceptanceCriteria: AcceptanceCriterion[];
  links: AgentRunReportLink[];
  /** Only on a partial report: work that outlives the agent run. */
  leftBehind: string[];
  /** Present when the report was built with the agent run's events. */
  metrics?: AgentRunMetrics;
  /** What the agent run's turns spent, when the host reads usage. */
  usage?: AgentRunUsage;
}

const WAIT_START_KINDS = new Set(["stage-completed", "stage-skipped", "resumed", "mission-started"]);

export function computeAgentRunMetrics(args: {
  providerId: string;
  events: readonly AgentRunEvent[];
}): AgentRunMetrics {
  const count = (kind: AgentRunEvent["kind"]) => args.events.filter((event) => event.kind === kind).length;
  const waits: number[] = [];
  let waitStartedAt: number | null = null;
  for (const event of args.events) {
    if (WAIT_START_KINDS.has(event.kind)) waitStartedAt = Date.parse(event.createdAt);
    if (event.kind === "sign-off" && waitStartedAt !== null) {
      waits.push(Math.max(0, Date.parse(event.createdAt) - waitStartedAt));
      waitStartedAt = null;
    }
  }
  return {
    providerId: args.providerId,
    userReplies: count("user-turn"),
    nudges: count("nudge"),
    stuckStages: count("stage-stuck"),
    signOffs: count("sign-off"),
    signOffWaitAverageMs: waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : null,
    signOffWaitLongestMs: waits.length ? Math.max(...waits) : null,
  };
}

/** What the workspace holds when the agent run ends, read by the runtime. */
export interface AgentRunWorkspaceState {
  branch: string | null;
  branchPushed: boolean;
  openPullRequest: { url: string; number: number; isDraft: boolean } | null;
}

export function buildAgentRunReport(args: {
  aggregate: AgentRunAggregate;
  workspace: AgentRunWorkspaceState;
  endedAt: Date;
  /** The agent run's events, oldest first, for the metrics. */
  events?: readonly AgentRunEvent[];
}): AgentRunReport {
  const { agentRun, stages: records } = args.aggregate;
  if (agentRun.state !== "completed" && agentRun.state !== "cancelled" && agentRun.state !== "stopped") {
    throw new Error(`Run ${agentRun.id} is still ${agentRun.state}; report it once it ends.`);
  }

  const acceptanceCriteria = collectAcceptanceCriteria(args.aggregate, true);
  const links = new Map<string, AgentRunReportLink>();
  const addLink = (link: AgentRunReportLink) => {
    const existing = links.get(link.url);
    if (!existing || (existing.source === "agent" && link.source === "stave")) {
      links.set(link.url, link);
    }
  };

  const stages = agentRun.workflow.stages.map((stage): AgentRunReportStage => {
    const record = latestStageRecord(records, stage.id);
    const attempts = records.filter((candidate) => candidate.stageId === stage.id).length;
    const report = record?.report?.outcome === "complete" ? record.report : null;
    const evidence: ClassifiedEvidence[] = report
      ? classifyStageEvidence(report, record?.facts ?? null)
      : [];
    const action = record?.facts?.action ?? null;
    if (action) {
      const actionEvidence = describeActionEvidence(action, record?.facts);
      evidence.unshift(actionEvidence);
      if (actionEvidence.ref) {
        addLink({ label: actionEvidence.label, url: actionEvidence.ref, source: "stave" });
      }
    }
    for (const artifact of report?.artifacts ?? []) {
      addLink({ label: artifact.label, url: artifact.url, source: "agent" });
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
      plan: record?.facts?.plan?.items ?? null,
    };
  });

  const leftBehind: string[] = [];
  if (agentRun.state !== "completed") {
    const { branch, branchPushed, openPullRequest } = args.workspace;
    if (branch && branchPushed) leftBehind.push(`Branch ${branch} is pushed.`);
    if (openPullRequest) {
      leftBehind.push(
        `${openPullRequest.isDraft ? "Draft PR" : "PR"} #${openPullRequest.number} is still open: ${openPullRequest.url}`,
      );
    }
  }

  return {
    agentRunId: agentRun.id,
    workflowName: agentRun.workflow.name,
    assignment: agentRun.assignment,
    outcome: agentRun.state,
    reason: agentRun.reasonDetail,
    startedAt: agentRun.createdAt,
    endedAt: args.endedAt.toISOString(),
    turnCount: agentRun.turnCount,
    stages,
    acceptanceCriteria,
    links: [...links.values()],
    leftBehind,
    ...(args.events
      ? { metrics: computeAgentRunMetrics({ providerId: agentRun.fingerprint.providerId, events: args.events }) }
      : {}),
  };
}
