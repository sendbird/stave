import { expect, mock } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { toWorkspaceFolderName } from "../../src/store/repository.utils";

const directory = mkdtempSync(path.join(tmpdir(), "tars-worktree-recovery-"));
const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
try {
  git("init", "-b", "main");
  writeFileSync(path.join(directory, ".gitignore"), "node_modules/\n.stave/\n");
  git("add", ".gitignore");
  const tree = git("write-tree");
  const commit = execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree],
    { cwd: directory, input: "Fixture root\n", encoding: "utf8" }).trim();
  git("update-ref", "refs/heads/main", commit);
  const branch = "tars/stable-execution";
  const workspacePath = path.join(directory, ".stave/workspaces", toWorkspaceFolderName({ branch, unique: true }));
  const fresh = process.argv.includes("--fresh");
  const fallback = process.argv.includes("--fallback");
  mkdirSync(path.join(directory, "node_modules"));
  writeFileSync(path.join(directory, "node_modules/seed-proof"), "seeded");
  if (!fresh) git("worktree", "add", "-b", branch, workspacePath, "main");
  // Simulated crash boundary: Git committed the worktree, but no registry/snapshot was saved.
  let registry: unknown[] = [];
  const snapshots = new Map<string, unknown>();
  mock.module("electron", () => ({ app: { getPath: () => directory } }));
  mock.module("../../electron/host-service/persistence", () => ({
    resolveHostServiceUserDataPath: () => directory,
    ensureHostServicePersistenceReady: () => ({
      loadRepositoryRegistry: () => registry,
      updateRepositoryRegistry: (update: (rows: unknown[]) => { repositories: unknown[]; result: unknown }) => {
        const result = update(registry); registry = result.repositories; return result.result;
      },
      loadWorkspaceShell: ({ workspaceId }: { workspaceId: string }) => snapshots.get(workspaceId) ?? null,
      upsertWorkspace: ({ id, snapshot }: { id: string; snapshot: unknown }) => snapshots.set(id, snapshot),
    }),
  }));
  if (fallback) mock.module("../../electron/host-service/worktree-dependencies", () => ({ seedWorktreeDependencies: async () => ({ status: "fallback" }) }));
  const runtime = await import("../../electron/host-service/local-mcp-runtime");
  const result = await runtime.createWorkspace({ repositoryPath: directory, name: branch, mode: "branch", fromBranch: "main",
    initCommand: `${fresh && !fallback ? "test -f node_modules/seed-proof && " : "test ! -d node_modules && "}printf initialized > preparation-proof`, useRootNodeModulesSymlink: false });
  expect(result.workspacePath).toBe(workspacePath);
  expect(result.branch).toBe(branch);
  expect(readFileSync(path.join(workspacePath, "preparation-proof"), "utf8")).toBe("initialized");
  if (fallback) expect(result).toMatchObject({ noticeLevel: "warning", message: expect.stringContaining("Continuing normal setup") });
  const repository = registry[0] as { workspacePathById: Record<string, string>; workspaceBranchById: Record<string, string> };
  expect(repository.workspacePathById[result.workspaceId]).toBe(workspacePath);
  expect(repository.workspaceBranchById[result.workspaceId]).toBe(branch);
  expect(snapshots.has(result.workspaceId)).toBe(true);
  expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
  const repeated = await runtime.createWorkspace({ repositoryPath: directory, name: branch, mode: "branch", fromBranch: "main" });
  expect(repeated.workspaceId).toBe(result.workspaceId);
  process.stdout.write(JSON.stringify({ worktrees: 2, registered: true, prepared: true }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
