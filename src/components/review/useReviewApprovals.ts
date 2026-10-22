import { useMemo } from "react";
import { useAsync, type AsyncState } from "@/components/ads/utils/async";
import { useRunTurnMessages } from "@/components/session/RunTurnDialog";
import { collectApprovalRecord, messagesInWindow, type ApprovalRecordEntry } from "@/lib/approvals/approval-record";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { RUN_TURN_MAX_PAGES, RUN_TURN_PAGE_SIZE } from "@/lib/reviews/run-turn";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

/** A scope's approval requests; null when the reviewed turn is no longer in the saved history. */
export type ReviewApprovals = ApprovalRecordEntry[] | null;

const NO_MESSAGES: readonly ChatMessage[] = [];

/** The approvals of a turn as its messages read (`useRunTurnMessages`). */
export function approvalsFromRunTurn(
  run: { status: "loading" } | { status: "missing" } | { status: "failed"; message: string } | { status: "ready"; messages: readonly ChatMessage[] },
): AsyncState<ReviewApprovals> {
  if (run.status === "loading") return { status: "pending" };
  if (run.status === "failed") return { status: "error", error: new Error(run.message) };
  if (run.status === "missing") return { status: "ready", data: null };
  return { status: "ready", data: collectApprovalRecord(run.messages) };
}

/** A turn's approvals: from the open conversation when it holds the turn, else read from saved history. */
export function useTurnApprovals(args: { workspaceId: string; taskId: string; turnId: string }) {
  const run = useRunTurnMessages(args);
  const messages = run.status === "ready" ? run.messages : null;
  const failure = run.status === "failed" ? run.message : null;
  const state = useMemo(
    () => approvalsFromRunTurn(failure !== null ? { status: "failed", message: failure } : messages ? { status: "ready", messages } : { status: run.status === "missing" ? "missing" : "loading" }),
    [failure, messages, run.status],
  );
  return { state, refresh: run.retry };
}

/**
 * The approvals of the messages that started inside a window (a stage): the
 * open conversation's window when it reaches back to the start, else saved
 * history read newest page first until it does.
 */
export function useWindowApprovals(args: { workspaceId: string; taskId: string; window: { startedAt: string; endedAt: string | null } | null }) {
  const { workspaceId, taskId, window: span } = args;
  const resident = useAppStore((state) => (state.activeWorkspaceId === workspaceId ? (state.messagesByTask[taskId] ?? NO_MESSAGES) : NO_MESSAGES));
  const total = useAppStore((state) => (state.activeWorkspaceId === workspaceId ? state.messageCountByTask[taskId] : undefined));
  const since = span ? Date.parse(span.startedAt) : Number.NaN;
  const oldest = resident[0]?.startedAt ? Date.parse(resident[0].startedAt) : Number.NaN;
  const covered = !span || (total !== undefined && resident.length >= total) || oldest <= since;
  const loaded = useAsync(async (): Promise<readonly ChatMessage[] | null> => {
    if (covered || !span) return null;
    let messages: ChatMessage[] = [];
    let offset = 0;
    for (let page = 0; page < RUN_TURN_MAX_PAGES; page += 1) {
      const result = await loadTaskMessagesPage({ workspaceId, taskId, limit: RUN_TURN_PAGE_SIZE, offset });
      messages = [...result.messages, ...messages];
      const first = result.messages[0]?.startedAt;
      if (!result.hasMoreOlder || result.messages.length === 0 || (first && Date.parse(first) <= since)) break;
      offset += result.messages.length;
    }
    return messages;
  }, [covered, workspaceId, taskId, span?.startedAt]);
  const state = useMemo((): AsyncState<ReviewApprovals> => {
    if (!span) return { status: "ready", data: [] };
    if (covered) return { status: "ready", data: windowApprovals({ saved: null, resident, window: span }) };
    if (loaded.state.status !== "ready") return loaded.state;
    return { status: "ready", data: windowApprovals({ saved: loaded.state.data ?? NO_MESSAGES, resident, window: span }) };
  }, [covered, loaded.state, resident, span]);
  return { state, refresh: loaded.refresh };
}

/**
 * Saved history joined with the open conversation, oldest first, one copy per
 * message: the conversation's copy wins, because it is the newest (a request
 * answered since the read), and its messages the read did not have follow.
 */
function mergeByMessageId(saved: readonly ChatMessage[], resident: readonly ChatMessage[]): ChatMessage[] {
  const newest = new Map(resident.map((message) => [message.id, message]));
  const merged = saved.map((message) => newest.get(message.id) ?? message);
  const seen = new Set(saved.map((message) => message.id));
  return [...merged, ...resident.filter((message) => !seen.has(message.id))];
}

/**
 * The approvals of the messages that started inside a window. `saved` is the
 * history read back to the window's start when the open conversation does
 * not reach it (null when it does); the open conversation is joined to it, so
 * requests that arrive or are answered after the read count too.
 */
export function windowApprovals(args: {
  saved: readonly ChatMessage[] | null;
  resident: readonly ChatMessage[];
  window: { startedAt: string; endedAt: string | null };
}): ApprovalRecordEntry[] {
  const messages = args.saved ? mergeByMessageId(args.saved, args.resident) : args.resident;
  return collectApprovalRecord(messagesInWindow(messages, args.window));
}

/** The approvals of the whole task, from the messages the conversation has loaded. */
export function useTaskApprovals(taskId: string): AsyncState<ReviewApprovals> {
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  return useMemo(() => ({ status: "ready", data: collectApprovalRecord(messages) }), [messages]);
}
