import { afterEach, expect, test } from "bun:test";
import { useAppStore } from "../src/store/app.store";
import { collectTaskReferenceContextParts } from "../src/store/attached-task-context-runtime";
import { flushPendingSnapshotPersists } from "../src/store/workspace-session-state";
import type { Task, ChatMessage } from "../src/types/chat";

const task = (id: string): Task => ({ id, title: id, provider: "codex", updatedAt: "now", unread: false, controlMode: "interactive", controlOwner: "stave" });
const answer: ChatMessage = { id: "answer", role: "assistant", model: "test", providerId: "codex", content: "Final result\nwith details", parts: [] };

function prepare() {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    activeWorkspaceId: "workspace", activeTaskId: "fork",
    workspaces: [{ id: "workspace", name: "Workspace", updatedAt: "now" }],
    tasks: [task("original"), { ...task("fork"), forkParent: { taskId: "original", workspaceId: "workspace", messageId: "boundary" } }],
    taskWorkspaceIdById: { original: "workspace", fork: "workspace" },
    messagesByTask: { original: [], fork: [answer] }, messageCountByTask: { original: 0, fork: 1 },
  });
  useAppStore.getState().updatePromptDraft({ taskId: "original", patch: {
    text: "Existing draft", attachedFilePaths: ["notes.txt"],
  } });
}

afterEach(async () => {
  await flushPendingSnapshotPersists();
  useAppStore.setState(useAppStore.getInitialState());
});

test("returning the final answer selects the original draft, preserves text and files, quotes a link and attaches readable context without sending", async () => {
  prepare();
  const result = await useAppStore.getState().sendForkResultToOriginal({ taskId: "fork" });
  expect(result.ok).toBe(true);
  const state = useAppStore.getState();
  const draft = state.promptDraftByTask.original;
  expect(state.activeTaskId).toBe("original");
  expect(draft?.text).toStartWith("Existing draft\n\n> ");
  expect(draft?.text).toContain("> Final result\n> with details");
  expect(draft?.text).toContain("stave://workspace/workspace/task/fork");
  expect(draft?.attachedFilePaths).toEqual(["notes.txt"]);
  expect(draft?.attachments).toEqual([expect.objectContaining({ kind: "task-context", taskId: "fork", workspaceId: "workspace", scope: "conversation" })]);
  expect(state.messagesByTask.original).toEqual([]);
  expect(state.activeTurnIdsByTask).toEqual({});
  expect(state.promptFocusNonce).toBeGreaterThan(0);
  const contexts = await collectTaskReferenceContextParts({ getState: useAppStore.getState, prompt: draft!.text, promptDraft: draft!, currentTaskId: "original", tasks: state.tasks, messagesByTask: state.messagesByTask });
  expect(contexts.map((part) => part.content).join("\n")).toContain("Final result");
  await useAppStore.getState().sendForkResultToOriginal({ taskId: "fork" });
  expect(useAppStore.getState().promptDraftByTask.original?.attachments).toHaveLength(1);
});

test.each(["running", "streaming", "no-answer", "deleted-original", "wrong-workspace"])("refuses %s without changing a draft", async (scenario) => {
  prepare();
  if (scenario === "running") useAppStore.setState({ activeTurnIdsByTask: { fork: "turn" } });
  if (scenario === "streaming") useAppStore.setState({ messagesByTask: { fork: [{ ...answer, isStreaming: true }] } });
  if (scenario === "no-answer") useAppStore.setState({ messagesByTask: { fork: [] }, messageCountByTask: { fork: 0 } });
  if (scenario === "deleted-original") useAppStore.setState((state) => ({ tasks: state.tasks.filter((row) => row.id !== "original") }));
  if (scenario === "wrong-workspace") useAppStore.setState({ activeWorkspaceId: "other" });
  const before = useAppStore.getState().promptDraftByTask;
  expect((await useAppStore.getState().sendForkResultToOriginal({ taskId: "fork" })).ok).toBe(false);
  expect(useAppStore.getState().promptDraftByTask).toBe(before);
});


test("refuses a full task attachment shelf instead of returning a result without its context", async () => {
  prepare();
  useAppStore.getState().updatePromptDraft({ taskId: "original", patch: { attachments: Array.from({ length: 5 }, (_, index) => ({
    kind: "task-context" as const, id: `existing-${index}`, taskId: `existing-${index}`, workspaceId: "workspace", title: "Existing", scope: "latest-reply" as const,
  })) } });
  const before = useAppStore.getState().promptDraftByTask;
  expect((await useAppStore.getState().sendForkResultToOriginal({ taskId: "fork" })).ok).toBe(false);
  expect(useAppStore.getState().promptDraftByTask).toBe(before);
});
