import { afterEach, beforeEach, describe, expect, test } from "bun:test";

type UseAppStore = typeof import("../src/store/app.store").useAppStore;
type SendUserMessageArgs = Parameters<
  ReturnType<UseAppStore["getState"]>["sendUserMessage"]
>[0];

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;
let useAppStore: UseAppStore;

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

beforeEach(async () => {
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
    api: {},
  };
  ({ useAppStore } = await import("../src/store/app.store"));
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    activeTaskId: "task-1",
    reviewCommentsByTask: {},
    editorTabs: [],
  });
});

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("review comment store actions", () => {
  test("adds and removes comments per task", () => {
    const comment = useAppStore.getState().addReviewComment({
      taskId: "task-1",
      filePath: "src/a.ts",
      line: 8,
      side: "modified",
      body: "Tighten this condition.",
    });

    expect(comment?.filePath).toBe("src/a.ts");
    expect(useAppStore.getState().reviewCommentsByTask["task-1"]).toHaveLength(
      1,
    );

    useAppStore.getState().removeReviewComment({
      taskId: "task-1",
      commentId: comment?.id ?? "",
    });

    expect(useAppStore.getState().reviewCommentsByTask["task-1"]).toBeUndefined();
  });

  test("submits formatted feedback through sendUserMessage and clears on queue", async () => {
    let sentArgs: SendUserMessageArgs | null = null;
    useAppStore.setState({
      reviewCommentsByTask: {
        "task-1": [
          {
            id: "comment-1",
            filePath: "src/a.ts",
            line: 5,
            side: "modified",
            body: "Please cover the null case.",
            createdAt: "2026-06-18T01:00:00.000Z",
          },
        ],
      },
      editorTabs: [
        {
          id: "tab-a",
          filePath: "src/a.ts",
          language: "typescript",
          content: "export const value = 1;\n",
          hasConflict: false,
          isDirty: false,
        },
      ],
      sendUserMessage: async (args) => {
        sentArgs = args;
        return {
          status: "queued",
          taskId: "task-1",
          workspaceId: "workspace-1",
        };
      },
    });

    const result = await useAppStore
      .getState()
      .submitReviewFeedback({ taskId: "task-1" });

    expect(result.status).toBe("queued");
    expect(sentArgs?.content).toContain("Review feedback");
    expect(sentArgs?.content).toContain("Please cover the null case.");
    expect(sentArgs?.fileContexts).toEqual([
      {
        filePath: "src/a.ts",
        content: "export const value = 1;\n",
        language: "typescript",
        instruction:
          "Review comments for this file:\n- modified line 5: Please cover the null case.",
      },
    ]);
    expect(useAppStore.getState().reviewCommentsByTask["task-1"]).toBeUndefined();
  });

  test("keeps comments when feedback dispatch is blocked", async () => {
    useAppStore.setState({
      reviewCommentsByTask: {
        "task-1": [
          {
            id: "comment-1",
            filePath: "src/a.ts",
            body: "Do not drop this.",
            createdAt: "2026-06-18T01:00:00.000Z",
          },
        ],
      },
      sendUserMessage: async () => ({ status: "blocked" }),
    });

    const result = await useAppStore
      .getState()
      .submitReviewFeedback({ taskId: "task-1" });

    expect(result.status).toBe("blocked");
    expect(useAppStore.getState().reviewCommentsByTask["task-1"]).toHaveLength(
      1,
    );
  });
});
