import { awaitsUsageReset, describeAgentRunUsageLimit } from "./usage-limit";
import { toAgentRunAccountSwitch } from "./account-pool";
import {
  activeEventWait,
  describeEventWaitDetail,
  eventWaitTargetLabel,
  describeEventWaitFact,
  EventWaitFactSchema,
} from "./event-wait";
import { getStageDisplayTitle } from "./stage-display";
import { i18n } from "@/i18n/runtime";
/**
 * What the agent run surfaces show, derived from an `AgentRunDetail`: stage rows,
 * the one status line with its age, and the transcript divider for each turn an
 * agent run started. The Agent run bar, the Agent run panel and the transcript read
 * the same projection, so they tell the same story.
 *
 * Pure. Callers pass `now` and a time formatter.
 */
import type { AgentRunDetail } from "./api";
import { PROVIDER_RETRY_DELAYS_MS, resolveAgentRunStageSignOff } from "./policy";
import {
  latestStageRecord,
  type AgentRun,
  type AgentRunEvent,
  type AgentRunStageRecord,
  type StageStatus,
} from "./domain";
import { classifyStageEvidence, describeActionEvidence, isVerifiedEvidence, type ClassifiedEvidence } from "./evidence";
import { CHECK_IN_LABELS, type WorkflowStage, type StaveAction } from "@/lib/workflows/schema";

/** How a stage status reads and which tone its icon takes. */
export type StageTone = "done" | "active" | "waiting" | "attention" | "idle" | "skipped";

export const STAGE_STATUS_PRESENTATION: Record<StageStatus, { label: string; tone: StageTone }> = {
  pending: { get label() { return i18n.t("agentRuns:agentRunView.label"); }, tone: "idle" },
  "awaiting-sign-off": { get label() { return i18n.t("agentRuns:agentRunView.label2"); }, tone: "waiting" },
  running: { get label() { return i18n.t("agentRuns:agentRunView.label3"); }, tone: "active" },
  blocked: { get label() { return i18n.t("agentRuns:agentRunView.label4"); }, tone: "attention" },
  stuck: { get label() { return i18n.t("agentRuns:agentRunView.label5"); }, tone: "attention" },
  completed: { get label() { return i18n.t("agentRuns:agentRunView.label6"); }, tone: "done" },
  skipped: { get label() { return i18n.t("agentRuns:agentRunView.label7"); }, tone: "skipped" },
  cancelled: { get label() { return i18n.t("agentRuns:agentRunView.label8"); }, tone: "skipped" },
};

export interface AgentRunStageRow {
  index: number;
  stage: WorkflowStage;
  record: AgentRunStageRecord | null;
  status: StageStatus;
  attempts: number;
  current: boolean;
  /** The stage waits for the user's sign-off before it starts. */
  asksFirst: boolean;
  durationMs: number | null;
  evidence: ClassifiedEvidence[];
}

export function projectAgentRunStages(detail: AgentRunDetail, now: Date): AgentRunStageRow[] {
  const { agentRun, stages: records } = detail;
  return agentRun.workflow.stages.map((stage, index) => {
    const record = latestStageRecord(records, stage.id) ?? null;
    const status: StageStatus = record?.status ?? "pending";
    const started = record?.startedAt ? Date.parse(record.startedAt) : null;
    const ended = record?.endedAt ? Date.parse(record.endedAt) : null;
    const report = record?.report?.outcome === "complete" ? record.report : null;
    const evidence = classifyStageEvidence(report, record?.facts ?? null);
    if (record?.facts?.action) evidence.unshift(describeActionEvidence(record.facts.action, record.facts));
    // Verified by Stave first.
    evidence.sort((left, right) => Number(isVerifiedEvidence(right)) - Number(isVerifiedEvidence(left)));
    return {
      index,
      stage,
      record,
      status,
      attempts: records.filter((candidate) => candidate.stageId === stage.id).length,
      current: index === agentRun.currentStageIndex,
      asksFirst: index > 0 && resolveAgentRunStageSignOff(agentRun, index) === "ask",
      durationMs:
        started === null ? null : (ended ?? (status === "running" ? now.getTime() : started)) - started,
      evidence,
    };
  });
}

/** "now", "45s", "6m", "2h", "3d". */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 5_000) return i18n.t("agentRuns:agentRunView.now");
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return i18n.t("agentRuns:agentRunView.seconds", { value: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18n.t("agentRuns:agentRunView.minutes", { value: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return i18n.t("agentRuns:agentRunView.hours", { value: hours });
  return i18n.t("agentRuns:agentRunView.days", { value: Math.floor(hours / 24) });
}

export type AgentRunHeadlineTone = "active" | "waiting" | "attention" | "done" | "ended";

export interface AgentRunHeadline {
  text: string;
  tone: AgentRunHeadlineTone;
  /** When the state this headline names began, for the age. */
  since: string;
}

function latestEvent(events: readonly AgentRunEvent[], kinds?: readonly AgentRunEvent["kind"][]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (!kinds || kinds.includes(event.kind)) return event;
  }
  return null;
}

/** "Checks 7/12" from the latest checks observation of the current attempt. */
function describeChecks(detail: AgentRunDetail, record: AgentRunStageRecord): string {
  const observed = latestEvent(detail.events, ["checks-observed"]);
  const checks =
    observed && observed.detail.stageId === record.stageId && observed.detail.attempt === record.attempt
      ? (observed.detail.checks as Array<{ state?: string }> | undefined)
      : undefined;
  if (!checks?.length) return i18n.t("agentRuns:agentRunView.describeChecks");
  const passing = checks.filter((check) =>
    ["SUCCESS", "NEUTRAL", "SKIPPED"].includes((check.state ?? "").toUpperCase()),
  ).length;
  return i18n.t("agentRuns:agentRunView.describeChecks2", { value1: passing, value2: checks.length });
}

/** A usage-limit pause that resumes on its own at a known time, so it waits instead of needing the user. */
function awaitsUsageResetPause(agentRun: AgentRun): boolean {
  return agentRun.pauseReason === "usage-limit" && awaitsUsageReset(agentRun);
}

/** The one line that says where the agent run is, named and aged. */
export function describeAgentRunHeadline(detail: AgentRunDetail): AgentRunHeadline {
  const { agentRun } = detail;
  const since = latestEvent(detail.events)?.createdAt ?? agentRun.updatedAt;
  switch (agentRun.state) {
    case "completed":
      return { text: i18n.t("agentRuns:agentRunView.text"), tone: "done", since: agentRun.updatedAt };
    case "cancelled":
      return { text: i18n.t("agentRuns:agentRunView.text2"), tone: "ended", since: agentRun.updatedAt };
    case "stopped":
      return {
        text: i18n.t("agentRuns:agentRunView.text3", { value1: agentRun.reasonDetail ? ` · ${agentRun.reasonDetail}` : "" }),
        tone: "attention",
        since: agentRun.updatedAt,
      };
    case "paused":
      return {
        text: agentRun.pauseReason === "usage-limit" ? describeAgentRunUsageLimit(agentRun) : agentRun.reasonDetail ?? i18n.t("agentRuns:agentRunView.text4"),
        tone: agentRun.pauseReason === "paused-by-user" || agentRun.pauseReason === "taken-over" || awaitsUsageResetPause(agentRun) ? "waiting" : "attention",
        since,
      };
    case "running":
      break;
  }
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex]!;
  const record = latestStageRecord(detail.stages, stage.id);
  const wait = activeEventWait(agentRun, record);
  if (wait) return { text: describeEventWaitDetail(wait, eventWaitTargetLabel(detail.events, wait)), tone: "waiting", since: wait.waitingSince ?? since };
  switch (record?.status ?? "pending") {
    case "awaiting-sign-off":
      return { text: i18n.t("agentRuns:agentRunView.text5"), tone: "waiting", since };
    case "blocked":
      return {
        text:
          record?.blockReason === "reporting-unavailable"
            ? i18n.t("agentRuns:agentRunView.text6")
            : i18n.t("agentRuns:agentRunView.text7", { value1: record?.detail ?? i18n.t("agentRuns:agentRunView.extraCopy219") }),
        tone: "attention",
        since,
      };
    case "stuck":
      return { text: i18n.t("agentRuns:agentRunView.text8", { value1: record?.detail ?? i18n.t("agentRuns:agentRunView.extraCopy220") }), tone: "attention", since };
    case "running":
      if (stage.kind === "action" && stage.action.type === "watch-checks" && record) {
        return { text: describeChecks(detail, record), tone: "active", since: record.startedAt ?? since };
      }
      return { text: i18n.t("agentRuns:remaining.presentationCopy414", { v1: getStageDisplayTitle(stage) }), tone: "active", since: record?.startedAt ?? since };
    case "pending":
    case "completed":
    case "skipped":
    case "cancelled":
      return { text: i18n.t("agentRuns:remaining.presentationCopy415", { v1: getStageDisplayTitle(stage) }), tone: "active", since };
  }
}

/**
 * Where a legacy run's line stands. Its state words, tone and glyph are the
 * run's badge (`describeAgentRunStatus`), which every surface shares.
 */
export interface AgentRunStatusLine {
  /** The lead words: the current stage, or how the run ended. */
  title: string;
  /** What the stage is doing, or why it waits. */
  detail: string | null;
  /** When the state this line names began, for the age. */
  since: string;
  /** A turn does the work now, so the Now phrase may replace the detail. */
  live: boolean;
}

/** What Stave is doing while one of its own stages runs. */
function describeRunningAction(action: StaveAction, watchingChecks: string): string {
  switch (action.type) {
    case "watch-checks":
      return watchingChecks;
    case "open-draft-pr":
      return i18n.t("agentRuns:agentRunView.describeRunningAction");
    case "mark-pr-ready":
      return i18n.t("agentRuns:agentRunView.describeRunningAction2");
    case "run-script":
      return i18n.t("agentRuns:agentRunView.describeRunningAction3", { value1: action.scriptId });
  }
}

/**
 * A legacy run's line: the stage in view and why it stands there, for example
 * `Verify` · `Which breakpoint…`. The bar puts the run's badge between them;
 * the panel shows the badge and the rest beside it.
 */
export function describeAgentRunStatusLine(detail: AgentRunDetail): AgentRunStatusLine {
  const { agentRun } = detail;
  const headline = describeAgentRunHeadline(detail);
  const since = headline.since;
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex]!;
  const line = (patch: Partial<AgentRunStatusLine> = {}): AgentRunStatusLine => ({
    title: getStageDisplayTitle(stage),
    detail: null,
    since,
    live: false,
    ...patch,
  });
  if (agentRun.state === "paused") {
    return line({
      detail:
        agentRun.pauseReason === "taken-over"
          ? i18n.t("agentRuns:agentRunView.detail")
          : agentRun.pauseReason === "paused-by-user"
            ? i18n.t("agentRuns:agentRunView.detail2", { value1: getStageDisplayTitle(stage) })
            : headline.text,
    });
  }
  if (agentRun.state !== "running") return line({ title: headline.text });
  const record = latestStageRecord(detail.stages, stage.id);
  if (activeEventWait(agentRun, record)) return line({ detail: headline.text });
  switch (record?.status ?? "pending") {
    case "awaiting-sign-off":
      return line();
    case "blocked":
      return line({
        detail: record?.blockReason === "reporting-unavailable"
          ? i18n.t("agentRuns:agentRunView.detail3")
          : (record?.detail ?? i18n.t("agentRuns:agentRunView.detail4")),
      });
    case "stuck":
      return line({ detail: record?.detail ?? i18n.t("agentRuns:agentRunView.detail5") });
    case "running": {
      if (stage.kind === "ai") return line({ detail: i18n.t("agentRuns:agentRunView.detail6"), live: true });
      return line({ detail: describeRunningAction(stage.action, headline.text) });
    }
    case "pending":
    case "completed":
    case "skipped":
    case "cancelled":
      return line({ detail: i18n.t("agentRuns:agentRunView.detail7") });
  }
}

export type AgentRunBadgeTone = "accent" | "warning" | "danger" | "success" | "neutral";

/** `manual` is stored as is; people see it as "Your settings". */
export const AGENT_RUN_PERMISSION_LABELS: Record<AgentRun["consent"]["permissionMode"], string> = {
  get auto() { return i18n.t("agentRuns:agentRunView.auto"); },
  get guided() { return i18n.t("agentRuns:agentRunView.guided"); },
  get manual() { return i18n.t("agentRuns:agentRunView.manual"); },
};

/** The permissions line of an agent run summary: a short label that fits beside the model. */
export function describeAgentRunPermissions(permissionMode: AgentRun["consent"]["permissionMode"]): string {
  return permissionMode === "manual"
    ? i18n.t("agentRuns:agentRunView.describeAgentRunPermissions")
    : i18n.t("agentRuns:remaining.presentationCopy416", { v1: AGENT_RUN_PERMISSION_LABELS[permissionMode] });
}

/** What Auto means on the run's provider, shown on hover of the permissions line. */
export function explainAgentRunPermissions(permissionMode: AgentRun["consent"]["permissionMode"], providerId: string): string | undefined {
  if (permissionMode !== "auto") return undefined;
  return providerId === "codex"
    ? i18n.t("agentRuns:agentRunView.autoPermissionCodex")
    : i18n.t("agentRuns:agentRunView.autoPermissionClaude");
}

/** The primary button names what happens when it is pressed. */
export function describeSignOffAction(stage: WorkflowStage): string {
  if (stage.kind === "ai") return i18n.t("agentRuns:agentRunView.describeSignOffAction", { value1: getStageDisplayTitle(stage) });
  switch (stage.action.type) {
    case "open-draft-pr":
      return i18n.t("agentRuns:agentRunView.describeSignOffAction2");
    case "watch-checks":
      return i18n.t("agentRuns:agentRunView.describeSignOffAction3");
    case "mark-pr-ready":
      return i18n.t("agentRuns:agentRunView.describeSignOffAction4");
    case "run-script":
      return i18n.t("agentRuns:agentRunView.describeSignOffAction5", { value1: stage.action.scriptId });
  }
}

/** What the card cites: the stage before it, in one line. */
export function summarizePreviousStage(row: AgentRunStageRow | undefined): string | null {
  if (!row?.record) return null;
  const parts: string[] = [i18n.t("agentRuns:agentRunView.stageOutcome", { stage: getStageDisplayTitle(row.stage), status: row.status === "completed" ? i18n.t("agentRuns:agentRunView.label6").toLowerCase() : STAGE_STATUS_PRESENTATION[row.status].label.toLowerCase() })];
  const diff = row.record.facts?.diff;
  if (diff && diff.filesChanged > 0) {
    parts.push(i18n.t("agentRuns:counts.changedFiles", { count: diff.filesChanged, insertions: diff.insertions, deletions: diff.deletions }));
  }
  const verified = row.evidence.filter(isVerifiedEvidence).length;
  if (verified > 0) parts.push(i18n.t("agentRuns:agentRunView.extraCopy225", { value1: verified }));
  return parts.join(" · ");
}

/** "5 of 40 turns", and whether the agent run is close to its turn limit. */
export function describeTurnBudget(agentRun: Pick<AgentRun, "turnCount" | "maxTurns">) {
  return {
    text: i18n.t("agentRuns:agentRunView.text9", { value1: agentRun.turnCount, value2: agentRun.maxTurns }),
    nearLimit: agentRun.turnCount >= Math.ceil(agentRun.maxTurns * 0.8),
  };
}

export function describeCheckIns(agentRun: AgentRun) {
  return CHECK_IN_LABELS[agentRun.consent.checkIns];
}

/**
 * Whether `incoming` is an older read of the agent run than `stored`, so a
 * response that left the host first cannot replace a newer one. An event can
 * land without moving `updatedAt`, so equal times compare the last event.
 */
export function isOlderAgentRunDetail(incoming: AgentRunDetail, stored: AgentRunDetail | undefined): boolean {
  if (!stored || stored.agentRun.id !== incoming.agentRun.id) return false;
  const incomingAt = Date.parse(incoming.agentRun.updatedAt);
  const storedAt = Date.parse(stored.agentRun.updatedAt);
  if (incomingAt !== storedAt) return incomingAt < storedAt;
  return (incoming.events.at(-1)?.sequence ?? 0) < (stored.events.at(-1)?.sequence ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Transcript dividers                                                         */
/* -------------------------------------------------------------------------- */

function stagePosition(agentRun: AgentRun, stageId: string) {
  const index = agentRun.workflow.stages.findIndex((stage) => stage.id === stageId);
  return index === -1 ? null : { index, stage: agentRun.workflow.stages[index]! };
}

/** `Stage 2 · Verify, attempt 2`, or null for a stage the workflow does not have. */
export function describeAgentRunStageName(agentRun: AgentRun, stageId: string, attempt: number): string | null {
  const where = stagePosition(agentRun, stageId);
  return where
    ? i18n.t("agentRuns:agentRunView.extraCopy226", { value1: where.index + 1, value2: getStageDisplayTitle(where.stage), value3: attempt > 1 ? i18n.t("agentRuns:remaining.presentationCopy417", { v1: attempt }) : "" })
    : null;
}

/**
 * One divider per turn the agent run started, keyed by turn id. Built from the
 * agent run's events, never from message text.
 */
export function buildAgentRunTurnDividers(
  detail: AgentRunDetail,
  formatTime: (iso: string) => string,
): Map<string, string> {
  const { agentRun, events } = detail;
  const dividers = new Map<string, string>();
  const startedByKey = new Map<string, { event: AgentRunEvent; position: number }>();
  events.forEach((event, position) => {
    if (event.kind === "turn-started" && event.idempotencyKey) {
      startedByKey.set(event.idempotencyKey, { event, position });
    }
  });
  for (const linked of events) {
    if (linked.kind !== "turn-linked" || typeof linked.detail.turnId !== "string") continue;
    const turnKey = linked.idempotencyKey?.replace(/:linked$/, "") ?? "";
    const started = startedByKey.get(turnKey);
    if (!started) continue;
    const stageId = String(started.event.detail.stageId ?? "");
    const attempt = Number(started.event.detail.attempt ?? 1);
    const reason = String(started.event.detail.reason ?? "stage-start");
    const name = describeAgentRunStageName(agentRun, stageId, attempt);
    if (!name) continue;
    dividers.set(
      linked.detail.turnId,
      describeTurnStart({ agentRun, events, position: started.position, name, stageId, attempt, reason, formatTime }),
    );
  }
  return dividers;
}

function describeTurnStart(args: {
  agentRun: AgentRun;
  events: readonly AgentRunEvent[];
  position: number;
  name: string;
  stageId: string;
  attempt: number;
  reason: string;
  formatTime: (iso: string) => string;
}): string {
  const { name, reason } = args;
  if (reason === "nudge") return i18n.t("agentRuns:agentRunView.describeTurnStart", { value1: name });
  if (reason === "repair-checks") return i18n.t("agentRuns:agentRunView.describeTurnStart2", { value1: name });
  if (reason === "continue-after-user") return i18n.t("agentRuns:agentRunView.describeTurnStart3", { value1: name });
  if (reason === "reporting-restored") return i18n.t("agentRuns:agentRunView.describeTurnStart4", { value1: name });
  if (reason === "resume-after-restart") return i18n.t("agentRuns:agentRunView.describeTurnStart5", { value1: name });
  if (reason === "resume-after-account-switch") {
    for (let index = args.position - 1; index >= 0; index -= 1) {
      const change = toAgentRunAccountSwitch(args.events[index]!);
      if (change) return i18n.t("agentRuns:accountPool.switchedTurn", { name, from: change.from, to: change.to });
    }
  }
  if (reason === "resume-after-event") {
    // The wake is recorded with the turn's start, just before it.
    const woke = args.events[args.position - 1];
    const fact = woke?.kind === "wait-woke" ? EventWaitFactSchema.safeParse(woke.detail.fact) : null;
    if (fact?.success) return i18n.t("agentRuns:eventWait.wokeTurn", { name, fact: describeEventWaitFact(fact.data) });
  }
  if (reason === "resume-after-wait-expired") return i18n.t("agentRuns:eventWait.expiredTurn", { name });
  if (reason === "retry-after-provider-error") {
    const retry = args.events.slice(0, args.position + 1).filter((event) => event.kind === "turn-started" &&
      event.detail.reason === reason && event.detail.stageId === args.stageId && event.detail.attempt === args.attempt).length;
    return i18n.t("agentRuns:agentRunView.providerRetryTurn", { name, retry, total: PROVIDER_RETRY_DELAYS_MS.length });
  }
  // What happened just before this stage started.
  for (let index = args.position - 1; index >= 0; index -= 1) {
    const event = args.events[index]!;
    const sameAttempt = event.detail.stageId === args.stageId && event.detail.attempt === args.attempt;
    if (event.kind === "sign-off" && sameAttempt) {
      return i18n.t("agentRuns:agentRunView.describeTurnStart6", { value1: name, value2: args.formatTime(event.createdAt) });
    }
    if (event.kind === "changes-requested" && event.detail.rerunStageId === args.stageId) {
      return i18n.t("agentRuns:agentRunView.describeTurnStart7", { value1: name });
    }
    if (event.kind === "stage-retried" && event.detail.stageId === args.stageId) {
      return i18n.t("agentRuns:remaining.presentationCopy418", { v1: name });
    }
    if (event.kind === "stage-completed" || event.kind === "stage-skipped") {
      const previous = stagePosition(args.agentRun, String(event.detail.stageId ?? ""));
      if (previous) {
        const verb = event.kind === "stage-completed" ? i18n.t("agentRuns:agentRunView.extraCopy227") : i18n.t("agentRuns:agentRunView.extraCopy228");
        return i18n.t("agentRuns:agentRunView.describeTurnStart8", { value1: name, value2: getStageDisplayTitle(previous.stage), value3: verb });
      }
    }
    if (event.kind === "agent-run-started") return i18n.t("agentRuns:agentRunView.describeTurnStart9", { value1: name });
  }
  return name;
}
