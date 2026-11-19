import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  describeAgentRunResult,
  type AgentRunDoneWhenLine,
} from "@/lib/agent-runs/agent-run-status";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import type { TurnHistoryEntry } from "@/lib/providers/turn-history";
import type { ProviderTurnActivitySnapshot, RetainedTurnActivity } from "@/lib/providers/turn-status";
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
}

function latestAssistantTurnId(messages: readonly ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.turnId) return message.turnId;
  }
  return null;
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
}): TaskPanelStatus {
  const { messages, history } = args;
  const currentTurnId = args.liveTurnId ?? latestAssistantTurnId(messages) ?? history?.[0]?.id ?? null;
  const past = args.selectedTurnId && args.selectedTurnId !== currentTurnId ? args.selectedTurnId : null;
  const turnId = past ?? currentTurnId;
  const entry = turnId ? history?.find((turn) => turn.id === turnId) ?? null : null;
  const message = lastAssistantOfTurn(messages, turnId);
  const ending = (entry ? historyEnding(entry) : null) ?? (past
    ? null
    : resolveTurnEnding({
        message,
        retained: args.retained?.snapshot.turnId === turnId ? args.retained : null,
        activity: args.activity?.turnId === turnId ? args.activity : null,
      }));
  const lastTurn = ending && !(turnId === args.liveTurnId)
    ? { ...ending, endedAt: entry?.completedAt ?? message?.completedAt ?? null }
    : null;
  const turnResult: TaskResult = {
    pullRequest: null,
    changedFiles: changedFilesOfTurn(messages, turnId),
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
    };
  }
  const pending = args.pending ?? findTaskPendingRequests(messages, args.liveTurnId);
  // A question first, as `findTaskPendingDecision` reads it.
  const decision = pending.question ? "question" : pending.approval ? "approval" : null;
  const run = args.agentRun ? describeAgentRunResult(args.agentRun, args.now, decision) : null;
  const pr = args.prInfo?.pr ?? null;
  const facts: TaskStateFacts = {
    liveTurn: args.liveTurnId
      ? { pendingInteraction: args.activity?.turnId === args.liveTurnId ? (args.activity.pendingInteraction ?? null) : null }
      : null,
    pendingDecision: decision,
    agentRun: run && args.agentRun
      ? { badge: run.status.badge, waiting: run.status.waiting, reason: run.status.reason, updatedAt: args.agentRun.agentRun.updatedAt }
      : null,
    lastTurn,
    result: {
      pullRequest: run?.pullRequest ?? (pr ? { url: pr.url, number: pr.number, title: pr.title } : null),
      changedFiles: run?.changes?.files ?? turnResult.changedFiles,
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
    request: requestOfStatus(status, pending),
    remaining: run?.doneWhen.filter((line) => line.status === "unmet" || line.status === "unverified") ?? [],
  };
}
