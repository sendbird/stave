import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { keepUnseenWorkspaces } from "../electron/persistence/repository-registry-merge";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

// Tars runs prepare independent responsibilities at the same time, and each
// preparation registers its repository and worktree workspace through the host
// registry writers. The saved registry is one value. A writer that reads it,
// awaits, and then saves its copy erases a workspace another preparation saved
// in between, and that preparation later cannot find its workspace or task.
//
// The fake store models SQLite: another writer's transaction can commit only
// while this caller's JavaScript yields. `commitAfterNextRead` queues such a
// commit right after the next registry read, the earliest moment a concurrent
// writer can land. A writer that awaits between its read and its write loses
// the commit; one that reads and writes in one transaction keeps it.
//
// Persistence is stubbed (better-sqlite3 cannot run under Bun); repositories
// are real temporary directories, and the worktree case uses a real Git repo.

type Registry = PersistenceRepositoryRegistryEntry[];
type Commit = (registry: Registry) => Registry;

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "stave-registry-race-")));
const USER_DATA_PATH = path.join(root, "user-data");
let saved: Registry = [];
const workspaceRows = new Set<string>();
let pendingCommit: Commit | null = null;
let commitAfterNextWorkspaceRow: Commit | null = null;

function commitAfterNextRead(commit: Commit) {
  pendingCommit = commit;
}

function readSaved(): Registry {
  const value = structuredClone(saved);
  const commit = pendingCommit;
  if (commit) {
    pendingCommit = null;
    queueMicrotask(() => { saved = commit(structuredClone(saved)); });
  }
  return value;
}

const fakeStore = {
  loadRepositoryRegistry: readSaved,
  saveRepositoryRegistry: (args: { repositories: Registry; keepUnseenWorkspaces?: boolean }) => {
    saved = args.keepUnseenWorkspaces
      ? keepUnseenWorkspaces({ incoming: args.repositories, persisted: saved, workspaceExists: (id) => workspaceRows.has(id) })
      : structuredClone(args.repositories);
  },
  updateRepositoryRegistry: <T>(update: (persisted: Registry) => { repositories: Registry; result: T }): T => {
    const { repositories, result } = update(readSaved());
    saved = structuredClone(repositories);
    return result;
  },
  loadWorkspaceShell: ({ workspaceId }: { workspaceId: string }) => (workspaceRows.has(workspaceId) ? { tasks: [] } : null),
  upsertWorkspace: ({ id }: { id: string }) => {
    workspaceRows.add(id);
    if (commitAfterNextWorkspaceRow) {
      commitAfterNextRead(commitAfterNextWorkspaceRow);
      commitAfterNextWorkspaceRow = null;
    }
  },
};

mock.module("electron", () => ({ app: { getPath: () => USER_DATA_PATH } }));
mock.module("../electron/host-service/persistence", () => ({
  ensureHostServicePersistenceReady: () => fakeStore,
  resetHostServicePersistence: () => {},
  resolveHostServiceUserDataPath: () => USER_DATA_PATH,
}));

const runtime = await import("../electron/host-service/local-mcp-runtime");

function makeRepository(name: string) {
  const repositoryPath = path.join(root, name);
  mkdirSync(repositoryPath, { recursive: true });
  return repositoryPath;
}

/** What another preparation's final registration commits: its worktree workspace in `repositoryPath`. */
function addWorkspace(repositoryPath: string, id: string): Commit {
  workspaceRows.add(id);
  const workspacePath = `${repositoryPath}/.stave/workspaces/${id}`;
  return (registry) => registry.map((repository) => repository.repositoryPath !== repositoryPath ? repository : {
    ...repository,
    workspaces: [...repository.workspaces, { id, name: id, updatedAt: "2026-11-09T00:00:00.000Z" }],
    workspaceBranchById: { ...repository.workspaceBranchById, [id]: `tars/${id}` },
    workspacePathById: { ...repository.workspacePathById, [id]: workspacePath },
    workspaceDefaultById: { ...repository.workspaceDefaultById, [id]: false },
  });
}

/** What another writer commits when it registers a repository this caller never read. */
function addRepository(repositoryPath: string, workspaceId: string): Commit {
  workspaceRows.add(workspaceId);
  return (registry) => [...registry, {
    repositoryPath, repositoryName: path.basename(repositoryPath), lastOpenedAt: "2026-11-09T00:00:00.000Z", defaultBranch: "main",
    workspaces: [{ id: workspaceId, name: "Default Workspace", updatedAt: "2026-11-09T00:00:00.000Z" }], activeWorkspaceId: workspaceId,
    workspaceBranchById: { [workspaceId]: "main" }, workspacePathById: { [workspaceId]: repositoryPath }, workspaceDefaultById: { [workspaceId]: true },
  }];
}

const workspaceIdsOf = (repositoryPath: string) =>
  saved.find((repository) => repository.repositoryPath === repositoryPath)?.workspaces.map((workspace) => workspace.id) ?? [];

beforeEach(() => {
  saved = [];
  workspaceRows.clear();
  pendingCommit = null;
  commitAfterNextWorkspaceRow = null;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("host registry writers keep what another writer saved between their read and write", () => {
  test("registering a repository keeps a workspace another preparation registered meanwhile", async () => {
    const repositoryPath = makeRepository("shared");
    const first = await runtime.registerRepository({ repositoryPath, defaultBranch: "main" });

    commitAfterNextRead(addWorkspace(repositoryPath, "tars-b"));
    await runtime.registerRepository({ repositoryPath, defaultBranch: "main" });

    expect(pendingCommit).toBeNull();
    expect(workspaceIdsOf(repositoryPath)).toEqual([first.defaultWorkspaceId, "tars-b"]);
    expect(saved[0]?.workspacePathById["tars-b"]).toBe(`${repositoryPath}/.stave/workspaces/tars-b`);
  });

  test("registering a repository keeps a repository another writer added meanwhile", async () => {
    const repositoryPath = makeRepository("first");
    const otherPath = makeRepository("other");

    commitAfterNextRead(addRepository(otherPath, "other-default"));
    const registered = await runtime.registerRepository({ repositoryPath, defaultBranch: "main" });

    expect(saved.map((repository) => repository.repositoryPath).toSorted()).toEqual([repositoryPath, otherPath].toSorted());
    expect(workspaceIdsOf(repositoryPath)).toEqual([registered.defaultWorkspaceId]);
    expect(workspaceIdsOf(otherPath)).toEqual(["other-default"]);
  });

  test("creating a worktree workspace keeps a repository and a workspace saved while the worktree was created", async () => {
    const repositoryPath = makeRepository("git-repo");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryPath, stdio: "ignore" });
    git("init", "-b", "main");
    git("-c", "user.name=Stave Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "initial");
    const otherPath = makeRepository("other-repo");
    const first = await runtime.registerRepository({ repositoryPath, defaultBranch: "main" });

    // Lands right after the new workspace's row is written and the registry is read for its registration.
    const sibling = addWorkspace(repositoryPath, "tars-b");
    const otherRepository = addRepository(otherPath, "other-default");
    commitAfterNextWorkspaceRow = (registry) => otherRepository(sibling(registry));
    const created = await runtime.createWorkspace({ repositoryPath, name: "tars/a", mode: "clean" });

    expect(pendingCommit).toBeNull();
    expect(workspaceIdsOf(repositoryPath).toSorted()).toEqual([first.defaultWorkspaceId, "tars-b", created.workspaceId].toSorted());
    expect(saved.find((repository) => repository.repositoryPath === repositoryPath)?.workspacePathById[created.workspaceId]).toBe(created.workspacePath);
    expect(workspaceIdsOf(otherPath)).toEqual(["other-default"]);
  });
});
