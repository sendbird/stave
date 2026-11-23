import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { collectFleetNotificationAttentionItems } from "@/lib/fleet/attention-projection";
import { buildFleetInbox } from "@/lib/fleet/inbox-model";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { ProviderDecisionResponse, ProviderId } from "@/lib/providers/provider.types";
import { startProviderTurnActivity } from "@/lib/providers/turn-status";
import { answerFromBell, classifyBellQuickAnswer, readBellRequest } from "@/store/bell-quick-answer";
import { createWorkspaceSessionStateFromAppState } from "@/store/workspace-runtime-state";
import type { ApprovalPart, UserInputPart, UserInputQuestion } from "@/types/chat";

const approval: ApprovalPart = {
  type: "approval", requestId: "request", toolName: "Read", description: "Read configuration",
  supportsAllowAlways: true, state: "approval-requested",
};
const question: UserInputQuestion = {
  key: "format", header: "Format", question: "Choose a format",
  options: ["CSV", "JSON", "XML", "TSV"].map((label) => ({ label, value: label.toLowerCase(), description: "" })),
};
const input: UserInputPart = {
  type: "user_input", requestId: "request", toolName: "AskUserQuestion", state: "input-requested",
  questions: [question],
};

describe("bell eligibility", () => {
  test("offers approval and one to four fixed choices", () => {
    expect(classifyBellQuickAnswer(approval).kind).toBe("approval");
    for (let count = 1; count <= 4; count++) {
      expect(classifyBellQuickAnswer({
        ...input, questions: [{ ...question, options: question.options.slice(0, count) }],
      }).kind).toBe("short-question");
    }
  });

  const complex: Array<[string, UserInputPart]> = [
    ["multiple questions", { ...input, questions: [question, question] }],
    ["multiple selections", { ...input, questions: [{ ...question, multiSelect: true }] }],
    ["typed answers", { ...input, questions: [{ ...question, inputType: "text", options: [] }] }],
    ["custom answers", { ...input, questions: [{ ...question, allowCustom: true }] }],
    ["long prompts", { ...input, questions: [{ ...question, question: "Choose carefully. ".repeat(15) }] }],
    ["too many choices", { ...input, questions: [{ ...question, options: [...question.options, { label: "PDF", description: "" }] }] }],
    ["option previews", { ...input, questions: [{ ...question, options: [{ label: "CSV", description: "", preview: "one,two" }] }] }],
    ["asynchronous questions", { ...input, delivery: "async" }],
  ];
  test.each(complex)("%s use Open task", (_name, part) =>
    expect(classifyBellQuickAnswer(part).kind).toBe("open"));
});

const originalWindow = globalThis.window;
let schedule: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">> | undefined;
const capturedTurnId = "turn";
const taskId = "task";
const workspaceId = "workspace";
const repositoryPath = "/tmp/bell-tests";

async function seed(part: ApprovalPart | UserInputPart, providerId: ProviderId = "codex") {
  const respondApproval = mock(async (_args: unknown): Promise<ProviderDecisionResponse> => ({ ok: true }));
  const respondUserInput = mock(async (_args: unknown): Promise<ProviderDecisionResponse> => ({ ok: true }));
  (globalThis as { window: unknown }).window = {
    api: { provider: { respondApproval, respondUserInput } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
  const { useAppStore: store } = await import("@/store/app.store");
  const markNotificationRead = mock(async ({ id, resolvedAt }: { id: string; resolvedAt?: string }) => {
    store.setState((state) => ({
      notifications: state.notifications.map((row) =>
        row.id === id ? { ...row, readAt: resolvedAt ?? null, resolvedAt } : row),
    }));
    return true;
  });
  const at = new Date().toISOString();
  const notification: AppNotification = {
    id: "notice", title: "Task", taskTitle: "Task", body: "", providerId,
    taskId, workspaceId, workspaceName: "main", repositoryPath, repositoryName: "bell-tests",
    kind: part.type === "approval" ? "task.approval_requested" : "task.user_input_requested",
    action: part.type === "approval" ? { type: "approval", requestId: part.requestId, messageId: "message" } : null,
    payload: { requestId: part.requestId, messageId: "message" },
    turnId: capturedTurnId, createdAt: at, readAt: null,
  };
  store.setState({
    ...store.getInitialState(),
    repositoryPath, activeWorkspaceId: workspaceId, hasHydratedWorkspaces: true,
    workspaces: [{ id: workspaceId, name: "main", updatedAt: at }],
    tasks: [{ id: taskId, title: "Task", provider: providerId, updatedAt: at, unread: false, controlMode: "interactive", controlOwner: "stave" }],
    taskWorkspaceIdById: { [taskId]: workspaceId },
    messagesByTask: { [taskId]: [{
      id: "message", turnId: capturedTurnId, providerId, model: "test", role: "assistant", content: "", parts: [part],
    }] },
    activeTurnIdsByTask: { [taskId]: capturedTurnId },
    providerTurnActivityByTask: startProviderTurnActivity({
      activityByTask: {}, taskId, turnId: capturedTurnId, providerId, now: 1_000,
      pendingInteraction: part.type === "approval" ? "approval" : "user_input",
    }),
    notifications: [notification],
    markNotificationRead,
  }, true);
  const entry = buildFleetInbox({
    items: collectFleetNotificationAttentionItems([notification]),
    notifications: [notification],
  }).itemEntries[0]!;
  schedule = spyOn(globalThis, "setTimeout");
  return { store, entry, respondApproval, respondUserInput, markNotificationRead, schedule };
}

afterEach(async () => {
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  schedule?.mockRestore();
  (globalThis as { window: unknown }).window = originalWindow;
});

for (const provider of ["claude-code", "codex"] as const) {
  test(`bell approvals use the ${provider} card action and restart turn activity`, async () => {
    const { store, entry, respondApproval, markNotificationRead, schedule } = await seed(approval, provider);
    expect(await answerFromBell(store.getState, entry, { approved: true })).toEqual({ status: "delivered" });
    expect(respondApproval.mock.calls).toEqual([[{ turnId: capturedTurnId, requestId: approval.requestId, approved: true }]]);
    expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toMatchObject({
      state: "approval-responded", resolution: { scope: "once", decision: "allowed" },
    });
    expect(store.getState().settings.trustedTools).toEqual([]);
    expect(store.getState().providerTurnActivityByTask[taskId]?.pendingInteraction).toBeNull();
    expect(store.getState().providerTurnActivityByTask[taskId]!.lastEventAt).toBeGreaterThan(1_000);
    expect(markNotificationRead).toHaveBeenCalledWith({ id: "notice", resolvedAt: expect.any(String) });
    expect(schedule).toHaveBeenCalled();
  });

  test(`bell questions use the ${provider} card action and send the option value`, async () => {
    const { store, entry, respondUserInput, markNotificationRead, schedule } = await seed(input, provider);
    expect(await answerFromBell(store.getState, entry, { value: "json" })).toEqual({ status: "delivered" });
    expect(respondUserInput.mock.calls).toEqual([[{
      turnId: capturedTurnId, requestId: input.requestId, answers: { format: "json" }, denied: undefined,
    }]]);
    expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toMatchObject({
      state: "input-responded", answers: { format: "json" },
    });
    expect(store.getState().providerTurnActivityByTask[taskId]?.pendingInteraction).toBeNull();
    expect(markNotificationRead).toHaveBeenCalledWith({ id: "notice", resolvedAt: expect.any(String) });
    expect(schedule).toHaveBeenCalled();
  });
}

test("a stale click after the task card answered sends nothing and settles its notification", async () => {
  const { store, entry, respondUserInput, markNotificationRead } = await seed(input);
  const part = { ...input, state: "input-responded" as const, answers: { format: "csv" } };
  store.setState({ messagesByTask: { [taskId]: [{ ...store.getState().messagesByTask[taskId]![0]!, parts: [part] }] } });
  expect(await answerFromBell(store.getState, entry, { value: "json" })).toEqual({ status: "skipped" });
  expect(respondUserInput).not.toHaveBeenCalled();
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
  expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toEqual(part);
});

test("a replaced turn does not send to the new turn", async () => {
  const { store, entry, respondApproval, markNotificationRead } = await seed(approval);
  store.setState({ activeTurnIdsByTask: { [taskId]: "different-turn" } });
  expect(await answerFromBell(store.getState, entry, { approved: false })).toEqual({ status: "skipped" });
  expect(respondApproval).not.toHaveBeenCalled();
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
});

test("an unloaded owning workspace settles the row without sending or loading", async () => {
  const { store, entry, respondApproval, markNotificationRead } = await seed(approval);
  store.setState({ activeWorkspaceId: "other", workspaceRuntimeCacheById: {} });
  expect(readBellRequest(store.getState(), entry).status).toBe("stale");
  expect(await answerFromBell(store.getState, entry, { approved: true })).toEqual({ status: "skipped" });
  expect(respondApproval).not.toHaveBeenCalled();
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
  expect(store.getState().activeWorkspaceId).toBe("other");
});

test("a loaded background workspace uses the owning session and leaves the current workspace open", async () => {
  const { store, entry, respondApproval } = await seed(approval, "claude-code");
  const session = createWorkspaceSessionStateFromAppState(store.getState());
  store.setState({
    activeWorkspaceId: "other",
    tasks: [],
    messagesByTask: {},
    activeTurnIdsByTask: {},
    workspaceRuntimeCacheById: { [workspaceId]: session },
  });
  expect(await answerFromBell(store.getState, entry, { approved: false })).toEqual({ status: "delivered" });
  expect(respondApproval.mock.calls).toEqual([[{ turnId: capturedTurnId, requestId: approval.requestId, approved: false }]]);
  const background = store.getState().workspaceRuntimeCacheById[workspaceId];
  expect(background?.messagesByTask[taskId]![0]!.parts[0]).toMatchObject({ state: "output-denied" });
  expect(store.getState().activeWorkspaceId).toBe("other");
});

test("a provider rejection racing an external approval preserves its recorded decision", async () => {
  const { store, entry, respondApproval } = await seed(approval);
  const delivery = Promise.withResolvers<ProviderDecisionResponse>();
  respondApproval.mockReturnValueOnce(delivery.promise);
  const sending = answerFromBell(store.getState, entry, { approved: true });
  const part = { ...approval, state: "output-denied" as const };
  store.setState({ messagesByTask: { [taskId]: [{ ...store.getState().messagesByTask[taskId]![0]!, parts: [part] }] } });
  delivery.resolve({ ok: false, reason: "already-answered" });
  expect(await sending).toEqual({ status: "skipped" });
  expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toEqual(part);
});

test("the preference is rechecked when the user clicks", async () => {
  const { store, entry, respondApproval, markNotificationRead } = await seed(approval);
  store.setState((state) => ({ settings: { ...state.settings, notificationActionsEnabled: false } }));
  expect(readBellRequest(store.getState(), entry).status).toBe("open");
  expect((await answerFromBell(store.getState, entry, { approved: true })).status).toBe("failed");
  expect(respondApproval).not.toHaveBeenCalled();
  expect(markNotificationRead).not.toHaveBeenCalled();
});

test("an already answered provider request closes when the renderer is still waiting", async () => {
  const { store, entry, respondUserInput, markNotificationRead } = await seed(input);
  respondUserInput.mockResolvedValueOnce({ ok: false, reason: "already-answered" });
  expect(await answerFromBell(store.getState, entry, { value: "json" })).toEqual({ status: "skipped" });
  expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toMatchObject({ state: "input-interrupted" });
  expect(markNotificationRead).toHaveBeenCalledTimes(1);
});

test("a write failure leaves the card and notification available in the task", async () => {
  const { store, entry, respondUserInput, markNotificationRead } = await seed(input);
  respondUserInput.mockResolvedValueOnce({ ok: false, reason: "write-failed", message: "Delivery failed" });
  expect(await answerFromBell(store.getState, entry, { value: "json" })).toMatchObject({ status: "failed" });
  expect(store.getState().messagesByTask[taskId]![0]!.parts[0]).toEqual(input);
  expect(markNotificationRead).not.toHaveBeenCalled();
});
