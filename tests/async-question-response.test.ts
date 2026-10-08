import { afterEach, expect, test } from "bun:test";
import type { ChatMessage } from "../src/types/chat";
import { useAppStore } from "../src/store/app.store";

const originalWindow = globalThis.window;
afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  Object.assign(globalThis, { window: originalWindow });
});

test("an async answer queues once and acknowledges only after acceptance", async () => {
  let accept!: () => void;
  let sent = 0;
  const acknowledgements: string[] = [];
  Object.assign(globalThis, { window: { api: { localMcp: {
    respondUserInput: async ({ requestId }: { requestId: string }) => { acknowledgements.push(requestId); return { ok: true }; },
  } } } });
  const message: ChatMessage = { id: "m1", role: "assistant", providerId: "codex", model: "auto", content: "", parts: [{
    type: "user_input", delivery: "async", requestId: "q1", toolName: "request_user_input_async",
    state: "input-requested", questions: [{ key: "scope", question: "Which scope?", header: "", options: [] }],
  }] };
  useAppStore.setState({
    ...useAppStore.getInitialState(), activeWorkspaceId: "ws-1", activeTaskId: "task-1",
    taskWorkspaceIdById: { "task-1": "ws-1" }, messagesByTask: { "task-1": [message] },
    sendUserMessage: async (args) => {
      sent++;
      expect(args.submitIntent).toBe("queue");
      expect(args.content).toContain("Focused");
      await new Promise<void>((resolve) => { accept = resolve; });
      return { status: "queued" } as never;
    },
  });
  const answer = { taskId: "task-1", messageId: "m1", requestId: "q1", answers: { scope: "Focused" } };
  useAppStore.getState().resolveUserInput(answer);
  useAppStore.getState().resolveUserInput(answer);
  expect(sent).toBe(1);
  expect(acknowledgements).toHaveLength(0);
  expect(useAppStore.getState().messagesByTask["task-1"]![0]!.parts[0]).toMatchObject({ state: "input-requested" });
  accept();
  await Bun.sleep(0);
  expect(acknowledgements).toEqual(["q1"]);
  expect(useAppStore.getState().messagesByTask["task-1"]![0]!.parts[0]).toMatchObject({ state: "input-responded" });
});
