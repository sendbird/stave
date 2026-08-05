import { afterEach, describe, expect, test } from "bun:test";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
}

function setWindowContext() {
  (globalThis as { window: unknown }).window = {
    api: undefined,
    localStorage: createMemoryStorage(),
  } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("sidebar active workspace dismissal store actions", () => {
  test("dismiss stamps the workspace and restore clears every stamp", async () => {
    setWindowContext();
    const { useAppStore } = await import("../src/store/app.store");
    useAppStore.setState({ sidebarActiveWorkspaceDismissedAtById: {} });

    useAppStore
      .getState()
      .dismissSidebarActiveWorkspace({ workspaceId: "ws-unimportant" });
    const stamped =
      useAppStore.getState().sidebarActiveWorkspaceDismissedAtById;
    expect(Object.keys(stamped)).toEqual(["ws-unimportant"]);
    expect(Number.isFinite(Date.parse(stamped["ws-unimportant"]!))).toBe(true);

    // A blank id is a no-op and must keep the same map reference.
    useAppStore.getState().dismissSidebarActiveWorkspace({ workspaceId: "  " });
    expect(useAppStore.getState().sidebarActiveWorkspaceDismissedAtById).toBe(
      stamped,
    );

    useAppStore.getState().restoreSidebarActiveWorkspaces();
    expect(
      useAppStore.getState().sidebarActiveWorkspaceDismissedAtById,
    ).toEqual({});

    // Restoring an already-empty map must not create a new reference.
    const emptied = useAppStore.getState().sidebarActiveWorkspaceDismissedAtById;
    useAppStore.getState().restoreSidebarActiveWorkspaces();
    expect(useAppStore.getState().sidebarActiveWorkspaceDismissedAtById).toBe(
      emptied,
    );
  });
});

describe("sidebar active workspace dismissal persistence", () => {
  test("partialize persists the dismissal map", async () => {
    setWindowContext();
    const { useAppStore } = await import("../src/store/app.store");
    const { createAppStorePersistenceOptions } = await import(
      "../src/store/app-store-persistence"
    );

    const state = {
      ...useAppStore.getInitialState(),
      sidebarActiveWorkspaceDismissedAtById: {
        "ws-hidden": "2026-08-01T00:00:00.000Z",
      },
    };
    const persisted = createAppStorePersistenceOptions().partialize(state);
    expect(persisted.sidebarActiveWorkspaceDismissedAtById).toEqual({
      "ws-hidden": "2026-08-01T00:00:00.000Z",
    });
  });

  test("rehydrate normalizes corrupted stamps and prunes unknown workspaces", async () => {
    setWindowContext();
    const { useAppStore } = await import("../src/store/app.store");
    const { createAppStorePersistenceOptions } = await import(
      "../src/store/app-store-persistence"
    );

    const state = {
      ...useAppStore.getInitialState(),
      workspaces: [{ id: "ws-known", name: "known", updatedAt: "" }],
      recentProjects: [],
      projectPath: null,
      sidebarActiveWorkspaceDismissedAtById: {
        "ws-known": "2026-08-01T00:00:00.000Z",
        "ws-forgotten": "2026-08-01T00:00:00.000Z",
        "ws-corrupted": 42,
      } as unknown as Record<string, string>,
    };
    createAppStorePersistenceOptions().onRehydrateStorage()(state);
    expect(state.sidebarActiveWorkspaceDismissedAtById).toEqual({
      "ws-known": "2026-08-01T00:00:00.000Z",
    });
  });

  test("rehydrate tolerates a persisted state that predates the field", async () => {
    setWindowContext();
    const { useAppStore } = await import("../src/store/app.store");
    const { createAppStorePersistenceOptions } = await import(
      "../src/store/app-store-persistence"
    );

    const state = {
      ...useAppStore.getInitialState(),
      recentProjects: [],
      projectPath: null,
    };
    delete (state as { sidebarActiveWorkspaceDismissedAtById?: unknown })
      .sidebarActiveWorkspaceDismissedAtById;
    createAppStorePersistenceOptions().onRehydrateStorage()(state);
    expect(state.sidebarActiveWorkspaceDismissedAtById).toEqual({});
  });
});
