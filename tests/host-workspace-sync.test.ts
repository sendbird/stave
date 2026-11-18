import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RecentRepositoryState } from "@/lib/repository";
import type { WorkspaceShellSummary } from "@/lib/db/workspaces.db";
import { syncHostWorkspaceChange } from "@/store/host-workspace-sync";
import {
  requestFleetWorkspaceShell,
  resetFleetWorkspaceShells,
  useFleetWorkspaceShellsStore,
} from "@/store/fleet-workspace-shells-store";

// The host creates Tars execution workspaces while the user looks at another
// repository. Its `local-mcp.workspace-changed` signal is the only thing that
// tells this window; without it the workspace appears only after a click.

const STAVE = "/repo/stave";
const OTHER = "/repo/other";
const NEW_ID = "worktree:tars-1";
const T0 = "2026-11-17T10:00:00.000Z";

function repository(repositoryPath: string, ids: string[], activeWorkspaceId = ids[0]!): RecentRepositoryState {
  return {
    repositoryPath, repositoryName: repositoryPath.split("/").at(-1)!, lastOpenedAt: T0, defaultBranch: "main",
    workspaces: ids.map((id) => ({ id, name: id, updatedAt: T0 })), activeWorkspaceId,
    workspaceBranchById: Object.fromEntries(ids.map((id, index) => [id, index === 0 ? "main" : `fix/${id}`])),
    workspacePathById: Object.fromEntries(ids.map((id, index) => [id, index === 0 ? repositoryPath : `${repositoryPath}/.stave/workspaces/${id}`])),
    workspaceDefaultById: Object.fromEntries(ids.map((id, index) => [id, index === 0])),
  } as RecentRepositoryState;
}

// What the host saved: Stave has its default and the new execution workspace,
// and the host selected the new one (repository-registry-update.ts).
let savedRegistry: RecentRepositoryState[] = [];

type State = {
  repositoryPath: string;
  activeWorkspaceId: string;
  workspaces: RecentRepositoryState["workspaces"];
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  recentRepositories: RecentRepositoryState[];
};

function storeOpenAt(open: RecentRepositoryState, remembered: RecentRepositoryState[]) {
  let state: State = {
    repositoryPath: open.repositoryPath, activeWorkspaceId: open.activeWorkspaceId, workspaces: open.workspaces,
    workspaceBranchById: open.workspaceBranchById, workspacePathById: open.workspacePathById,
    workspaceDefaultById: open.workspaceDefaultById, recentRepositories: remembered,
  };
  const store = {
    getState: () => state,
    setState: (update: (current: State) => Partial<State> | State) => {
      const next = update(state);
      if (next !== state) state = { ...state, ...next };
    },
  };
  return { store: store as never, read: () => state };
}

const staveIds = (state: State) =>
  state.recentRepositories.find((item) => item.repositoryPath === STAVE)?.workspaces.map((item) => item.id);

let previousWindowDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  savedRegistry = [repository(OTHER, ["base:other"]), repository(STAVE, ["base:stave", NEW_ID], NEW_ID)];
  (globalThis as { window?: unknown }).window = {
    api: {
      persistence: {
        listWorkspaces: async () => ({ ok: true, rows: [] }),
        loadWorkspace: async () => ({ ok: true, snapshot: null }),
        upsertWorkspace: async () => ({ ok: true }),
        loadRepositoryRegistry: async () => ({ ok: true, repositories: structuredClone(savedRegistry) }),
      },
    },
  };
  resetFleetWorkspaceShells();
});

afterEach(() => {
  if (previousWindowDescriptor) {
    Object.defineProperty(globalThis, "window", previousWindowDescriptor);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  resetFleetWorkspaceShells();
});

describe("a workspace the host created appears without opening its repository", () => {
  test("another repository is open: the workspace joins its remembered repository, and nothing else moves", async () => {
    const other = repository(OTHER, ["base:other"]);
    const { store, read } = storeOpenAt(other, [other, repository(STAVE, ["base:stave"])]);
    const before = read();

    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);

    const after = read();
    expect(staveIds(after)).toEqual(["base:stave", NEW_ID]);
    const stave = after.recentRepositories.find((item) => item.repositoryPath === STAVE)!;
    expect(stave.workspacePathById[NEW_ID]).toBe(`${STAVE}/.stave/workspaces/${NEW_ID}`);
    expect(stave.workspaceBranchById[NEW_ID]).toBe(`fix/${NEW_ID}`);
    expect(stave.workspaceDefaultById[NEW_ID]).toBe(false);
    // The host selected the new workspace in its registry; this window keeps the user's choice.
    expect(stave.activeWorkspaceId).toBe("base:stave");
    expect(after.repositoryPath).toBe(OTHER);
    expect(after.activeWorkspaceId).toBe("base:other");
    expect(after.workspaces).toBe(before.workspaces);
  });

  test("the second signal (the task the host added) lists nothing twice", async () => {
    const other = repository(OTHER, ["base:other"]);
    const { store, read } = storeOpenAt(other, [other, repository(STAVE, ["base:stave"])]);
    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);
    const once = read();
    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);
    expect(read()).toBe(once);
    expect(staveIds(read())).toEqual(["base:stave", NEW_ID]);
  });

  test("its own repository is open: the sidebar lists it and the selected workspace stays", async () => {
    const stave = repository(STAVE, ["base:stave"]);
    const { store, read } = storeOpenAt(stave, [repository(OTHER, ["base:other"]), stave]);

    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);

    const after = read();
    expect(after.workspaces.map((item) => item.id)).toEqual(["base:stave", NEW_ID]);
    expect(after.workspacePathById[NEW_ID]).toBe(`${STAVE}/.stave/workspaces/${NEW_ID}`);
    expect(after.activeWorkspaceId).toBe("base:stave");
    expect(staveIds(after)).toEqual(["base:stave", NEW_ID]);
  });

  test("a repository this window never listed arrives with its default selected", async () => {
    const other = repository(OTHER, ["base:other"]);
    const { store, read } = storeOpenAt(other, [other]);

    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);

    const stave = read().recentRepositories.find((item) => item.repositoryPath === STAVE)!;
    expect(stave.workspaces.map((item) => item.id)).toEqual(["base:stave", NEW_ID]);
    expect(stave.activeWorkspaceId).toBe("base:stave");
  });

  test("a workspace the saved registry does not hold changes nothing", async () => {
    const other = repository(OTHER, ["base:other"]);
    const { store, read } = storeOpenAt(other, [other, repository(STAVE, ["base:stave"])]);
    const before = read();
    await syncHostWorkspaceChange({ workspaceId: "worktree:unknown", repositoryPath: STAVE }, store);
    expect(read()).toBe(before);
  });

  test("Fleet reads the workspace's task list again when this visit already read it", async () => {
    const other = repository(OTHER, ["base:other"]);
    const { store } = storeOpenAt(other, [other, repository(STAVE, ["base:stave"])]);
    // Fleet read the workspace between createWorkspace and createIdleTask: no task yet.
    const empty = { tasks: [], openTaskTabIds: [] } as unknown as WorkspaceShellSummary;
    requestFleetWorkspaceShell(NEW_ID, async () => empty);
    await Promise.resolve();
    expect(useFleetWorkspaceShellsStore.getState().byWorkspaceId[NEW_ID]).toEqual({ status: "loaded", shell: empty });

    const withTask = { tasks: [{ id: "task-tars-1" }], openTaskTabIds: [] } as unknown as WorkspaceShellSummary;
    (window as unknown as { api: { persistence: Record<string, unknown> } }).api.persistence.loadWorkspaceShellSummary =
      async () => ({ ok: true, summary: withTask });
    await syncHostWorkspaceChange({ workspaceId: NEW_ID, repositoryPath: STAVE }, store);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const entry = useFleetWorkspaceShellsStore.getState().byWorkspaceId[NEW_ID];
    expect(entry?.status).toBe("loaded");
    expect((entry as { shell: WorkspaceShellSummary }).shell.tasks.map((item) => item.id)).toEqual(["task-tars-1"]);
  });
});
