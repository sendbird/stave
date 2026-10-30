import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type { BridgeEvent } from "../electron/providers/types";

type Answer = { requestId: string; answers?: Record<string, string>; denied?: boolean };
type Init = { session_id: string; capabilities?: string[] };
const capability = "ask_user_question_unanswered_v1";
const questions = [
  { header: "Name", question: "Which name?", options: [{ label: "A" }, { label: "B" }] },
  { header: "Scope", question: "Which scope?", options: [{ label: "Local" }, { label: "All" }] },
];
let initFrames: Init[] = [{ session_id: "session-1", capabilities: [capability] }];
let denied = false;
let stopOnQuestion = false;
const decisions: Array<Record<string, unknown>> = [];
const actualCliPathEnv = await import("../electron/providers/cli-path-env");
const actualMcpManifest = await import("../electron/main/stave-local-mcp-manifest");

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { options: { canUseTool: (name: string, input: Record<string, unknown>, options: { signal: AbortSignal; suggestions: unknown[]; toolUseID: string }) => Promise<Record<string, unknown>> } }) => {
    const controller = new AbortController();
    return {
      async *[Symbol.asyncIterator]() {
        for (const init of initFrames) yield { type: "system", subtype: "init", permissionMode: "default", tools: [], mcp_servers: [], ...init };
        const decision = await args.options.canUseTool("AskUserQuestion", { questions }, {
          signal: controller.signal, suggestions: [], toolUseID: "question-1",
        });
        const updatedInput = decision.updatedInput as Record<string, unknown> | undefined;
        // A strict old host refuses the entire answer if the new field leaks.
        if (!initFrames.at(-1)?.capabilities?.includes(capability) && updatedInput?.annotations) throw new Error("strict old host rejected annotations");
        decisions.push(decision);
        yield { type: "result", subtype: "success", is_error: false, result: "Done", stop_reason: "end_turn", session_id: initFrames.at(-1)?.session_id,
          duration_ms: 1, duration_api_ms: 1, num_turns: 1, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 } };
      },
      close: () => controller.abort(),
      mcpServerStatus: async () => [],
    };
  },
}));
mock.module("../electron/providers/cli-path-env", () => ({ ...actualCliPathEnv, buildClaudeCliEnv: () => ({ PATH: "/tmp/bin" }) }));
mock.module("../electron/main/stave-local-mcp-manifest", () => ({ ...actualMcpManifest, readStaveLocalMcpManifest: async () => null }));

const { streamClaudeWithSdk } = await import("../electron/providers/claude-sdk-runtime");
let nextTurn = 1;
afterEach(() => {
  initFrames = [{ session_id: "session-1", capabilities: [capability] }];
  denied = false; stopOnQuestion = false; decisions.length = 0;
});
afterAll(() => mock.restore());

async function runQuestion() {
  const events: BridgeEvent[] = [];
  let respond: ((answer: Answer) => unknown) | undefined;
  let abort: (() => void) | undefined;
  await streamClaudeWithSdk({
    providerId: "claude-code", cwd: process.cwd(), taskId: `question-capability-${nextTurn++}`, freshSession: true, prompt: "Choose",
    runtimeOptions: { claudeBinaryPath: "/tmp/bin/claude", claudePermissionMode: "default" },
    registerUserInputResponder: (responder) => { respond = responder; },
    registerAbort: (aborter) => { abort = aborter; },
    onEvent: (event) => {
      events.push(event);
      if (event.type !== "user_input") return;
      if (stopOnQuestion) abort?.();
      else respond?.({ requestId: event.requestId, answers: { "Which name?": "A" }, denied });
    },
  });
  return events;
}

test("the SDK callback uses the current init capability for partial answers", async () => {
  const events = await runQuestion();
  expect(decisions).toEqual([{ behavior: "allow", updatedInput: {
    questions, answers: { "Which name?": "A" }, annotations: { "Which scope?": { unanswered: "skipped" } },
  } }]);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
});

test("an old strict host receives the legacy answer and completes", async () => {
  initFrames = [{ session_id: "old-session" }];
  const events = await runQuestion();
  expect(decisions).toEqual([{ behavior: "allow", updatedInput: { questions, answers: { "Which name?": "A" } } }]);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "end_turn" });
});

test("a new session and a repeated init without the capability cannot inherit support", async () => {
  for (const lastSession of ["session-1", "new-session"]) {
    initFrames = [{ session_id: "session-1", capabilities: [capability] }, { session_id: lastSession }];
    await runQuestion();
    expect(decisions.at(-1)).toEqual({ behavior: "allow", updatedInput: { questions, answers: { "Which name?": "A" } } });
  }
});

test("denying a question still returns deny on a supporting host", async () => {
  denied = true;
  await runQuestion();
  expect(decisions).toEqual([{ behavior: "deny", message: "User declined to answer questions." }]);
});

test("Stop aborts a pending question without manufacturing an allowed skipped result", async () => {
  stopOnQuestion = true;
  const events = await runQuestion();
  expect(decisions).toEqual([]);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "user_abort" });
});
