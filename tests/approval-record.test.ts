import { describe, expect, test } from "bun:test";
import {
  buildClaudeApprovalDecisionEvent,
  CLAUDE_HANDOFF_ALLOW_DECIDERS,
} from "../electron/providers/claude-permission-handoff";
import { buildAssistantTrace } from "@/components/session/message/assistant-trace-builder";
import {
  collectApprovalRecord,
  messagesInWindow,
  recordAutomaticApprovalDecision,
  summarizeApprovalRecord,
} from "@/lib/approvals/approval-record";
import {
  APPROVAL_RECORD_INPUT_MAX_CHARS,
  buildApprovalResolution,
  type ApprovalResolvedEvent,
} from "@/lib/approvals/approval-resolution";
import { toCanonicalConversationMessage } from "@/lib/providers/canonical-request";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import {
  applyProviderTurnActivityEvents,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";
import { appendProviderEventToAssistant } from "@/lib/session/provider-event-replay";
import { hasRenderableAssistantContent, updateApprovalPartsByRequestId } from "@/store/provider-message.utils";
import type { ApprovalPart, ChatMessage, MessagePart } from "@/types/chat";

const AT = "2026-10-22T09:00:00.000Z";

function message(parts: MessagePart[], overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m-1", role: "assistant", model: "claude-opus", providerId: "claude-code", content: "", turnId: "turn-1", parts, ...overrides };
}

function resolved(overrides: Partial<ApprovalResolvedEvent> = {}): ApprovalResolvedEvent {
  return { type: "approval_resolved", requestId: "call-1", toolName: "Bash", input: "bun test", decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT, ...overrides };
}

const shown = (requestId: string, state: ApprovalPart["state"] = "approval-requested"): ApprovalPart => ({
  type: "approval", toolName: "Bash", description: "Run the tests\nInput: {}", input: "bun test", requestId, state,
});

function approvals(target: ChatMessage): ApprovalPart[] {
  return target.parts.filter((part): part is ApprovalPart => part.type === "approval");
}

describe("approval_resolved event", () => {
  test("parses as a normalized provider event; a person's answer is never one", () => {
    expect(NormalizedProviderEventSchema.safeParse(resolved()).success).toBe(true);
    expect(NormalizedProviderEventSchema.safeParse(resolved({ reason: undefined, input: undefined })).success).toBe(true);
    expect(NormalizedProviderEventSchema.safeParse({ ...resolved(), source: "user" }).success).toBe(false);
    expect(NormalizedProviderEventSchema.safeParse({ ...resolved(), decision: "maybe" }).success).toBe(false);
  });

  test("Claude records who allowed a call it never asked about, with the command in one bounded line", () => {
    const now = new Date(AT);
    expect(CLAUDE_HANDOFF_ALLOW_DECIDERS).toEqual({
      "permission-mode": { source: "provider-auto", reason: "permission-mode" },
      autonomy: { source: "rule", reason: "autonomy" },
      trusted: { source: "rule", reason: "trusted-tool" },
    });
    const event = buildClaudeApprovalDecisionEvent({
      requestId: "toolu_1", toolName: "Bash", input: { command: `  bun   test\n${"x".repeat(400)}`, description: "Run" },
      decision: "allowed", decider: CLAUDE_HANDOFF_ALLOW_DECIDERS.autonomy, now,
    });
    expect(event).toMatchObject({ type: "approval_resolved", requestId: "toolu_1", toolName: "Bash", decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT });
    expect(event.input?.startsWith("bun test x")).toBe(true);
    expect(event.input?.length).toBe(APPROVAL_RECORD_INPUT_MAX_CHARS);
    expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
    const edit = buildClaudeApprovalDecisionEvent({
      requestId: "toolu_2", toolName: "Edit", input: { file_path: "src/a.ts", old_string: "a" },
      decision: "denied", decider: { source: "provider-auto", reason: "permission-mode" }, now,
    });
    expect(edit).toMatchObject({ input: "src/a.ts", decision: "denied", source: "provider-auto" });
    expect(buildClaudeApprovalDecisionEvent({ requestId: "t", toolName: "Task", input: {}, decision: "allowed", decider: CLAUDE_HANDOFF_ALLOW_DECIDERS.trusted, now }).input).toBeUndefined();
  });
});

describe("replaying decisions into approval parts", () => {
  test("a request nobody was asked becomes an unprompted part kept for the record only", () => {
    const next = appendProviderEventToAssistant({ message: message([]), event: resolved() });
    expect(approvals(next)).toEqual([{
      type: "approval", toolName: "Bash", description: "", input: "bun test", requestId: "call-1", state: "approval-responded",
      resolution: { decision: "allowed", source: "rule", reason: "autonomy", decidedAt: AT }, prompted: false,
    }]);
    // Not shown: no trace row, not part of the conversation sent to a provider, and not content.
    expect(buildAssistantTrace({ message: next }).entries.some((entry) => entry.kind === "approval")).toBe(false);
    expect(toCanonicalConversationMessage({ message: next }).parts).toEqual([]);
    expect(hasRenderableAssistantContent({ message: next })).toBe(false);
  });

  test("a shown request that timed out is recorded as denied, and the denied call's result does not flip it", () => {
    let next = appendProviderEventToAssistant({ message: message([]), event: { type: "approval", toolName: "Bash", requestId: "call-1", description: "Run the tests", input: "bun test" } });
    next = appendProviderEventToAssistant({ message: next, event: resolved({ decision: "denied", reason: "timeout" }) });
    next = appendProviderEventToAssistant({ message: next, event: { type: "tool_result", tool_use_id: "call-1", output: "Permission denied", isError: true } });
    const [part] = approvals(next);
    expect(approvals(next)).toHaveLength(1);
    expect(part).toMatchObject({ state: "output-denied", resolution: { decision: "denied", source: "rule", reason: "timeout" } });
    expect(part?.prompted).toBeUndefined();
    expect(buildAssistantTrace({ message: next }).entries.some((entry) => entry.kind === "approval")).toBe(true);
  });

  test("a decision a person already recorded stands", () => {
    const byYou = { ...shown("call-1", "approval-responded"), resolution: buildApprovalResolution({ approved: true, source: "user", decidedAt: Date.parse(AT), scope: "once" }) };
    expect(recordAutomaticApprovalDecision([byYou], resolved({ decision: "denied" }))).toEqual([byYou]);
    const answeredElsewhere = shown("call-1", "approval-responded");
    expect(recordAutomaticApprovalDecision([answeredElsewhere], resolved())).toEqual([answeredElsewhere]);
  });

  test("a person's answer is recorded with its grant; a rule's answer without one", () => {
    const [byYou] = updateApprovalPartsByRequestId({
      parts: [shown("call-1")], requestId: "call-1", approved: true,
      resolution: buildApprovalResolution({ approved: true, source: "user", decidedAt: Date.parse(AT), scope: "always" }),
    });
    expect(byYou).toMatchObject({ state: "approval-responded", resolution: { decision: "allowed", source: "user", scope: "always", decidedAt: AT } });
    const denial = buildApprovalResolution({ approved: false, source: "user", decidedAt: Date.parse(AT), scope: "always" });
    expect(denial).toEqual({ decision: "denied", source: "user", decidedAt: AT });
    expect(buildApprovalResolution({ approved: true, source: "rule", reason: "trusted-tool", decidedAt: Date.parse(AT) })).toEqual({ decision: "allowed", source: "rule", reason: "trusted-tool", decidedAt: AT });
  });
});

describe("the approval record", () => {
  test("counts a person's decisions apart from automatic ones in one run", () => {
    const parts: MessagePart[] = [
      { ...shown("a", "approval-responded"), resolution: { decision: "allowed", source: "user", decidedAt: AT, scope: "once" } },
      { ...shown("b", "output-denied"), resolution: { decision: "denied", source: "user", decidedAt: AT } },
      { ...shown("c", "approval-responded"), resolution: { decision: "allowed", source: "rule", reason: "trusted-tool", decidedAt: AT } },
      { ...shown("d", "approval-responded"), prompted: false, resolution: { decision: "allowed", source: "provider-auto", reason: "permission-mode", decidedAt: AT } },
      { ...shown("e", "output-denied"), resolution: { decision: "denied", source: "rule", reason: "timeout", decidedAt: AT } },
      shown("f"),
      shown("g", "approval-interrupted"),
      shown("h", "approval-responded"),
    ];
    const entries = collectApprovalRecord([message(parts)]);
    expect(entries.map((entry) => entry.standing)).toEqual([
      "allowed-by-you", "denied-by-you", "allowed-automatically", "allowed-automatically",
      "denied-automatically", "waiting", "withdrawn", "unrecorded",
    ]);
    expect(entries[3]).toMatchObject({ id: "m-1:d", turnId: "turn-1", prompted: false, target: "bun test", decision: "allowed" });
    expect(entries[5]?.decision).toBeUndefined();
    expect(summarizeApprovalRecord(entries)).toEqual({
      "allowed-by-you": 1, "denied-by-you": 1, "allowed-automatically": 2, "denied-automatically": 1,
      waiting: 1, withdrawn: 1, unrecorded: 1, total: 8,
    });
  });

  test("a request without input is described by its first line", () => {
    const [entry] = collectApprovalRecord([message([{ ...shown("a"), input: undefined, description: "\n  Edit src/a.ts  \nInput: {}" }])]);
    expect(entry?.target).toBe("Edit src/a.ts");
  });

  test("a stage covers the messages that started while it ran", () => {
    const messages = [
      message([], { id: "before", startedAt: "2026-10-22T08:59:59.000Z" }),
      message([], { id: "during", startedAt: "2026-10-22T09:30:00.000Z" }),
      message([], { id: "after", startedAt: "2026-10-22T10:00:01.000Z" }),
      message([], { id: "undated" }),
    ];
    expect(messagesInWindow(messages, { startedAt: AT, endedAt: "2026-10-22T10:00:00.000Z" }).map((item) => item.id)).toEqual(["during"]);
    expect(messagesInWindow(messages, { startedAt: AT, endedAt: null }).map((item) => item.id)).toEqual(["during", "after"]);
  });
});

describe("a shown request decided without a person stops asking", () => {
  const started = () => startProviderTurnActivity({ activityByTask: {}, taskId: "task-1", turnId: "turn-1", providerId: "claude-code", now: 1 });
  const approvalEvent = (requestId: string) => ({ type: "approval" as const, toolName: "Bash", requestId, description: "Run" });

  test("the turn reads as running again once its only request timed out", () => {
    let activity = applyProviderTurnActivityEvents({ activityByTask: started(), taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [approvalEvent("call-1")], now: 2 });
    expect(activity["task-1"]?.pendingInteraction).toBe("approval");
    activity = applyProviderTurnActivityEvents({ activityByTask: activity, taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [resolved({ decision: "denied", reason: "timeout" })], now: 3 });
    expect(activity["task-1"]?.pendingInteraction).toBeNull();
    expect(Object.values(activity["task-1"]?.workGraph.interactionsById ?? {}).every((interaction) => interaction.resolvedAt === 3)).toBe(true);
  });

  test("another request still open keeps the turn waiting", () => {
    let activity = applyProviderTurnActivityEvents({ activityByTask: started(), taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [approvalEvent("call-1"), approvalEvent("call-2")], now: 2 });
    activity = applyProviderTurnActivityEvents({ activityByTask: activity, taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [resolved({ requestId: "call-1", decision: "denied", reason: "timeout" })], now: 3 });
    expect(activity["task-1"]?.pendingInteraction).toBe("approval");
  });

  test("a call nobody was asked about leaves a waiting turn waiting", () => {
    let activity = applyProviderTurnActivityEvents({ activityByTask: started(), taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [approvalEvent("call-1")], now: 2 });
    activity = applyProviderTurnActivityEvents({ activityByTask: activity, taskId: "task-1", turnId: "turn-1", providerId: "claude-code", events: [resolved({ requestId: "call-9" })], now: 3 });
    expect(activity["task-1"]?.pendingInteraction).toBe("approval");
  });
});
