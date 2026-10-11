import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  DelegateTaskArgsSchema,
  type DelegateTaskArgs,
  type DelegatedTaskActionResponse,
  type DelegatedTaskSummary,
} from "../src/lib/runs/delegated-task";
import type { SkillCatalogEntry } from "../src/lib/skills/types";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  };
}

const delegated: DelegateTaskArgs[] = [];
const delegatedContexts: unknown[] = [];
const providerRequests: unknown[] = [];
let delegateResponse: DelegatedTaskActionResponse;
let delegatedChildren: DelegatedTaskSummary[] = [];

const REVIEW_CHILD: DelegatedTaskSummary = {
  runId: "child-task:task-main:stave-review-1",
  stepId: "child-task:task-main:stave-review-1:turn",
  parentTaskId: "task-main",
  delegationKey: "stave-review-20261004120000-a",
  delegatedTaskId: "task-review",
  delegatedWorkspaceId: "ws-main",
  delegatedTurnId: "turn-review",
  providerId: "codex",
  requestedModel: "gpt-5.5",
  lifecycle: "one-turn",
  phase: "completed",
  reason: null,
  attempt: 1,
  createdAt: "2026-10-04T12:00:00.000Z",
  updatedAt: "2026-10-04T12:05:00.000Z",
  completedAt: "2026-10-04T12:05:00.000Z",
  result: "RECEIPT COPY OF THE FINDINGS",
};

(globalThis as { window: unknown }).window = {
  localStorage: createMemoryStorage(),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  api: {
    runs: {
      delegateTask: async (args: DelegateTaskArgs, context?: unknown) => {
        delegated.push(args);
        delegatedContexts.push(context);
        return delegateResponse;
      },
      listDelegatedTasks: async () => delegatedChildren,
    },
    provider: {
      startPushTurn: async (args: unknown) => {
        providerRequests.push(args);
        return { ok: true, streamId: "stream-1", turnId: "turn-1" };
      },
      subscribeStreamEvents: () => () => undefined,
      abortTurn: async () => ({ ok: true, message: "aborted" }),
      cleanupTask: async () => ({ ok: true }),
    },
    persistence: {
      listWorkspaces: async () => [],
      loadWorkspace: async () => null,
      upsertWorkspace: async () => ({ ok: true }),
      loadTaskMessages: async () => ({
        ok: true,
        page: {
          messages: [
            {
              id: "r1",
              role: "assistant",
              model: "gpt-5.5",
              providerId: "codex",
              content: "FULL FINDINGS: the cache key ignores the locale.",
              parts: [],
            },
          ],
          totalCount: 1,
          limit: 40,
          offset: 0,
          hasMoreOlder: false,
        },
      }),
    },
    fs: {
      readFile: async () => ({ ok: false, content: "", revision: "", stderr: "not found" }),
    },
  },
} as unknown;

const { useAppStore } = await import("../src/store/app.store");
const { attachReviewResultToDraft, recheckReviewTask, rerunReviewTask, startReviewTask } = await import(
  "../src/store/review-task-runtime"
);
const { DEFAULT_REVIEW_FOLLOW_UP_PROMPT } = await import("../src/lib/reviews/review-task");

afterAll(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

const SKILL: SkillCatalogEntry = {
  id: "skill-team-review",
  slug: "team-review",
  name: "Team review",
  description: "Our checklist",
  scope: "local",
  provider: "shared",
  path: "/tmp/stave-project/skills/team-review/SKILL.md",
  realPath: "/tmp/stave-project/skills/team-review/SKILL.md",
  sourceRootPath: "/tmp/stave-project/skills",
  sourceRootRealPath: null,
  invocationToken: "$team-review",
  instructions: "Rank findings by blast radius.",
};

function seedStore() {
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    hasHydratedWorkspaces: true,
    workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-10-04T00:00:00.000Z" }],
    activeWorkspaceId: "ws-main",
    activeTaskId: "task-main",
    repositoryPath: "/tmp/stave-project",
    workspacePathById: { "ws-main": "/tmp/stave-project" },
    workspaceBranchById: { "ws-main": "main" },
    workspaceDefaultById: { "ws-main": true },
    draftProvider: "claude-code",
    tasks: [
      {
        id: "task-main",
        title: "Main Task",
        provider: "claude-code",
        updatedAt: "2026-10-04T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
      {
        id: "task-review",
        title: "Review · Uncommitted changes · GPT-5.5",
        provider: "codex",
        updatedAt: "2026-10-04T12:05:00.000Z",
        unread: false,
        archivedAt: null,
        parentTaskId: "task-main",
      },
    ],
    messagesByTask: {
      "task-main": [
        { id: "u1", role: "user", model: "", providerId: "user", content: "Plan the cache fix", parts: [] },
        {
          id: "a1",
          role: "assistant",
          model: "claude-opus-5-5",
          providerId: "claude-code",
          content: "Key the cache by locale.",
          parts: [],
          startedAt: "2026-10-04T11:00:00.000Z",
        },
      ],
    },
    promptDraftByTask: {
      "task-main": { text: "", attachedFilePaths: [], attachments: [] },
    },
    skillCatalog: {
      ...useAppStore.getInitialState().skillCatalog,
      skills: [SKILL],
    },
  } as never);
  useAppStore.setState((state) => ({
    settings: {
      ...state.settings,
      reviewTask: { ...state.settings.reviewTask, instructions: "Check persistence." },
    },
  }));
}

beforeEach(() => {
  delegated.length = 0;
  providerRequests.length = 0;
  delegatedChildren = [];
  delegateResponse = {
    accepted: true,
    duplicate: false,
    reason: null,
    message: null,
    child: { ...REVIEW_CHILD, phase: "running", completedAt: null, result: undefined },
  };
  seedStore();
});

describe("starting a review task", () => {
  test("custom rubric is delivered unchanged to either provider in a read-only delegation", async () => {
    seedStore();
    for (const providerId of ["codex", "claude-code"] as const) {
      const result = await startReviewTask({ getState: useAppStore.getState, taskId: "task-main", request: {
        reviewer: { providerId, model: "configured-model", label: "Reviewer" }, target: "working-tree", focuses: [],
        promptSource: "custom", customPrompt: "CUSTOM_RUBRIC: verify event sequence.", presetId: "performance", skillSlug: "missing-skill",
      } });
      expect(result.ok).toBe(true);
      expect(delegated.at(-1)?.providerId).toBe(providerId);
      expect(delegated.at(-1)?.prompt).toContain("CUSTOM_RUBRIC: verify event sequence.");
      expect(delegated.at(-1)?.access).toBe("read-only");
    }
    expect(providerRequests).toHaveLength(0);
  });

  test("a review runs on the accounts selected when it was started", async () => {
    seedStore();
    const personal = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    useAppStore.setState((state) => ({ settings: { ...state.settings, codexAccountProfileId: personal } }));
    const result = await startReviewTask({ getState: useAppStore.getState, taskId: "task-main", request: {
      reviewer: { providerId: "codex", model: "configured-model", label: "Reviewer" }, target: "working-tree", focuses: [],
      promptSource: "custom", customPrompt: "Check the cache key.",
    } });
    expect(result.ok).toBe(true);
    expect(delegatedContexts.at(-1)).toEqual({ accounts: { claudeAccountProfileId: "system-default", codexAccountProfileId: personal } });
  });

  test("empty custom, unavailable skills and empty skills fail before delegation", async () => {
    seedStore();
    for (const choice of [{ promptSource: "custom" as const, customPrompt: " " }, { promptSource: "skill" as const, skillSlug: "missing-skill", skillOptional: true }]) {
      const result = await startReviewTask({ getState: useAppStore.getState, taskId: "task-main", request: {
        reviewer: { providerId: "codex", model: "configured-model", label: "Reviewer" }, target: "working-tree", focuses: [], ...choice,
      } });
      expect(result.ok).toBe(false);
    }
    useAppStore.setState((state) => ({ skillCatalog: {
      ...state.skillCatalog, skills: [{ ...SKILL, instructions: " " }],
    } }));
    const emptySkill = await startReviewTask({ getState: useAppStore.getState, taskId: "task-main", request: {
      reviewer: { providerId: "codex", model: "configured-model", label: "Reviewer" },
      target: "working-tree", focuses: [], promptSource: "skill", skillSlug: SKILL.slug,
    } });
    expect(emptySkill).toEqual({ ok: false, error: "The skill $team-review has no review instructions." });
    expect(delegated).toHaveLength(0);
  });

  test("delegates a read-only child with the chosen model, skill and saved instructions", async () => {
    const result = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: {
        reviewer: { providerId: "codex", model: "gpt-5.5", label: "GPT-5.5" },
        effort: "high",
        target: "latest-reply",
        focuses: ["correctness"],
        instructions: "Is the plan safe?",
        skillSlug: "$team-review",
      },
      now: new Date("2026-10-04T12:00:00.000Z"),
      nonce: "a",
    });

    expect(result).toEqual({
      ok: true,
      delegationKey: "stave-review-20261004120000-a",
      delegatedTaskId: "task-review",
    });
    expect(delegated).toHaveLength(1);
    const args = DelegateTaskArgsSchema.parse(delegated[0]);
    expect(args).toMatchObject({
      repositoryPath: "/tmp/stave-project",
      parentWorkspaceId: "ws-main",
      parentTaskId: "task-main",
      providerId: "codex",
      model: "gpt-5.5",
      effort: "high",
      access: "read-only",
      lifecycle: "one-turn",
      workspace: { mode: "same-workspace" },
      title: "Review · Latest reply · GPT-5.5",
    });
    expect(args.prompt).toContain("Key the cache by locale.");
    expect(args.prompt).toContain("Plan the cache fix");
    expect(args.prompt).toContain("Check persistence.\n\nIs the plan safe?");
    expect(args.prompt).toContain("Rank findings by blast radius.");
  });

  test("a cross-check runs without a skill its provider cannot load", async () => {
    const result = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: {
        reviewer: { providerId: "codex", model: "gpt-5.5", label: "GPT-5.5" },
        target: "working-tree",
        focuses: [],
        skillSlug: "missing-skill",
        skillOptional: true,
      },
    });
    expect(result.ok).toBe(true);
    expect(DelegateTaskArgsSchema.parse(delegated[0]).prompt).not.toContain("Review skill");
  });

  test("a commit review needs a valid ref and carries criteria into the prompt", async () => {
    const reviewer = { providerId: "codex" as const, model: "gpt-5.5", label: "GPT-5.5" };
    const bad = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: { reviewer, target: "commit", focuses: [], commitRef: "HEAD && echo" },
    });
    expect(bad.ok).toBe(false);
    expect(delegated).toHaveLength(0);
    const good = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: { reviewer, target: "commit", focuses: [], commitRef: "HEAD~2", criteria: "Must keep drafts." },
      now: new Date("2026-10-04T15:00:00.000Z"),
      nonce: "d",
    });
    expect(good.ok).toBe(true);
    const args = DelegateTaskArgsSchema.parse(delegated[0]);
    expect(args.title).toBe("Review · Commit HEAD~2 · GPT-5.5");
    expect(args.prompt).toContain("introduced by commit HEAD~2");
    expect(args.prompt).toContain("Must keep drafts.");
  });

  test("a refusal is reported with the coordinator's sentence", async () => {
    delegateResponse = {
      accepted: false,
      duplicate: false,
      reason: "concurrency-limit-reached",
      message: "Three subagents are already running.",
      child: null,
    };
    const result = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: {
        reviewer: { providerId: "claude-code", model: "claude-opus-5-5", label: "Opus" },
        target: "working-tree",
        focuses: [],
      },
    });
    expect(result).toEqual({ ok: false, error: "Three subagents are already running." });
  });

  test("a skill the reviewer cannot load stops the review before it starts", async () => {
    const result = await startReviewTask({
      getState: useAppStore.getState,
      taskId: "task-main",
      request: {
        reviewer: { providerId: "codex", model: "gpt-5.5", label: "GPT-5.5" },
        target: "branch",
        focuses: [],
        skillSlug: "missing-skill",
      },
    });
    expect(result.ok).toBe(false);
    expect(delegated).toHaveLength(0);
  });
});

describe("bringing the result back", () => {
  test("attaching adds the review's latest reply to the draft once", () => {
    const child = REVIEW_CHILD;
    expect(attachReviewResultToDraft({ getState: useAppStore.getState, taskId: "task-main", child })).toBe("attached-with-prompt");
    expect(attachReviewResultToDraft({ getState: useAppStore.getState, taskId: "task-main", child })).toBe("already-attached");
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.text).toBe(DEFAULT_REVIEW_FOLLOW_UP_PROMPT);
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.attachments).toEqual([
      {
        kind: "task-context",
        id: "task-context-task-review",
        taskId: "task-review",
        workspaceId: "ws-main",
        title: "Review · Uncommitted changes · GPT-5.5",
        scope: "latest-reply",
      },
    ]);
  });

  test("the follow-up prompt never replaces what the user wrote, and can be turned off", () => {
    useAppStore.getState().updatePromptDraft({ taskId: "task-main", patch: { text: "My own request" } });
    expect(
      attachReviewResultToDraft({ getState: useAppStore.getState, taskId: "task-main", child: REVIEW_CHILD }),
    ).toBe("attached");
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.text).toBe("My own request");

    seedStore();
    useAppStore.setState((state) => ({
      settings: { ...state.settings, reviewTask: { ...state.settings.reviewTask, followUpPrompt: "" } },
    }));
    expect(
      attachReviewResultToDraft({ getState: useAppStore.getState, taskId: "task-main", child: REVIEW_CHILD }),
    ).toBe("attached");
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.text).toBe("");
  });

  test("running a review again sends the earlier prompt on the same model", async () => {
    const result = await rerunReviewTask({
      getState: useAppStore.getState,
      review: REVIEW_CHILD,
      prompt: "Review only the current uncommitted working tree.",
      title: "Review · Uncommitted changes · GPT-5.5",
      now: new Date("2026-10-04T13:00:00.000Z"),
      nonce: "b",
    });
    expect(result).toMatchObject({ ok: true, delegationKey: "stave-review-20261004130000-b" });
    expect(DelegateTaskArgsSchema.parse(delegated[0])).toMatchObject({
      parentTaskId: "task-main",
      parentWorkspaceId: "ws-main",
      providerId: "codex",
      model: "gpt-5.5",
      access: "read-only",
      prompt: "Review only the current uncommitted working tree.",
      title: "Review · Uncommitted changes · GPT-5.5",
    });
  });

  test("choosing findings narrows the chip, and choosing again replaces the choice", () => {
    const get = useAppStore.getState;
    expect(
      attachReviewResultToDraft({ getState: get, taskId: "task-main", child: REVIEW_CHILD, findingIds: ["F2", "F2", "F3"], findingsReplyId: "r1" }),
    ).toBe("attached-with-prompt");
    const chip = () => get().promptDraftByTask["task-main"]?.attachments[0];
    expect(chip()).toMatchObject({ kind: "task-context", taskId: "task-review", findingIds: ["F2", "F3"], findingsReplyId: "r1" });
    expect(
      attachReviewResultToDraft({ getState: get, taskId: "task-main", child: REVIEW_CHILD, findingIds: ["F3", "F2"] }),
    ).toBe("already-attached");
    expect(
      attachReviewResultToDraft({ getState: get, taskId: "task-main", child: REVIEW_CHILD, findingIds: ["F2"] }),
    ).toBe("updated");
    expect(chip()).toMatchObject({ findingIds: ["F2"] });
    expect(attachReviewResultToDraft({ getState: get, taskId: "task-main", child: REVIEW_CHILD })).toBe("updated");
    expect(chip()).not.toHaveProperty("findingIds");
    expect(chip()).not.toHaveProperty("findingsReplyId");
    expect(get().promptDraftByTask["task-main"]?.attachments).toHaveLength(1);
  });

  test("checking fixes sends the earlier findings to a new review on the same model", async () => {
    const result = await recheckReviewTask({
      getState: useAppStore.getState,
      review: REVIEW_CHILD,
      originalPrompt: "Review only the current uncommitted working tree.",
      report: {
        verdict: "request-changes",
        findings: [
          { id: "F2", severity: "critical", title: "Offset not validated", file: "src/users.ts", line: 42, detail: null, fix: null },
        ],
        previous: null,
      },
      title: "Review · Uncommitted changes · GPT-5.5",
      now: new Date("2026-10-04T14:00:00.000Z"),
      nonce: "c",
    });
    expect(result).toMatchObject({ ok: true, delegationKey: "stave-review-20261004140000-c" });
    const args = DelegateTaskArgsSchema.parse(delegated[0]);
    expect(args).toMatchObject({
      providerId: "codex",
      model: "gpt-5.5",
      access: "read-only",
      title: "Re-check · Review · Uncommitted changes · GPT-5.5",
    });
    expect(args.prompt).toContain("Do not review from scratch.");
    expect(args.prompt).toContain('"id":"F2"');
    const empty = await recheckReviewTask({
      getState: useAppStore.getState,
      review: REVIEW_CHILD,
      originalPrompt: "x",
      report: { verdict: "approve", findings: [], previous: null },
      title: "Review",
    });
    expect(empty.ok).toBe(false);
  });

  test("checking again retains earlier findings omitted from a re-check answer", async () => {
    const earlier = { id: "F1", severity: "major" as const, title: "Still needs verification", file: "src/a.ts", line: 1, detail: null, fix: null };
    const result = await recheckReviewTask({
      getState: useAppStore.getState, review: REVIEW_CHILD, originalPrompt: "Review this scope", title: "Review",
      report: { verdict: "approve", findings: [], earlierFindings: [earlier],
        previous: [{ id: "F1", status: "unchecked", note: "Missing from the answer" }] },
      now: new Date("2026-10-04T14:00:00.000Z"), nonce: "incomplete",
    });
    expect(result.ok).toBe(true);
    expect(DelegateTaskArgsSchema.parse(delegated[0]).prompt).toContain('"id":"F1"');
  });

  test("an unattached review stays out of the next turn", async () => {
    delegatedChildren = [REVIEW_CHILD];
    useAppStore.getState().updatePromptDraft({ taskId: "task-main", patch: { text: "Continue" } });

    const result = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Continue",
      turnOrigin: "conversation",
    });

    expect(result.status).toBe("started");
    const request = JSON.stringify(providerRequests[0]);
    expect(request).toContain("held until the user attaches this review");
    expect(request).not.toContain("RECEIPT COPY OF THE FINDINGS");
    expect(request).not.toContain("FULL FINDINGS");
  });

  test("the sent turn carries the full review once, not again as a subagent receipt", async () => {
    delegatedChildren = [REVIEW_CHILD];
    attachReviewResultToDraft({ getState: useAppStore.getState, taskId: "task-main", child: REVIEW_CHILD });
    useAppStore.getState().updatePromptDraft({
      taskId: "task-main",
      patch: { text: "Address the review findings" },
    });

    const result = await useAppStore.getState().sendUserMessage({
      taskId: "task-main",
      content: "Address the review findings",
      turnOrigin: "conversation",
    });

    expect(result.status).toBe("started");
    const request = JSON.stringify(providerRequests[0]);
    expect(request).toContain("stave:attached-task-context");
    expect(request).toContain("FULL FINDINGS: the cache key ignores the locale.");
    expect(request).toContain("attached to this message under Attached Stave Tasks");
    expect(request).not.toContain("RECEIPT COPY OF THE FINDINGS");
  });
});
