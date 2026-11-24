import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSubAgentWorktrees,
  parseWorktreePorcelain,
  SUBAGENT_WORKTREE_QUIET_MS,
  verifySubAgentWorktreePath,
  type SubAgentGit,
  type SubAgentWorktreeStore,
} from "../electron/host-service/subagent-worktrees";

// Real Git in temporary repositories only; nothing here touches another checkout.
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

let root: string;
let repo: string;
let calls: string[][];
let failStatus: boolean;
const runner: SubAgentGit = async (cwd, args) => {
  calls.push(args);
  if (failStatus && args.includes("status")) return { ok: false, stdout: "" };
  const result = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
};
const later = () => Date.now() + 2 * SUBAGENT_WORKTREE_QUIET_MS;
function store(extra: Partial<ReturnType<SubAgentWorktreeStore["loadRepositoryRegistry"]>[number]> = {}, archived: string[] = []): SubAgentWorktreeStore {
  return {
    loadRepositoryRegistry: () => [{ repositoryPath: repo, repositoryName: "project", workspacePathById: { base: repo }, ...extra }],
    listArchivedWorkspacesPersistence: () => archived.map((path) => ({ path })),
  };
}
const agentPath = (id: string) => join(repo, ".claude", "worktrees", `agent-${id}`);
function addAgent(id: string) {
  git(repo, "worktree", "add", "-b", `worktree-agent-${id}`, agentPath(id));
  return agentPath(id);
}
const real = (path: string) => realpathSync(path);
const branchExists = (name: string) => spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${name}`], { cwd: repo, env: GIT_ENV }).status === 0;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "subagent-worktrees-"));
  repo = join(root, "project");
  git(root, "init", "-b", "main", repo);
  git(repo, "commit", "--allow-empty", "-m", "initial");
  calls = [];
  failStatus = false;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("sub-agent worktree discovery", () => {
  test("parses porcelain -z fields, including locked and detached entries", () => {
    const parsed = parseWorktreePorcelain(["worktree /p", "HEAD a", "branch refs/heads/main", "", "worktree /p/.claude/worktrees/agent-1", "HEAD b", "detached", "locked reason", "", ""].join("\0"));
    expect(parsed).toEqual([
      { path: "/p", head: "a", branch: "main", detached: false, locked: false },
      { path: "/p/.claude/worktrees/agent-1", head: "b", branch: null, detached: true, locked: true },
    ]);
  });

  test("lists only <project>/.claude/worktrees/agent-* and ignores other worktrees and symbolic links", async () => {
    const kept = addAgent("kept");
    git(repo, "worktree", "add", "-b", "named", join(repo, ".claude", "worktrees", "not-an-agent"));
    git(repo, "worktree", "add", "-b", "stave", join(repo, ".stave", "workspaces", "agent-stave"));
    git(repo, "worktree", "add", "-b", "outside", join(root, "outside", "agent-outside"));
    // A link inside `.claude/worktrees` that points at a worktree elsewhere.
    git(repo, "worktree", "add", "-b", "linked", join(root, "elsewhere", "agent-linked"));
    symlinkSync(join(root, "elsewhere", "agent-linked"), join(repo, ".claude", "worktrees", "agent-linked"));
    // A second project whose `.claude/worktrees` folder is itself a link.
    const other = join(root, "other");
    git(root, "init", "-b", "main", other);
    git(other, "commit", "--allow-empty", "-m", "initial");
    mkdirSync(join(other, ".claude"));
    mkdirSync(join(root, "redirected"));
    symlinkSync(join(root, "redirected"), join(other, ".claude", "worktrees"));
    git(other, "worktree", "add", "-b", "through-link", join(other, ".claude", "worktrees", "agent-through"));

    const two: SubAgentWorktreeStore = {
      loadRepositoryRegistry: () => [{ repositoryPath: repo, repositoryName: "project", workspacePathById: {} }, { repositoryPath: other, repositoryName: "other", workspacePathById: {} }],
      listArchivedWorkspacesPersistence: () => [],
    };
    const folders = await createSubAgentWorktrees({ store: () => two, git: runner, now: later }).discover();
    expect(folders.map((folder) => folder.path)).toEqual([real(kept)]);
    expect(folders[0]).toMatchObject({ name: "agent-kept", branch: "worktree-agent-kept", detached: false, locked: false, repositoryPath: repo });
    expect(await verifySubAgentWorktreePath(real(repo), join(repo, ".claude", "worktrees", "agent-linked"))).toBeNull();
    expect(await verifySubAgentWorktreePath(real(other), join(other, ".claude", "worktrees", "agent-through"))).toBeNull();
  });

  test("never lists a Stave workspace, linked worktree or archive path", async () => {
    const linked = addAgent("linked");
    const workspace = addAgent("workspace");
    const archived = addAgent("archived");
    const plain = addAgent("plain");
    const agents = createSubAgentWorktrees({ store: () => store({ linkedWorkspacePaths: [linked], workspacePathById: { base: repo, ws: workspace } }, [archived]), git: runner, now: later });
    expect((await agents.discover()).map((folder) => folder.path)).toEqual([real(plain)]);
    expect((await agents.list([], () => null)).map((row) => row.path)).toEqual([real(plain)]);
    const refused = await agents.remove({ repositoryPath: repo, path: real(linked) }, []);
    expect(refused).toEqual({ ok: false, path: real(linked), reason: "staveWorkspace" });
    expect(existsSync(linked)).toBe(true);
  });
});

describe("sub-agent worktree blockers", () => {
  const rowFor = async (path: string, options: { running?: string[]; now?: () => number } = {}) => {
    const rows = await createSubAgentWorktrees({ store: () => store(), git: runner, now: options.now ?? later }).list(options.running ?? [], () => 7);
    return rows.find((row) => row.path === real(path))!;
  };

  test("a quiet, clean worktree on its branch has no blockers and reports its size", async () => {
    const path = addAgent("clean");
    expect(await rowFor(path)).toMatchObject({ name: "agent-clean", branch: "worktree-agent-clean", blockers: [], bytes: 7, repositoryName: "project" });
  });

  test("uncommitted and untracked changes block", async () => {
    const untracked = addAgent("untracked");
    writeFileSync(join(untracked, "notes.txt"), "draft");
    const modified = addAgent("modified");
    writeFileSync(join(modified, "tracked.txt"), "one");
    git(modified, "add", "tracked.txt");
    expect((await rowFor(untracked)).blockers).toEqual(["changedFiles"]);
    expect((await rowFor(modified)).blockers).toEqual(["changedFiles"]);
  });

  test("a detached HEAD with commits on no branch blocks; one on a branch does not", async () => {
    const loose = addAgent("loose");
    git(loose, "checkout", "--detach");
    git(loose, "commit", "--allow-empty", "-m", "only here");
    const safe = addAgent("safe");
    git(safe, "checkout", "--detach");
    expect(await rowFor(loose)).toMatchObject({ branch: null, blockers: ["unreachableCommits"] });
    expect(await rowFor(safe)).toMatchObject({ branch: null, blockers: [] });
  });

  test("a locked worktree blocks", async () => {
    const path = addAgent("locked");
    git(repo, "worktree", "lock", path);
    expect((await rowFor(path)).blockers).toEqual(["worktreeLocked"]);
  });

  test("a worktree changed in the last 30 minutes blocks", async () => {
    const path = addAgent("recent");
    const row = await rowFor(path, { now: Date.now });
    expect(row.blockers).toEqual(["recentlyModified"]);
    expect(Date.parse(row.lastModified!)).toBeGreaterThan(Date.now() - SUBAGENT_WORKTREE_QUIET_MS);
  });

  test("a sub-agent Activity sees running blocks, matched by its real path", async () => {
    const path = addAgent("running");
    expect((await rowFor(path, { running: [join(repo, ".claude", "worktrees", ".", "agent-running")] })).blockers).toEqual(["agentRunning"]);
  });

  test("a Git error blocks instead of guessing", async () => {
    const path = addAgent("error");
    failStatus = true;
    expect((await rowFor(path)).blockers).toEqual(["checksUnavailable"]);
  });

  test("checks read Git without optional locks", async () => {
    addAgent("locks");
    await rowFor(agentPath("locks"));
    expect(calls.filter((args) => args.includes("status"))).toEqual([["--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"]]);
  });
});

describe("sub-agent worktree removal", () => {
  test("removes the worktree without --force, prunes and keeps the branch", async () => {
    const path = addAgent("done");
    const target = real(path);
    const agents = createSubAgentWorktrees({ store: () => store(), git: runner, now: later });
    const result = await agents.remove({ repositoryPath: repo, path: target }, []);
    expect(result).toEqual({ ok: true, path: target, reason: null });
    expect(existsSync(path)).toBe(false);
    expect(branchExists("worktree-agent-done")).toBe(true);
    expect(git(repo, "worktree", "list", "--porcelain")).not.toContain("agent-done");
    expect(calls.some((args) => args[0] === "worktree" && args[1] === "remove")).toBe(true);
    expect(calls.some((args) => args[0] === "worktree" && args[1] === "prune")).toBe(true);
    expect(calls.flat().filter((arg) => arg === "--force" || arg === "-f" || arg === "-D" || arg === "--delete")).toEqual([]);
    expect(calls.some((args) => args[0] === "branch")).toBe(false);
  });

  test("checks again right before removing: a worktree that changed since it was listed is kept", async () => {
    const path = addAgent("late");
    const agents = createSubAgentWorktrees({ store: () => store(), git: runner, now: later });
    expect((await agents.list([], () => null))[0]!.blockers).toEqual([]);
    writeFileSync(join(path, "late.txt"), "written after listing");
    const result = await agents.remove({ repositoryPath: repo, path: real(path) }, []);
    expect(result).toEqual({ ok: false, path: real(path), reason: "changedFiles" });
    expect(existsSync(join(path, "late.txt"))).toBe(true);
    expect(calls.some((args) => args[1] === "remove")).toBe(false);
  });

  test("an agent that started running since listing is kept", async () => {
    const path = addAgent("restarted");
    const agents = createSubAgentWorktrees({ store: () => store(), git: runner, now: later });
    expect((await agents.remove({ repositoryPath: repo, path: real(path) }, [path])).reason).toBe("agentRunning");
    expect(existsSync(path)).toBe(true);
  });

  test("refuses paths that are not listed sub-agent worktrees and projects that are not registered", async () => {
    const outside = join(root, "outside", "agent-outside");
    git(repo, "worktree", "add", "-b", "outside", outside);
    const agents = createSubAgentWorktrees({ store: () => store(), git: runner, now: later });
    for (const path of [real(outside), real(repo), join(real(repo), ".claude", "worktrees", "agent-missing")]) {
      expect(await agents.remove({ repositoryPath: repo, path }, [])).toEqual({ ok: false, path, reason: "subAgentWorktreeMissing" });
    }
    expect(await agents.remove({ repositoryPath: join(root, "unregistered"), path: real(outside) }, [])).toMatchObject({ ok: false, reason: "ownershipChanged" });
    expect(existsSync(outside)).toBe(true);
    expect(calls.some((args) => args[1] === "remove")).toBe(false);
  });

  test("Git's own refusal is reported and the worktree stays", async () => {
    const path = addAgent("refused");
    // A check that passed, then a Git refusal (here: an untracked file Git still sees).
    let statusCalls = 0;
    const racing: SubAgentGit = async (cwd, args) => {
      if (args.includes("status") && statusCalls++ === 0) return { ok: true, stdout: "" };
      if (args[1] === "remove") writeFileSync(join(path, "raced.txt"), "x");
      return runner(cwd, args);
    };
    const result = await createSubAgentWorktrees({ store: () => store(), git: racing, now: later }).remove({ repositoryPath: repo, path: real(path) }, []);
    expect(result).toEqual({ ok: false, path: real(path), reason: "worktreeRemoveFailed" });
    expect(existsSync(path)).toBe(true);
    expect(branchExists("worktree-agent-refused")).toBe(true);
  });
});
