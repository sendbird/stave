import { describe, expect, test } from "bun:test";
import { selectMessageSubagents } from "@/lib/delegation/message-subagents";
import type { SubagentMessage } from "@/lib/delegation/subagent-summary";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";

const child: DelegatedTaskSummary = {
  runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "review",
  delegatedTaskId: "child-1", delegatedWorkspaceId: "ws-1", delegatedTurnId: "child-turn",
  providerId: "codex", requestedModel: "gpt-6.1-sol", requestedEffort: "high",
  lifecycle: "one-turn", phase: "running", reason: null, attempt: 0,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
};
const receipt = { delegation: { accepted: true, child } };
function message(output: unknown = receipt): SubagentMessage {
  return { role: "assistant", providerId: "codex", turnId: "turn-1", parts: [{
    type: "tool_use", toolName: "mcp__stave_local__stave_delegate_task", toolUseId: "call-1",
    input: JSON.stringify({ prompt: "Review authentication", title: "Security review" }),
    state: "output-available", output: JSON.stringify(output),
  }] };
}
const finished: DelegatedTaskSummary = { ...child, phase: "completed", result: "The redirect needs a guard.", completedAt: "2026-01-01T00:01:00.000Z" };

describe("message-owned subagent results", () => {
  test("updates only the exact execution and preserves requested model and effort", () => {
    const [row] = selectMessageSubagents({ message: message(), taskId: "parent", children: [finished] });
    expect(row?.title).toBe("Security review");
    expect(row?.outcome).toMatchObject({ status: "returned", result: finished.result });
    expect(row?.identity).toMatchObject({ model: "gpt-6.1-sol", effort: "high", modelEvidence: "requested" });
  });
  test("reads Claude text blocks and Codex structured results without duplicating the child", () => {
    for (const output of [{ content: [{ type: "text", text: JSON.stringify(receipt) }] },
      { structuredContent: receipt, content: [{ type: "text", text: JSON.stringify(receipt) }] }]) {
      expect(selectMessageSubagents({ message: message(output), taskId: "parent" })).toHaveLength(1);
    }
  });
  test("rejects other tasks, malformed receipts and refused delegations", () => {
    for (const output of [{ delegation: { accepted: false, child } },
      { delegation: { accepted: true, duplicate: true, child } },
      { delegation: { accepted: true, child: { ...child, parentTaskId: "other" } } },
      { delegation: { accepted: true, child: { result: "Not a ledger row" } } }]) {
      expect(selectMessageSubagents({ message: message(output), taskId: "parent" })).toEqual([]);
    }
  });
  test("a retry or follow-up cannot rewrite a historical message with the new result", () => {
    for (const newer of [{ ...finished, attempt: 1 }, { ...finished, delegatedTaskId: "new-child" },
      { ...finished, delegatedTurnId: "new-turn" }, { ...finished, runId: "new-run" }]) {
      const [row] = selectMessageSubagents({ message: message(), taskId: "parent", children: [newer] });
      expect(row?.outcome.result).toBeUndefined();
      expect(row?.outcome.status).toBe("unresolved");
    }
  });
  test("surfaces a question for the matching live child, not an unrelated failure", () => {
    const [row] = selectMessageSubagents({ message: message(), taskId: "parent", children: [child], blocked: { review: "user-input" } });
    expect(row?.outcome.status).toBe("needs_user");
    const [failed] = selectMessageSubagents({ message: message(), taskId: "parent", children: [{ ...child, phase: "failed", reason: "Test command failed" }], blocked: { review: "user-input" } });
    expect(failed?.outcome).toMatchObject({ status: "failed", error: "Test command failed" });
  });
  test("an async spawn handle is not a result", () => {
    const msg: SubagentMessage = { role: "assistant", providerId: "codex", turnId: "native-turn", parts: [{
      type: "tool_use", toolName: "collaboration:spawn_agent", toolUseId: "spawn", input: JSON.stringify({ message: "Inspect tests" }),
      state: "output-available", output: JSON.stringify({ newThreadId: "thread-child" }),
    }] };
    const rows = selectMessageSubagents({ message: msg, taskId: "parent" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome.result).toBeUndefined();
    expect(rows[0]?.outcome.status).not.toBe("returned");
  });
  test("restored native results survive without a live graph", () => {
    const msg: SubagentMessage = { role: "assistant", providerId: "claude-code", turnId: "native-turn", parts: [{
      type: "tool_use", toolName: "Task", toolUseId: "spawn", input: JSON.stringify({ description: "Review", prompt: "Review tests" }),
      state: "output-available", output: "A missing edge case.", elapsedSeconds: 14,
    }] };
    const [row] = selectMessageSubagents({ message: msg, taskId: "parent" });
    expect(row?.outcome).toMatchObject({ status: "returned", result: "A missing edge case." });
    expect(row?.timing).toMatchObject({ observed: false, elapsedMs: 14_000 });
  });
});
