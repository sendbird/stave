import { expect, test } from "bun:test";
import { addIdleTask, resolveTaskModel } from "../electron/host-service/idle-task";
import { createEmptyWorkspaceState } from "../src/store/workspace-session-state";

test("an idle task starts its composer on the chosen model, and that is the model it runs on", () => {
  const session = createEmptyWorkspaceState() as never;
  const { session: next, taskId } = addIdleTask(session, { title: "  Move billing  ", provider: "codex", model: "gpt-6-luna" });
  const task = next.tasks.find((candidate) => candidate.id === taskId)!;
  expect(task).toMatchObject({ title: "Move billing", provider: "codex", controlOwner: "stave" });
  expect(next.promptDraftByTask[taskId]?.runtimeOverrides).toEqual({ model: "gpt-6-luna", modelProviderId: "codex" });
  expect(resolveTaskModel({ messages: [], draft: next.promptDraftByTask[taskId], providerId: "codex" })).toBe("gpt-6-luna");

  // Without a model, no draft is written and the provider default applies.
  const plain = addIdleTask(session, { title: "", provider: "claude-code" });
  expect(plain.session.promptDraftByTask[plain.taskId]).toBeUndefined();
  expect(plain.session.tasks[0]!.title).toBe("Run");
});

test("a message's model wins, and a drafted model of another provider is ignored", () => {
  const draft = { text: "", attachedFilePaths: [], attachments: [], runtimeOverrides: { model: "gpt-6-luna", modelProviderId: "codex" as const } };
  expect(resolveTaskModel({ messages: [{ model: "gpt-6-sol" }] as never, draft, providerId: "codex" })).toBe("gpt-6-sol");
  expect(resolveTaskModel({ messages: [], draft, providerId: "claude-code" })).not.toBe("gpt-6-luna");
});
