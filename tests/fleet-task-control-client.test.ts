import { afterEach, describe, expect, test } from "bun:test";
import { deleteFleetTask, removeDeletedFleetTask } from "@/lib/fleet/task-control-client";
import { useAppStore } from "@/store/app.store";
import { useFleetWorkspaceShellsStore } from "@/store/fleet-workspace-shells-store";
import { createEmptyWorkspaceState } from "@/store/workspace-session-state";

const initial = useAppStore.getState();
const originalWindow = globalThis.window;
const task = (id: string) => ({ id, title: id, provider: "codex" as const,
  updatedAt: "2026-11-16T00:00:00.000Z", archivedAt: "2026-11-16T00:00:00.000Z", unread: false });
const session = () => ({ ...createEmptyWorkspaceState(), tasks: [task("deleted"), task("kept")],
  activeTaskId: "deleted", activeSurface: { kind: "task" as const, taskId: "deleted" },
  openTaskTabIds: ["deleted", "kept"], messageCountByTask: { deleted: 3, kept: 2 },
  providerSessionByTask: { deleted: { codex: "session" }, kept: { codex: "other" } } });

afterEach(() => {
  useAppStore.setState(initial, true);
  useFleetWorkspaceShellsStore.setState({ byWorkspaceId: {} });
  globalThis.window = originalWindow;
});

describe("Fleet deletion renderer reconciliation", () => {
  test("removes deleted task references without changing another task", () => {
    const before = session();
    const after = removeDeletedFleetTask(before, "deleted");
    expect(after.tasks.map((item) => item.id)).toEqual(["kept"]);
    expect(after.openTaskTabIds).toEqual(["kept"]);
    expect(after.activeTaskId).toBe("");
    expect(after.activeSurface).toEqual({ kind: "task", taskId: "" });
    expect(after.messageCountByTask).toEqual({ kept: 2 });
    expect(after.providerSessionByTask).toEqual({ kept: { codex: "other" } });
    expect(before.tasks).toHaveLength(2);
  });

  test("a host refusal preserves current and cached task state", async () => {
    const before = session();
    useAppStore.setState({ ...before, activeWorkspaceId: "ws", workspaceRuntimeCacheById: { ws: before } });
    globalThis.window = { api: { taskControl: { deletePermanently: async () => ({ ok: false, message: "running" }) } } } as unknown as Window & typeof globalThis;
    const result = await deleteFleetTask({ workspaceId: "ws", taskId: "deleted" });
    expect(result).toEqual({ ok: false, message: "running" });
    expect(useAppStore.getState().tasks).toBe(before.tasks);
    expect(useAppStore.getState().workspaceRuntimeCacheById.ws).toBe(before);
  });

  test("a successful host deletion purges current, inactive and cold snapshots", async () => {
    const before = session();
    useAppStore.setState({ ...before, activeWorkspaceId: "ws", workspaceRuntimeCacheById: { ws: before }, taskWorkspaceIdById: { deleted: "ws", kept: "ws" } });
    useFleetWorkspaceShellsStore.setState({ byWorkspaceId: { ws: { status: "loaded", shell: before } } });
    const calls: unknown[] = [];
    globalThis.window = { api: { taskControl: { deletePermanently: async (args: unknown) => { calls.push(args); return { ok: true }; } } } } as unknown as Window & typeof globalThis;
    await deleteFleetTask({ workspaceId: "ws", taskId: "deleted" });
    expect(calls).toEqual([{ workspaceId: "ws", taskId: "deleted" }]);
    expect(useAppStore.getState().tasks.map((item) => item.id)).toEqual(["kept"]);
    expect(useAppStore.getState().workspaceRuntimeCacheById.ws?.tasks.map((item) => item.id)).toEqual(["kept"]);
    expect(useAppStore.getState().taskWorkspaceIdById).toEqual({ kept: "ws" });
    const entry = useFleetWorkspaceShellsStore.getState().byWorkspaceId.ws;
    expect(entry?.status === "loaded" && entry.shell?.tasks.map((item) => item.id)).toEqual(["kept"]);
  });
});
