import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { AgentRunLineView } from "../src/components/agent-runs/AgentRunLine";
import { useAppStore } from "../src/store/app.store";
import { AGENT_RUN_PLAN_INSTRUCTION, buildAgentRunWorkflow } from "../src/lib/agent-runs/agent-run";
import { buildAgentRunTurnContextPart } from "../src/lib/agent-runs/briefing";
import { agentRunMessages, describeRunPlan, resolveAgentRunPlan } from "../src/lib/agent-runs/progress";
import { appendProviderEventToAssistant } from "../src/lib/session/provider-event-replay";
import { findLatestTodoPart } from "../src/components/session/turn-todo.utils";
import { selectTaskSubagents, describeSubagentSummary, subagentResultLine } from "../src/lib/delegation/subagent-summary";
import { createCodexWorkerActivityMapper } from "../electron/providers/codex-worker-activity";
import type { ChatMessage } from "../src/types/chat";
import { buildClaudeQueryOptions } from "../electron/providers/claude-sdk-runtime";
import { buildCodexThreadStartParams, buildCodexThreadResumeParams } from "../electron/providers/codex-app-server-params";
import { selectAgentRunSubagents } from "../src/lib/agent-runs/subagents";
import { useTaskSubagents } from "../src/components/session/useTaskSubagents";
import type { DelegatedTaskSummary } from "../src/lib/runs/delegated-task";
import { createWorkGraph, reduceWorkGraphEvent } from "../src/lib/work-graph/work-graph-reducer";
import { describeAgentRunProgress } from "../src/lib/agent-runs/agent-run-status";
import { isReservedEnvVarName } from "../src/lib/secrets/secrets";

const now = new Date("2026-10-05T00:00:00Z");
const detail = buildAgentRunFixtures(now).working;
const originalMessages = useAppStore.getState().messagesByTask;
afterEach(() => useAppStore.setState({ messagesByTask: originalMessages }));
const assistant = (providerId: "codex" | "claude-code" = "codex"): ChatMessage => ({ id: "assistant", role: "assistant", providerId, model: "model", content: "", turnId: "turn", parts: [] });
const prompt: ChatMessage = { id: "prompt", role: "user", providerId: "user", model: "user", content: "assignment", parts: [], agentRunPrompt: { agentRunId: detail.agentRun.id, assignment: "assignment" } };
function todo(message: ChatMessage, content: string, ownerAgentId?: string) {
  return appendProviderEventToAssistant({ message, event: { type: "tool", toolUseId: `plan-${ownerAgentId ?? "lead"}`, toolName: "TodoWrite", input: JSON.stringify({ todos: [{ content, status: "in_progress" }] }), state: "output-available", ownerAgentId } });
}

test("assigned primary agents receive native plan tools without exposing secrets or changing secondary turns", () => {
  const runtimeOptions = { agentInstructions: "Read and report.", nativePlanTools: true };
  const options = buildClaudeQueryOptions({ cwd: "/tmp/project", claudeExecutablePath: "", runtimeOptions, secretEnv: { CLAUDE_CODE_ENABLE_TASKS: "untrusted", CLAUDE_CODE_ENABLE_TODO_TOOLS: "untrusted" } });
  expect(options.env).toMatchObject({ CLAUDE_CODE_ENABLE_TODO_TOOLS: "1", CLAUDE_CODE_ENABLE_TASKS: "0" });
  const secondary = buildClaudeQueryOptions({ cwd: "/tmp/project", claudeExecutablePath: "", runtimeOptions, secondaryReadOnly: true, secretEnv: { CLAUDE_CODE_ENABLE_TASKS: "untrusted" } });
  expect(secondary.env?.CLAUDE_CODE_ENABLE_TASKS).not.toBe("untrusted");
  expect(isReservedEnvVarName("CLAUDE_CODE_ENABLE_TASKS")).toBe(true);
  for (const params of [buildCodexThreadStartParams({ cwd: "/tmp/project", runtimeOptions }), buildCodexThreadResumeParams({ threadId: "thread", cwd: "/tmp/project", runtimeOptions })]) {
    expect(params.config).toMatchObject({ "tools.update_plan.enabled": true });
  }
  const params = buildCodexThreadStartParams({ cwd: "/tmp/project", runtimeOptions, secondaryReadOnly: true });
  expect(params.config?.["tools.update_plan.enabled"]).toBeUndefined();
});

test("the plan requirement reaches implicit and custom workflows on run turns", () => {
  const workflow = buildAgentRunWorkflow({ agent: { name: "Lead" }, now });
  expect(workflow.stages[0]).toMatchObject({ instruction: expect.stringContaining(AGENT_RUN_PLAN_INSTRUCTION) });
  for (const reason of ["stage", "nudge", "repair-checks"] as const) {
    const custom = { ...detail, agentRun: { ...detail.agentRun, workflow: { ...workflow, stages: [{ ...workflow.stages[0]!, instruction: "Read only." }] } } };
    const context = buildAgentRunTurnContextPart({ aggregate: custom, reason });
    expect(context.content).toContain("TodoWrite or update_plan");
    expect(context.content).toContain("exactly one step in progress");
    expect(context.content).toContain("plan-mode limits");
  }
});

test("lead and two workers update their own plans independently", () => {
  let message = todo(assistant(), "Lead first");
  message = todo(message, "Worker A", "a");
  message = todo(message, "Worker B", "b");
  message = todo(message, "Lead latest");
  message = todo(message, "Worker A latest", "a");
  expect(message.parts).toHaveLength(3);
  expect(findLatestTodoPart([prompt, message])?.input).toContain("Lead latest");
  const plan = resolveAgentRunPlan(detail, [prompt, message]);
  expect(describeRunPlan(plan)).toBe("Plan 0/1 · Now: Lead latest");
  expect(resolveAgentRunPlan(detail, [{ ...prompt, agentRunPrompt: { agentRunId: "other", assignment: null } }, message])).toBeNull();
  expect(describeRunPlan(null)).toBe("Planning…");
  const nested = appendProviderEventToAssistant({ message, event: { type: "tool", toolUseId: "nested-plan", parentToolUseId: "spawn-unknown", toolName: "TodoWrite", input: '{"todos":[{"content":"Nested worker step","status":"in_progress"}]}', state: "input-available" } });
  expect(nested.parts).toHaveLength(4);
  expect(describeRunPlan(resolveAgentRunPlan(detail, [prompt, nested]))).toBe("Plan 0/1 · Now: Lead latest");
  expect(findLatestTodoPart([nested])?.input).toContain("Lead latest");
});

test("Progress renders the live plan and uses stored facts between turns", () => {
  const message = todo(assistant(), "Check the live diff");
  useAppStore.setState({ messagesByTask: { [detail.agentRun.leadTaskId]: [prompt, message] } });
  const html = renderToStaticMarkup(createElement(AgentRunOverview, { detail, plan: resolveAgentRunPlan(detail, [prompt, message]), now: now.getTime() }));
  expect(html).toContain("Plan 0/1 · Now: Check the live diff");
  expect(html).toContain('aria-label="Plan"');
  const plan = resolveAgentRunPlan(detail, [prompt, message])!;
  const stored = { ...detail, stages: detail.stages.map((stage) => ({ ...stage, facts: { diff: null, commands: [], toolCalls: [], action: null, plan } })) };
  expect(resolveAgentRunPlan(stored, [])).toEqual(plan);
  const shelf = renderToStaticMarkup(createElement(AgentRunLineView, { detail: stored, now: now.getTime(), nowPhrase: null, reducedMotion: true, subagents: "Implementer running · Reviewer done" }));
  expect(shelf).toContain("Plan 0/1 · Now: Check the live diff");
  expect(shelf).toContain("Implementer running · Reviewer done");
});

test("Claude subagents retain label, step, result and failure after event compaction", () => {
  let message = assistant("claude-code");
  for (const id of ["a", "b"]) {
    message = appendProviderEventToAssistant({ message, event: { type: "tool", toolUseId: `spawn-${id}`, agentId: id, toolName: "Agent", input: JSON.stringify({ description: id === "a" ? "Implementer" : "Reviewer" }), state: "input-available" } });
    message = todo(message, id === "a" ? "Verify the fix" : "Read the diff", id);
  }
  message = appendProviderEventToAssistant({ message, event: { type: "tool_result", tool_use_id: "spawn-a", output: "The fix and checks passed." } });
  message = appendProviderEventToAssistant({ message, event: { type: "tool_result", tool_use_id: "spawn-b", output: "Cannot read the requested commit.", isError: true } });
  const rows = selectTaskSubagents({ messages: JSON.parse(JSON.stringify([message])) });
  expect(rows).toHaveLength(2);
  expect(describeSubagentSummary(rows)).toBe("Implementer done · Reviewer failed");
  expect(rows[0]?.outcome.progress?.at(-1)).toBe("Verify the fix");
  expect(subagentResultLine(rows[0]!)).toBe("The fix and checks passed.");
  expect(subagentResultLine(rows[1]!)).toBe("Cannot read the requested commit.");
  const framed = { ...rows[0]!, outcome: { ...rows[0]!.outcome, result: "[Report] Provider output follows:\n  The checks passed.\n  No issues found." } };
  expect(subagentResultLine(framed)).toBe("The checks passed. No issues found.");
  expect(framed.outcome.result).toContain("[Report]");
});

test("Codex spawn handle leaves the worker running, with its own plan until final output", () => {
  const mapper = createCodexWorkerActivityMapper({ inputMaxBytes: 10_000, outputMaxBytes: 10_000 });
  const spawn = { id: "spawn", type: "collabAgentToolCall", tool: "spawnAgent", newThreadId: "worker", prompt: "Implementer", status: "completed" };
  let message = assistant();
  for (const event of [...mapper.mapStarted(spawn).events, ...mapper.mapCompleted(spawn).events]) message = appendProviderEventToAssistant({ message, event });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [message] }))).toBe("Implementer running");
  const plans = mapper.mapForeignNotification({ method: "turn/plan/updated", threadId: "worker", params: { turnId: "child-turn", plan: [{ step: "Run focused checks", status: "inProgress" }] } });
  expect(plans.events[0]).toMatchObject({ ownerAgentId: "worker", parentToolUseId: "spawn" });
  for (const event of plans.events) message = appendProviderEventToAssistant({ message, event });
  expect(findLatestTodoPart([message])).toBeNull();
  expect(selectTaskSubagents({ messages: [message] })[0]?.outcome.progress?.at(-1)).toBe("Run focused checks");
  const finished = mapper.mapForeignNotification({ method: "item/completed", threadId: "worker", params: { item: { type: "agentMessage", phase: "final_answer", text: "Checks passed." } } });
  for (const event of finished.events) message = appendProviderEventToAssistant({ message, event });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [message] }))).toBe("Implementer done");
  expect(subagentResultLine(selectTaskSubagents({ messages: [message] })[0]!)).toBe("Checks passed.");
});

test("sealed tool parts do not turn unfinished workers into successful results", () => {
  const mapper = createCodexWorkerActivityMapper({ inputMaxBytes: 10_000, outputMaxBytes: 10_000 });
  const spawn = { id: "spawn", type: "collabAgentToolCall", tool: "spawnAgent", newThreadId: "worker", prompt: "Implementer", status: "completed" };
  let message = assistant();
  for (const event of [...mapper.mapStarted(spawn).events, ...mapper.mapCompleted(spawn).events]) message = appendProviderEventToAssistant({ message, event });
  const stopped = appendProviderEventToAssistant({ message, event: { type: "done", stop_reason: "interrupted" } });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [stopped] }))).toBe("Implementer stopped");
  const failed = appendProviderEventToAssistant({ message, event: { type: "error", message: "Runtime disconnected." } });
  const finished = appendProviderEventToAssistant({ message: failed, event: { type: "done" } });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [finished] }))).toBe("Implementer failed");
  const noOutput = { ...message, parts: message.parts.map((part) => part.type === "tool_use" ? { ...part, output: undefined } : part) };
  const unknown = appendProviderEventToAssistant({ message: noOutput, event: { type: "done" } });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [unknown] }))).toBe("Implementer unresolved");
});

test("release notices and delegated instructions alone do not opt into native plans", () => {
  for (const agentInstructions of ["# Agent released\nThe role no longer applies.", "Complete the delegated task."]) {
    const runtimeOptions = { agentInstructions };
    const claude = buildClaudeQueryOptions({ cwd: "/tmp/project", claudeExecutablePath: "", runtimeOptions });
    expect(claude.env?.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBeUndefined();
    expect(claude.env?.CLAUDE_CODE_ENABLE_TASKS).toBeUndefined();
    for (const params of [buildCodexThreadStartParams({ cwd: "/tmp/project", runtimeOptions }), buildCodexThreadResumeParams({ threadId: "thread", cwd: "/tmp/project", runtimeOptions })]) {
      expect(params.config?.["tools.update_plan.enabled"]).toBeUndefined();
    }
  }
});

test("a plan-less run keeps its working label and actual activity, with Planning as the idle fallback", () => {
  const activity = renderToStaticMarkup(createElement(AgentRunLineView, { detail, now: now.getTime(), nowPhrase: "Editing progress.ts", reducedMotion: true }));
  expect(activity).toContain("Working");
  expect(activity).toContain("Editing progress.ts");
  expect(activity).not.toContain("Planning…");
  const idle = renderToStaticMarkup(createElement(AgentRunLineView, { detail, now: now.getTime(), nowPhrase: null, reducedMotion: true }));
  expect(idle).toContain("Planning…");
});

test("run plans include live and persisted user replies, excluding chat before and after the run", () => {
  const start = "2026-10-05T00:00:00Z";
  const end = "2026-10-05T00:10:00Z";
  const run = { ...detail, agentRun: { ...detail.agentRun, createdAt: start, updatedAt: end } };
  const reply: ChatMessage = { ...prompt, id: "reply", agentRunPrompt: undefined, content: "Also verify the shelf." };
  const response = todo({ ...assistant(), id: "reply-assistant", turnId: "reply-turn", startedAt: "2026-10-05T00:01:00Z" }, "Verify the revised scope");
  const before = todo({ ...assistant(), id: "before", turnId: "old-turn", startedAt: "2026-10-04T23:59:00Z" }, "Old scope");
  const messages = [before, prompt, todo(assistant(), "Initial scope"), reply, response];
  expect(describeRunPlan(resolveAgentRunPlan(run, messages))).toBe("Plan 0/1 · Now: Verify the revised scope");
  // Event ownership survives missing timestamps in historical rows.
  const persisted = { ...run, events: [{ id: "reply-event", agentRunId: run.agentRun.id, kind: "user-turn", sequence: 1, idempotencyKey: null, createdAt: end, detail: { turnId: "reply-turn" } }] };
  expect(resolveAgentRunPlan(persisted, [prompt, assistant(), reply, { ...response, startedAt: undefined }])).toEqual(resolveAgentRunPlan(run, messages));
  const ended = { ...run, agentRun: { ...run.agentRun, state: "completed" as const } };
  const later = todo({ ...assistant(), id: "later", turnId: "chat-turn", startedAt: "2026-10-05T00:11:00Z" }, "Ordinary chat");
  const scoped = agentRunMessages(ended, [...messages, { ...reply, id: "chat" }, later]);
  expect(scoped.map((message) => message.id)).toEqual(["assistant", "reply-assistant"]);
});

test("native worker exits without an answer settle as failure instead of remaining running", () => {
  const cases = [
    { method: "turn/completed", params: { turn: { status: "completed" } } },
    { method: "turn/completed", params: { turn: { status: "interrupted" } } },
    { method: "thread/closed", params: {} },
    { method: "thread/status/changed", params: { status: { type: "systemError" } } },
  ];
  for (const notification of cases) {
    const mapper = createCodexWorkerActivityMapper({ inputMaxBytes: 10_000, outputMaxBytes: 10_000 });
    const spawn = { id: "spawn", type: "collabAgentToolCall", tool: "spawnAgent", newThreadId: "worker", prompt: "Implementer", status: "completed" };
    let message = assistant();
    for (const event of [...mapper.mapStarted(spawn).events, ...mapper.mapCompleted(spawn).events]) message = appendProviderEventToAssistant({ message, event });
    const exit = mapper.mapForeignNotification({ ...notification, threadId: "worker" });
    expect(exit.events).toHaveLength(1);
    for (const event of exit.events) message = appendProviderEventToAssistant({ message, event });
    expect(describeSubagentSummary(selectTaskSubagents({ messages: [message] }))).toBe("Implementer failed");
    expect(mapper.ownsChildThread("worker")).toBe(false);
    expect(mapper.agentIdForToolUseId("spawn")).toBeUndefined();
  }
});

test("the plan instruction occurs once on an implicit stage turn and remains on reminder turns", () => {
  const workflow = buildAgentRunWorkflow({ agent: { name: "Lead" }, now });
  const aggregate = { ...detail, agentRun: { ...detail.agentRun, workflow } };
  const context = buildAgentRunTurnContextPart({ aggregate, reason: "stage" });
  expect(context.content).not.toContain(AGENT_RUN_PLAN_INSTRUCTION);
  expect(buildAgentRunTurnContextPart({ aggregate, reason: "nudge" }).content).toContain(AGENT_RUN_PLAN_INSTRUCTION);
});

test("run subagents exclude older messages, retained graphs and ledger rows and sort sources together", () => {
  const run = { ...detail, agentRun: { ...detail.agentRun, createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:10:00Z", state: "completed" as const } };
  const spawn = (turnId: string, startedAt: string, description: string) => appendProviderEventToAssistant({
    message: { ...assistant(), turnId, startedAt }, event: { type: "tool", toolUseId: `spawn-${turnId}`, agentId: turnId, toolName: "Agent", input: JSON.stringify({ description }), state: "input-available" },
  });
  const old = spawn("old", "2026-10-04T23:59:00Z", "Old worker");
  const current = spawn("turn", "2026-10-05T00:01:00Z", "Current worker");
  const child = (delegationKey: string, createdAt: string): DelegatedTaskSummary => ({
    runId: delegationKey, stepId: delegationKey, parentTaskId: run.agentRun.leadTaskId, delegationKey,
    delegatedTaskId: delegationKey, delegatedWorkspaceId: "workspace", delegatedTurnId: null,
    providerId: "codex", lifecycle: "one-turn", phase: "completed", reason: null, attempt: 0,
    createdAt, updatedAt: createdAt, completedAt: createdAt,
  });
  const oldGraph = reduceWorkGraphEvent(createWorkGraph({ turnId: "old", providerId: "codex", startedAt: 0 }), {
    type: "tool", toolUseId: "retained", toolName: "Agent", input: '{"description":"Old retained worker"}', state: "input-available",
  }, 0);
  const delegatedTasks = [child("old-ledger", "2026-10-04T23:59:00Z"), child("new-ledger", "2026-10-05T00:02:00Z"), child("after-ledger", "2026-10-05T00:11:00Z")];
  const messages = [old, prompt, current];
  const rows = selectAgentRunSubagents(run, { messages, workGraph: oldGraph, delegatedTasks });
  expect(rows.map((row) => row.title)).toEqual(["Current worker", "new-ledger"]);
  // The general task view still includes history, ordered across both sources.
  expect(selectTaskSubagents({ messages, delegatedTasks }).map((row) => row.title)).toEqual(["old-ledger", "Old worker", "Current worker", "new-ledger", "after-ledger"]);
});

test("a disabled subagent hook reads no task history and returns the same empty collection", () => {
  let reads = 0;
  const messagesByTask = new Proxy(originalMessages, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } });
  useAppStore.setState({ messagesByTask });
  const rows: unknown[] = [];
  function Probe() { rows.push(useTaskSubagents(detail.agentRun.leadTaskId, null)); return null; }
  const initialState = useAppStore.getInitialState();
  const initialMessages = initialState.messagesByTask;
  initialState.messagesByTask = messagesByTask;
  try {
    renderToStaticMarkup(createElement(Probe));
    renderToStaticMarkup(createElement(Probe));
    expect(reads).toBe(0);
    expect(rows[0]).toBe(rows[1]);
    expect(rows[0]).toEqual([]);
  } finally {
    initialState.messagesByTask = initialMessages;
  }

});

test("shared progress text accepts the live plan and keeps the stored fallback", () => {
  const message = todo(assistant(), "Verify the live activity row");
  const stalePlan = { items: [{ content: "Old saved step", status: "in_progress" as const }], turnId: "old" };
  const run = { ...detail, stages: detail.stages.map((stage) => ({ ...stage, facts: { diff: null, commands: [], toolCalls: [], action: null, plan: stalePlan } })) };
  const plan = resolveAgentRunPlan(run, [prompt, message]);
  expect(describeAgentRunProgress(run, plan)).toBe(describeRunPlan(plan));
  expect(describeAgentRunProgress(run, plan)).toBe("Plan 0/1 · Now: Verify the live activity row");
  expect(describeAgentRunProgress(run)).toBe("Plan 0/1 · Now: Old saved step");
});

test("a failed native spawn receipt remains failed after message-only reconstruction", () => {
  const mapper = createCodexWorkerActivityMapper({ inputMaxBytes: 10_000, outputMaxBytes: 10_000 });
  const spawn = { id: "spawn", type: "collabAgentToolCall", tool: "spawnAgent", receiverThreadIds: ["worker"], prompt: "Reviewer", status: "failed" };
  let message = assistant();
  for (const event of [...mapper.mapStarted(spawn).events, ...mapper.mapCompleted(spawn).events]) message = appendProviderEventToAssistant({ message, event });
  expect(describeSubagentSummary(selectTaskSubagents({ messages: [message] }))).toBe("Reviewer failed");
});
