import { describe, expect, test } from "bun:test";
import { buildReviewExchange } from "@/components/session/composer-shelf/composer-shelf.utils";
import {
  mapAgentHistoryItems,
  mergeHistoryItems,
  progressFromExchange,
  stepsFromHistoryItems,
  stepsFromMessages,
  stepsFromSubagentParts,
} from "@/lib/agent-progress";
import { fromDelegatedTask, fromWorkGraphNode } from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { AgentNode } from "@/lib/work-graph/work-graph.types";
import type { ChatMessage } from "@/types/chat";

const CWD = "/tmp/project";

/** A Claude subagent transcript as the SDK returns it (`getSubagentMessages`). */
const CLAUDE_HISTORY = [
  { type: "user", uuid: "u1", message: { role: "user", content: "Find where sessions expire." } },
  {
    type: "assistant",
    uuid: "a1",
    message: {
      role: "assistant",
      model: "claude-opus-4-5",
      content: [
        { type: "thinking", thinking: "Start with the auth module." },
        { type: "tool_use", id: "t1", name: "Grep", input: { pattern: "expiresAt" } },
        { type: "tool_use", id: "t2", name: "Read", input: { file_path: `${CWD}/src/auth/session.ts` } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "src/auth/session.ts:12" },
        { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "export const TTL = 3600" }], is_error: true },
      ],
    },
  },
  { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: "Sessions expire after one hour." }] } },
];

/** A Codex thread as `thread/read` with turns returns it. */
const CODEX_THREAD = {
  id: "thread-child",
  model: "gpt-6.1-sol",
  turns: [
    {
      id: "turn-1",
      items: [
        { type: "userMessage", id: "i0", content: [{ type: "text", text: "Check the build." }] },
        { type: "reasoning", id: "i1", summary: ["Look at the scripts first."] },
        { type: "commandExecution", id: "i2", command: "bun run build", aggregatedOutput: "error TS2345", status: "completed", exitCode: 1, durationMs: 4200 },
        { type: "fileChange", id: "i3", changes: [{ path: `${CWD}/src/a.ts`, kind: "update", diff: "+fix" }], status: "completed" },
        { type: "mcpToolCall", id: "i4", server: "github", tool: "get_pull_request", arguments: { number: 3 }, result: { content: [{ type: "text", text: "PR #3" }] }, status: "completed" },
        { type: "collabAgentToolCall", id: "i5", tool: "spawnAgent", prompt: "Run the tests", receiverThreadIds: ["thread-grandchild"], status: "inProgress" },
        { type: "agentMessage", id: "i6", text: "The build is fixed." },
      ],
    },
  ],
};

describe("history adapters", () => {
  test("a Claude subagent transcript reads as ask, steps and answer", () => {
    const items = mapAgentHistoryItems("claude-code", CLAUDE_HISTORY);
    const read = stepsFromHistoryItems(items, { live: false, cwd: CWD, providerId: "claude-code" });
    expect(read.ask).toBe("Find where sessions expire.");
    expect(read.result).toBe("Sessions expire after one hour.");
    expect(read.steps.map((step) => [step.kind, step.status, step.done])).toEqual([
      ["thinking", "done", "Thought"],
      ["tool", "done", "Searched for expiresAt"],
      ["tool", "error", "Read src/auth/session.ts"],
    ]);
    expect(read.steps[1]?.detail).toMatchObject({ source: "inline", output: "src/auth/session.ts:12" });
  });

  test("a live Claude subagent keeps unanswered calls running and its words as steps", () => {
    const items = mapAgentHistoryItems("claude-code", CLAUDE_HISTORY.slice(0, 2));
    const read = stepsFromHistoryItems(items, { live: true, cwd: CWD });
    expect(read.steps.filter((step) => step.status === "running")).toHaveLength(2);
    expect(read.result).toBeUndefined();
  });

  test("a Codex thread reads with the same sentences, its spawn opening the child", () => {
    const items = mapAgentHistoryItems("codex", CODEX_THREAD);
    const read = stepsFromHistoryItems(items, { live: false, cwd: CWD, providerId: "codex" });
    expect(read.ask).toBe("Check the build.");
    expect(read.result).toBe("The build is fixed.");
    expect(read.steps.map((step) => [step.kind, step.status, step.done])).toEqual([
      ["thinking", "done", "Thought"],
      ["tool", "error", "Ran bun run build"],
      ["tool", "done", "Edited src/a.ts"],
      ["tool", "done", "Used get pull request"],
      ["subagent", "running", "Started an agent: Run the tests"],
    ]);
    expect(read.steps[1]?.durationMs).toBe(4200);
    expect(read.steps.at(-1)?.child).toMatchObject({ kind: "subagent", agentId: "thread-grandchild", providerId: "codex" });
  });

  test("Codex pages by item and pages merge without moving a row", () => {
    const first = mapAgentHistoryItems("codex", CODEX_THREAD, { offset: 0, limit: 3 });
    const second = mapAgentHistoryItems("codex", CODEX_THREAD, { offset: 3, limit: 10 });
    expect(first).toHaveLength(3);
    const merged = mergeHistoryItems(first, second, [{ ...first[2]!, status: "done" }]);
    expect(merged.map((item) => item.id)).toEqual(mapAgentHistoryItems("codex", CODEX_THREAD).map((item) => item.id));
  });

  test("oversized payloads are cut and marked", () => {
    const [item] = mapAgentHistoryItems("claude-code", [
      { type: "assistant", uuid: "big", message: { role: "assistant", content: [{ type: "text", text: "x".repeat(20_000) }] } },
    ]);
    expect(item?.text).toHaveLength(16_000);
    expect(item?.truncated).toBe(true);
  });
});

const child: DelegatedTaskSummary = {
  runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "fix-auth-0123456789ab",
  delegatedTaskId: "child-1", delegatedWorkspaceId: "ws-1", delegatedTurnId: "child-turn",
  providerId: "codex", requestedModel: "gpt-6.1-sol", requestedEffort: "high",
  lifecycle: "one-turn", phase: "running", reason: null, attempt: 0,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
};

function childMessages(streaming: boolean): ChatMessage[] {
  return [
    { id: "m1", role: "user", model: "user", providerId: "user", content: "Fix the session expiry.", parts: [{ type: "text", text: "Fix the session expiry." }] },
    {
      id: "m2",
      role: "assistant",
      model: "gpt-6.1-sol",
      providerId: "codex",
      content: "Done: sessions now expire.",
      isStreaming: streaming,
      parts: [
        { type: "thinking", text: "Plan the change.", isStreaming: false },
        { type: "text", text: "Looking at the auth module first." },
        { type: "tool_use", toolUseId: "c1", toolName: "bash", input: JSON.stringify({ command: "rg expiresAt" }), state: "output-available", output: "src/auth.ts" },
        { type: "tool_use", toolUseId: "c2", toolName: "fileChange", input: JSON.stringify({ paths: [`${CWD}/src/auth.ts`] }), state: streaming ? "input-available" : "output-available" },
        { type: "tool_use", toolUseId: "nested", toolName: "Read", parentToolUseId: "c9", input: "{}", state: "output-available" },
        { type: "text", text: "Done: sessions now expire." },
      ],
    },
  ];
}

describe("delegated task and review adapters", () => {
  test("a delegated task's messages read as ask, steps and its final answer", () => {
    const read = stepsFromMessages(childMessages(false), { live: false, cwd: CWD, taskId: "child-1" });
    expect(read.ask).toBe("Fix the session expiry.");
    expect(read.result).toBe("Done: sessions now expire.");
    expect(read.steps.map((step) => [step.kind, step.done])).toEqual([
      ["thinking", "Thought"],
      ["text", "Looking at the auth module first."],
      ["tool", "Ran rg expiresAt"],
      ["tool", "Edited src/auth.ts"],
    ]);
    const progress = progressFromExchange(
      fromDelegatedTask({ ...child, phase: "completed", completedAt: "2026-01-01T00:02:00.000Z", result: "ledger copy" }),
      { steps: read.steps, ask: read.ask, result: read.result, kindLabel: "Delegated task" },
    );
    expect(progress).toMatchObject({
      source: "delegated-task",
      state: "ready",
      ask: "Fix the session expiry.",
      result: "Done: sessions now expire.",
      facts: { model: "gpt-6.1-sol", effort: "high", steps: 2, startedAt: Date.parse(child.createdAt), endedAt: Date.parse("2026-01-01T00:02:00.000Z") },
    });
    expect(progress.now).toBeUndefined();
  });

  test("a running delegated task shows its current step as now", () => {
    const read = stepsFromMessages(childMessages(true), { live: true, cwd: CWD });
    expect(read.result).toBeUndefined();
    const progress = progressFromExchange(fromDelegatedTask(child), { steps: read.steps, ask: read.ask });
    expect(progress.state).toBe("working");
    expect(progress.now?.doing).toBe("Editing src/auth.ts");
  });

  test("a review reads through the same exchange with its full answer", () => {
    const item = { child: { ...child, phase: "completed" as const, result: "cut", completedAt: "2026-01-01T00:02:00.000Z" }, status: "ready" as const };
    const exchange = buildReviewExchange({ item, title: "Security review", transcript: { prompt: "Review auth", reply: "No blocking issues." } });
    const progress = progressFromExchange(exchange, { steps: [], source: "review", kindLabel: "Review" });
    expect(progress).toMatchObject({ source: "review", title: "Security review", ask: "Review auth", result: "No blocking issues.", state: "ready" });
  });
});

describe("in-turn subagent adapter", () => {
  test("reads the calls a subagent owns from the parent's messages and its spawn as the header", () => {
    const messages: ChatMessage[] = [{
      id: "p1",
      role: "assistant",
      model: "claude-opus-4-5",
      providerId: "claude-code",
      content: "",
      isStreaming: true,
      parts: [
        { type: "tool_use", toolUseId: "spawn", toolName: "Agent", agentId: "agent-1", input: JSON.stringify({ description: "Map the auth flow", prompt: "Map how login works", subagent_type: "Explore" }), state: "input-available" },
        { type: "tool_use", toolUseId: "s1", toolName: "Glob", parentToolUseId: "spawn", input: JSON.stringify({ pattern: "src/auth/**" }), state: "output-available", output: "a.ts" },
        { type: "tool_use", toolUseId: "s2", toolName: "Read", ownerAgentId: "agent-1", input: JSON.stringify({ file_path: `${CWD}/src/auth/a.ts` }), state: "input-available" },
        { type: "tool_use", toolUseId: "other", toolName: "Bash", input: JSON.stringify({ command: "ls" }), state: "output-available" },
      ],
    }];
    const steps = stepsFromSubagentParts({ messages, toolUseId: "spawn", agentId: "agent-1", live: true, cwd: CWD });
    expect(steps.map((step) => [step.status, step.doing])).toEqual([
      ["done", "Finding src/auth/**"],
      ["running", "Reading src/auth/a.ts"],
    ]);
    const node = {
      key: "agent-1", label: "Map the auth flow", badge: "Explore", status: "running", progress: [],
      startedAt: 1_000, agentId: "agent-1", spawnedByToolUseId: "spawn", model: "claude-haiku-4-5",
    } as unknown as AgentNode;
    const progress = progressFromExchange(fromWorkGraphNode(node, { providerId: "claude-code" }), {
      steps, ask: "Map how login works", kindLabel: "Explore",
    });
    expect(progress).toMatchObject({ source: "subagent", state: "working", ask: "Map how login works", facts: { model: "claude-haiku-4-5", steps: 2, startedAt: 1_000 } });
    expect(progress.now?.doing).toBe("Reading src/auth/a.ts");
  });
});
