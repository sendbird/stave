import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildShortQuestionAnswers,
  classifyFleetInlineInteraction,
} from "@/lib/fleet/inline-interaction";
import type { TaskMessagesPage, WorkspaceShell } from "@/lib/db/workspaces.db";
import type { PersistedTurnSummary } from "@/lib/db/turns.db";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";
import type {
  ApprovalPart,
  ChatMessage,
  Task,
  UserInputPart,
  UserInputQuestion,
} from "@/types/chat";

// Three workspaces of one repository: the open one, one another surface has
// already cached, and one nobody has opened since the app started.
const REPOSITORY_PATH = "/tmp/fleet-inline-project";
const NOW = "2026-10-22T00:00:00.000Z";

const approval = (requestId: string, state: ApprovalPart["state"] = "approval-requested"): ApprovalPart => ({
  type: "approval", requestId, toolName: "Bash", description: "Run the focused tests", input: "bun test tests/fleet", state,
});
const question = (overrides: Partial<UserInputQuestion> = {}): UserInputQuestion => ({
  question: "Which environment should this deploy to?", header: "Env",
  options: [{ label: "Staging", description: "Safe" }, { label: "Production" }], ...overrides,
});
const userInput = (requestId: string, questions: UserInputQuestion[], state: UserInputPart["state"] = "input-requested"): UserInputPart => ({
  type: "user_input", requestId, toolName: "AskUserQuestion", questions, state,
});
const message = (id: string, part: ApprovalPart | UserInputPart, turnId: string): ChatMessage => ({
  id, role: "assistant", model: "gpt-5.5", providerId: "codex", content: "", turnId, parts: [part],
});
const task = (id: string, title: string): Task => ({ id, title, provider: "codex", updatedAt: NOW, unread: false });

const originalWindow = globalThis.window;
const providerApprovals: Array<Record<string, unknown>> = [];
const providerAnswers: Array<Record<string, unknown>> = [];

async function store() {
  return (await import("@/store/app.store")).useAppStore;
}

async function flush() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

beforeEach(async () => {
  providerApprovals.length = 0;
  providerAnswers.length = 0;
  globalThis.window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: () => void) => globalThis.setTimeout(callback, 0),
    api: {
      provider: {
        respondApproval: async (args: Record<string, unknown>) => { providerApprovals.push(args); return { ok: true }; },
        respondUserInput: async (args: Record<string, unknown>) => { providerAnswers.push(args); return { ok: true }; },
      },
    },
  } as unknown as Window & typeof globalThis;
  const useAppStore = await store();
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    repositoryPath: REPOSITORY_PATH,
    activeWorkspaceId: "ws-open",
    activeTaskId: "task-open",
    workspaces: [
      { id: "ws-open", name: "open", updatedAt: NOW },
      { id: "ws-cached", name: "cached", updatedAt: NOW },
      { id: "ws-cold", name: "cold", updatedAt: NOW },
    ],
    tasks: [task("task-open", "Open task")],
    messagesByTask: { "task-open": [message("m-open", approval("approval-open"), "turn-open")] },
    activeTurnIdsByTask: { "task-open": "turn-open" },
    taskWorkspaceIdById: { "task-open": "ws-open", "task-cached": "ws-cached", "task-cold": "ws-cold" },
    workspaceRuntimeCacheById: {
      "ws-cached": {
        ...createEmptyWorkspaceState(),
        nativeSessionReadyByTask: {},
        tasks: [task("task-cached", "Cached task")],
        activeTaskId: "task-cached",
        messagesByTask: {
          "task-cached": [
            message("m-approval", approval("approval-cached"), "turn-cached"),
            message("m-question", userInput("question-cached", [question()]), "turn-cached"),
          ],
        },
        activeTurnIdsByTask: { "task-cached": "turn-cached" },
      },
    },
  });
});

afterEach(async () => {
  const useAppStore = await store();
  useAppStore.setState(useAppStore.getInitialState(), true);
  globalThis.window = originalWindow;
});

const cachedApproval = {
  repositoryPath: REPOSITORY_PATH, workspaceId: "ws-cached", taskId: "task-cached", turnId: "turn-cached",
  kind: "approval" as const, requestId: "approval-cached", messageId: "m-approval",
};

describe("which requests a Fleet row answers itself", () => {
  test("a pending approval is answered in the row", () => {
    expect(classifyFleetInlineInteraction(approval("a")).kind).toBe("approval");
    expect(classifyFleetInlineInteraction(approval("a", "approval-responded")).kind).toBe("open");
  });

  test("a short question is one single-select question with two to six options", () => {
    const short = classifyFleetInlineInteraction(userInput("q", [question()]));
    expect(short.kind).toBe("short-question");
    // Yes/No questions are options too.
    expect(classifyFleetInlineInteraction(userInput("q", [question({
      inputType: "boolean", options: [{ label: "Yes" }, { label: "No" }] })])).kind).toBe("short-question");
    const six = Array.from({ length: 6 }, (_, index) => ({ label: `Option ${index + 1}` }));
    expect(classifyFleetInlineInteraction(userInput("q", [question({ options: six })])).kind).toBe("short-question");
  });

  test("long forms, free text, numbers and links open the task instead", () => {
    const open = (questions: UserInputQuestion[]) => classifyFleetInlineInteraction(userInput("q", questions)).kind;
    expect(open([question(), question({ question: "And the region?" })])).toBe("open");
    expect(open([question({ multiSelect: true })])).toBe("open");
    expect(open([question({ options: [{ label: "Only" }] })])).toBe("open");
    expect(open([question({ options: Array.from({ length: 7 }, (_, index) => ({ label: `O${index}` })) })])).toBe("open");
    for (const inputType of ["text", "number", "integer", "url_notice"] as const) {
      expect(open([question({ inputType })])).toBe("open");
    }
    expect(classifyFleetInlineInteraction(userInput("q", [question()], "input-responded")).kind).toBe("open");
    expect(classifyFleetInlineInteraction(null).kind).toBe("open");
  });

  test("a picked option is filed like every other surface files it", () => {
    expect(buildShortQuestionAnswers(question(), { value: "Production" })).toEqual({
      "Which environment should this deploy to?": "Production",
    });
    expect(buildShortQuestionAnswers(question({ key: "env" }), { value: "Staging" })).toEqual({ env: "Staging" });
  });
});

describe("answering from Fleet", () => {
  test("a cached workspace's approval is delivered and recorded in its task without switching", async () => {
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    expect(respondToFleetInteraction(cachedApproval, { kind: "approval", approved: true }).ok).toBe(true);
    await flush();
    expect(providerApprovals).toEqual([{ turnId: "turn-cached", requestId: "approval-cached", approved: true }]);
    const state = useAppStore.getState();
    expect(state.activeWorkspaceId).toBe("ws-open");
    const recorded = state.workspaceRuntimeCacheById["ws-cached"]?.messagesByTask["task-cached"]?.[0]?.parts[0];
    // Exactly what answering in the task records.
    expect(recorded).toMatchObject({ type: "approval", requestId: "approval-cached", state: "approval-responded" });
  });

  test("a second answer while the first is in flight is not sent", async () => {
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    expect(respondToFleetInteraction(cachedApproval, { kind: "approval", approved: true }).ok).toBe(true);
    // The task's own card, the same moment: still pending in state, already in flight.
    useAppStore.getState().resolveApproval({ taskId: "task-cached", messageId: "m-approval", requestId: "approval-cached", approved: false });
    await flush();
    expect(providerApprovals).toHaveLength(1);
    // Once recorded, the request is no longer there to answer.
    const again = respondToFleetInteraction(cachedApproval, { kind: "approval", approved: true });
    expect(again.ok).toBe(false);
    expect(providerApprovals).toHaveLength(1);
  });

  test("a request answered elsewhere, or from a replaced turn, is refused", async () => {
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cached"]!;
    useAppStore.setState({ workspaceRuntimeCacheById: { "ws-cached": { ...cached,
      messagesByTask: { "task-cached": [message("m-approval", approval("approval-cached", "approval-responded"), "turn-cached")] } } } });
    const answered = respondToFleetInteraction(cachedApproval, { kind: "approval", approved: true });
    expect(answered).toEqual({ ok: false, reason: "This request was already answered or expired. Review the latest task state." });

    useAppStore.setState({ workspaceRuntimeCacheById: { "ws-cached": { ...cached, activeTurnIdsByTask: { "task-cached": "turn-replaced" } } } });
    const replaced = respondToFleetInteraction(cachedApproval, { kind: "approval", approved: true });
    expect(replaced).toEqual({ ok: false, reason: "The turn changed before this action was sent. Review the latest task state." });
    expect(providerApprovals).toEqual([]);
  });

  test("a short question is answered with its key and recorded", async () => {
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    const result = respondToFleetInteraction(
      { ...cachedApproval, kind: "user-input", requestId: "question-cached", messageId: "m-question" },
      { kind: "user-input", answers: buildShortQuestionAnswers(question(), { value: "Staging" }) },
    );
    expect(result.ok).toBe(true);
    await flush();
    expect(providerAnswers).toEqual([{ turnId: "turn-cached", requestId: "question-cached",
      answers: { "Which environment should this deploy to?": "Staging" }, denied: undefined }]);
    const recorded = useAppStore.getState().workspaceRuntimeCacheById["ws-cached"]?.messagesByTask["task-cached"]?.[1]?.parts[0];
    expect(recorded).toMatchObject({ state: "input-responded", answers: { "Which environment should this deploy to?": "Staging" } });
  });

  test("a cold workspace's request is loaded on demand, then answered", async () => {
    const { loadFleetInteraction } = await import("@/lib/fleet/interaction-load");
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    const coldTask = task("task-cold", "Cold task");
    const shell: WorkspaceShell = { ...createEmptyWorkspaceState(), activeTaskId: "task-cold", tasks: [coldTask], messageCountByTask: { "task-cold": 1 } };
    const page: TaskMessagesPage = { messages: [message("m-cold", approval("approval-cold"), "turn-cold")], totalCount: 1, limit: 120, offset: 0, hasMoreOlder: false };
    const turns: PersistedTurnSummary[] = [{ id: "turn-cold", workspaceId: "ws-cold", taskId: "task-cold", providerId: "codex", createdAt: NOW, completedAt: null }];
    const identity = { repositoryPath: REPOSITORY_PATH, workspaceId: "ws-cold", taskId: "task-cold", turnId: "turn-cold",
      kind: "approval" as const, requestId: "approval-cold", messageId: "m-cold" };
    expect(respondToFleetInteraction(identity, { kind: "approval", approved: true }).ok).toBe(false);
    await loadFleetInteraction(identity, { loadWorkspaceShell: async () => shell, loadTaskMessagesPage: async () => page,
      listActiveWorkspaceTurns: async () => turns });
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws-open");
    expect(respondToFleetInteraction(identity, { kind: "approval", approved: false }).ok).toBe(true);
    await flush();
    expect(providerApprovals).toEqual([{ turnId: "turn-cold", requestId: "approval-cold", approved: false }]);
  });

  test("another repository's request is not loaded or answered here", async () => {
    const { loadFleetInteraction } = await import("@/lib/fleet/interaction-load");
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const elsewhere = { ...cachedApproval, repositoryPath: "/tmp/another-project" };
    let read = false;
    await expect(loadFleetInteraction(elsewhere, {
      loadWorkspaceShell: async () => { read = true; return null; },
      loadTaskMessagesPage: async () => { read = true; throw new Error("unreachable"); },
      listActiveWorkspaceTurns: async () => { read = true; return []; },
    })).rejects.toThrow("This request belongs to another repository. Open the task to answer it.");
    expect(read).toBe(false);
    expect(respondToFleetInteraction(elsewhere, { kind: "approval", approved: true }).ok).toBe(false);
    expect(providerApprovals).toEqual([]);
  });
});

describe("loading cold requests", () => {
  // One workspace nobody has opened, with two tasks whose turns both run.
  const coldShell = (): WorkspaceShell => ({
    ...createEmptyWorkspaceState(), activeTaskId: "task-cold",
    tasks: [task("task-cold", "Cold task"), task("task-cold-b", "Second cold task")],
    messageCountByTask: { "task-cold": 1, "task-cold-b": 1 },
  });
  const coldTurns: PersistedTurnSummary[] = [
    { id: "turn-cold", workspaceId: "ws-cold", taskId: "task-cold", providerId: "codex", createdAt: NOW, completedAt: null },
    { id: "turn-cold-b", workspaceId: "ws-cold", taskId: "task-cold-b", providerId: "codex", createdAt: NOW, completedAt: null },
  ];
  const pageOf = (messageId: string, requestId: string, turnId: string): TaskMessagesPage => ({
    messages: [message(messageId, approval(requestId), turnId)], totalCount: 1, limit: 120, offset: 0, hasMoreOlder: false,
  });
  const identityOf = (taskId: string, turnId: string, requestId: string, messageId: string) => ({
    repositoryPath: REPOSITORY_PATH, workspaceId: "ws-cold", taskId, turnId, kind: "approval" as const, requestId, messageId,
  });

  test("loading one task's request keeps the workspace's other running turns", async () => {
    const { loadFleetInteraction } = await import("@/lib/fleet/interaction-load");
    const useAppStore = await store();
    await loadFleetInteraction(identityOf("task-cold", "turn-cold", "approval-cold", "m-cold"), {
      loadWorkspaceShell: async () => coldShell(),
      loadTaskMessagesPage: async () => pageOf("m-cold", "approval-cold", "turn-cold"),
      listActiveWorkspaceTurns: async () => coldTurns,
    });
    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cold"];
    expect(cached?.activeTurnIdsByTask).toEqual({ "task-cold": "turn-cold", "task-cold-b": "turn-cold-b" });
    expect(cached?.messageCountByTask).toMatchObject({ "task-cold": 1, "task-cold-b": 1 });
  });

  test("two reads of one cold workspace at once both land, and both requests can be answered", async () => {
    const { loadFleetInteraction } = await import("@/lib/fleet/interaction-load");
    const { respondToFleetInteraction } = await import("@/lib/fleet/interaction-respond");
    const useAppStore = await store();
    let releaseSecond: () => void = () => {};
    const secondPage = new Promise<TaskMessagesPage>((resolve) => {
      releaseSecond = () => resolve(pageOf("m-cold-b", "approval-cold-b", "turn-cold-b"));
    });
    const reads = {
      loadWorkspaceShell: async () => coldShell(),
      loadTaskMessagesPage: async ({ taskId }: { taskId: string }) =>
        taskId === "task-cold" ? pageOf("m-cold", "approval-cold", "turn-cold") : secondPage,
      listActiveWorkspaceTurns: async () => coldTurns,
    } as unknown as import("@/lib/fleet/interaction-load").FleetInteractionReads;
    const first = identityOf("task-cold", "turn-cold", "approval-cold", "m-cold");
    const second = identityOf("task-cold-b", "turn-cold-b", "approval-cold-b", "m-cold-b");
    // Both start before either lands.
    const loadingSecond = loadFleetInteraction(second, reads);
    await loadFleetInteraction(first, reads);
    releaseSecond();
    await loadingSecond;

    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cold"];
    expect(cached?.messagesByTask["task-cold"]?.[0]?.id).toBe("m-cold");
    expect(cached?.messagesByTask["task-cold-b"]?.[0]?.id).toBe("m-cold-b");
    expect(respondToFleetInteraction(first, { kind: "approval", approved: true }).ok).toBe(true);
    expect(respondToFleetInteraction(second, { kind: "approval", approved: true }).ok).toBe(true);
  });

  test("a provider update that lands during the read still wins over the stored page", async () => {
    const { loadFleetInteraction } = await import("@/lib/fleet/interaction-load");
    const useAppStore = await store();
    let releasePage: () => void = () => {};
    const page = new Promise<TaskMessagesPage>((resolve) => {
      releasePage = () => resolve(pageOf("m-cold", "approval-cold", "turn-cold"));
    });
    const loading = loadFleetInteraction(identityOf("task-cold", "turn-cold", "approval-cold", "m-cold"), {
      loadWorkspaceShell: async () => coldShell(),
      loadTaskMessagesPage: async () => page,
      listActiveWorkspaceTurns: async () => coldTurns,
    });
    // The live session arrives first, with a newer message for the task.
    const live = message("m-live", approval("approval-live"), "turn-cold");
    useAppStore.setState((state) => ({
      workspaceRuntimeCacheById: {
        ...state.workspaceRuntimeCacheById,
        "ws-cold": {
          ...createEmptyWorkspaceState(), nativeSessionReadyByTask: {}, tasks: [task("task-cold", "Cold task")],
          activeTaskId: "task-cold", messagesByTask: { "task-cold": [live] }, activeTurnIdsByTask: { "task-cold": "turn-cold" },
        },
      },
    }));
    releasePage();
    await loading;
    expect(useAppStore.getState().workspaceRuntimeCacheById["ws-cold"]?.messagesByTask["task-cold"]).toEqual([live]);
  });
});

describe("a request older than the loaded messages", () => {
  const filler = (index: number): ChatMessage => ({
    id: `m-filler-${index}`, role: "assistant", model: "gpt-5.5", providerId: "codex", content: `${index}`,
    parts: [{ type: "text", text: `${index}` }],
  });
  const older = message("m-older", userInput("question-older", [question()]), "turn-cached");
  // The full history: the question first, then 9 later messages.
  const history = [older, ...Array.from({ length: 9 }, (_, index) => filler(index))];
  const identity = { ...cachedApproval, kind: "user-input" as const, requestId: "question-older", messageId: "m-older" };

  async function cacheLatest(count: number) {
    const useAppStore = await store();
    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cached"]!;
    useAppStore.setState({ workspaceRuntimeCacheById: { "ws-cached": { ...cached,
      messagesByTask: { "task-cached": history.slice(-count) }, messageCountByTask: { "task-cached": history.length } } } });
    return useAppStore;
  }
  // Prepends the next older page of three, as the store's older-page load does.
  const pageOlder = (useAppStore: Awaited<ReturnType<typeof store>>, calls: string[]) => async (taskId: string) => {
    calls.push(taskId);
    const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cached"]!;
    const loaded = cached.messagesByTask["task-cached"] ?? [];
    const start = Math.max(history.length - loaded.length - 3, 0);
    useAppStore.setState({ workspaceRuntimeCacheById: { "ws-cached": { ...cached,
      messagesByTask: { "task-cached": [...history.slice(start, history.length - loaded.length), ...loaded] } } } });
  };

  test("the request counts as shown by its message, or by its request id when no message was named", async () => {
    const { isFleetRequestShown } = await import("@/lib/fleet/interaction-load");
    expect(isFleetRequestShown(history, identity)).toBe(true);
    expect(isFleetRequestShown(history.slice(1), identity)).toBe(false);
    expect(isFleetRequestShown(history, { requestId: "question-older", messageId: null })).toBe(true);
    expect(isFleetRequestShown(history.slice(1), { requestId: "question-older", messageId: null })).toBe(false);
  });

  test("older pages are read until the request's message is loaded", async () => {
    const { loadFleetRequestFromOlderMessages } = await import("@/lib/fleet/interaction-load");
    const useAppStore = await cacheLatest(4);
    const calls: string[] = [];
    expect(await loadFleetRequestFromOlderMessages(identity, pageOlder(useAppStore, calls))).toBe(true);
    expect(calls).toEqual(["task-cached", "task-cached"]);
    expect(useAppStore.getState().workspaceRuntimeCacheById["ws-cached"]?.messagesByTask["task-cached"]?.[0]?.id).toBe("m-older");
  });

  test("with every message loaded, or when a page brings nothing, the search stops", async () => {
    const { loadFleetRequestFromOlderMessages } = await import("@/lib/fleet/interaction-load");
    const missing = { ...identity, messageId: "m-gone", requestId: "question-gone" };
    const useAppStore = await cacheLatest(history.length);
    const calls: string[] = [];
    expect(await loadFleetRequestFromOlderMessages(missing, pageOlder(useAppStore, calls))).toBe(false);
    expect(calls).toEqual([]);
    await cacheLatest(4);
    expect(await loadFleetRequestFromOlderMessages(identity, async () => {})).toBe(false);
  });
});

describe("the Fleet row", () => {
  type Interaction = import("@/components/layout/useFleetRowInteraction").FleetRowInteraction;
  function interaction(overrides: Partial<Interaction>): Interaction {
    return {
      identity: { ...cachedApproval }, inline: { kind: "open" }, pending: false, otherRepository: false,
      settled: false, loading: false, error: null, busy: false, managed: false,
      ensureLoaded: () => {}, respond: () => ({ ok: true }), ...overrides,
    };
  }
  async function renderAnswer(value: Interaction) {
    const { FleetRowInlineAnswer } = await import("@/components/layout/FleetRowInlineAnswer");
    return renderToStaticMarkup(createElement(FleetRowInlineAnswer, { interaction: value, onAnswer: () => {} }));
  }

  test("an approval is answered with the compact approval card and A / D", async () => {
    const { describeFleetRowKeys } = await import("@/components/layout/FleetRowInlineAnswer");
    const value = interaction({ inline: classifyFleetInlineInteraction(approval("approval-cached")), pending: true });
    const html = await renderAnswer(value);
    expect(html).toContain('data-fleet-inline-answer="approval"');
    expect(html).toContain('data-density="compact"');
    // The tool and the command it would run.
    expect(html).toContain("Bash");
    expect(html).toContain("bun test tests/fleet");
    expect(html).toContain(">Allow once<");
    expect(html).toContain(">Deny<");
    expect(describeFleetRowKeys(value)).toBe("A D");
    // A task its host manages keeps no standing grant, so it is not offered.
    const managed = await renderAnswer({ ...value, managed: true,
      inline: classifyFleetInlineInteraction({ ...approval("approval-cached"), supportsAllowAlways: true }) });
    expect(managed).not.toContain(">Always allow<");
    const busy = await renderAnswer({ ...value, busy: true });
    expect(busy).toContain("Recording decision");
  });

  test("a short question offers its options with their number keys", async () => {
    const { describeFleetRowKeys } = await import("@/components/layout/FleetRowInlineAnswer");
    const value = interaction({ inline: classifyFleetInlineInteraction(userInput("question-cached", [question()])), pending: true });
    const html = await renderAnswer(value);
    expect(html).toContain('data-fleet-inline-answer="short-question"');
    expect(html).toContain("Which environment should this deploy to?");
    expect(html).toMatch(/aria-keyshortcuts="1"[^>]*>[\s\S]*?Staging/);
    expect(html).toMatch(/aria-keyshortcuts="2"[^>]*>[\s\S]*?Production/);
    expect(describeFleetRowKeys(value)).toBe("1 2");
    expect(await renderAnswer({ ...value, busy: true })).toContain("Sending the answer…");
  });

  test("a long form, another repository, a cold load and a settled request say why there are no answers", async () => {
    const { describeFleetRowKeys } = await import("@/components/layout/FleetRowInlineAnswer");
    const longForm = interaction({
      inline: classifyFleetInlineInteraction(userInput("q", [question(), question({ question: "And the region?" })])),
      pending: true,
    });
    expect(await renderAnswer(longForm)).toContain("Answer this in the task.");
    expect(describeFleetRowKeys(longForm)).toBeUndefined();
    expect(await renderAnswer(interaction({ settled: true }))).toContain("This request was answered or expired.");
    expect(await renderAnswer(interaction({ loading: true }))).toContain("Loading request…");
    expect(await renderAnswer(interaction({ otherRepository: true }))).toContain(
      "This request belongs to another repository. Open the task to answer it.");
    expect(await renderAnswer(interaction({ error: "This task is no longer available." }))).toContain('role="alert"');
    // A cold row before it is focused draws nothing extra.
    expect(await renderAnswer(interaction({}))).toBe("");
  });

  test("every task row offers Open, beside its other actions", async () => {
    const { FleetAttentionInbox } = await import("@/components/layout/FleetAttentionInbox");
    const html = renderToStaticMarkup(createElement(FleetAttentionInbox, {
      items: [{ id: "interaction:approval:ws-cached:task-cached:approval-cached", kind: "approval", priority: 1,
        repositoryPath: REPOSITORY_PATH, repositoryName: "project", workspaceId: "ws-cached", workspaceName: "cached",
        taskId: "task-cached", taskTitle: "Cached task", turnId: "turn-cached", requestId: "approval-cached",
        messageId: "m-approval", createdAt: NOW, source: "live" }],
      selectedAttentionId: null, busyAttentionId: null, onOpen: () => {}, onOpenTask: () => {},
      onMarkRead: () => {}, onDismiss: () => {}, onSnooze: () => {}, onOpenPr: () => {}, onClearReview: () => {},
      onRestoreSnoozed: () => {}, onClearSelection: () => {},
    }));
    expect(html).toContain('aria-label="Open Cached task in cached"');
  });
});

describe("row keys", () => {
  test("A, D and 1–9 answer only unmodified, fresh key presses outside fields", async () => {
    const { resolveFleetRowKey } = await import("@/components/layout/FleetRowInlineAnswer");
    const approvalRow = { inline: classifyFleetInlineInteraction(approval("a")), busy: false };
    const questionRow = { inline: classifyFleetInlineInteraction(userInput("q", [question()])), busy: false };
    const press = (key: string, extra: Record<string, unknown> = {}) => ({
      key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, target: null, ...extra,
    });
    expect(resolveFleetRowKey(press("a"), approvalRow)).toEqual({ kind: "approval", approved: true, scope: "once" });
    expect(resolveFleetRowKey(press("d"), approvalRow)).toEqual({ kind: "approval", approved: false });
    expect(resolveFleetRowKey(press("2"), questionRow)).toEqual({
      kind: "user-input", answers: { "Which environment should this deploy to?": "Production" } });
    expect(resolveFleetRowKey(press("3"), questionRow)).toBeNull();
    expect(resolveFleetRowKey(press("1"), approvalRow)).toBeNull();
    for (const extra of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { isComposing: true }]) {
      expect(resolveFleetRowKey(press("a", extra), approvalRow)).toBeNull();
    }
    expect(resolveFleetRowKey(press("a"), { ...approvalRow, busy: true })).toBeNull();
  });
});
