import type { ApprovalPart, ChatMessage, MessagePart } from "@/types/chat";
import { boundApprovalRecordInput, type ApprovalDecision, type ApprovalResolution, type ApprovalResolvedEvent } from "./approval-resolution";

/**
 * Record a decision made without a person (`approval_resolved`) on the
 * request's approval part. A request shown as a card takes the decision (it
 * timed out); one nobody was asked gets an unprompted part kept for the
 * record. A decision already recorded, or a request no longer pending, stands.
 */
export function recordAutomaticApprovalDecision(parts: MessagePart[], event: ApprovalResolvedEvent): MessagePart[] {
  const resolution: ApprovalResolution = {
    decision: event.decision,
    source: event.source,
    decidedAt: event.decidedAt,
    ...(event.reason ? { reason: event.reason } : {}),
  };
  const state = event.decision === "allowed" ? "approval-responded" : "output-denied";
  const index = parts.findIndex((part) => part.type === "approval" && part.requestId === event.requestId);
  if (index >= 0) {
    const shown = parts[index] as ApprovalPart;
    if (shown.state !== "approval-requested" || shown.resolution) return parts;
    const next = [...parts];
    next[index] = { ...shown, state, resolution };
    return next;
  }
  const input = boundApprovalRecordInput(event.input);
  return [...parts, {
    type: "approval",
    toolName: event.toolName,
    description: "",
    ...(input ? { input } : {}),
    requestId: event.requestId,
    state,
    resolution,
    prompted: false,
  }];
}

/** Where one request stands in the record. */
export type ApprovalStanding =
  | "allowed-by-you"
  | "denied-by-you"
  | "allowed-automatically"
  | "denied-automatically"
  | "waiting"
  | "withdrawn"
  /** Answered, but who decided was not recorded (older parts, or decided outside Stave). */
  | "unrecorded";

export interface ApprovalRecordEntry {
  /** Stable within a task: the message and the request. */
  id: string;
  messageId: string;
  turnId?: string;
  toolName: string;
  /** One line: the command, path or the request's first line, when there is one. */
  target?: string;
  standing: ApprovalStanding;
  /** What was decided, as the request's card shows it; absent while waiting or withdrawn. */
  decision?: ApprovalDecision;
  resolution?: ApprovalResolution;
  prompted: boolean;
}

export function approvalStanding(part: Pick<ApprovalPart, "state" | "resolution">): ApprovalStanding {
  if (part.state === "approval-requested") return "waiting";
  if (part.state === "approval-interrupted") return "withdrawn";
  if (!part.resolution) return "unrecorded";
  // The state is what the card shows; the resolution says who decided it.
  const allowed = part.state === "approval-responded";
  if (part.resolution.source === "user") return allowed ? "allowed-by-you" : "denied-by-you";
  return allowed ? "allowed-automatically" : "denied-automatically";
}

function firstLine(value: string): string | undefined {
  return boundApprovalRecordInput(value.split("\n").find((line) => line.trim()));
}

/** The approval requests in these messages, in the order they were asked. */
export function collectApprovalRecord(messages: readonly ChatMessage[]): ApprovalRecordEntry[] {
  const entries: ApprovalRecordEntry[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "approval") continue;
      const target = boundApprovalRecordInput(part.input) ?? firstLine(part.description);
      const decision = part.state === "approval-responded" ? "allowed" : part.state === "output-denied" ? "denied" : undefined;
      entries.push({
        id: `${message.id}:${part.requestId}`,
        messageId: message.id,
        ...(message.turnId ? { turnId: message.turnId } : {}),
        toolName: part.toolName,
        ...(target ? { target } : {}),
        standing: approvalStanding(part),
        ...(decision ? { decision } : {}),
        ...(part.resolution ? { resolution: part.resolution } : {}),
        prompted: part.prompted !== false,
      });
    }
  }
  return entries;
}

export type ApprovalRecordSummary = Record<ApprovalStanding, number> & { total: number };

/** How many requests stand each way; a person's decisions apart from automatic ones. */
export function summarizeApprovalRecord(entries: readonly ApprovalRecordEntry[]): ApprovalRecordSummary {
  const summary: ApprovalRecordSummary = {
    "allowed-by-you": 0,
    "denied-by-you": 0,
    "allowed-automatically": 0,
    "denied-automatically": 0,
    waiting: 0,
    withdrawn: 0,
    unrecorded: 0,
    total: entries.length,
  };
  for (const entry of entries) summary[entry.standing] += 1;
  return summary;
}

/**
 * The messages a stage ran in: those of its task that started while the
 * stage did. A stage that has not ended takes everything since it started.
 */
export function messagesInWindow(
  messages: readonly ChatMessage[],
  window: { startedAt: string; endedAt: string | null },
): ChatMessage[] {
  const start = Date.parse(window.startedAt);
  const end = window.endedAt ? Date.parse(window.endedAt) : Number.POSITIVE_INFINITY;
  return messages.filter((message) => {
    const at = message.startedAt ? Date.parse(message.startedAt) : Number.NaN;
    return at >= start && at <= end;
  });
}
