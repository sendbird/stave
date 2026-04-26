import { describe, expect, test } from "bun:test";
import {
  buildColiseumMergedFollowUp,
  MAX_COLISEUM_BRANCHES,
  MIN_COLISEUM_BRANCHES,
  buildReviewerPrompt,
  clearReviewerFromGroup,
  collectActiveColiseumTaskIds,
  deriveColiseumRunStatus,
  extractBranchSummary,
  planColiseumFanOut,
  planReviewerLaunch,
  promoteColiseumChampion,
  reapColiseumOrphans,
  summarizeColiseumActivity,
  stripColiseumBranchesFromRecords,
  unpickColiseumChampion,
  validateColiseumBranches,
  type ColiseumBranchSpec,
  type ColiseumBranchSummary,
} from "@/store/coliseum.utils";
import { isColiseumBranch, getVisibleTasks } from "@/lib/tasks";
import type {
  ChatMessage,
  ColiseumGroupState,
  PromptDraft,
  Task,
} from "@/types/chat";

function createParentTask(): Task {
  return {
    id: "task-parent",
    title: "Example task",
    provider: "claude-code",
    updatedAt: "2026-04-20T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
  };
}

function createHistory(): ChatMessage[] {
  return [
    {
      id: "task-parent-m-1",
      role: "user",
      model: "user",
      providerId: "user",
      content: "first prompt",
      parts: [{ type: "text", text: "first prompt" }],
    },
    {
      id: "task-parent-m-2",
      role: "assistant",
      model: "claude-sonnet-4-6",
      providerId: "claude-code",
      content: "first answer",
      parts: [{ type: "text", text: "first answer" }],
    },
  ];
}

function sequentialIdFactory(prefix: string) {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

const deterministicNow = () => "2026-04-20T12:00:00.000Z";

describe("planColiseumFanOut", () => {
  test("creates a child task per branch with coliseumParentTaskId set", () => {
    const branches: ColiseumBranchSpec[] = [
      { provider: "claude-code", model: "claude-sonnet-4-6" },
      { provider: "codex", model: "gpt-5.4" },
      { provider: "stave", model: "stave-auto" },
    ];

    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches,
      content: "compare these models",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchTasks).toHaveLength(3);
    expect(result.branchTasks.map((task) => task.id)).toEqual([
      "child-1",
      "child-2",
      "child-3",
    ]);
    for (const child of result.branchTasks) {
      expect(child.coliseumParentTaskId).toBe("task-parent");
      expect(child.archivedAt).toBe(null);
      expect(child.controlMode).toBe("interactive");
      expect(child.controlOwner).toBe("stave");
    }
    expect(result.branchTasks[0]?.provider).toBe("claude-code");
    expect(result.branchTasks[1]?.provider).toBe("codex");
    expect(result.branchTasks[2]?.provider).toBe("stave");
  });

  test("populates the group state with parent id and fan-out snapshot index", () => {
    const history = createHistory();
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      createRunId: sequentialIdFactory("run"),
      now: deterministicNow,
    });

    expect(result.group.parentTaskId).toBe("task-parent");
    expect(result.group.runId).toBe("run-1");
    expect(result.group.branchTaskIds).toEqual(["child-1", "child-2"]);
    expect(result.group.parentMessageCountAtFanout).toBe(history.length);
    expect(result.group.createdAt).toBe("2026-04-20T12:00:00.000Z");
    // Initial lifecycle flags — branches are live, no champion yet.
    expect(result.group.status).toBe("running");
    expect(result.group.championTaskId).toBeNull();
    expect(result.group.pickedHistory).toEqual([]);
    expect(result.group.viewMode).toBe("grid");
    expect(result.group.focusedBranchTaskId).toBeNull();
    expect(result.group.minimized).toBe(false);
  });

  test("captures authoritative per-branch provider/model in branchMeta", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
        { provider: "stave", model: "stave-auto" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    // branchMeta is keyed by branch task id and records the exact
    // provider/model chosen at fan-out time. This is the source of truth for
    // the arena column headers — we don't wait on the branch's first assistant
    // message to render the model label.
    expect(result.group.branchMeta).toEqual({
      "child-1": {
        branchTaskId: "child-1",
        provider: "claude-code",
        model: "claude-sonnet-4-6",
      },
      "child-2": {
        branchTaskId: "child-2",
        provider: "codex",
        model: "gpt-5.4",
      },
      "child-3": {
        branchTaskId: "child-3",
        provider: "stave",
        model: "stave-auto",
      },
    });
  });

  test("seeds each branch's message list with parent history + user msg + empty streaming assistant", () => {
    const history = createHistory();
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "new prompt",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    const firstBranch = result.branchMessagesByTask["child-1"];
    expect(firstBranch).toBeDefined();
    expect(firstBranch?.length).toBe(history.length + 2);

    // Parent history preserved verbatim at the start.
    expect(firstBranch?.[0]).toEqual(history[0]!);
    expect(firstBranch?.[1]).toEqual(history[1]!);

    const userMsg = firstBranch?.[history.length];
    expect(userMsg?.role).toBe("user");
    expect(userMsg?.content).toBe("new prompt");

    const assistantMsg = firstBranch?.[history.length + 1];
    expect(assistantMsg?.role).toBe("assistant");
    expect(assistantMsg?.isStreaming).toBe(true);
    expect(assistantMsg?.content).toBe("");
    expect(assistantMsg?.model).toBe("claude-sonnet-4-6");
    expect(assistantMsg?.providerId).toBe("claude-code");
    expect(assistantMsg?.parts).toEqual([]);

    // The second branch gets its own model on the streaming assistant.
    const secondAssistant =
      result.branchMessagesByTask["child-2"]?.[history.length + 1];
    expect(secondAssistant?.model).toBe("gpt-5.4");
    expect(secondAssistant?.providerId).toBe("codex");
  });

  test("wires active turn ids + fresh provider session + native session flags per branch", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchActiveTurnIdsByTask).toEqual({
      "child-1": "turn-1",
      "child-2": "turn-2",
    });
    expect(result.branchProviderSessionByTask).toEqual({
      "child-1": {},
      "child-2": {},
    });
    expect(result.branchNativeSessionReadyByTask).toEqual({
      "child-1": false,
      "child-2": false,
    });
    expect(result.branchTaskWorkspaceIdById).toEqual({
      "child-1": "worktree:abc",
      "child-2": "worktree:abc",
    });
  });

  test("dispatch list matches branch input order with resolved ids", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "codex", model: "gpt-5.4" },
        { provider: "claude-code", model: "claude-sonnet-4-6" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchDispatchList).toEqual([
      {
        taskId: "child-1",
        turnId: "turn-1",
        provider: "codex",
        model: "gpt-5.4",
      },
      {
        taskId: "child-2",
        turnId: "turn-2",
        provider: "claude-code",
        model: "claude-sonnet-4-6",
      },
    ]);
  });

  test("inherits runtime overrides from parent's prompt draft and pins branch-specific model", () => {
    const parentDraft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: {
        claudePermissionMode: "acceptEdits",
        codexPlanMode: true,
        model: "claude-sonnet-4-6",
      },
    };

    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: parentDraft,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-opus-4-5" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    // First branch preserves parent's Claude permission mode + pins its own model.
    expect(result.branchPromptDraftByTask["child-1"]?.runtimeOverrides).toEqual(
      {
        claudePermissionMode: "acceptEdits",
        codexPlanMode: true,
        model: "claude-opus-4-5",
      },
    );
    // Second branch pins its own model while inheriting the same overrides.
    expect(result.branchPromptDraftByTask["child-2"]?.runtimeOverrides).toEqual(
      {
        claudePermissionMode: "acceptEdits",
        codexPlanMode: true,
        model: "gpt-5.4",
      },
    );
  });

  test("falls back to a fresh draft when parent has no prompt draft", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    expect(result.branchPromptDraftByTask["child-1"]).toEqual({
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: { model: "claude-sonnet-4-6" },
    });
  });

  test("does not mutate parent messages or add messages to the parent task", () => {
    const history = createHistory();
    const frozenHistoryCopy = JSON.parse(JSON.stringify(history));

    planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: history,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    // Parent history is read, not mutated.
    expect(history).toEqual(frozenHistoryCopy);
  });

  test("file + image contexts are attached to the user message of every branch", () => {
    const result = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "explain this file",
      fileContexts: [
        {
          filePath: "src/foo.ts",
          content: "export const foo = 1;",
          language: "typescript",
        },
      ],
      imageContexts: [
        {
          dataUrl: "data:image/png;base64,AAAA",
          label: "diagram.png",
          mimeType: "image/png",
        },
      ],
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    for (const taskId of ["child-1", "child-2"]) {
      const userMsg = result.branchMessagesByTask[taskId]?.[2];
      expect(userMsg).toBeDefined();
      const partTypes = userMsg?.parts.map((p) => p.type);
      expect(partTypes).toEqual(["file_context", "image_context", "text"]);
    }
  });

  test("throws below MIN_COLISEUM_BRANCHES or above MAX_COLISEUM_BRANCHES", () => {
    const baseArgs = {
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    };

    expect(() =>
      planColiseumFanOut({
        ...baseArgs,
        branches: [{ provider: "claude-code", model: "claude-sonnet-4-6" }],
      }),
    ).toThrow(`Coliseum requires at least ${MIN_COLISEUM_BRANCHES} branches`);

    expect(() =>
      planColiseumFanOut({
        ...baseArgs,
        branches: Array.from({ length: MAX_COLISEUM_BRANCHES + 1 }, (_, i) => ({
          provider: "claude-code" as const,
          model: `model-${i}`,
        })),
      }),
    ).toThrow(`Coliseum allows at most ${MAX_COLISEUM_BRANCHES} branches`);
  });
});

describe("validateColiseumBranches", () => {
  test("accepts exactly MIN and MAX branches", () => {
    const min: ColiseumBranchSpec[] = Array.from(
      { length: MIN_COLISEUM_BRANCHES },
      (_, i) => ({ provider: "claude-code", model: `m${i}` }),
    );
    const max: ColiseumBranchSpec[] = Array.from(
      { length: MAX_COLISEUM_BRANCHES },
      (_, i) => ({ provider: "claude-code", model: `m${i}` }),
    );
    expect(validateColiseumBranches(min)).toBeNull();
    expect(validateColiseumBranches(max)).toBeNull();
  });

  test("rejects too few or too many branches", () => {
    expect(validateColiseumBranches([])).toMatch(/at least/);
    expect(
      validateColiseumBranches([{ provider: "claude-code", model: "x" }]),
    ).toMatch(/at least/);
    expect(
      validateColiseumBranches(
        Array.from({ length: MAX_COLISEUM_BRANCHES + 1 }, () => ({
          provider: "claude-code" as const,
          model: "x",
        })),
      ),
    ).toMatch(/at most/);
  });

  test("rejects a branch missing provider or model", () => {
    expect(
      validateColiseumBranches([
        { provider: "claude-code", model: "x" },
        { provider: "codex", model: "" },
      ]),
    ).toMatch(/provider and a model/);
  });
});

describe("Coliseum branches stay hidden from task-tree surfaces", () => {
  test("isColiseumBranch + getVisibleTasks filter branches by default", () => {
    const parent = createParentTask();
    const result = planColiseumFanOut({
      parentTask: parent,
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "x",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });

    for (const child of result.branchTasks) {
      expect(isColiseumBranch(child)).toBe(true);
    }

    const allTasks: Task[] = [parent, ...result.branchTasks];
    const visibleActive = getVisibleTasks({
      tasks: allTasks,
      filter: "active",
    });
    expect(visibleActive).toEqual([parent]);

    const visibleAll = getVisibleTasks({ tasks: allTasks, filter: "all" });
    expect(visibleAll).toEqual([parent]);

    const visibleWithBranches = getVisibleTasks({
      tasks: allTasks,
      filter: "all",
      includeColiseumBranches: true,
    });
    expect(visibleWithBranches.length).toBe(allTasks.length);
  });
});

describe("promoteColiseumChampion", () => {
  function buildGroup(): ColiseumGroupState {
    return {
      parentTaskId: "task-parent",
      runId: "run-1",
      branchTaskIds: ["child-1", "child-2"],
      branchMeta: {
        "child-1": {
          branchTaskId: "child-1",
          provider: "claude-code",
          model: "claude-sonnet-4-6",
        },
        "child-2": {
          branchTaskId: "child-2",
          provider: "codex",
          model: "gpt-5.4",
        },
      },
      createdAt: "2026-04-20T12:00:00.000Z",
      parentMessageCountAtFanout: 2,
      status: "running",
      championTaskId: null,
      pickedHistory: [],
      viewMode: "grid",
      focusedBranchTaskId: null,
      minimized: false,
    };
  }

  function buildChampionMessages(): ChatMessage[] {
    // Indices 0-1 are parent history copies; indices 2+ are the branch's own
    // user message + streaming assistant response (plus any churn).
    return [
      {
        id: "child-1-m-1",
        role: "user",
        model: "user",
        providerId: "user",
        content: "first prompt",
        parts: [{ type: "text", text: "first prompt" }],
      },
      {
        id: "child-1-m-2",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "first answer",
        parts: [{ type: "text", text: "first answer" }],
      },
      {
        id: "child-1-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "child-1-m-4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "champion answer",
        parts: [{ type: "text", text: "champion answer" }],
      },
    ];
  }

  test("appends only the champion's post-fan-out tail with rewritten IDs", () => {
    const group = buildGroup();
    const parentMessages = createHistory();
    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages,
      championMessages: buildChampionMessages(),
    });

    expect(result.appendedFromChampion).toBe(2);
    expect(result.nextParentMessages).toHaveLength(parentMessages.length + 2);
    // Parent prefix unchanged (same object references are fine).
    expect(result.nextParentMessages[0]).toEqual(parentMessages[0]!);
    expect(result.nextParentMessages[1]).toEqual(parentMessages[1]!);
    // Grafted messages are keyed to the parent task id, sequentially numbered
    // from `parentMessages.length + 1`.
    expect(result.nextParentMessages[2]?.id).toBe("task-parent-m-3");
    expect(result.nextParentMessages[3]?.id).toBe("task-parent-m-4");
    expect(result.nextParentMessages[2]?.content).toBe("compare prompt");
    expect(result.nextParentMessages[3]?.content).toBe("champion answer");
  });

  test("forces isStreaming:false on the grafted tail so parent doesn't render a stuck spinner", () => {
    const group = buildGroup();
    const parentMessages = createHistory();
    // Champion with a still-streaming assistant — simulates "pick now" while
    // the branch is mid-response.
    const streamingChampion: ChatMessage[] = [
      ...createHistory(),
      {
        id: "child-1-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "child-1-m-4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "streaming...",
        isStreaming: true,
        parts: [{ type: "text", text: "streaming..." }],
      },
    ];

    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages,
      championMessages: streamingChampion,
    });

    // The grafted assistant must be flagged as *not* streaming on the parent
    // side, even though the original branch message is still streaming.
    const graftedAssistant = result.nextParentMessages[3];
    expect(graftedAssistant?.role).toBe("assistant");
    expect(graftedAssistant?.isStreaming).toBe(false);
  });

  test("replacePreviousPick rolls back the previous graft before applying the new champion's tail", () => {
    const group = buildGroup();
    // Parent already has the previous champion's tail grafted onto it.
    const parentAfterFirstPick: ChatMessage[] = [
      ...createHistory(),
      {
        id: "task-parent-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "task-parent-m-4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "previous pick answer",
        parts: [{ type: "text", text: "previous pick answer" }],
      },
    ];

    // New champion branch (child-2) has a different answer.
    const newChampionMessages: ChatMessage[] = [
      ...createHistory(),
      {
        id: "child-2-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "child-2-m-4",
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "new pick answer",
        parts: [{ type: "text", text: "new pick answer" }],
      },
    ];

    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-2",
      parentMessages: parentAfterFirstPick,
      championMessages: newChampionMessages,
      replacePreviousPick: true,
    });

    // Parent is rolled back to 2 history messages, then new tail (2) grafted.
    expect(result.nextParentMessages).toHaveLength(4);
    expect(result.appendedFromChampion).toBe(2);
    // Grafted tail is the NEW champion's content, not the previous one.
    expect(result.nextParentMessages[3]?.content).toBe("new pick answer");
    expect(result.nextParentMessages[3]?.id).toBe("task-parent-m-4");
    // Previous pick's content is gone.
    expect(
      result.nextParentMessages.some(
        (m) => m.content === "previous pick answer",
      ),
    ).toBe(false);
  });

  test("does not mutate the input parent messages or champion messages", () => {
    const group = buildGroup();
    const parentMessages = createHistory();
    const champion = buildChampionMessages();
    const parentSnapshot = JSON.parse(JSON.stringify(parentMessages));
    const championSnapshot = JSON.parse(JSON.stringify(champion));

    promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages,
      championMessages: champion,
    });

    expect(parentMessages).toEqual(parentSnapshot);
    expect(champion).toEqual(championSnapshot);
  });

  test("throws when championTaskId is not a branch of the group", () => {
    expect(() =>
      promoteColiseumChampion({
        group: buildGroup(),
        championTaskId: "unrelated",
        parentMessages: createHistory(),
        championMessages: buildChampionMessages(),
      }),
    ).toThrow(/not a branch/);
  });

  test("appendedFromChampion is zero when champion has no post-fan-out messages", () => {
    const group = buildGroup();
    const result = promoteColiseumChampion({
      group,
      championTaskId: "child-1",
      parentMessages: createHistory(),
      // Champion only has the parent prefix — no branch turn yet.
      championMessages: createHistory(),
    });
    expect(result.appendedFromChampion).toBe(0);
    expect(result.nextParentMessages).toHaveLength(createHistory().length);
  });
});

describe("unpickColiseumChampion", () => {
  function buildGroup(): ColiseumGroupState {
    return {
      parentTaskId: "task-parent",
      runId: "run-1",
      branchTaskIds: ["child-1", "child-2"],
      branchMeta: {
        "child-1": {
          branchTaskId: "child-1",
          provider: "claude-code",
          model: "claude-sonnet-4-6",
        },
        "child-2": {
          branchTaskId: "child-2",
          provider: "codex",
          model: "gpt-5.4",
        },
      },
      createdAt: "2026-04-20T12:00:00.000Z",
      parentMessageCountAtFanout: 2,
      status: "promoted",
      championTaskId: "child-1",
      pickedHistory: [
        { championTaskId: "child-1", pickedAt: "2026-04-20T12:01:00.000Z" },
      ],
      viewMode: "grid",
      focusedBranchTaskId: null,
      minimized: false,
    };
  }

  test("rolls parent messages back to the pre-fan-out snapshot", () => {
    const group = buildGroup();
    const preFanOut = createHistory();
    // Parent has been extended with the previous champion's graft.
    const parentAfterGraft: ChatMessage[] = [
      ...preFanOut,
      {
        id: "task-parent-m-3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "compare prompt",
        parts: [{ type: "text", text: "compare prompt" }],
      },
      {
        id: "task-parent-m-4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "picked answer",
        parts: [{ type: "text", text: "picked answer" }],
      },
    ];

    const result = unpickColiseumChampion({
      group,
      parentMessages: parentAfterGraft,
    });

    // Exactly the first `parentMessageCountAtFanout` messages are preserved.
    expect(result.nextParentMessages).toHaveLength(
      group.parentMessageCountAtFanout,
    );
    expect(result.nextParentMessages[0]).toEqual(preFanOut[0]!);
    expect(result.nextParentMessages[1]).toEqual(preFanOut[1]!);
  });

  test("does not mutate input parent messages", () => {
    const group = buildGroup();
    const parent = [...createHistory()];
    const snapshot = JSON.parse(JSON.stringify(parent));

    unpickColiseumChampion({ group, parentMessages: parent });

    expect(parent).toEqual(snapshot);
  });
});

describe("deriveColiseumRunStatus", () => {
  function buildBaseGroup(): ColiseumGroupState {
    return {
      parentTaskId: "task-parent",
      runId: "run-1",
      branchTaskIds: ["child-1", "child-2"],
      branchMeta: {
        "child-1": {
          branchTaskId: "child-1",
          provider: "claude-code",
          model: "claude-sonnet-4-6",
        },
        "child-2": {
          branchTaskId: "child-2",
          provider: "codex",
          model: "gpt-5.4",
        },
      },
      createdAt: "2026-04-20T12:00:00.000Z",
      parentMessageCountAtFanout: 2,
      status: "running",
      championTaskId: null,
      pickedHistory: [],
      viewMode: "grid",
      focusedBranchTaskId: null,
      minimized: false,
    };
  }

  test("returns 'running' when any branch has an active turn", () => {
    const group = buildBaseGroup();
    expect(
      deriveColiseumRunStatus({
        group,
        activeTurnIdsByTask: { "child-1": "turn-1" },
      }),
    ).toBe("running");
  });

  test("returns 'ready' when no branch is active and no champion is picked", () => {
    const group = buildBaseGroup();
    expect(
      deriveColiseumRunStatus({
        group,
        activeTurnIdsByTask: {},
      }),
    ).toBe("ready");
  });

  test("returns 'promoted' when no branch is active and a champion exists", () => {
    const group = { ...buildBaseGroup(), championTaskId: "child-1" };
    expect(
      deriveColiseumRunStatus({
        group,
        activeTurnIdsByTask: {},
      }),
    ).toBe("promoted");
  });

  test("'running' takes precedence over a picked champion (pick-now mid-stream)", () => {
    const group = { ...buildBaseGroup(), championTaskId: "child-1" };
    expect(
      deriveColiseumRunStatus({
        group,
        // The non-champion branch is still streaming.
        activeTurnIdsByTask: { "child-2": "turn-2" },
      }),
    ).toBe("running");
  });
});

describe("reapColiseumOrphans", () => {
  function makeTask(id: string, coliseumParentTaskId?: string): Task {
    return {
      id,
      title: id,
      provider: "claude-code",
      updatedAt: "2026-04-20T00:00:00.000Z",
      unread: false,
      archivedAt: null,
      controlMode: "interactive",
      controlOwner: "stave",
      ...(coliseumParentTaskId ? { coliseumParentTaskId } : {}),
    };
  }

  test("removes branch tasks when no group references them", () => {
    const parent = makeTask("parent");
    const branchA = makeTask("branch-a", "parent");
    const branchB = makeTask("branch-b", "parent");
    const result = reapColiseumOrphans({
      tasks: [parent, branchA, branchB],
      activeColiseumsByTask: {},
    });
    expect(result.tasks).toEqual([parent]);
    expect(result.orphanedBranchTaskIds).toEqual(["branch-a", "branch-b"]);
  });

  test("keeps branches that are still in an active group", () => {
    const parent = makeTask("parent");
    const branchA = makeTask("branch-a", "parent");
    const branchB = makeTask("branch-b", "parent");
    const result = reapColiseumOrphans({
      tasks: [parent, branchA, branchB],
      activeColiseumsByTask: {
        parent: {
          parentTaskId: "parent",
          runId: "run-parent-1",
          branchTaskIds: ["branch-a", "branch-b"],
          branchMeta: {
            "branch-a": {
              branchTaskId: "branch-a",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
            "branch-b": {
              branchTaskId: "branch-b",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
          },
          createdAt: "2026-04-20T00:00:00.000Z",
          parentMessageCountAtFanout: 0,
          status: "running",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: false,
        },
      },
    });
    expect(result.tasks).toEqual([parent, branchA, branchB]);
    expect(result.orphanedBranchTaskIds).toEqual([]);
  });

  test("returns the same tasks reference when there are no orphans", () => {
    const parent = makeTask("parent");
    const tasks = [parent];
    const result = reapColiseumOrphans({
      tasks,
      activeColiseumsByTask: {},
    });
    expect(result.tasks).toBe(tasks);
    expect(result.orphanedBranchTaskIds).toEqual([]);
  });

  test("mixed orphaned + live branches are partitioned correctly", () => {
    const parent = makeTask("parent");
    const liveBranch = makeTask("live-branch", "parent");
    const orphanBranch = makeTask("orphan-branch", "gone-parent");
    const result = reapColiseumOrphans({
      tasks: [parent, liveBranch, orphanBranch],
      activeColiseumsByTask: {
        parent: {
          parentTaskId: "parent",
          runId: "run-parent-1",
          branchTaskIds: ["live-branch"],
          branchMeta: {
            "live-branch": {
              branchTaskId: "live-branch",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
          },
          createdAt: "2026-04-20T00:00:00.000Z",
          parentMessageCountAtFanout: 0,
          status: "running",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: false,
        },
      },
    });
    expect(result.tasks).toEqual([parent, liveBranch]);
    expect(result.orphanedBranchTaskIds).toEqual(["orphan-branch"]);
  });
});

describe("Coliseum lifecycle end-to-end (pure helpers)", () => {
  // These tests thread the helper chain the way the store action does, without
  // touching `app.store.ts`. They guarantee the three pure helpers compose
  // correctly across the fan-out → promote → cleanup boundary, which is where
  // regressions would otherwise only surface as live runtime bugs.

  function runFanOut() {
    return planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
        { provider: "stave", model: "stave-auto" },
      ],
      content: "compare these",
      createTaskId: sequentialIdFactory("child"),
      createTurnId: sequentialIdFactory("turn"),
      now: deterministicNow,
    });
  }

  test("branch taskIds + turnIds are all unique across concurrent branches", () => {
    const plan = runFanOut();
    const taskIds = plan.branchDispatchList.map((d) => d.taskId);
    const turnIds = plan.branchDispatchList.map((d) => d.turnId);
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(new Set(turnIds).size).toBe(turnIds.length);
    // Per-branch message maps share no keys with each other.
    expect(new Set(Object.keys(plan.branchMessagesByTask)).size).toBe(
      plan.branchTasks.length,
    );
  });

  test("promotion is non-destructive: branches stay alive so the user can re-pick", () => {
    const plan = runFanOut();

    // Simulate the champion branch appending a response after fan-out.
    const championTaskId = plan.branchDispatchList[1]!.taskId;
    const championPriorMessages = plan.branchMessagesByTask[championTaskId]!;
    // Replace streaming assistant with a completed one.
    const championMessages: ChatMessage[] = championPriorMessages.map(
      (msg, idx) => {
        if (
          idx === championPriorMessages.length - 1 &&
          msg.role === "assistant"
        ) {
          return {
            ...msg,
            isStreaming: false,
            content: "codex champion answer",
            parts: [{ type: "text", text: "codex champion answer" }],
          };
        }
        return msg;
      },
    );

    const parentMessages = createHistory();
    const promotion = promoteColiseumChampion({
      group: plan.group,
      championTaskId,
      parentMessages,
      championMessages,
    });

    // Parent gained exactly the post-fan-out tail (user msg + assistant).
    expect(promotion.appendedFromChampion).toBe(2);
    expect(promotion.nextParentMessages).toHaveLength(
      parentMessages.length + 2,
    );
    // The grafted assistant renders as *complete* on the parent.
    expect(promotion.nextParentMessages.at(-1)?.isStreaming).toBe(false);
    // Non-destructive: the result does NOT include a drop list. Branches stay
    // alive — the store lets the arena remain open so the user can re-pick,
    // switch focus, or keep comparing. Explicit cleanup is handled by
    // `discardColiseumRun`, not by promote.
    expect(
      (promotion as unknown as { branchTaskIdsToDrop?: unknown })
        .branchTaskIdsToDrop,
    ).toBeUndefined();

    // With the group still active, `reapColiseumOrphans` must preserve all
    // branch tasks — promote is NOT a reap trigger.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      activeColiseumsByTask: {
        "task-parent": {
          ...plan.group,
          championTaskId,
          status: "promoted",
          pickedHistory: [
            { championTaskId, pickedAt: "2026-04-20T12:01:00.000Z" },
          ],
        },
      },
    });
    expect(reapResult.tasks).toEqual(plan.branchTasks);
    expect(reapResult.orphanedBranchTaskIds).toEqual([]);
  });

  test("re-pick replaces the previous graft while branches remain alive", () => {
    const plan = runFanOut();

    // First pick: branch 1.
    const firstChampionId = plan.branchDispatchList[0]!.taskId;
    const firstChampionPrior = plan.branchMessagesByTask[firstChampionId]!;
    const firstChampionMessages: ChatMessage[] = firstChampionPrior.map(
      (msg, idx) => {
        if (idx === firstChampionPrior.length - 1 && msg.role === "assistant") {
          return {
            ...msg,
            isStreaming: false,
            content: "first champion answer",
            parts: [{ type: "text", text: "first champion answer" }],
          };
        }
        return msg;
      },
    );
    const firstPick = promoteColiseumChampion({
      group: plan.group,
      championTaskId: firstChampionId,
      parentMessages: createHistory(),
      championMessages: firstChampionMessages,
    });
    expect(firstPick.nextParentMessages.at(-1)?.content).toBe(
      "first champion answer",
    );

    // Second pick: branch 2, replacing the first.
    const secondChampionId = plan.branchDispatchList[1]!.taskId;
    const secondChampionPrior = plan.branchMessagesByTask[secondChampionId]!;
    const secondChampionMessages: ChatMessage[] = secondChampionPrior.map(
      (msg, idx) => {
        if (
          idx === secondChampionPrior.length - 1 &&
          msg.role === "assistant"
        ) {
          return {
            ...msg,
            isStreaming: false,
            content: "second champion answer",
            parts: [{ type: "text", text: "second champion answer" }],
          };
        }
        return msg;
      },
    );
    const secondPick = promoteColiseumChampion({
      group: plan.group,
      championTaskId: secondChampionId,
      parentMessages: firstPick.nextParentMessages,
      championMessages: secondChampionMessages,
      replacePreviousPick: true,
    });

    // The grafted tail reflects the *new* champion's content, length stays at
    // history + 2 (not history + 4 — re-pick must not accumulate).
    expect(secondPick.nextParentMessages).toHaveLength(
      createHistory().length + 2,
    );
    expect(secondPick.nextParentMessages.at(-1)?.content).toBe(
      "second champion answer",
    );

    // Branches are still alive; re-pick is a pure parent-side swap.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      activeColiseumsByTask: {
        "task-parent": {
          ...plan.group,
          championTaskId: secondChampionId,
          status: "promoted",
          pickedHistory: [
            {
              championTaskId: firstChampionId,
              pickedAt: "2026-04-20T12:01:00.000Z",
            },
            {
              championTaskId: secondChampionId,
              pickedAt: "2026-04-20T12:02:00.000Z",
            },
          ],
        },
      },
    });
    expect(reapResult.tasks).toEqual(plan.branchTasks);
  });

  test("sequential runs: after close+relaunch, parent accumulates both champions' tails", () => {
    // === Run 1 ===
    const plan1 = planColiseumFanOut({
      parentTask: createParentTask(),
      parentMessages: createHistory(),
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-sonnet-4-6" },
        { provider: "codex", model: "gpt-5.4" },
      ],
      content: "first coliseum prompt",
      createTaskId: sequentialIdFactory("run1-child"),
      createTurnId: sequentialIdFactory("run1-turn"),
      createRunId: sequentialIdFactory("run"),
      now: deterministicNow,
    });
    expect(plan1.group.runId).toBe("run-1");

    // Pick champion from run 1.
    const champion1Id = plan1.branchDispatchList[0]!.taskId;
    const champion1Messages: ChatMessage[] = plan1.branchMessagesByTask[
      champion1Id
    ]!.map((msg, idx, arr) => {
      if (idx === arr.length - 1 && msg.role === "assistant") {
        return {
          ...msg,
          isStreaming: false,
          content: "run 1 champion answer",
          parts: [{ type: "text", text: "run 1 champion answer" }],
        };
      }
      return msg;
    });
    const pick1 = promoteColiseumChampion({
      group: plan1.group,
      championTaskId: champion1Id,
      parentMessages: createHistory(),
      championMessages: champion1Messages,
    });

    // Simulate close-arena: branches reaped, group removed from state.
    const tasksAfterClose1 = reapColiseumOrphans({
      tasks: plan1.branchTasks,
      activeColiseumsByTask: {},
    });
    expect(tasksAfterClose1.tasks).toHaveLength(0);

    // === Run 2 — starts from run 1's grafted parent messages ===
    const plan2 = planColiseumFanOut({
      parentTask: createParentTask(),
      // Crucial: the new run reads the parent's *current* history, which
      // already includes run 1's grafted tail.
      parentMessages: pick1.nextParentMessages,
      parentPromptDraft: undefined,
      parentTaskWorkspaceId: "worktree:abc",
      branches: [
        { provider: "claude-code", model: "claude-opus-4-5" },
        { provider: "stave", model: "stave-auto" },
      ],
      content: "second coliseum prompt",
      createTaskId: sequentialIdFactory("run2-child"),
      createTurnId: sequentialIdFactory("run2-turn"),
      createRunId: sequentialIdFactory("r2-run"),
      now: deterministicNow,
    });

    // Second run gets its own runId, and its fan-out point lands on the
    // extended parent — not the original pre-run-1 length.
    expect(plan2.group.runId).toBe("r2-run-1");
    expect(plan2.group.parentMessageCountAtFanout).toBe(
      pick1.nextParentMessages.length,
    );

    // Pick champion from run 2.
    const champion2Id = plan2.branchDispatchList[1]!.taskId;
    const champion2Messages: ChatMessage[] = plan2.branchMessagesByTask[
      champion2Id
    ]!.map((msg, idx, arr) => {
      if (idx === arr.length - 1 && msg.role === "assistant") {
        return {
          ...msg,
          isStreaming: false,
          content: "run 2 champion answer",
          parts: [{ type: "text", text: "run 2 champion answer" }],
        };
      }
      return msg;
    });
    const pick2 = promoteColiseumChampion({
      group: plan2.group,
      championTaskId: champion2Id,
      parentMessages: pick1.nextParentMessages,
      championMessages: champion2Messages,
    });

    // Parent now carries history (2) + run 1 tail (2) + run 2 tail (2) = 6.
    expect(pick2.nextParentMessages).toHaveLength(6);
    // Run 1's champion answer is preserved (sequential, not destructive).
    expect(pick2.nextParentMessages.map((m) => m.content)).toEqual([
      "first prompt",
      "first answer",
      "first coliseum prompt",
      "run 1 champion answer",
      "second coliseum prompt",
      "run 2 champion answer",
    ]);
    // IDs are contiguous on the parent task.
    expect(pick2.nextParentMessages.map((m) => m.id)).toEqual([
      "task-parent-m-1",
      "task-parent-m-2",
      "task-parent-m-3",
      "task-parent-m-4",
      "task-parent-m-5",
      "task-parent-m-6",
    ]);
    // Grafted assistants render as complete on the parent.
    expect(pick2.nextParentMessages[3]?.isStreaming).toBe(false);
    expect(pick2.nextParentMessages[5]?.isStreaming).toBe(false);
  });

  test("discarding the run without picking a champion cleans up every branch", () => {
    const plan = runFanOut();
    const strippedMessages = stripColiseumBranchesFromRecords(
      plan.branchMessagesByTask,
      plan.group.branchTaskIds,
    );
    expect(strippedMessages).toEqual({});

    // Post-discard: branches must be reapable from the task list even if they
    // were never promoted.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      activeColiseumsByTask: {},
    });
    expect(reapResult.tasks).toHaveLength(0);
  });

  test("closing one branch leaves the group and the survivors intact", () => {
    const plan = runFanOut();
    const [killed, ...survivors] = plan.branchTasks;
    expect(killed).toBeDefined();
    // Spread keeps all the required ColiseumGroupState fields from the plan.
    const reapResult = reapColiseumOrphans({
      tasks: plan.branchTasks,
      // The group now only tracks the surviving branches.
      activeColiseumsByTask: {
        "task-parent": {
          ...plan.group,
          branchTaskIds: survivors.map((s) => s.id),
        },
      },
    });
    expect(reapResult.tasks).toEqual(survivors);
    expect(reapResult.orphanedBranchTaskIds).toEqual([killed!.id]);
  });
});

describe("collectActiveColiseumTaskIds", () => {
  test("retains parent, branch, and reviewer tasks for live arena state", () => {
    const retained = collectActiveColiseumTaskIds({
      activeColiseumsByTask: {
        "task-parent": {
          parentTaskId: "task-parent",
          runId: "run-1",
          branchTaskIds: ["branch-a", "branch-b"],
          branchMeta: {
            "branch-a": {
              branchTaskId: "branch-a",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
            "branch-b": {
              branchTaskId: "branch-b",
              provider: "codex",
              model: "gpt-5.4",
            },
          },
          createdAt: "2026-04-20T12:00:00.000Z",
          parentMessageCountAtFanout: 2,
          status: "ready",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: false,
          reviewerTaskId: "reviewer-1",
        },
      },
    });

    expect([...retained]).toEqual([
      "task-parent",
      "branch-a",
      "branch-b",
      "reviewer-1",
    ]);
  });
});

describe("summarizeColiseumActivity", () => {
  test("counts running branches and reviewers across active arenas", () => {
    const summary = summarizeColiseumActivity({
      activeColiseumsByTask: {
        "task-parent": {
          parentTaskId: "task-parent",
          runId: "run-1",
          branchTaskIds: ["branch-a", "branch-b"],
          branchMeta: {
            "branch-a": {
              branchTaskId: "branch-a",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
            "branch-b": {
              branchTaskId: "branch-b",
              provider: "codex",
              model: "gpt-5.4",
            },
          },
          createdAt: "2026-04-20T12:00:00.000Z",
          parentMessageCountAtFanout: 2,
          status: "running",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: true,
          reviewerTaskId: "reviewer-1",
          reviewerVerdict: {
            status: "running",
            providerId: "claude-code",
            model: "claude-opus",
            content: "",
            startedAt: "2026-04-20T12:01:00.000Z",
          },
        },
      },
      activeTurnIdsByTask: {
        "branch-a": "turn-a",
        "reviewer-1": "turn-reviewer",
      },
    });

    expect(summary).toEqual({
      runningArenaCount: 1,
      runningBranchCount: 1,
      runningReviewerCount: 1,
      hasActivity: true,
    });
  });

  test("returns an empty summary when every arena is idle", () => {
    const summary = summarizeColiseumActivity({
      activeColiseumsByTask: {
        "task-parent": {
          parentTaskId: "task-parent",
          runId: "run-1",
          branchTaskIds: ["branch-a", "branch-b"],
          branchMeta: {
            "branch-a": {
              branchTaskId: "branch-a",
              provider: "claude-code",
              model: "claude-sonnet-4-6",
            },
            "branch-b": {
              branchTaskId: "branch-b",
              provider: "codex",
              model: "gpt-5.4",
            },
          },
          createdAt: "2026-04-20T12:00:00.000Z",
          parentMessageCountAtFanout: 2,
          status: "ready",
          championTaskId: null,
          pickedHistory: [],
          viewMode: "grid",
          focusedBranchTaskId: null,
          minimized: false,
        },
      },
      activeTurnIdsByTask: {},
    });

    expect(summary).toEqual({
      runningArenaCount: 0,
      runningBranchCount: 0,
      runningReviewerCount: 0,
      hasActivity: false,
    });
  });
});

describe("stripColiseumBranchesFromRecords", () => {
  test("removes listed keys and preserves the rest", () => {
    const record = {
      "task-parent": 1,
      "child-1": 2,
      "child-2": 3,
    };
    const next = stripColiseumBranchesFromRecords(record, [
      "child-1",
      "child-2",
    ]);
    expect(next).toEqual({ "task-parent": 1 });
  });

  test("returns the same reference when no keys match", () => {
    const record = { a: 1, b: 2 };
    const next = stripColiseumBranchesFromRecords(record, ["missing"]);
    expect(next).toBe(record);
  });

  test("returns the same reference when the branch list is empty", () => {
    const record = { a: 1 };
    expect(stripColiseumBranchesFromRecords(record, [])).toBe(record);
  });
});

describe("extractBranchSummary", () => {
  function meta(id: string): {
    branchTaskId: string;
    provider: "claude-code" | "codex" | "stave";
    model: string;
  } {
    return {
      branchTaskId: id,
      provider: "claude-code",
      model: "claude-sonnet-4-6",
    };
  }

  test("returns only the branch's post-fan-out messages, ignoring the parent prefix", () => {
    const parentPrefix: ChatMessage[] = [
      {
        id: "m1",
        role: "user",
        model: "user",
        providerId: "user",
        content: "unrelated",
        parts: [{ type: "text", text: "unrelated" }],
      },
      {
        id: "m2",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "unrelated answer",
        parts: [{ type: "text", text: "unrelated answer" }],
      },
    ];
    const branchTail: ChatMessage[] = [
      {
        id: "m3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "branch prompt",
        parts: [{ type: "text", text: "branch prompt" }],
      },
      {
        id: "m4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "the answer",
        parts: [{ type: "text", text: "the answer" }],
      },
    ];

    const summary = extractBranchSummary({
      branchMeta: meta("branch-1"),
      branchMessages: [...parentPrefix, ...branchTail],
      parentMessageCountAtFanout: parentPrefix.length,
    });

    expect(summary.branchTaskId).toBe("branch-1");
    expect(summary.assistantText).toBe("the answer");
    // Parent-prefix assistant text is NOT included.
    expect(summary.assistantText).not.toContain("unrelated");
    expect(summary.isStreaming).toBe(false);
  });

  test("collects file paths from code_diff and Edit/Write tool_use parts, deduped and ordered", () => {
    const branchTail: ChatMessage[] = [
      {
        id: "m3",
        role: "user",
        model: "user",
        providerId: "user",
        content: "prompt",
        parts: [{ type: "text", text: "prompt" }],
      },
      {
        id: "m4",
        role: "assistant",
        model: "claude-sonnet-4-6",
        providerId: "claude-code",
        content: "",
        parts: [
          {
            type: "tool_use",
            toolName: "Edit",
            input: JSON.stringify({ file_path: "src/a.ts" }),
            state: "output-available",
          },
          {
            type: "code_diff",
            filePath: "src/b.ts",
            oldContent: "",
            newContent: "new",
            status: "pending",
          },
          {
            type: "tool_use",
            toolName: "Write",
            input: JSON.stringify({ file_path: "src/a.ts" }),
            state: "output-available",
          },
          {
            type: "text",
            text: "done",
          },
        ],
      },
    ];

    const summary = extractBranchSummary({
      branchMeta: meta("branch-1"),
      branchMessages: branchTail,
      parentMessageCountAtFanout: 0,
    });

    // Deduped (src/a.ts appears twice in tool uses; only listed once).
    expect(summary.changedFilePaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(summary.toolTrace).toEqual(["Edit: src/a.ts", "Write: src/a.ts"]);
    expect(summary.assistantText).toBe("done");
  });

  test("caps toolTrace length to keep the reviewer prompt bounded", () => {
    const manyTools = Array.from({ length: 20 }, (_, i) => ({
      type: "tool_use" as const,
      toolName: "Bash",
      input: JSON.stringify({ cmd: `echo ${i}` }),
      state: "output-available" as const,
    }));
    const summary = extractBranchSummary({
      branchMeta: meta("branch-1"),
      branchMessages: [
        {
          id: "m1",
          role: "assistant",
          model: "m",
          providerId: "claude-code",
          content: "",
          parts: manyTools,
        },
      ],
      parentMessageCountAtFanout: 0,
    });
    // REVIEWER_TOOL_TRACE_LIMIT_PER_BRANCH is 6.
    expect(summary.toolTrace.length).toBe(6);
  });

  test("flags isStreaming when the final assistant is still streaming", () => {
    const summary = extractBranchSummary({
      branchMeta: meta("branch-1"),
      branchMessages: [
        {
          id: "m1",
          role: "assistant",
          model: "m",
          providerId: "claude-code",
          content: "partial",
          isStreaming: true,
          parts: [{ type: "text", text: "partial" }],
        },
      ],
      parentMessageCountAtFanout: 0,
    });
    expect(summary.isStreaming).toBe(true);
  });
});

describe("buildReviewerPrompt", () => {
  const sampleSummaries: ColiseumBranchSummary[] = [
    {
      branchTaskId: "branch-1",
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      assistantText: "Here is approach A.",
      changedFilePaths: ["src/a.ts"],
      toolTrace: ["Edit: src/a.ts"],
      isStreaming: false,
    },
    {
      branchTaskId: "branch-2",
      provider: "codex",
      model: "gpt-5.4",
      assistantText: "Alternative approach B.",
      changedFilePaths: ["src/b.ts", "README.md"],
      toolTrace: ["Write: src/b.ts", "Bash"],
      isStreaming: false,
    },
  ];

  test("includes the original user prompt and each branch's model + text", () => {
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "Refactor foo.",
      branchSummaries: sampleSummaries,
    });

    expect(prompt).toContain("Refactor foo.");
    expect(prompt).toContain("claude-code · claude-sonnet-4-6");
    expect(prompt).toContain("codex · gpt-5.4");
    expect(prompt).toContain("Here is approach A.");
    expect(prompt).toContain("Alternative approach B.");
    expect(prompt).toContain("src/a.ts");
    expect(prompt).toContain("src/b.ts");
    expect(prompt).toContain("README.md");
  });

  test("numbers branches 1..N in the order provided", () => {
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "x",
      branchSummaries: sampleSummaries,
    });
    const branch1Index = prompt.indexOf("Branch 1");
    const branch2Index = prompt.indexOf("Branch 2");
    expect(branch1Index).toBeGreaterThanOrEqual(0);
    expect(branch2Index).toBeGreaterThan(branch1Index);
  });

  test("asks for a structured scorecard + recommendation in the response format", () => {
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "x",
      branchSummaries: sampleSummaries,
    });
    expect(prompt).toContain("TL;DR recommendation");
    expect(prompt).toContain("Scorecard");
    expect(prompt).toContain("Key differences");
    expect(prompt).toContain("Red flags");
  });

  test("marks streaming branches so the reviewer knows the answer isn't final", () => {
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "x",
      branchSummaries: [{ ...sampleSummaries[0]!, isStreaming: true }],
    });
    expect(prompt).toContain("still streaming when captured");
  });

  test("truncates very long assistant text with a visible marker", () => {
    const big = "A".repeat(5000);
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "x",
      branchSummaries: [{ ...sampleSummaries[0]!, assistantText: big }],
    });
    expect(prompt).toContain("truncated");
    // Full 5000-char block should not appear — it would exceed the 4000 cap.
    expect(prompt).not.toContain("A".repeat(4500));
  });

  test("falls back to a placeholder when the branch has no text (tool-only response)", () => {
    const prompt = buildReviewerPrompt({
      originalUserPrompt: "x",
      branchSummaries: [{ ...sampleSummaries[0]!, assistantText: "" }],
    });
    expect(prompt).toContain("(no text — tool-only response)");
  });

  test("throws when no branch summaries are provided", () => {
    expect(() =>
      buildReviewerPrompt({ originalUserPrompt: "x", branchSummaries: [] }),
    ).toThrow(/at least one branch/);
  });
});

describe("buildColiseumMergedFollowUp", () => {
  const sampleSummaries: ColiseumBranchSummary[] = [
    {
      branchTaskId: "branch-1",
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      assistantText: "Champion answer.",
      changedFilePaths: ["src/a.ts"],
      toolTrace: ["Edit: src/a.ts"],
      isStreaming: false,
    },
    {
      branchTaskId: "branch-2",
      provider: "codex",
      model: "gpt-5.4",
      assistantText: "Alternative improvement.",
      changedFilePaths: ["src/b.ts"],
      toolTrace: ["Write: src/b.ts"],
      isStreaming: false,
    },
  ];

  test("uses the reviewer verdict and excludes the champion body when a champion exists", () => {
    const prompt = buildColiseumMergedFollowUp({
      reviewerVerdict: {
        content: "Branch 2 has the better edge-case handling.",
      },
      branchSummaries: sampleSummaries,
      championTaskId: "branch-1",
    });

    expect(prompt).toContain("Current champion already in the conversation");
    expect(prompt).toContain("Branch 2 has the better edge-case handling.");
    expect(prompt).toContain("Alternative improvement.");
    expect(prompt).not.toContain("Champion answer.");
  });

  test("includes every branch when no champion has been picked", () => {
    const prompt = buildColiseumMergedFollowUp({
      reviewerVerdict: { content: "Prefer the first branch as the base." },
      branchSummaries: sampleSummaries,
      championTaskId: null,
    });

    expect(prompt).toContain("No champion has been picked yet.");
    expect(prompt).toContain("Champion answer.");
    expect(prompt).toContain("Alternative improvement.");
  });

  test("marks still-streaming branches and truncates oversized content", () => {
    const prompt = buildColiseumMergedFollowUp({
      reviewerVerdict: { content: "Use branch 1." },
      branchSummaries: [
        {
          ...sampleSummaries[0]!,
          assistantText: "A".repeat(3000),
          isStreaming: true,
        },
      ],
      championTaskId: null,
    });

    expect(prompt).toContain("still streaming when captured");
    expect(prompt).toContain("truncated");
    expect(prompt).not.toContain("A".repeat(2500));
  });

  test("throws when no branch summaries are provided", () => {
    expect(() =>
      buildColiseumMergedFollowUp({
        reviewerVerdict: { content: "x" },
        branchSummaries: [],
      }),
    ).toThrow(/at least one branch/);
  });
});

describe("planReviewerLaunch", () => {
  function buildGroupFixture(): ColiseumGroupState {
    return {
      parentTaskId: "task-parent",
      runId: "run-xyz",
      branchTaskIds: ["branch-a", "branch-b"],
      branchMeta: {
        "branch-a": {
          branchTaskId: "branch-a",
          provider: "claude-code",
          model: "claude-sonnet",
        },
        "branch-b": {
          branchTaskId: "branch-b",
          provider: "codex",
          model: "gpt-5",
        },
      },
      createdAt: "2026-04-20T00:00:00.000Z",
      parentMessageCountAtFanout: 2,
      status: "ready",
      championTaskId: null,
      pickedHistory: [],
      viewMode: "grid",
      focusedBranchTaskId: null,
      minimized: false,
    };
  }

  test("seeds a reviewer task hidden via coliseumParentTaskId and assigns message ids", () => {
    const parentTask = createParentTask();
    const group = buildGroupFixture();

    const plan = planReviewerLaunch({
      parentTask,
      group,
      parentTaskWorkspaceId: "ws-main",
      reviewerProvider: "claude-code",
      reviewerModel: "claude-opus-4.5",
      reviewerPrompt: "compare the branches",
      createTaskId: () => "reviewer-task-1",
      createTurnId: () => "turn-rev-1",
      now: () => "2026-04-20T01:00:00.000Z",
    });

    expect(plan.reviewerTask.id).toBe("reviewer-task-1");
    expect(plan.reviewerTask.coliseumParentTaskId).toBe("task-parent");
    expect(plan.reviewerTurnId).toBe("turn-rev-1");
    expect(plan.reviewerMessages).toHaveLength(2);
    expect(plan.reviewerMessages[0]).toMatchObject({
      role: "user",
      content: "compare the branches",
    });
    expect(plan.reviewerMessages[1]).toMatchObject({
      role: "assistant",
      providerId: "claude-code",
      model: "claude-opus-4.5",
      isStreaming: true,
    });
    expect(plan.reviewerVerdict).toMatchObject({
      status: "running",
      providerId: "claude-code",
      model: "claude-opus-4.5",
      content: "",
    });
    expect(plan.nextGroup.reviewerTaskId).toBe("reviewer-task-1");
    expect(plan.nextGroup.reviewerVerdict).toBe(plan.reviewerVerdict);
  });

  test("reviewer is considered a branch by isColiseumBranch — task tree hides it", () => {
    const parentTask = createParentTask();
    const group = buildGroupFixture();
    const plan = planReviewerLaunch({
      parentTask,
      group,
      parentTaskWorkspaceId: "ws-main",
      reviewerProvider: "codex",
      reviewerModel: "gpt-5",
      reviewerPrompt: "review",
      createTaskId: () => "rev",
      createTurnId: () => "turn",
    });
    expect(isColiseumBranch(plan.reviewerTask)).toBe(true);
  });

  test("inherits parent prompt-draft runtime overrides and overrides model", () => {
    const parentTask = createParentTask();
    const group = buildGroupFixture();
    const parentPromptDraft: PromptDraft = {
      text: "",
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: {
        claudePermissionMode: "acceptEdits",
        model: "some-other-model",
      },
    };

    const plan = planReviewerLaunch({
      parentTask,
      group,
      parentTaskWorkspaceId: "ws-main",
      reviewerProvider: "claude-code",
      reviewerModel: "claude-opus-4.5",
      reviewerPrompt: "review",
      parentPromptDraft,
      createTaskId: () => "r",
      createTurnId: () => "t",
    });
    expect(plan.reviewerPromptDraft.runtimeOverrides).toEqual({
      claudePermissionMode: "acceptEdits",
      model: "claude-opus-4.5",
    });
  });

  test("clearReviewerFromGroup drops reviewerTaskId and verdict cleanly", () => {
    const parentTask = createParentTask();
    const plan = planReviewerLaunch({
      parentTask,
      group: buildGroupFixture(),
      parentTaskWorkspaceId: "ws-main",
      reviewerProvider: "claude-code",
      reviewerModel: "claude-opus-4.5",
      reviewerPrompt: "p",
      createTaskId: () => "r",
      createTurnId: () => "t",
    });
    const cleared = clearReviewerFromGroup(plan.nextGroup);
    expect(cleared.reviewerTaskId).toBeUndefined();
    expect(cleared.reviewerVerdict).toBeUndefined();
    // Preserves other fields.
    expect(cleared.branchTaskIds).toEqual(plan.nextGroup.branchTaskIds);
    expect(cleared.parentMessageCountAtFanout).toBe(
      plan.nextGroup.parentMessageCountAtFanout,
    );
  });

  test("clearReviewerFromGroup returns the same reference when nothing to clear", () => {
    const group = buildGroupFixture();
    expect(clearReviewerFromGroup(group)).toBe(group);
  });
});
