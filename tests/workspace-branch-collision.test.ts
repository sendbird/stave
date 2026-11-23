import { i18n } from "../src/i18n/runtime";
import { createGitWorktree } from "../electron/shared/git-worktree-create";
import { buildDeterministicKickoffProposal, classifyKickoffSource, DEFAULT_KICKOFF_SOURCE_CONFIGS } from "../src/lib/workspace-kickoff";
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useAppStore } from "../src/store/app.store";
import { toWorkspaceFolderName } from "../src/store/repository.utils";

const originalWindow = globalThis.window;
const originalState = useAppStore.getState();
let root: string;

afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  useAppStore.setState(originalState, true);
  if (root) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  root = mkdtempSync(join(tmpdir(), "stave-create-workspace-"));
  const git = (...args: string[]) => execFileSync("git", [
    "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false",
    ...args,
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("commit", "--allow-empty", "-m", "Original base");
  git("branch", "topic");
  git("commit", "--allow-empty", "-m", "Requested base");
  Object.assign(globalThis, {
    window: {
      localStorage: { getItem: () => null, setItem: () => {} },
      api: { sourceControl: { createWorktree: createGitWorktree } },
    },
  });
  useAppStore.setState({ ...useAppStore.getInitialState(), repositoryPath: root, defaultBranch: "main" });
  return {
    git,
    workspacePath: (branch: string) => join(root, ".stave/workspaces", toWorkspaceFolderName({ branch, unique: true })),
    create: (name: string, fromBranch = "main") =>
      useAppStore.getState().createWorkspace({ name, mode: "branch", fromBranch }),
  };
}

describe("new workspace branch collisions", () => {
  test("preserves an existing branch from a different base and suggests a free suffix", async () => {
    const { git, create } = fixture();
    const originalCommit = git("rev-parse", "topic");
    expect(originalCommit).not.toBe(git("rev-parse", "main"));
    git("branch", "topic-2");

    expect(await create("topic")).toMatchObject({
      ok: false, message: expect.stringContaining("topic-3"),
    });
    expect(git("rev-parse", "topic")).toBe(originalCommit);
    expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);

    expect(await create("topic-3")).toMatchObject({ ok: true });
    expect(git("rev-parse", "topic-3")).toBe(git("rev-parse", "main"));
  });

  test("identifies an existing branch checked out in another worktree", async () => {
    const { git, create } = fixture();
    const other = join(root, "other checkout");
    git("worktree", "add", other, "topic");

    const result = await create("topic");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("checked out");
    expect(result.message).toContain("other checkout");
    expect(result.message).toContain("topic-2");
    expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
  });

  test("a branch conflict uses the current renderer language", async () => {
    const { create } = fixture();
    const language = i18n.language;
    try {
      await i18n.changeLanguage("ko");
      const result = await create("topic");
      expect(result.ok).toBe(false);
      expect(result.message).toContain('이미 있습니다.');
      expect(result.message).toContain('"topic-2" 이름으로');
    } finally {
      await i18n.changeLanguage(language);
    }
  });

  test("Kickoff stops before starting its first task and returns the same collision notice", async () => {
    const { git } = fixture();
    const classification = classifyKickoffSource({ input: "A new task", configs: DEFAULT_KICKOFF_SOURCE_CONFIGS });
    const proposal = { ...buildDeterministicKickoffProposal({ classification }), branchName: "topic" };
    let sent = false;
    useAppStore.setState({
      sendUserMessage: async () => {
        sent = true;
        return { status: "blocked" };
      },
    });
    const result = await useAppStore.getState().kickoffWorkspace({
      proposal, fromBranch: "main", startFirstTask: true,
    });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("topic-2") });
    expect(sent).toBe(false);
    expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(1);
  });

  test("concurrent requests for one path create only one worktree", async () => {
    const { git, workspacePath } = fixture();
    const args = { cwd: root, branch: "fresh", path: workspacePath("fresh"), baseRef: "main" };
    const outcomes = await Promise.all([createGitWorktree(args), createGitWorktree(args)]);
    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);
    expect(outcomes.find((outcome) => outcome !== null)?.code).toBeOneOf(["path_exists", "branch_checked_out"]);
    expect(git("worktree", "list", "--porcelain").match(/^worktree /gm)).toHaveLength(2);
    expect(git("rev-parse", "fresh")).toBe(git("rev-parse", "main"));
  });

  test("reports the occupied path and missing base as distinct errors", async () => {
    const { git, create, workspacePath } = fixture();
    const occupied = workspacePath("occupied");
    mkdirSync(occupied, { recursive: true });
    writeFileSync(join(occupied, "keep"), "keep");

    expect(await create("occupied")).toMatchObject({ ok: false, message: expect.stringContaining("path already exists") });
    expect(await create("free", "missing-base")).toMatchObject({ ok: false, message: expect.stringContaining("Base ref") });
    expect(git("branch", "--list", "occupied", "free")).toBe("");
  });
});
