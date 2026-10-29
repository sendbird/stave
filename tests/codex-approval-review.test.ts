import { describe, expect, test } from "bun:test";
import { createCodexApprovalReviewTracker } from "../electron/providers/codex-approval-review";
import { mapCodexServerRequestPresentation } from "../electron/providers/codex-server-request-mapping";
import { ApprovalResolutionSchema } from "@/lib/approvals/approval-resolution";
import { collectApprovalRecord, summarizeApprovalRecord } from "@/lib/approvals/approval-record";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import { appendProviderEventToAssistant } from "@/lib/session/provider-event-replay";
import { toCanonicalConversationMessage } from "@/lib/providers/canonical-request";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import type { ChatMessage } from "@/types/chat";

const timestamp = Date.parse("2026-10-29T09:00:00.000Z");
function notification(overrides: Record<string, unknown> = {}) {
  return {
    threadId: "thread-1", turnId: "turn-1", reviewId: "review-1", targetItemId: "command-1",
    decisionSource: "agent", startedAtMs: timestamp - 10, completedAtMs: timestamp,
    action: { type: "command", command: "private-command", cwd: "/tmp/workspace", source: "shell" },
    review: { status: "approved", rationale: "private-rationale", riskLevel: "low" },
    ...overrides,
  };
}

describe("native approval reviewer decisions", () => {
  test("names shared actions the same way as existing user approval cards", () => {
    const cases = [
      { method: "item/commandExecution/requestApproval", action: { type: "command", command: "private", cwd: "/tmp/workspace", source: "shell" } },
      { method: "item/fileChange/requestApproval", action: { type: "applyPatch", cwd: "/tmp/workspace", files: ["private"] } },
      { method: "item/permissions/requestApproval", action: { type: "requestPermissions", permissions: { network: { enabled: true } } } },
    ];
    for (const { method, action } of cases) {
      const user = mapCodexServerRequestPresentation({ method, params: {}, requestId: "human-request" });
      expect(user?.kind).toBe("approval");
      if (user?.kind !== "approval") throw new Error("Expected an existing approval card");
      const native = createCodexApprovalReviewTracker("thread-1").completed(notification({ action }), "turn-1");
      expect(native?.toolName).toBe(user.event.toolName);
      expect(native?.requestId).not.toBe(user.event.requestId);
    }
  });

  test("records only the final decision and action kind, without action arguments or rationale", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    const event = tracker.completed(notification(), "turn-1");
    expect(event).toMatchObject({ type: "approval_resolved", decision: "allowed", source: "provider-auto", reason: "provider-reviewer", toolName: "bash", decidedAt: "2026-10-29T09:00:00.000Z" });
    expect(event?.requestId).toMatch(/^codex-review:[a-f0-9]{64}$/);
    expect(event?.input).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("private-");
    expect(NormalizedProviderEventSchema.safeParse(event).success).toBe(true);
    expect(tracker.completed(notification(), "turn-1")).toBeNull();
  });

  test("keeps distinct reviews of one target, child stdin approvals and network reviews without an item", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    const events = [
      notification({ reviewId: "execve-1", action: { type: "execve", program: "private", argv: ["private"], cwd: "/tmp/workspace", source: "shell" } }),
      notification({ reviewId: "execve-2", action: { type: "execve", program: "private", argv: [], cwd: "/tmp/workspace", source: "unifiedExec" } }),
      notification({ reviewId: "stdin", action: { type: "writeStdin", approvalId: "human-request-1", processId: "process-1", stdin: "private-stdin", cwd: "/tmp/workspace" } }),
      notification({ reviewId: "network", targetItemId: null, action: { type: "networkAccess", host: "private-host", target: "private-target", protocol: "https", port: 443 }, review: { status: "denied" } }),
    ].map((params) => tracker.completed(params, "turn-1")!);
    expect(new Set(events.map((event) => event.requestId)).size).toBe(4);
    expect(events.map((event) => [event.toolName, event.decision])).toEqual([
      ["bash", "allowed"], ["bash", "allowed"], ["bash", "allowed"], ["network", "denied"],
    ]);
    expect(events.some((event) => event.requestId === "human-request-1" || event.requestId === "command-1")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("private-");
  });

  test("scopes review identity to the exact native thread and turn", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    for (const params of [notification({ threadId: "child-1" }), notification({ turnId: "old-turn" }), notification({ turnId: null }), notification({ threadId: null })]) {
      expect(tracker.completed(params, "turn-1")).toBeNull();
    }
    expect(tracker.completed(notification(), "")).toBeNull();
    const first = tracker.completed(notification(), "turn-1");
    const second = tracker.completed(notification({ turnId: "turn-2" }), "turn-2");
    const foreign = createCodexApprovalReviewTracker("thread-2").completed(notification({ threadId: "thread-2" }), "turn-1");
    expect(new Set([first?.requestId, second?.requestId, foreign?.requestId]).size).toBe(3);
  });

  test("observes file, MCP and permission actions without retaining their contents", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    const actions = [
      { type: "applyPatch", cwd: "/tmp/workspace", files: ["private-file"] },
      { type: "mcpToolCall", server: "private-server", toolName: "private-tool", connectorName: "private-connector" },
      { type: "requestPermissions", permissions: { network: { enabled: true } }, reason: "private-reason" },
    ];
    const events = actions.map((action, index) => tracker.completed(notification({ reviewId: `review-${index}`, action }), "turn-1"));
    expect(events.map((event) => event?.toolName)).toEqual(["apply_patch", "mcp", "permissions"]);
    expect(JSON.stringify(events)).not.toContain("private-");
  });

  test("ignores unfinished, unknown and non-native decisions without consuming their identity", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    for (const status of ["inProgress", "timedOut", "aborted", "unknown", null]) {
      expect(tracker.completed(notification({ review: { status } }), "turn-1")).toBeNull();
    }
    for (const decisionSource of ["user", "policy", "cache", "unknown", null, undefined]) {
      expect(tracker.completed(notification({ decisionSource }), "turn-1")).toBeNull();
    }
    expect(tracker.completed(notification({ review: { status: "denied" } }), "turn-1")?.decision).toBe("denied");
  });

  test("rejects malformed identity, action, timestamps and payloads", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    const invalid = [null, [], "text", notification({ reviewId: "" }), notification({ reviewId: "x".repeat(1_025) }), notification({ action: { type: "constructor" } }), notification({ action: { type: "futureAction" } }), notification({ action: { type: "command" } }), notification({ action: { type: "networkAccess", host: "host", target: "target", protocol: "https", port: -1 } }), notification({ review: null }), notification({ completedAtMs: NaN }), notification({ completedAtMs: Infinity }), notification({ completedAtMs: -1 }), notification({ completedAtMs: 9e15 }), notification({ completedAtMs: timestamp + 0.5 }), notification({ completedAtMs: timestamp - 20 }), notification({ startedAtMs: undefined })];
    for (const params of invalid) expect(tracker.completed(params, "turn-1")).toBeNull();
    expect(tracker.completed(notification(), "turn-1")).not.toBeNull();
  });

  test("replay and saved history preserve once-only native counts and existing user decisions", () => {
    const tracker = createCodexApprovalReviewTracker("thread-1");
    const event = tracker.completed(notification(), "turn-1")!;
    const denied = tracker.completed(notification({ reviewId: "review-2", review: { status: "denied" } }), "turn-1")!;
    let message: ChatMessage = {
      id: "message-1", role: "assistant", model: "codex", providerId: "codex", content: "", turnId: "stave-turn-1",
      parts: [{ type: "approval", toolName: "bash", description: "", requestId: "command-1", state: "approval-responded", resolution: { source: "user", decision: "allowed", decidedAt: "2026-10-29T09:00:00.000Z", scope: "once" } }],
    };
    for (const next of [event, denied, event]) message = appendProviderEventToAssistant({ message, event: NormalizedProviderEventSchema.parse(next) });
    const saved = ChatMessageSchema.parse(JSON.parse(JSON.stringify(message)));
    for (const part of saved.parts) if (part.type === "approval") expect(ApprovalResolutionSchema.safeParse(part.resolution).success).toBe(true);
    const entries = collectApprovalRecord([saved]);
    expect(summarizeApprovalRecord(entries)).toMatchObject({ "allowed-by-you": 1, "allowed-by-provider": 1, "denied-by-provider": 1, automatic: 2, total: 3 });
    expect(entries.filter((entry) => !entry.prompted)).toHaveLength(2);
    expect(toCanonicalConversationMessage({ message: saved }).parts).toMatchObject([{ type: "approval", requestId: "command-1" }]);
    expect(ApprovalResolutionSchema.parse({ source: "provider-auto", decision: "allowed", decidedAt: "2026-10-29T09:00:00.000Z", reason: "future-reason" }).reason).toBeUndefined();
    expect(NormalizedProviderEventSchema.safeParse({ ...event, reason: "future-reason" }).success).toBe(false);
  });
});
