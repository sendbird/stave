import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { classifyAgentRunTurnEnding } from "../electron/host-service/supervision/agent-run-actions";
import type { BridgeEvent } from "../electron/providers/types";

// Approvals retain their timeout in native Auto and ordinary turns. Native
// Run questions instead survive as async cards when their callback ends.
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal; suggestions: unknown[]; toolUseID: string },
) => Promise<{ behavior: string; message?: string }>;

let questionMode = false;
const decisions: Array<{ behavior: string; message?: string }> = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualStaveLocalMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: { canUseTool: CanUseTool } }) => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "system", subtype: "init", session_id: "session-1", permissionMode: "auto", tools: [], mcp_servers: [] };
      decisions.push(await args.options.canUseTool(questionMode ? "AskUserQuestion" : "Bash", questionMode
        ? { questions: [{ question: "Which filename?", header: "File", options: [{ label: "A.md", description: "First" }, { label: "B.md", description: "Second" }] }] }
        : { command: "rm -rf build" }, {
        signal: new AbortController().signal, suggestions: [], toolUseID: "tool-1",
      }));
      yield { type: "result", subtype: "success", is_error: false, result: "", session_id: "session-1",
        duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
    },
    close: () => {},
    mcpServerStatus: async () => [],
  }),
}));
mock.module("../electron/providers/cli-path-env", () => ({
  ...actualCliPathEnv,
  buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }),
}));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({
  ...actualStaveLocalMcpManifest,
  readStaveLocalMcpManifest: async () => null,
}));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");

const originalTimeout = process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS;
beforeEach(() => { process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS = "25"; });
afterEach(() => {
  decisions.length = 0; questionMode = false;
  if (originalTimeout === undefined) delete process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS;
  else process.env.STAVE_CLAUDE_APPROVAL_TIMEOUT_MS = originalTimeout;
});
afterAll(() => mock.restore());

for (const agentRunStage of [{ agentRunId: "run", stageId: "work", attempt: 1 }, undefined]) {
  test(`${agentRunStage ? "an agent run" : "an ordinary turn"}: an unanswered Claude approval is denied after the decision timeout`, async () => {
    const events: BridgeEvent[] = [];
    await streamClaudeWithSdk({
      providerId: "claude-code", cwd: process.cwd(), taskId: `task-${agentRunStage ? "run" : "chat"}`, prompt: "Work",
      runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: agentRunStage ? "auto" : "default" },
      ...(agentRunStage ? { agentRunStage } : {}),
      registerApprovalResponder: () => {},
      onEvent: (event) => { events.push(event); },
    });
    expect(events.filter((event) => event.type === "approval")).toHaveLength(1);
    expect(decisions).toEqual([expect.objectContaining({ behavior: "deny", message: expect.stringContaining("Denied automatically") })]);
    expect(events.some((event) => event.type === "error" && event.message.includes("did not receive"))).toBe(true);
    // The approval record says the shown request was denied by Stave's timeout, not by a person.
    expect(events.filter((event) => event.type === "approval_resolved")).toEqual([
      expect.objectContaining({ requestId: "tool-1", toolName: "Bash", decision: "denied", source: "rule", reason: "timeout" }),
    ]);
  }, 10_000);
}

test("a call Stave allows without asking is recorded as decided by a rule, with no card", async () => {
  const events: BridgeEvent[] = [];
  await streamClaudeWithSdk({
    providerId: "claude-code", cwd: process.cwd(), taskId: "task-trusted", prompt: "Work",
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "default", trustedTools: ["bash:rm -rf build"] },
    onEvent: (event) => { events.push(event); },
  });
  expect(decisions).toEqual([expect.objectContaining({ behavior: "allow" })]);
  expect(events.filter((event) => event.type === "approval")).toHaveLength(0);
  expect(events.filter((event) => event.type === "approval_resolved")).toEqual([
    expect.objectContaining({ requestId: "tool-1", toolName: "Bash", input: "rm -rf build", decision: "allowed", source: "rule", reason: "trusted-tool" }),
  ]);
  const { replayProviderEventsToTaskState } = await import("../src/lib/session/provider-event-replay");
  const replayed = replayProviderEventsToTaskState({ taskId: "task", provider: "claude-code", model: "sonnet", turnId: "turn", events, messages: [] });
  expect(replayed.messages.flatMap((message) => message.parts).filter((part) => part.type === "approval")).toEqual([
    expect.objectContaining({ requestId: "tool-1", state: "approval-responded", prompted: false, resolution: expect.objectContaining({ source: "rule", reason: "trusted-tool" }) }),
  ]);
}, 10_000);

const QUESTION_STAGE = { agentRunId: "question-run", stageId: "work", attempt: 1 };
for (const turn of [
  { label: "a user-owned Run", agentRunStage: QUESTION_STAGE, survives: true },
  { label: "a delegated (managed) Run", agentRunStage: QUESTION_STAGE, managedTask: true, survives: false },
  { label: "an ordinary turn", survives: false },
]) {
  test(`${turn.label}: a Claude question survives the timeout only on a user-owned Run`, async () => {
    questionMode = true;
    const events: BridgeEvent[] = [];
    await streamClaudeWithSdk({ providerId: "claude-code", turnId: "native-question-turn", cwd: process.cwd(), taskId: `question-${turn.label}`, prompt: "Work",
      runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "default" }, agentRunStage: turn.agentRunStage, managedTask: turn.managedTask,
      onEvent: event => { events.push(event); } });
    const { replayProviderEventsToTaskState } = await import("../src/lib/session/provider-event-replay");
    const replayed = replayProviderEventsToTaskState({ taskId: "task", provider: "claude-code", model: "sonnet", turnId: "turn", events, messages: [] });
    const parts = replayed.messages.flatMap(message => message.parts).filter(part => part.type === "user_input");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject(turn.survives ? { delivery: "async", state: "input-requested" } : { state: "input-interrupted" });
    if (!turn.survives) expect((parts[0] as { requestId: string }).requestId.startsWith("run-question:")).toBe(false);
    expect(events.some(event => event.type === "done")).toBe(true);
    expect(events.some(event => event.type === "error")).toBe(!turn.survives);
    if (turn.survives) expect(classifyAgentRunTurnEnding(events.map(event => ({ event })) as never)).toBe("completed");
  }, 10_000);
}

test("a Run question answered before timeout still reaches Claude's native callback once", async () => {
  questionMode = true;
  let respond: ((args: { requestId: string; answers?: Record<string, string> }) => { ok: boolean }) | undefined;
  let deliveries = 0;
  await streamClaudeWithSdk({ providerId: "claude-code", turnId: "native-in-time-turn", cwd: process.cwd(), taskId: "question-in-time", prompt: "Work",
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "default" },
    agentRunStage: { agentRunId: "in-time-run", stageId: "work", attempt: 1 },
    registerUserInputResponder: responder => { respond = responder; },
    onEvent: event => {
      if (event.type !== "user_input") return;
      expect(respond!({ requestId: event.requestId, answers: { "Which filename?": "B.md" } }).ok).toBe(true);
      deliveries += 1;
      expect(respond!({ requestId: event.requestId, answers: { "Which filename?": "B.md" } }).ok).toBe(false);
    },
  });
  expect(deliveries).toBe(1);
  expect(decisions).toEqual([expect.objectContaining({ behavior: "allow", updatedInput: expect.objectContaining({ answers: { "Which filename?": "B.md" } }) })]);
});
