import { i18n } from "@/i18n/runtime";
import { describeAgentRunStatus, type AgentRunBadge } from "@/lib/agent-runs/agent-run-status";
import { resolveTaskUserState, type TaskStateFacts, type TaskUserStatus } from "@/lib/task-user-state";
import { tarsGoalNext } from "./completion";
import { tarsSummaryExcerpt } from "./completion-summary";
import { describeTarsQueueWait, describeTarsResponsibilityDetail } from "./detail";
import { isTarsWorkRunning } from "./live-progress";
import { tarsRecordedChangeCount } from "./outputs-model";
import { projectTarsReport } from "./report-model";
import type { TarsTrayAttentionInput, TarsTrayAttentionRow, TarsTrayCard, TarsTrayDecision } from "./tray-model";
import { isTarsTaskOperation, type TarsControlOperation, type TarsResponsibility } from "./types";

/**
 * A Tars work card reads in three lines: the work's title, one sentence, and
 * the state with one action. This file decides the last two from what the
 * tray already knows about the work. The state is the task's user state
 * (`resolveTaskUserState`): Tars's own states and Fleet's rows are translated
 * into that function's facts here, so the card has no state words of its own.
 */

type CardFacts = Pick<TarsTrayCard, "row" | "attention" | "controls" | "run">;

/** Fleet's kinds that say the work's task stopped by itself: a block, not a question. */
const HALT_KINDS: ReadonlySet<string> = new Set(["tars-blocked", "run-failed", "turn-stalled", "agent-run-blocked", "agent-run-stuck"]);

/** Each Tars state as the run badge it stands for; queued and waiting work is still in Tars's hands. */
const BADGE_OF: Record<TarsResponsibility["state"], AgentRunBadge> = {
  queued: "running", preparing: "running", running: "running", waiting: "running",
  paused: "paused", takenOver: "paused", blocked: "halted", resultReady: "needs-answer", completed: "completed", cancelled: "stopped",
};

function asksOf(card: Pick<TarsTrayCard, "row" | "attention">) {
  const halt = card.attention.find((entry) => HALT_KINDS.has(entry.item.kind)) ?? null;
  const asks = card.attention.filter((entry) => !HALT_KINDS.has(entry.item.kind));
  // A result waiting for the user's check is a sign-off, said by the state itself.
  const tars = card.row.state === "resultReady" ? null : asks.find((entry) => entry.item.kind === "tars-decision") ?? null;
  const task = asks.find((entry) => entry.item.kind !== "tars-decision") ?? null;
  return { halt, tars, task };
}

/**
 * What the work's run waits for when nobody has to act: a usage reset with a
 * known time, or the outside event it asked to be woken by. The run's own
 * status words it, as on the Task panel; it is read only for a run that can
 * be waiting, so running work never walks its stage records here. Null when
 * the run works, needs someone, ended, or was not read by this window.
 */
function holdOf(card: Pick<TarsTrayCard, "row" | "run">): string | null {
  const run = card.run?.agentRun;
  if (!run || card.row.state === "queued" || BADGE_OF[card.row.state] !== "running") return null;
  if (!(run.state === "paused" && run.pauseReason === "usage-limit") && run.eventWait?.status !== "waiting") return null;
  const status = describeAgentRunStatus(card.run!);
  return status.waiting ? status.reason : null;
}

/** The Fleet row's own words, when it has some. */
function wordsOf(entry: TarsTrayAttentionRow<TarsTrayAttentionInput> | null) {
  return entry?.item.detail?.trim() || null;
}

/**
 * The work as `resolveTaskUserState` reads a task. A decision Tars itself
 * asks (a proposal to confirm, a question, an unverified completion) is the
 * live prompt, whatever the run does; a request left open in the work's task
 * is the task's pending decision; a row that says the task stopped is a halt.
 */
export function tarsTaskStateFacts(card: CardFacts): TaskStateFacts {
  const { row } = card;
  const { halt, tars, task } = asksOf(card);
  const taskAsk = !task ? null : task.item.kind === "approval" ? "approval" as const : "question" as const;
  const signOff = task?.item.kind === "agent-run-sign-off";
  const hold = halt ? null : holdOf(card);
  const running = isTarsWorkRunning(row) && !halt && hold === null;
  const opened = row.publication?.state === "opened" && row.publication.url ? row.publication : null;
  return {
    liveTurn: tars ? { pendingInteraction: tars.decision ? "approval" : "user_input" }
      : running ? { pendingInteraction: signOff ? null : taskAsk === "approval" ? "approval" : taskAsk ? "user_input" : null } : null,
    pendingDecision: signOff ? null : taskAsk,
    agentRun: {
      badge: halt && BADGE_OF[row.state] === "running" ? "halted" : signOff && BADGE_OF[row.state] === "running" ? "needs-answer" : BADGE_OF[row.state],
      reason: hold ?? describeTarsResponsibilityDetail(row) ?? wordsOf(halt),
      waiting: hold !== null,
      updatedAt: row.updatedAt,
    },
    lastTurn: null,
    result: {
      pullRequest: opened ? { url: opened.url!, ...(opened.number ? { number: opened.number } : {}), title: opened.title } : null,
      changedFiles: card.run ? tarsRecordedChangeCount(card.run) ?? 0 : 0,
      answerMessageId: null,
    },
  };
}

/** The card's state: one of the task's user states. */
export function tarsCardStatus(card: CardFacts): TaskUserStatus {
  // The facts always carry a run badge, so the state is never unknown.
  return resolveTaskUserState(tarsTaskStateFacts(card))!;
}

/**
 * The card's one sentence: what the work needs from the user, why it stands
 * still, or what came out. Null for work in progress whose words are what
 * Stave observes live (the card then shows its live line or the stage in hand).
 */
export function describeTarsCardSentence(card: CardFacts, status: TaskUserStatus): string | null {
  const { row } = card;
  const { halt, tars, task } = asksOf(card);
  switch (status.state) {
    case "waiting":
      if (tars?.decision) return i18n.t(`shell:tars.tray.decision.${tars.decision.operation}`);
      if (tars) return wordsOf(tars) ?? i18n.t("shell:tars.tray.decision.answerInConversation");
      if (row.state === "resultReady") return i18n.t(`shell:tars.goal.next.${tarsGoalNext(row)}`);
      return wordsOf(task) ?? i18n.t("shell:tars.detail.waitingForUser");
    case "blocked":
      if (row.state === "takenOver") return describeTarsResponsibilityDetail(row) ?? i18n.t("shell:tars.detail.pauseReason.takenOver");
      if (row.state === "paused") return describeTarsResponsibilityDetail(row) ?? i18n.t("shell:tars.detail.runPaused");
      return describeTarsResponsibilityDetail(row) ?? wordsOf(halt) ?? i18n.t("shell:tars.tray.blockedDetail");
    case "on-hold":
      // When it resumes, in the run's own words.
      return status.reason ?? describeTarsResponsibilityDetail(row);
    case "working":
      if (row.state === "queued") return describeTarsQueueWait(row);
      return isTarsWorkRunning(row) ? null : describeTarsResponsibilityDetail(row);
    case "finished": {
      const pullRequest = status.result?.pullRequest;
      if (pullRequest) return pullRequest.number ? i18n.t("shell:tars.publish.status.opened", { number: pullRequest.number }) : i18n.t("shell:tars.publish.status.openedUnnumbered");
      const summary = card.run ? tarsSummaryExcerpt(projectTarsReport(row, card.run).summary ?? "") : "";
      return describeTarsResponsibilityDetail(row) ?? (summary || i18n.t("shell:tars.goal.next.complete"));
    }
    case "stopped":
      return describeTarsResponsibilityDetail(row) ?? i18n.t("shell:tars.detail.runCancelled");
  }
}

/**
 * The one action a card shows beside its state. Confirm and a control go
 * through the host's own paths; the rest only open something: the decision in
 * the conversation, the work's task, its report, or its pull request.
 */
export type TarsCardPrimary =
  | { kind: "confirm"; decision: TarsTrayDecision }
  | { kind: "control"; operation: TarsControlOperation }
  | { kind: "answer" }
  | { kind: "openTask" }
  | { kind: "openReport" }
  | { kind: "openPullRequest"; url: string; number: number | null };

/** The controls that let held work go on, in the order they are offered. */
const UNBLOCKING: readonly TarsControlOperation[] = ["resume", "handBack", "acceptCompletion"];

/**
 * The action that fits the state: answer what waits, read why blocked work
 * stopped or let paused work go on, start queued work or look at running
 * work, open what finished work produced. Work on hold resumes by itself, so
 * it offers nothing. `can` says which openers this view has; null when none
 * applies.
 */
export function tarsCardPrimary(card: CardFacts, status: TaskUserStatus, can: { answer: boolean; report: boolean }): TarsCardPrimary | null {
  const { row } = card;
  const openTask: TarsCardPrimary | null = row.taskId ? { kind: "openTask" } : null;
  // Ended work opens its report only once this window has read the run the report comes from.
  const ended = status.state === "finished" || status.state === "stopped";
  const openReport: TarsCardPrimary | null = can.report && row.agentRunId && (!ended || card.run) ? { kind: "openReport" } : null;
  switch (status.state) {
    case "waiting": {
      // An answer in the task (approve, answer, words) is confirmed only on the conversation card that shows it.
      const proposal = card.attention.find((entry) => entry.decision && !isTarsTaskOperation(entry.decision.operation))?.decision;
      if (proposal) return { kind: "confirm", decision: proposal };
      if (asksOf(card).tars) return can.answer ? { kind: "answer" } : openTask;
      if (row.state === "resultReady") return openReport ?? (card.controls.includes("acceptCompletion") ? { kind: "control", operation: "acceptCompletion" } : openTask);
      return openTask;
    }
    case "blocked": {
      // Work Tars could not finish is read before it is resumed: its report says what is unmet.
      if (row.state === "blocked" && openReport) return openReport;
      const operation = UNBLOCKING.find((candidate) => card.controls.includes(candidate));
      return operation ? { kind: "control", operation } : openTask;
    }
    case "on-hold":
      return null;
    case "working":
      return row.state === "queued" && card.controls.includes("startNow") ? { kind: "control", operation: "startNow" } : openTask;
    case "finished": {
      const pullRequest = status.result?.pullRequest;
      return pullRequest ? { kind: "openPullRequest", url: pullRequest.url, number: pullRequest.number ?? null } : openReport ?? openTask;
    }
    case "stopped":
      return openReport ?? openTask;
  }
}
