import type { FleetAttentionItem, FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { classifyProviderTurnStopReason } from "@/lib/providers/turn-stop-reason";
import type { TaskHandoffRecord } from "@/lib/task-context/handoff-record";
import type { ChatMessage } from "@/types/chat";

/**
 * The summary a task shows when you come back to it: the last decision, what
 * changed while you were away, why it stopped and what to do next, each with
 * the place it comes from. It is read from what Stave already holds (the
 * loaded conversation, the handoff record, Fleet's attention items); nothing
 * is stored for it.
 */

/** Away this long, a task you come back to shows its summary. */
export const RETURN_AWAY_MS = 15 * 60 * 1000;

export type ReturnDecision =
  | { kind: "record"; text: string; at: string | null }
  | { kind: "approval"; toolName: string; description: string; approved: boolean; at: string | null }
  | { kind: "answer"; question: string; answer: string; at: string | null };

export interface ReturnChanges {
  /** Turns that finished after the visit. */
  turns: number;
  /** Files the agent changed after the visit. */
  files: number;
  /** Tool calls the agent made after the visit. */
  steps: number;
}

export type ReturnStop =
  | { kind: "need"; need: FleetAttentionKind; since: string | null; detail: string | null }
  | { kind: "running" }
  | { kind: "finished" | "failed" | "stopped"; at: string | null }
  | { kind: "none" };

export type ReturnNext =
  | { kind: "answer" }
  | { kind: "review" }
  | { kind: "inspect-failure" }
  | { kind: "check-stall" }
  | { kind: "open-run" }
  | { kind: "remaining"; text: string }
  | { kind: "wait" }
  | { kind: "continue" };

export interface ReturnSummary {
  decision: ReturnDecision | null;
  changes: ReturnChanges;
  stop: ReturnStop;
  next: ReturnNext;
}

function messageTime(message: ChatMessage) {
  return message.completedAt ?? message.startedAt ?? null;
}

function lastListLine(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  return lines.at(-1) ?? null;
}

function firstListLine(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  return lines[0] ?? null;
}

/**
 * The task's last decision: the newest line of the handoff record's approved
 * decisions when it has them, else the newest approval or answer you gave in
 * the loaded conversation.
 */
export function findLastDecision(
  messages: readonly ChatMessage[],
  record: TaskHandoffRecord | null,
): ReturnDecision | null {
  const decisions = record?.sections.decisions;
  const recorded = decisions?.text ? lastListLine(decisions.text) : null;
  if (recorded) {
    return { kind: "record", text: recorded, at: decisions?.updatedAt ?? null };
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (part?.type === "approval" && (part.state === "approval-responded" || part.state === "output-denied")) {
        return {
          kind: "approval",
          toolName: part.toolName,
          description: part.description.trim().split("\n")[0] ?? "",
          approved: part.state === "approval-responded",
          at: messageTime(message),
        };
      }
      if (part?.type === "user_input" && part.state === "input-responded" && part.answers) {
        const question = part.questions[0];
        const answer = question ? part.answers[question.key ?? question.question] ?? Object.values(part.answers)[0] : undefined;
        if (question && answer) {
          return { kind: "answer", question: question.question, answer, at: messageTime(message) };
        }
      }
    }
  }
  return null;
}

/** What the agent did after `since`, from the loaded conversation. */
export function countChangesSince(messages: readonly ChatMessage[], since: string): ReturnChanges {
  const sinceMs = Date.parse(since);
  const turns = new Set<string>();
  const files = new Set<string>();
  let steps = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const at = Date.parse(message.completedAt ?? message.startedAt ?? "");
    if (!Number.isFinite(at) || at <= sinceMs) continue;
    if (message.completedAt && !message.isStreaming) turns.add(message.turnId ?? message.id);
    for (const part of message.parts) {
      if (part.type === "code_diff") files.add(part.filePath);
      else if (part.type === "tool_use" && !part.ownerAgentId && !part.parentToolUseId) steps += 1;
    }
  }
  return { turns: turns.size, files: files.size, steps };
}

function resolveStop(args: {
  messages: readonly ChatMessage[];
  need: FleetAttentionItem | null;
  running: boolean;
}): ReturnStop {
  if (args.need) {
    return {
      kind: "need",
      need: args.need.kind,
      since: args.need.waitingSince ?? null,
      detail: args.need.detail?.trim() || null,
    };
  }
  if (args.running) return { kind: "running" };
  const reply = [...args.messages].reverse().find((message) => message.role === "assistant" && !message.isStreaming);
  if (!reply) return { kind: "none" };
  const outcome = classifyProviderTurnStopReason(reply.terminalStopReason);
  return {
    kind: outcome === "failed" ? "failed" : outcome === "cancelled" ? "stopped" : "finished",
    at: messageTime(reply),
  };
}

function resolveNext(stop: ReturnStop, record: TaskHandoffRecord | null): ReturnNext {
  if (stop.kind === "need") {
    switch (stop.need) {
      case "approval":
      case "user-input":
        return { kind: "answer" };
      case "result-ready":
        return { kind: "review" };
      case "run-failed":
        return { kind: "inspect-failure" };
      case "turn-stalled":
        return { kind: "check-stall" };
      case "agent-run-sign-off":
      case "agent-run-blocked":
      case "agent-run-stuck":
        return { kind: "open-run" };
      default:
        break;
    }
  }
  if (stop.kind === "failed") return { kind: "inspect-failure" };
  const remaining = record?.sections.remaining?.text ? firstListLine(record.sections.remaining.text) : null;
  if (remaining) return { kind: "remaining", text: remaining };
  if (stop.kind === "running") return { kind: "wait" };
  return { kind: "continue" };
}

export function buildReturnSummary(args: {
  messages: readonly ChatMessage[];
  record: TaskHandoffRecord | null;
  /** The task's most urgent Fleet attention item, if any. */
  need: FleetAttentionItem | null;
  running: boolean;
  since: string;
}): ReturnSummary {
  const stop = resolveStop(args);
  return {
    decision: findLastDecision(args.messages, args.record),
    changes: countChangesSince(args.messages, args.since),
    stop,
    next: resolveNext(stop, args.record),
  };
}

/**
 * When you last were at the task: the time you left it during this app
 * session, else your last message in it. Null when neither is known.
 */
export function resolveLastVisit(args: {
  messages: readonly ChatMessage[];
  leftAt: string | null;
}): { at: string; kind: "visit" | "message" } | null {
  if (args.leftAt) return { at: args.leftAt, kind: "visit" };
  for (let index = args.messages.length - 1; index >= 0; index -= 1) {
    const message = args.messages[index];
    if (message?.role === "user" && message.startedAt) return { at: message.startedAt, kind: "message" };
  }
  return null;
}

/** Whether coming back now, after the last visit, is a return worth a summary. */
export function isReturn(args: { lastVisitAt: string; now: number }) {
  const at = Date.parse(args.lastVisitAt);
  return Number.isFinite(at) && args.now - at >= RETURN_AWAY_MS;
}

/** Whether the summary has anything to say: something happened, or the task waits on you. */
export function hasReturnNews(summary: ReturnSummary) {
  return (
    summary.changes.turns > 0 ||
    summary.changes.files > 0 ||
    summary.changes.steps > 0 ||
    summary.stop.kind === "need"
  );
}
