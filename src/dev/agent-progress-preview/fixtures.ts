import {
  mapAgentHistoryItems,
  progressFromExchange,
  stepsFromHistoryItems,
  stepsFromMessages,
  type AgentProgress,
  type AgentStep,
} from "@/lib/agent-progress";
import { fromDelegatedTask, fromWorkGraphNode } from "@/lib/delegation/exchange";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { AgentNode } from "@/lib/work-graph/work-graph.types";
import type { ChatMessage } from "@/types/chat";

/**
 * Agent progress fixtures, built through the real adapters: a running Claude
 * subagent read from its saved transcript, a finished delegated task read
 * from its messages, a failed Codex subagent and a nested agent.
 */

const CWD = "/tmp/project";
const NOW = Date.now();

function tool(id: string, name: string, input: Record<string, unknown>) {
  return { type: "tool_use", id, name, input };
}

function result(id: string, content: string, isError = false) {
  return { type: "tool_result", tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

const CLAUDE_RUNNING = [
  { type: "user", uuid: "u0", message: { role: "user", content: "Find every place the session cookie is read and check its expiry handling. Report file paths with line numbers." } },
  { type: "assistant", uuid: "a1", message: { role: "assistant", content: [
    { type: "thinking", thinking: "Start from the auth middleware, then follow the cookie helpers." },
    tool("t1", "Grep", { pattern: "sessionCookie" }),
    tool("t2", "Glob", { pattern: "src/auth/**/*.ts" }),
  ] } },
  { type: "user", uuid: "u1", message: { role: "user", content: [
    result("t1", "src/auth/middleware.ts:14\nsrc/auth/cookies.ts:3\nsrc/routes/login.ts:41"),
    result("t2", "src/auth/middleware.ts\nsrc/auth/cookies.ts\nsrc/auth/session.ts"),
  ] } },
  { type: "assistant", uuid: "a2", message: { role: "assistant", content: [
    tool("t3", "Read", { file_path: `${CWD}/src/auth/middleware.ts` }),
    tool("t4", "Read", { file_path: `${CWD}/src/auth/cookies.ts` }),
    tool("t5", "Bash", { command: "rg -n \"maxAge\" src/auth" }),
  ] } },
  { type: "user", uuid: "u2", message: { role: "user", content: [
    result("t3", "export function readSession(req) {\n  const raw = req.cookies.session;\n  …\n}"),
    result("t4", "export const SESSION_MAX_AGE = 60 * 60;"),
    result("t5", "rg: src/auth: Permission denied (os error 13)", true),
  ] } },
  { type: "assistant", uuid: "a3", message: { role: "assistant", content: [
    { type: "text", text: "The middleware reads the cookie but never checks `expiresAt`; the cookie helper sets a one-hour max age. Checking the login route next." },
    tool("t6", "Read", { file_path: `${CWD}/src/routes/${"nested/".repeat(6)}login.ts` }),
  ] } },
];

const CODEX_FAILED = {
  turns: [{ id: "turn", items: [
    { type: "userMessage", id: "i0", content: [{ type: "text", text: "Run the integration tests and fix the first failure." }] },
    { type: "reasoning", id: "i1", summary: ["Run the suite first to see what breaks."] },
    { type: "commandExecution", id: "i2", command: "bun test tests/integration", aggregatedOutput: "1 fail\nexpected 200, received 500", status: "completed", exitCode: 1, durationMs: 18_400 },
    { type: "fileChange", id: "i3", changes: [{ path: `${CWD}/src/server/handlers.ts`, kind: "update", diff: "-  return res.send()\n+  return res.status(200).send()" }], status: "completed" },
    { type: "commandExecution", id: "i4", command: "bun test tests/integration", aggregatedOutput: "error: sandbox denied network access", status: "failed", exitCode: 1, durationMs: 2_100 },
  ] }],
};

function node(overrides: Partial<AgentNode>): AgentNode {
  return {
    key: "agent-1",
    identitySource: "provider",
    parentKey: null,
    label: "Map session expiry",
    badge: "Explore",
    status: "running",
    progress: [],
    startedAt: NOW - 94_000,
    updatedAt: NOW,
    agentId: "agent-1",
    spawnedByToolUseId: "spawn-1",
    model: "claude-haiku-4-5",
    ...overrides,
  } as AgentNode;
}

const DELEGATED: DelegatedTaskSummary = {
  runId: "run-1", stepId: "step-1", parentTaskId: "parent", delegationKey: "fix-session-expiry-0123456789ab",
  delegatedTaskId: "child-1", delegatedWorkspaceId: "ws-1", delegatedTurnId: "child-turn",
  providerId: "codex", requestedModel: "gpt-6.1-sol", requestedEffort: "high",
  lifecycle: "one-turn", phase: "completed", reason: null, attempt: 1,
  createdAt: new Date(NOW - 7 * 60_000).toISOString(), updatedAt: new Date(NOW).toISOString(),
  completedAt: new Date(NOW - 60_000).toISOString(), result: "ledger copy",
} as DelegatedTaskSummary;

const DELEGATED_MESSAGES: ChatMessage[] = [
  { id: "m0", role: "user", model: "user", providerId: "user", content: "Make expired sessions log the user out and add a test for it.", parts: [{ type: "text", text: "Make expired sessions log the user out and add a test for it." }] },
  { id: "m1", role: "assistant", model: "gpt-6.1-sol", providerId: "codex", content: "", parts: [
    { type: "thinking", text: "Add the expiry check in middleware, then a test.", isStreaming: false },
    { type: "tool_use", toolUseId: "c1", toolName: "bash", input: JSON.stringify({ command: "rg -n readSession src" }), state: "output-available", output: "src/auth/middleware.ts:14", elapsedSeconds: 0.4 },
    { type: "tool_use", toolUseId: "c2", toolName: "fileChange", input: JSON.stringify({ paths: [`${CWD}/src/auth/middleware.ts`, `${CWD}/tests/auth.test.ts`] }), state: "output-available", output: "2 files changed" },
    { type: "text", text: "Added the check; running the auth tests." },
    { type: "tool_use", toolUseId: "c3", toolName: "bash", input: JSON.stringify({ command: "bun test tests/auth.test.ts" }), state: "output-available", output: "12 pass\n0 fail", elapsedSeconds: 6.2 },
    { type: "text", text: "Expired sessions now clear the cookie and redirect to `/login`. Added `tests/auth.test.ts` covering it; 12 tests pass." },
  ] },
];

function nestedChild(): AgentStep {
  return {
    id: "child-step",
    kind: "subagent",
    doing: "Starting an agent: Check the cookie flags",
    done: "Started an agent: Check the cookie flags",
    status: "running",
    toolName: "Agent",
    childId: "subagent:child",
    child: { kind: "subagent", title: "Check the cookie flags", toolUseId: "spawn-2", agentId: "agent-2", providerId: "claude-code" },
    text: "Check whether the session cookie sets HttpOnly, Secure and SameSite.",
  };
}

export interface AgentProgressScenario {
  id: string;
  title: string;
  progress: AgentProgress;
  back?: string;
}

export function buildScenarios(): AgentProgressScenario[] {
  const running = stepsFromHistoryItems(mapAgentHistoryItems("claude-code", CLAUDE_RUNNING), { live: true, cwd: CWD, providerId: "claude-code" });
  const runningProgress = progressFromExchange(fromWorkGraphNode(node({}), { providerId: "claude-code" }), {
    steps: running.steps, ask: running.ask, kindLabel: "Explore",
    parent: { label: "Fix login session handling", taskId: "parent" }, readOnly: true,
  });

  const delegated = stepsFromMessages(DELEGATED_MESSAGES, { live: false, cwd: CWD, taskId: "child-1" });
  const finished = progressFromExchange(fromDelegatedTask(DELEGATED), {
    steps: delegated.steps, ask: delegated.ask, result: delegated.result, source: "delegated-task",
    kindLabel: "Delegated task", parent: { label: "Fix login session handling", taskId: "parent" },
  });
  const finishedProgress: AgentProgress = { ...finished, title: "Log out expired sessions", facts: { ...finished.facts, spend: { totalCostUsd: 0.42 } } };

  const failedSteps = stepsFromHistoryItems(mapAgentHistoryItems("codex", CODEX_FAILED), { live: false, cwd: CWD, providerId: "codex" });
  const failedProgress = progressFromExchange(
    fromWorkGraphNode(node({ key: "agent-3", label: "Run the integration tests", badge: undefined, status: "failed", reason: "The sandbox denied network access.", completedAt: NOW - 30_000, model: "gpt-6.1-sol" }), { providerId: "codex" }),
    { steps: failedSteps.steps, ask: failedSteps.ask, kindLabel: "Codex", parent: { label: "Fix login session handling", taskId: "parent" }, readOnly: true, effort: "medium" },
  );

  const nestedProgress = progressFromExchange(fromWorkGraphNode(node({ key: "agent-4", label: "Audit cookie security", badge: "general-purpose" }), { providerId: "claude-code" }), {
    steps: [...running.steps.slice(0, 3), nestedChild()], ask: "Audit how the session cookie is set and checked.",
    kindLabel: "general-purpose", readOnly: true,
  });

  return [
    { id: "running", title: "Running subagent (Claude transcript)", progress: runningProgress },
    { id: "finished", title: "Finished delegated task (Codex messages)", progress: finishedProgress },
    { id: "failed", title: "Failed subagent (Codex thread)", progress: failedProgress },
    { id: "nested", title: "Nested agent with a step back", progress: nestedProgress, back: "Map session expiry" },
  ];
}

/** One more thing the agent said, for the follow-the-bottom check. */
export function extraStep(index: number): AgentStep {
  const text = `Update ${index}: checked another cookie helper. It reads the session the same way and needs the same expiry guard before the handler continues.`;
  return { id: `extra-${index}`, kind: "text", doing: text, done: text, status: "done", text };
}
