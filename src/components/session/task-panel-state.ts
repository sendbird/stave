import type { AgentRunDetail } from "@/lib/agent-runs/api";
import {
  agentRunDecisionOfMessages,
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
import { findLatestPendingApproval, findLatestPendingUserInput } from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";

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

function findRequest(messages: ChatMessage[]): TaskPanelRequest | null {
  const question = findLatestPendingUserInput({ messages });
  if (question) {
    return {
      messageId: question.messageId,
      requestId: question.part.requestId,
      text: question.part.questions[0]?.question ?? "",
    };
  }
  const approval = findLatestPendingApproval({ messages });
  if (approval) {
    return {
      messageId: approval.messageId,
      requestId: approval.part.requestId,
      text: approval.part.description || approval.part.toolName,
    };
  }
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
  const decision = agentRunDecisionOfMessages(messages);
  const run = args.agentRun ? describeAgentRunResult(args.agentRun, args.now, decision) : null;
  const pr = args.prInfo?.pr ?? null;
  const facts: TaskStateFacts = {
    liveTurn: args.liveTurnId
      ? { pendingInteraction: args.activity?.turnId === args.liveTurnId ? (args.activity.pendingInteraction ?? null) : null }
      : null,
    pendingDecision: decision,
    agentRun: run && args.agentRun
      ? { badge: run.status.badge, reason: run.status.reason, updatedAt: args.agentRun.agentRun.updatedAt }
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
    request: decision ? findRequest(messages) : null,
    remaining: run?.doneWhen.filter((line) => line.status === "unmet" || line.status === "unverified") ?? [],
  };
}
