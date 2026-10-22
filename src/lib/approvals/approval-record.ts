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

/**
 * Where one request stands in the record. A decision says who made it: you,
 * a Stave rule (trusted tools, autonomous mode, a timeout, ...) or the
 * provider's own permission mode.
 */
export type ApprovalStanding =
  | "allowed-by-you"
  | "denied-by-you"
  | "allowed-by-rule"
  | "denied-by-rule"
  | "allowed-by-provider"
  | "denied-by-provider"
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
  switch (part.resolution.source) {
    case "user": return allowed ? "allowed-by-you" : "denied-by-you";
    case "rule": return allowed ? "allowed-by-rule" : "denied-by-rule";
    case "provider-auto": return allowed ? "allowed-by-provider" : "denied-by-provider";
  }
}

/** How settled a part is: a decision with its decider beats one without, which beats an open or withdrawn request. */
function settledness(part: ApprovalPart): number {
  if (part.state === "approval-requested" || part.state === "approval-interrupted") return 0;
  return part.resolution ? 2 : 1;
}

function firstLine(value: string): string | undefined {
  return boundApprovalRecordInput(value.split("\n").find((line) => line.trim()));
}

function toEntry(message: ChatMessage, part: ApprovalPart): ApprovalRecordEntry {
  const target = boundApprovalRecordInput(part.input) ?? firstLine(part.description);
  const decision = part.state === "approval-responded" ? "allowed" : part.state === "output-denied" ? "denied" : undefined;
  return {
    id: `${message.id}:${part.requestId}`,
    messageId: message.id,
    ...(message.turnId ? { turnId: message.turnId } : {}),
    toolName: part.toolName,
    ...(target ? { target } : {}),
    standing: approvalStanding(part),
    ...(decision ? { decision } : {}),
    ...(part.resolution ? { resolution: part.resolution } : {}),
    prompted: part.prompted !== false,
  };
}

/**
 * The approval requests in these messages, in the order they were asked, one
 * per request: a request delivered twice in a turn (a re-sent event, a row
 * split) is one entry, its most settled part.
 */
export function collectApprovalRecord(messages: readonly ChatMessage[]): ApprovalRecordEntry[] {
  const kept = new Map<string, { index: number; part: ApprovalPart }>();
  const entries: ApprovalRecordEntry[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "approval") continue;
      const key = `${message.turnId ?? message.id}:${part.requestId}`;
      const previous = kept.get(key);
      if (!previous) {
        kept.set(key, { index: entries.length, part });
        entries.push(toEntry(message, part));
      } else if (settledness(part) > settledness(previous.part)) {
        kept.set(key, { index: previous.index, part });
        entries[previous.index] = toEntry(message, part);
      }
    }
  }
  return entries;
}

/** Counts per standing, plus the decisions made without a person (rule and provider) and the total. */
export type ApprovalRecordSummary = Record<ApprovalStanding, number> & { automatic: number; total: number };

/** How many requests stand each way; who decided kept apart. */
export function summarizeApprovalRecord(entries: readonly ApprovalRecordEntry[]): ApprovalRecordSummary {
  const summary: ApprovalRecordSummary = {
    "allowed-by-you": 0,
    "denied-by-you": 0,
    "allowed-by-rule": 0,
    "denied-by-rule": 0,
    "allowed-by-provider": 0,
    "denied-by-provider": 0,
    waiting: 0,
    withdrawn: 0,
    unrecorded: 0,
    automatic: 0,
    total: entries.length,
  };
  for (const entry of entries) {
    summary[entry.standing] += 1;
    if (entry.resolution && entry.resolution.source !== "user" && entry.decision) summary.automatic += 1;
  }
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
