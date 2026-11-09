import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { hasTarsSnapshotCommit, releaseTarsWorkingChangesRef, snapshotTarsWorkingChanges, tarsWorkingChangesRef, tarsWorkspacePath } from "../electron/host-service/tars-working-changes";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { AgentConfigSchema } from "../src/lib/agents/schema";
import { BUILTIN_AGENTS } from "../src/lib/agents/starters";
import { isTarsAgentCatalogPending } from "../src/lib/tars/agents";
import type { TarsDecisionAction } from "../src/lib/tars/conversation";
import { TarsResponsibilitySchema } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const RELEASE = AgentConfigSchema.parse({ version: 1, id: "release-notes", source: "custom", name: "Release notes",
  description: "Writes release notes.", instructions: "Write release notes.", model: { mode: "auto" }, permission: "auto",
  workspace: "same-workspace", report: ["summary"], usableAs: ["delegate"] });
const directories: string[] = [];
const databases: Database[] = [];
const savedEnv: Record<string, string | undefined> = {};
// Isolate every Git call (the module's and the fixtures') from the machine's own configuration.
const ISOLATED_ENV = { GIT_CONFIG_GLOBAL: "", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: undefined, GIT_AUTHOR_EMAIL: undefined,
  GIT_COMMITTER_NAME: undefined, GIT_COMMITTER_EMAIL: undefined };
beforeAll(() => {
  const empty = mkdtempSync(path.join(tmpdir(), "stave-tars-gitconfig-")); directories.push(empty);
  writeFileSync(path.join(empty, "config"), "");
  for (const [key, value] of Object.entries({ ...ISOLATED_ENV, GIT_CONFIG_GLOBAL: path.join(empty, "config") })) {
    savedEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
}

/** A committed repository: tracked.txt, removed.txt and a .gitignore that ignores *.log. */
function repository() {
  const root = mkdtempSync(path.join(tmpdir(), "stave-tars-snapshot-")); directories.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Fixture"); git(root, "config", "user.email", "fixture@example.invalid");
  writeFileSync(path.join(root, "tracked.txt"), "committed\n");
  writeFileSync(path.join(root, "removed.txt"), "will be deleted\n");
  writeFileSync(path.join(root, ".gitignore"), "*.log\n");
  git(root, "add", "."); git(root, "commit", "-q", "-m", "test: initialize");
  return root;
}

/** Uncommitted state of every kind: a modified file, a staged new file, an untracked file, a deletion and an ignored file. */
function dirty(root: string) {
  writeFileSync(path.join(root, "tracked.txt"), "committed\nmodified in the working tree\n");
  writeFileSync(path.join(root, "staged.txt"), "staged\n"); git(root, "add", "staged.txt");
  writeFileSync(path.join(root, "untracked.txt"), "brand new\n");
  unlinkSync(path.join(root, "removed.txt"));
  writeFileSync(path.join(root, "debug.log"), "ignored\n");
}

const indexBytes = (root: string) => createHash("sha256").update(readFileSync(path.join(root, ".git", "index"))).digest("hex");
const exists = (root: string, spec: string) => {
  try { execFileSync("git", ["cat-file", "-e", spec], { cwd: root, stdio: "ignore" }); return true; } catch { return false; }
};

describe("snapshotTarsWorkingChanges", () => {
  test("commits modified, staged and untracked files and deletions on top of HEAD, leaves ignored files out and never touches the user's index or files", async () => {
    const root = repository();
    dirty(root);
    const head = git(root, "rev-parse", "HEAD");
    const before = { index: indexBytes(root), status: git(root, "status", "--porcelain=v1", "--untracked-files=all", "--ignored"),
      tracked: readFileSync(path.join(root, "tracked.txt"), "utf8") };
    const ref = tarsWorkingChangesRef("message-1", "workspace:one");
    const result = await snapshotTarsWorkingChanges({ workspacePath: root, ref, message: "chore(tars): start from working changes", date: NOW });

    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") return;
    // The user's index and working tree are byte-for-byte as they were.
    expect(indexBytes(root)).toBe(before.index);
    expect(git(root, "status", "--porcelain=v1", "--untracked-files=all", "--ignored")).toBe(before.status);
    expect(readFileSync(path.join(root, "tracked.txt"), "utf8")).toBe(before.tracked);
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    // The snapshot sits on HEAD, holds every uncommitted change and nothing ignored.
    expect(git(root, "rev-parse", `${result.commit}^`)).toBe(head);
    expect(git(root, "show", `${result.commit}:tracked.txt`)).toBe("committed\nmodified in the working tree");
    expect(git(root, "show", `${result.commit}:staged.txt`)).toBe("staged");
    expect(git(root, "show", `${result.commit}:untracked.txt`)).toBe("brand new");
    expect(exists(root, `${result.commit}:removed.txt`)).toBe(false);
    expect(exists(root, `${result.commit}:debug.log`)).toBe(false);
    expect(git(root, "log", "-1", "--format=%s|%an|%aI", result.commit)).toBe("chore(tars): start from working changes|Fixture|2026-11-05T00:00:00Z");
    // The ref keeps it reachable, and it is a valid, namespaced ref name.
    expect(result.ref).toBe(ref);
    expect(git(root, "rev-parse", ref)).toBe(result.commit);
    expect(() => git(root, "check-ref-format", ref)).not.toThrow();
    expect(TarsResponsibilitySchema.shape.workingChanges.parse(result)).toEqual(result);
  });

  test("leaves Stave's own .stave folder out, including other workspaces' worktrees inside it", async () => {
    const root = repository();
    git(root, "worktree", "add", "-q", "-b", "other", path.join(root, ".stave", "workspaces", "other"));
    writeFileSync(path.join(root, ".stave", "notes.md"), "Stave context\n");
    writeFileSync(path.join(root, "change.txt"), "the user's change\n");
    const result = await snapshotTarsWorkingChanges({ workspacePath: root, ref: tarsWorkingChangesRef("message-stave", "workspace"), message: "snapshot", date: NOW });
    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") return;
    expect(git(root, "ls-tree", "-r", "--name-only", result.commit).split("\n").sort()).toEqual([".gitignore", "change.txt", "removed.txt", "tracked.txt"]);
  });

  test("a retry with the same ref reuses the first snapshot even after the files changed again", async () => {
    const root = repository();
    dirty(root);
    const ref = tarsWorkingChangesRef("message-2", "workspace");
    const first = await snapshotTarsWorkingChanges({ workspacePath: root, ref, message: "snapshot", date: NOW });
    writeFileSync(path.join(root, "tracked.txt"), "edited after admission started\n");
    const retried = await snapshotTarsWorkingChanges({ workspacePath: root, ref, message: "snapshot", date: "2026-11-05T01:00:00.000Z" });
    expect(retried).toEqual(first);
    // Another message's snapshot does see the newer edit.
    const other = await snapshotTarsWorkingChanges({ workspacePath: root, ref: tarsWorkingChangesRef("message-3", "workspace"), message: "snapshot", date: NOW });
    expect(other.kind === "snapshot" && first.kind === "snapshot" && other.commit !== first.commit).toBe(true);
  });

  test("a clean tree records clean and creates no commit or ref", async () => {
    const root = repository();
    // Ignored files alone do not count as changes.
    writeFileSync(path.join(root, "noise.log"), "ignored\n");
    const ref = tarsWorkingChangesRef("message-4", "workspace");
    expect(await snapshotTarsWorkingChanges({ workspacePath: root, ref, message: "snapshot", date: NOW })).toEqual({ kind: "clean" });
    expect(exists(root, ref)).toBe(false);
  });

  test("snapshots a linked worktree, whose commit the repository can start a new workspace from", async () => {
    const root = repository();
    const worktree = `${root}-feature`; directories.push(worktree);
    git(root, "worktree", "add", "-q", "-b", "feature", worktree);
    writeFileSync(path.join(worktree, "feature.txt"), "only in the worktree\n");
    const result = await snapshotTarsWorkingChanges({ workspacePath: worktree, ref: tarsWorkingChangesRef("message-5", "feature"), message: "snapshot", date: NOW });
    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") return;
    expect(git(root, "show", `${result.commit}:feature.txt`)).toBe("only in the worktree");
    expect(await hasTarsSnapshotCommit(root, result.commit)).toBe(true);
    expect(await hasTarsSnapshotCommit(root, "0".repeat(40))).toBe(false);
    // The main checkout is untouched.
    expect(git(root, "status", "--porcelain")).toBe("");
  });

  test("without a Git identity the snapshot is authored by Stave instead of failing", async () => {
    const root = repository();
    git(root, "config", "--unset", "user.name"); git(root, "config", "--unset", "user.email");
    git(root, "config", "user.useConfigOnly", "true");
    dirty(root);
    const result = await snapshotTarsWorkingChanges({ workspacePath: root, ref: tarsWorkingChangesRef("message-6", "workspace"), message: "snapshot", date: NOW });
    expect(result.kind).toBe("snapshot");
    if (result.kind === "snapshot") expect(git(root, "log", "-1", "--format=%an", result.commit)).toBe("Stave");
  });

  test("resolves a workspace's checkout from the registry", () => {
    const registry = [{ repositoryPath: "/tmp/repository", workspaces: [{ id: "default" }, { id: "feature" }],
      workspacePathById: { feature: "/tmp/repository/.stave/workspaces/feature" } }] as unknown as PersistenceRepositoryRegistryEntry[];
    expect(tarsWorkspacePath("default", registry)).toBe("/tmp/repository");
    expect(tarsWorkspacePath("feature", registry)).toBe("/tmp/repository/.stave/workspaces/feature");
    expect(() => tarsWorkspacePath("missing", registry)).toThrow();
  });
});

describe("admission with working changes", () => {
  const unit = (title: string, agentId?: string): TarsDecisionAction => ({ kind: "delegate", workspaceId: "source", title,
    instruction: "Do it.", acceptanceCriteria: ["Done"], priority: 50, ...(agentId ? { agentId } : {}) });

  function fixture(root: string) {
    const database = new Database(":memory:"); databases.push(database);
    const conversations = new TarsConversationStore(database);
    const responsibilities = new TarsStore(database);
    conversations.configure({ providerId: "codex", model: "chosen", maxTurns: 8, allowedAgentIds: ["release-notes"] });
    const registry = [{ repositoryPath: root, workspaces: [{ id: "source" }] }] as PersistenceRepositoryRegistryEntry[];
    const requests: unknown[] = [];
    let ready = true;
    const ports: TarsDecisionPorts = { conversations, responsibilities, now: () => NOW, requestTick: () => {}, readRegistry: () => registry,
      agents: () => ready ? [...BUILTIN_AGENTS, RELEASE] : BUILTIN_AGENTS, agentCatalogReady: () => ready, control: () => { throw new Error("No control in this test."); },
      snapshotWorkingChanges: async (request) => {
        requests.push(request);
        return snapshotTarsWorkingChanges({ workspacePath: tarsWorkspacePath(request.workspaceId, registry),
          ref: tarsWorkingChangesRef(request.messageId, request.workspaceId), message: "snapshot", date: request.date });
      } };
    const answer = (actions: TarsDecisionAction[], includeWorkingChanges?: boolean) => {
      const queued = conversations.create({ requestId: `message-${conversations.list(100).length}`, text: "Work.",
        ...(includeWorkingChanges === undefined ? {} : { includeWorkingChanges }) }, NOW);
      const claimed = conversations.claim(queued.id, queued.revision, NOW);
      return conversations.answer(claimed.id, claimed.revision, { reply: "Proposed.", actions }, NOW);
    };
    return { conversations, responsibilities, ports, answer, requests, setReady: (value: boolean) => { ready = value; } };
  }

  test("every unit the message admits in one workspace starts from the same snapshot; a message without the choice starts from the branch", async () => {
    const root = repository();
    dirty(root);
    const f = fixture(root);
    const message = f.answer([unit("First"), unit("Second")], true);
    expect(message.includeWorkingChanges).toBe(true);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied"]);
    const [first, second] = f.responsibilities.snapshot().responsibilities;
    expect(first!.workingChanges?.kind).toBe("snapshot");
    expect(second!.workingChanges).toEqual(first!.workingChanges);
    // One snapshot per workspace per message, taken at the answer's time.
    expect(f.requests).toEqual([{ workspaceId: "source", repositoryPath: root, messageId: message.id, date: message.updatedAt }]);

    const plain = f.answer([unit("Plain")]);
    await applyTarsDecision({ messageId: plain.id, expectedRevision: plain.revision }, f.ports);
    expect(f.responsibilities.snapshot().responsibilities.find((row) => row.title === "Plain")!.workingChanges).toBeUndefined();
    expect(f.requests).toHaveLength(1);
  });

  test("a clean tree is recorded as clean", async () => {
    const f = fixture(repository());
    const message = f.answer([unit("Clean")], true);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(f.responsibilities.snapshot().responsibilities[0]!.workingChanges).toEqual({ kind: "clean" });
  });

  test("a retried admission reuses the first snapshot, so the unit's request hash and commit stay the same", async () => {
    const root = repository();
    dirty(root);
    const f = fixture(root);
    // A saved agent before the catalog synced keeps the unit pending after its snapshot was taken.
    f.setReady(false);
    const message = f.answer([unit("Saved agent work", "release-notes")], true);
    const pending = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports).then(() => null, (error: unknown) => error);
    expect(isTarsAgentCatalogPending(pending)).toBe(true);
    const ref = tarsWorkingChangesRef(message.id, "source");
    const firstCommit = git(root, "rev-parse", ref);
    writeFileSync(path.join(root, "tracked.txt"), "edited while the unit waited\n");
    f.setReady(true);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts[0]).toMatchObject({ status: "applied" });
    // The retry asked again but got the first snapshot: the later edit is not in it.
    expect(f.requests).toHaveLength(2);
    expect(git(root, "rev-parse", ref)).toBe(firstCommit);
    const row = f.responsibilities.snapshot().responsibilities[0]!;
    expect(row.workingChanges).toEqual({ kind: "snapshot", commit: firstCommit, ref });
    expect(git(root, "show", `${firstCommit}:tracked.txt`)).toBe("committed\nmodified in the working tree");
  });

  test("a snapshot that cannot be taken refuses the unit with its reason instead of starting from the branch", async () => {
    const f = fixture(repository());
    const message = f.answer([unit("Broken")], true);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision },
      { ...f.ports, snapshotWorkingChanges: async () => { throw new Error("fatal: not a git repository"); } });
    expect(receipts[0]).toMatchObject({ status: "rejected", reason: "workingChangesUnavailable" });
    expect(receipts[0]!.error).toContain("not a git repository");
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
    const unsupported = f.answer([unit("No port")], true);
    const { snapshotWorkingChanges: _absent, ...ports } = f.ports;
    expect((await applyTarsDecision({ messageId: unsupported.id, expectedRevision: unsupported.revision }, ports))[0])
      .toMatchObject({ status: "rejected", reason: "workingChangesUnavailable" });
  });
});

describe("Tars working-changes snapshot pins and cleanup (review fixes)", () => {
  const snap = (root: string, ref: string) => snapshotTarsWorkingChanges({ workspacePath: root, ref, message: "stave: snapshot", date: NOW });

  test("a clean first result stays clean on a retry, even when the tree changed since", async () => {
    const root = repository();
    const ref = tarsWorkingChangesRef("message-clean", "workspace-a");
    expect(await snap(root, ref)).toEqual({ kind: "clean" });
    writeFileSync(path.join(root, "tracked.txt"), "changed after the first admission\n");
    expect(await snap(root, ref)).toEqual({ kind: "clean" });
  });

  test("`.stave` entries the user already staged stay out of the snapshot", async () => {
    const root = repository();
    execFileSync("mkdir", ["-p", path.join(root, ".stave")]);
    writeFileSync(path.join(root, ".stave", "notes.md"), "private\n");
    git(root, "add", "-f", ".stave/notes.md");
    writeFileSync(path.join(root, "tracked.txt"), "changed\n");
    const result = await snap(root, tarsWorkingChangesRef("message-stave", "workspace-a"));
    expect(result.kind).toBe("snapshot");
    if (result.kind !== "snapshot") return;
    expect(git(root, "ls-tree", "-r", "--name-only", result.commit)).not.toContain(".stave/notes.md");
    // The user's own index still has it staged.
    expect(git(root, "diff", "--cached", "--name-only")).toContain(".stave/notes.md");
  });

  test("releasing drops the snapshot ref and the clean marker; the commit survives while a branch holds it", async () => {
    const root = repository();
    writeFileSync(path.join(root, "tracked.txt"), "changed\n");
    const ref = tarsWorkingChangesRef("message-release", "workspace-a");
    const result = await snap(root, ref);
    if (result.kind !== "snapshot") throw new Error("expected a snapshot");
    git(root, "branch", "tars/work", result.commit);
    await releaseTarsWorkingChangesRef(root, ref);
    expect(() => git(root, "rev-parse", "--verify", "--quiet", ref)).toThrow();
    expect(await hasTarsSnapshotCommit(root, result.commit)).toBe(true);
    // Releasing again is harmless.
    await releaseTarsWorkingChangesRef(root, ref);
    const cleanRoot = repository();
    const cleanRef = tarsWorkingChangesRef("message-release-clean", "workspace-a");
    await snap(cleanRoot, cleanRef);
    await releaseTarsWorkingChangesRef(cleanRoot, cleanRef);
    expect(() => git(cleanRoot, "rev-parse", "--verify", "--quiet", `${cleanRef}-clean`)).toThrow();
  });
});
