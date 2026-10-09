import { afterEach, beforeEach, expect, test } from "bun:test";
import { MAX_BOUND_SECRETS } from "../src/lib/secrets/secrets";

// A saved or reused secret from an agent's request is bound to the task's
// prompt draft, so the next turn sent from that task injects it.

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

function draft(runtimeOverrides: Record<string, unknown>) {
  return { text: "keep me", attachedFilePaths: [], attachments: [], runtimeOverrides };
}

async function seed() {
  const { useAppStore } = await import("../src/store/app.store");
  const { bindRequestedSecretToTask } = await import("../src/store/secret-requests-store");
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    activeWorkspaceId: "ws-active",
    taskWorkspaceIdById: { "task-active": "ws-active", "task-cached": "ws-cached" },
    promptDraftByTask: {
      "task-active": draft({ model: "claude-opus-5", boundSecretIds: ["s-1"] }),
    },
    workspaceRuntimeCacheById: {
      "ws-cached": {
        promptDraftByTask: { "task-cached": draft({ codexFastMode: true }) },
      },
    } as never,
  });
  return { useAppStore, bindRequestedSecretToTask };
}

test("binds to the active task's draft and keeps its other overrides", async () => {
  const { useAppStore, bindRequestedSecretToTask } = await seed();
  expect(bindRequestedSecretToTask({ taskId: "task-active", secretId: "s-2" })).toBe("bound");
  const stored = useAppStore.getState().promptDraftByTask["task-active"];
  expect(stored?.text).toBe("keep me");
  expect(stored?.runtimeOverrides).toEqual({ model: "claude-opus-5", boundSecretIds: ["s-1", "s-2"] });
  expect(bindRequestedSecretToTask({ taskId: "task-active", secretId: "s-2" })).toBe("already-bound");
  expect(useAppStore.getState().promptDraftByTask["task-active"]?.runtimeOverrides?.boundSecretIds).toEqual([
    "s-1",
    "s-2",
  ]);
});

test("binds to a task in a workspace that is not in view", async () => {
  const { useAppStore, bindRequestedSecretToTask } = await seed();
  expect(bindRequestedSecretToTask({ taskId: "task-cached", secretId: "s-9" })).toBe("bound");
  const cached = useAppStore.getState().workspaceRuntimeCacheById["ws-cached"];
  expect(cached?.promptDraftByTask["task-cached"]?.runtimeOverrides).toEqual({
    codexFastMode: true,
    boundSecretIds: ["s-9"],
  });
  expect(useAppStore.getState().promptDraftByTask["task-cached"]).toBeUndefined();
});

test("refuses to bind past the task's cap", async () => {
  const { useAppStore, bindRequestedSecretToTask } = await seed();
  const full = Array.from({ length: MAX_BOUND_SECRETS }, (_, index) => `s-${index}`);
  useAppStore.setState({ promptDraftByTask: { "task-active": draft({ boundSecretIds: full }) } });
  expect(bindRequestedSecretToTask({ taskId: "task-active", secretId: "one-more" })).toBe("at-cap");
  expect(useAppStore.getState().promptDraftByTask["task-active"]?.runtimeOverrides?.boundSecretIds).toEqual(full);
});
