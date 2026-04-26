import { afterEach, beforeEach, describe, expect, test } from "bun:test";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const originalWindow = (globalThis as { window?: unknown }).window;

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

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: createMemoryStorage(),
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("prompt draft persistence version", () => {
  test("text-only prompt changes avoid workspace snapshot churn", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      workspaceSnapshotVersion: 4,
      promptDraftPersistenceVersion: 1,
      promptDraftByTask: {
        "task-1": {
          text: "",
          attachedFilePaths: [],
          attachments: [],
        },
      },
    });

    useAppStore.getState().updatePromptDraft({
      taskId: "task-1",
      patch: { text: "hello" },
    });

    const afterTextUpdate = useAppStore.getState();
    expect(afterTextUpdate.workspaceSnapshotVersion).toBe(4);
    expect(afterTextUpdate.promptDraftPersistenceVersion).toBe(2);

    useAppStore.getState().updatePromptDraft({
      taskId: "task-1",
      patch: { attachedFilePaths: ["README.md"] },
    });

    const afterAttachmentUpdate = useAppStore.getState();
    expect(afterAttachmentUpdate.workspaceSnapshotVersion).toBe(5);
    expect(afterAttachmentUpdate.promptDraftPersistenceVersion).toBe(2);
  });

  test("queued-next-turn metadata uses workspace snapshot persistence", async () => {
    const { useAppStore } = await import("../src/store/app.store");
    const initialState = useAppStore.getInitialState();

    useAppStore.setState({
      ...initialState,
      workspaceSnapshotVersion: 9,
      promptDraftPersistenceVersion: 3,
      promptDraftByTask: {
        "task-1": {
          text: "Follow up",
          attachedFilePaths: [],
          attachments: [],
        },
      },
    });

    useAppStore.getState().updatePromptDraft({
      taskId: "task-1",
      patch: {
        queuedNextTurn: {
          queuedAt: "2026-04-09T00:00:00.000Z",
          sourceTurnId: "turn-1",
        },
      },
    });

    const afterQueueUpdate = useAppStore.getState();
    expect(afterQueueUpdate.workspaceSnapshotVersion).toBe(10);
    expect(afterQueueUpdate.promptDraftPersistenceVersion).toBe(3);

    useAppStore.getState().updatePromptDraft({
      taskId: "task-1",
      patch: {
        text: "Follow up with more detail",
      },
    });

    const afterQueuedTextUpdate = useAppStore.getState();
    expect(afterQueuedTextUpdate.workspaceSnapshotVersion).toBe(10);
    expect(afterQueuedTextUpdate.promptDraftPersistenceVersion).toBe(4);
  });
});
