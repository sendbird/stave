import { afterEach, expect, test } from "bun:test";
import { AgentRunCommandError } from "../src/lib/agent-runs/domain";
import { runQuestionRequestId } from "../src/lib/agent-runs/persistent-question";
import { respondHostUserInput, type HostUserInputPorts } from "../electron/host-service/host-user-input";
import { setRunQuestionAnswerer } from "../electron/host-service/run-question-answer";
import type { WorkspaceSessionState } from "../src/store/workspace-session-state";

afterEach(() => setRunQuestionAnswerer(null));

const stage = { agentRunId: "run-1", stageId: "work", attempt: 1 };
const requestId = runQuestionRequestId(stage, "native-1", "turn-1");

function sessionWith(delivery?: "async"): WorkspaceSessionState {
  return {
    tasks: [], activeTaskId: "task-1", activeTurnIdsByTask: {}, providerSessionByTask: {}, providerGoalByTask: {},
    messagesByTask: { "task-1": [{ id: "m1", role: "assistant", model: "m", providerId: "claude-code", turnId: "turn-1", content: "", parts: [{
      type: "user_input", requestId, toolName: "AskUserQuestion", state: "input-requested", ...(delivery ? { delivery } : {}),
      questions: [{ key: "file", question: "Which filename?", header: "File", options: [] }] }] }] },
  } as unknown as WorkspaceSessionState;
}

function harness(session: WorkspaceSessionState) {
  const log: string[] = [];
  let chain = Promise.resolve();
  const persisted: WorkspaceSessionState[] = [];
  const ports: HostUserInputPorts = {
    workspaceName: "Test",
    load: async () => session,
    enqueue: (_key, operation) => { log.push("queue:enter"); const next = chain.then(operation).finally(() => log.push("queue:leave")); chain = next.then(() => {}, () => {}); return next; },
    respond: async () => { throw new Error("no native callback"); },
    cache: (_key, value) => { session = value; return value; },
    persist: async ({ session: next }) => { persisted.push(next); },
  };
  return { ports, log, persisted, current: () => session };
}

test("a saved Run question is delivered after the workspace queue is released", async () => {
  const { ports, log } = harness(sessionWith("async"));
  let release!: () => void;
  const delivered = new Promise<void>(resolve => { release = resolve; });
  setRunQuestionAnswerer(async ({ prompt, questionAnswer }) => { log.push("answer:start"); expect(prompt).toContain("B.md"); expect(questionAnswer).toMatchObject({ requestId, answers: { file: "B.md" } }); await delivered; log.push("answer:end"); });
  const pending = respondHostUserInput({ workspaceId: "ws", taskId: "task-1", requestId, answers: { file: "B.md" } }, ports);
  release();
  await expect(pending).resolves.toMatchObject({ ok: true, requestId });
  // The queue was released before the answer started: delivery waits on the run, not the workspace.
  expect(log).toEqual(["queue:enter", "queue:leave", "answer:start", "answer:end"]);
});

test("a Run question whose run is gone ends instead of asking forever", async () => {
  const { ports, persisted, current } = harness(sessionWith("async"));
  setRunQuestionAnswerer(async () => { throw new AgentRunCommandError("not-active", "stage changed"); });
  await expect(respondHostUserInput({ workspaceId: "ws", taskId: "task-1", requestId, answers: { file: "B.md" } }, ports)).rejects.toThrow("stage changed");
  expect(persisted).toHaveLength(1);
  expect(current().messagesByTask["task-1"]![0]!.parts[0]).toMatchObject({ state: "input-interrupted" });
});

test("a transient refusal keeps the card answerable", async () => {
  const { ports, persisted, current } = harness(sessionWith("async"));
  setRunQuestionAnswerer(async () => { throw new AgentRunCommandError("refused", "wait for the approval"); });
  await expect(respondHostUserInput({ workspaceId: "ws", taskId: "task-1", requestId, answers: { file: "B.md" } }, ports)).rejects.toThrow("wait for the approval");
  expect(persisted).toHaveLength(0);
  expect(current().messagesByTask["task-1"]![0]!.parts[0]).toMatchObject({ state: "input-requested" });
});

test("a native Run card loaded without its turn is treated as saved", async () => {
  const { ports } = harness(sessionWith(undefined));
  let calls = 0;
  setRunQuestionAnswerer(async () => { calls += 1; });
  await expect(respondHostUserInput({ workspaceId: "ws", taskId: "task-1", requestId, denied: true }, ports)).resolves.toMatchObject({ ok: true, denied: true });
  expect(calls).toBe(1);
});
