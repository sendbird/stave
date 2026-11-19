import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  agentRunChangesStage,
  describeAgentRunResult,
  type AgentRunDoneWhenLine,
} from "@/lib/agent-runs/agent-run-status";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import type { StageIdentity } from "@/lib/review/review-stage";
import type { TurnHistoryEntry } from "@/lib/providers/turn-history";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnPendingInteraction,
  ProviderTurnWorkItem,
  RetainedTurnActivity,
} from "@/lib/providers/turn-status";
import { i18n } from "@/i18n/runtime";
import {
  resolveTaskUserState,
  resolveTurnEnding,
  type TaskResult,
  type TaskStateFacts,
  type TaskTurnEnding,
  type TaskUserStatus,
} from "@/lib/task-user-state";
import { findLatestPendingApprovalPart, findLatestPendingUserInputPart } from "@/store/provider-message.utils";
import type { ChatMessage, UserInputPart } from "@/types/chat";

/** The request that waits on the user, to show and to jump to. */
export interface TaskPanelRequest {
  messageId: string;
  requestId: string;
  /** The question asked, or what the approval would allow. */
  text: string;
}

/** What the Task panel's top says, for the current turn or a past one. */
export interface TaskPanelStatus {
  status: TaskUserStatus | null;
  /** The turn the panel follows: the live or newest one, or the past turn picked. */
  turnId: string | null;
  /** A past turn is picked: when it started, for the title. */
  pastTurnAt: string | null;
  /** The open question or approval, when the messages hold one. */
  request: TaskPanelRequest | null;
  /** Done-when lines still unmet or unverified (current turn only). */
  remaining: AgentRunDoneWhenLine[];
  /** The current work stopped on its own (not by the user): Details open on it. */
  focusDetails: boolean;
  /**
   * The run stage whose diff the result's file count is, for Review changes;
   * null when the count is the followed turn's own edits (the turn's review).
   */
  reviewStage: StageIdentity | null;
}

function latestAssistantMessage(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.turnId) return message;
  }
  return null;
}

/**
 * The newest turn with no live one: the newest of the messages' turn and the
 * saved history's (newest first). Restored messages can stop at an earlier
 * turn than the history holds; a turn the history has not saved yet is newer
 * when it started later.
 */
function latestSettledTurnId(messages: readonly ChatMessage[], history: readonly TurnHistoryEntry[] | null) {
  const message = latestAssistantMessage(messages);
  const saved = history?.[0] ?? null;
  if (!message?.turnId || !saved) return message?.turnId ?? saved?.id ?? null;
  const index = history!.findIndex((entry) => entry.id === message.turnId);
  if (index >= 0) return index === 0 ? message.turnId : saved.id;
  const savedAt = Date.parse(saved.createdAt);
  const messageAt = message.startedAt ? Date.parse(message.startedAt) : Number.NaN;
  return Number.isFinite(messageAt) && Number.isFinite(savedAt) && savedAt > messageAt ? saved.id : message.turnId;
}

function lastAssistantOfTurn(messages: readonly ChatMessage[], turnId: string | null) {
  if (!turnId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.turnId === turnId) return message;
  }
  return null;
}

/** Files one turn changed, counted once each. */
function changedFilesOfTurn(messages: readonly ChatMessage[], turnId: string | null) {
  if (!turnId) return 0;
  const files = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || message.turnId !== turnId) continue;
    for (const part of message.parts) if (part.type === "code_diff") files.add(part.filePath);
  }
  return files.size;
}

function historyEnding(entry: TurnHistoryEntry): { ending: TaskTurnEnding; error: string | null } | null {
  return entry.outcome ? { ending: entry.outcome, error: entry.outcome === "failed" ? entry.error : null } : null;
}

/**
 * The open requests a task's messages hold: the newest question (async ones
 * included) and approval anywhere, and the newest blocking question and
 * approval of the live turn, which its `pendingInteraction` hint names.
 */
export interface TaskPendingRequests {
  question: TaskPanelRequest | null;
  approval: TaskPanelRequest | null;
  liveQuestion: TaskPanelRequest | null;
  liveApproval: TaskPanelRequest | null;
}

const NO_PENDING: TaskPendingRequests = { question: null, approval: null, liveQuestion: null, liveApproval: null };

interface MessagePending {
  question: TaskPanelRequest | null;
  blockingQuestion: TaskPanelRequest | null;
  approval: TaskPanelRequest | null;
}

/** Per message: the store keeps a message's identity until it changes. */
const pendingByMessage = new WeakMap<ChatMessage, MessagePending>();

function questionRequest(messageId: string, part: UserInputPart | undefined): TaskPanelRequest | null {
  return part ? { messageId, requestId: part.requestId, text: part.questions[0]?.question ?? "" } : null;
}

function pendingOfMessage(message: ChatMessage): MessagePending {
  const known = pendingByMessage.get(message);
  if (known) return known;
  const approval = findLatestPendingApprovalPart({ message });
  const pending: MessagePending = {
    question: questionRequest(message.id, findLatestPendingUserInputPart({ message })),
    blockingQuestion: questionRequest(message.id, findLatestPendingUserInputPart({ message, blockingOnly: true })),
    approval: approval
      ? { messageId: message.id, requestId: approval.requestId, text: approval.description || approval.toolName }
      : null,
  };
  pendingByMessage.set(message, pending);
  return pending;
}

/** The open requests, newest first, as `findTaskPendingDecision` reads them. */
export function findTaskPendingRequests(messages: readonly ChatMessage[], liveTurnId: string | null): TaskPendingRequests {
  let found: TaskPendingRequests | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const pending = pendingOfMessage(message);
    if (!pending.question && !pending.approval) continue;
    found ??= { ...NO_PENDING };
    found.question ??= pending.question;
    found.approval ??= pending.approval;
    if (liveTurnId && message.turnId === liveTurnId) {
      found.liveQuestion ??= pending.blockingQuestion;
      found.liveApproval ??= pending.approval;
    }
  }
  return found ?? NO_PENDING;
}

const keyByMessages = new WeakMap<readonly ChatMessage[], { liveTurnId: string | null; key: string }>();

/**
 * The open requests as one string, for a store selector: a streaming turn's
 * text deltas leave it equal, so the panel does not re-render on them. Read
 * once per messages array (the store replaces it on change), and each message
 * once per identity, so only the message that changed is read again.
 */
export function taskPendingRequestsKey(messages: readonly ChatMessage[], liveTurnId: string | null): string {
  const known = keyByMessages.get(messages);
  if (known && known.liveTurnId === liveTurnId) return known.key;
  const pending = findTaskPendingRequests(messages, liveTurnId);
  const key = pending === NO_PENDING ? "" : JSON.stringify(pending);
  keyByMessages.set(messages, { liveTurnId, key });
  return key;
}

export function parseTaskPendingRequests(key: string): TaskPendingRequests {
  return key ? (JSON.parse(key) as TaskPendingRequests) : NO_PENDING;
}

/**
 * What the live turn is doing now, in its running step's own words ("Run
 * command · bun test"), from the activity it reported; null when no step runs.
 */
export function describeTaskActivityNow(
  activity: ProviderTurnActivitySnapshot | null | undefined,
  liveTurnId: string | null,
): string | null {
  if (!activity || !liveTurnId || activity.turnId !== liveTurnId || activity.completedAt != null) return null;
  let current: ProviderTurnWorkItem | null = null;
  for (const id of activity.orderedWorkItemIds) {
    const item = activity.workItemsById[id];
    if (item?.status === "running" && (!current || item.updatedAt >= current.updatedAt)) current = item;
  }
  if (!current) return null;
  const detail = current.detail?.trim();
  return detail ? i18n.t("fleet:taskActivity.withDetail", { label: current.title, detail }) : current.title;
}

/**
 * The request the state waits on: the live turn's own prompt when its hint
 * names one, else the open card of the same kind, so the words and the jump
 * target always belong to the state shown.
 */
function requestOfStatus(status: TaskUserStatus | null, pending: TaskPendingRequests): TaskPanelRequest | null {
  if (status?.state !== "waiting") return null;
  if (status.waitingOn === "approval") return pending.liveApproval ?? pending.approval;
  if (status.waitingOn === "question") return pending.liveQuestion ?? pending.question;
  return null;
}

/**
 * The facts of the turn the panel follows, handed to the one status function
 * (`resolveTaskUserState`). The current view adds the live turn, the open
 * request, the agent run and the workspace's pull request; a past turn has
 * only how it ended and what it produced. A turn's saved record decides how
 * it ended when the history has it, so the state and the record in Details
 * never disagree.
 */
export function buildTaskPanelStatus(args: {
  messages: ChatMessage[];
  liveTurnId: string | null;
  activity: ProviderTurnActivitySnapshot | null;
  retained: RetainedTurnActivity | null;
  history: readonly TurnHistoryEntry[] | null;
  agentRun: AgentRunDetail | undefined;
  prInfo: WorkspacePrInfo | undefined;
  selectedTurnId: string | null;
  now: number;
  /** The open requests (`findTaskPendingRequests`); read from `messages` when absent. */
  pending?: TaskPendingRequests;
  /** The live turn's prompt hint; read from `activity` when absent. */
  livePending?: ProviderTurnPendingInteraction | null;
}): TaskPanelStatus {
  const { messages, history } = args;
  const currentTurnId = args.liveTurnId ?? latestSettledTurnId(messages, history);
  const past = args.selectedTurnId && args.selectedTurnId !== currentTurnId ? args.selectedTurnId : null;
  const turnId = past ?? currentTurnId;
  const entry = turnId ? history?.find((turn) => turn.id === turnId) ?? null : null;
  // The live turn has not ended and shows no result: nothing in its messages
  // is read while it streams.
  const live = turnId !== null && turnId === args.liveTurnId;
  const message = live ? null : lastAssistantOfTurn(messages, turnId);
  // Without a saved record, the turn's own message (and its retained or live
  // snapshot) tells how it ended, for a past turn too.
  const ending = live ? null : (entry ? historyEnding(entry) : null) ?? resolveTurnEnding({
    message,
    retained: args.retained?.snapshot.turnId === turnId ? args.retained : null,
    activity: args.activity?.turnId === turnId ? args.activity : null,
  });
  const lastTurn = ending
    ? { ...ending, endedAt: entry?.completedAt ?? message?.completedAt ?? null }
    : null;
  const turnResult: TaskResult = {
    pullRequest: null,
    changedFiles: live ? 0 : changedFilesOfTurn(messages, turnId),
    answerMessageId: message?.id ?? null,
  };
  if (past) {
    return {
      status: resolveTaskUserState({ liveTurn: null, pendingDecision: null, agentRun: null, lastTurn, result: turnResult }),
      turnId,
      pastTurnAt: entry?.createdAt ?? message?.startedAt ?? null,
      request: null,
      remaining: [],
      focusDetails: false,
      reviewStage: null,
    };
  }
  const pending = args.pending ?? findTaskPendingRequests(messages, args.liveTurnId);
  // A question first, as `findTaskPendingDecision` reads it.
  const decision = pending.question ? "question" : pending.approval ? "approval" : null;
  const run = args.agentRun ? describeAgentRunResult(args.agentRun, args.now, decision) : null;
  const pr = args.prInfo?.pr ?? null;
  // The run's count is its report stage's diff: Review opens that stage, so
  // the number and the files shown agree. Without one, the turn's own edits.
  const reviewStage = run?.changes && args.agentRun ? agentRunChangesStage(args.agentRun) : null;
  const facts: TaskStateFacts = {
    liveTurn: args.liveTurnId
      ? {
          pendingInteraction: args.livePending !== undefined
            ? args.livePending
            : args.activity?.turnId === args.liveTurnId ? (args.activity.pendingInteraction ?? null) : null,
        }
      : null,
    pendingDecision: decision,
    agentRun: run && args.agentRun
      ? { badge: run.status.badge, waiting: run.status.waiting, reason: run.status.reason, updatedAt: args.agentRun.agentRun.updatedAt }
      : null,
    lastTurn,
    result: {
      pullRequest: run?.pullRequest ?? (pr ? { url: pr.url, number: pr.number, title: pr.title } : null),
      changedFiles: reviewStage && run?.changes ? run.changes.files : turnResult.changedFiles,
      answerMessageId: turnResult.answerMessageId,
    },
  };
  const status = resolveTaskUserState(facts);
  const stoppedByUser = lastTurn?.ending === "cancelled" || args.agentRun?.agentRun.state === "cancelled";
  return {
    status,
    turnId,
    pastTurnAt: null,
    focusDetails: status?.state === "stopped" && !stoppedByUser,
    reviewStage,
    request: requestOfStatus(status, pending),
    remaining: run?.doneWhen.filter((line) => line.status === "unmet" || line.status === "unverified") ?? [],
  };
}
