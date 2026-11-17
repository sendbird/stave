import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync, statSync, symlinkSync, readlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TurnSnapshotService } from "../../electron/host-service/turn-snapshots";
import { SqliteStore } from "../../electron/persistence/sqlite-store";
import { workspaceExecutionGate } from "../../electron/shared/workspace-execution-gate";

void (async () => {
const root = mkdtempSync(path.join(tmpdir(), "stave-turn-snapshot-case-"));
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
git("init", "-q", "-b", "main");
git("config", "user.name", "Fixture");
git("config", "user.email", "fixture@example.invalid");
writeFileSync(path.join(root, "tracked.txt"), "committed\n");
writeFileSync(path.join(root, ".gitignore"), "*.log\n*.sqlite*\n");
git("add", ".");
git("commit", "-qm", "test: initialize");
let store = new SqliteStore({ dbPath: path.join(root, "state.sqlite"), runMaintenance: false });
const owner = { workspaceId: "workspace", taskId: "task" };
const snapshot = { activeTaskId: "task", tasks: ["task", "other"].map(id => ({ id, title: id, provider: "codex", unread: false, updatedAt: "now" })), messagesByTask: { task: [], other: [] } };
store.upsertWorkspace({ id: owner.workspaceId, name: "Workspace", snapshot });
store.saveRepositoryRegistry({ repositories: [{ repositoryPath: root, repositoryName: "Fixture", lastOpenedAt: "now", defaultBranch: "main", workspaces: [{ id: owner.workspaceId, name: "Workspace", updatedAt: "now" }], activeWorkspaceId: owner.workspaceId, workspacePathById: { workspace: root }, workspaceBranchById: { workspace: "main" }, workspaceDefaultById: { workspace: true } }] });
// "manual" runs the capture path used by git versions without `--attr-source`.
const captureMode = process.argv[3] === "manual" ? "manual" as const : "auto" as const;
let service = new TurnSnapshotService(store, process.argv[2] === "pruning" ? 2 : 50, { captureMode });
try {
  switch (process.argv[2]) {
    case "non-git": {
      rmSync(path.join(root,".git"),{recursive:true,force:true});
      assert.equal(await service.capture(owner,"turn-1"),undefined);
      assert.equal((await service.list(owner)).snapshots.length,0);
      break;
    }
    case "attributes-bytes": {
      writeFileSync(path.join(root, ".gitattributes"), "*.txt text eol=lf\n");
      writeFileSync(path.join(root, "tracked.txt"), Buffer.from("raw\r\nline\r\n"));
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "changed");
      assert.equal((await service.restore({...owner,turnId:"turn-1"})).ok,true);
      assert.deepEqual(readFileSync(path.join(root,"tracked.txt")),Buffer.from("raw\r\nline\r\n"));
      break;
    }
    case "ignored-obstruction": {
      writeFileSync(path.join(root, "new.txt"), "saved");
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, ".gitignore"), "*.log\n*.sqlite*\nnew.txt\n");
      writeFileSync(path.join(root, "new.txt"), "ignored new content");
      const result=await service.restore({...owner,turnId:"turn-1"});
      assert.equal(result.ok,false);
      assert.equal(readFileSync(path.join(root,"new.txt"),"utf8"),"ignored new content");
      break;
    }
    case "undo-prune": {
      const small=new TurnSnapshotService(store,2,{ captureMode });
      await small.capture(owner,"turn-1");
      writeFileSync(path.join(root,"tracked.txt"),"before restore");
      assert.equal((await small.restore({...owner,turnId:"turn-1"})).ok,true);
      await small.capture(owner,"turn-2");await small.capture(owner,"turn-3");await small.capture(owner,"turn-4");
      git("gc","--prune=now");
      assert.equal((await small.undo(owner)).ok,true);
      assert.equal(readFileSync(path.join(root,"tracked.txt"),"utf8"),"before restore");
      break;
    }
    case "bytes": {
      writeFileSync(path.join(root, "tracked.txt"), "staged\n"); git("add", "tracked.txt");
      writeFileSync(path.join(root, "tracked.txt"), "working\n");
      writeFileSync(path.join(root, "untracked.bin"), Buffer.from([0, 255, 1, 2]));
      writeFileSync(path.join(root, "ignored.log"), "ignored");
      writeFileSync(path.join(root, "run.sh"), "#!/bin/sh\nexit 0\n");chmodSync(path.join(root,"run.sh"),0o755);
      symlinkSync("tracked.txt",path.join(root,"shortcut"));
      const originalIndex = readFileSync(path.join(root, ".git", "index"));
      const head = git("rev-parse", "HEAD");
      await service.capture(owner, "turn-1");
      assert.deepEqual(readFileSync(path.join(root, ".git", "index")), originalIndex);
      assert.equal(git("rev-parse", "HEAD"), head);
      writeFileSync(path.join(root, "tracked.txt"), "later");
      writeFileSync(path.join(root, "untracked.bin"), "later");
      writeFileSync(path.join(root, "extra.txt"), "remove on restore");
      chmodSync(path.join(root,"run.sh"),0o644);rmSync(path.join(root,"shortcut"));symlinkSync("extra.txt",path.join(root,"shortcut"));
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "working\n");
      assert.equal(git("show", ":tracked.txt"), "staged");
      assert.equal(statSync(path.join(root,"run.sh")).mode&0o111,0o111);
      assert.equal(readlinkSync(path.join(root,"shortcut")),"tracked.txt");
      assert.deepEqual(readFileSync(path.join(root, "untracked.bin")), Buffer.from([0, 255, 1, 2]));
      assert.equal(existsSync(path.join(root, "extra.txt")), false);
      assert.equal(readFileSync(path.join(root, "ignored.log"), "utf8"), "ignored");
      assert.equal(git("rev-parse", "HEAD"), head);
      break;
    }
    case "unchanged": {
      const first = await service.capture(owner, "turn-1");
      const second = await service.capture(owner, "turn-2");
      assert.equal(first.snapshotId, second.snapshotId);
      assert.equal((await service.list(owner)).snapshots.length, 2);
      writeFileSync(path.join(root, "tracked.txt"), "changed");
      const third = await service.capture(owner, "turn-3");
      assert.notEqual(first.snapshotId, third.snapshotId);
      break;
    }
    case "pruning": {
      const rows = [];
      for (let i = 0; i < 4; i++) {
        writeFileSync(path.join(root, "tracked.txt"), `state ${i}`);
        rows.push(await service.capture(owner, `turn-${i}`));
      }
      assert.equal((await service.list(owner)).snapshots.length, 2);
      const refs = git("for-each-ref", "--format=%(refname)", "refs/stave/turns").split("\n");
      assert.equal(refs.length, 2);
      assert.equal(refs.includes(rows[0]!.ref), false);
      assert.equal((await service.restore({ ...owner, turnId: "turn-0" })).reason, "missingSnapshot");
      break;
    }
    case "undo-restart": {
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "before restore");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      store.close();
      store = new SqliteStore({ dbPath: path.join(root, "state.sqlite"), runMaintenance: false });
      service = new TurnSnapshotService(store, 50, { captureMode });
      assert.equal((await service.list(owner)).canUndo, true);
      assert.equal((await service.undo(owner)).ok, true);
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "before restore");
      assert.equal((await service.list(owner)).canUndo, false);
      break;
    }
    case "shared-alias": {
      await service.capture(owner, "turn-1");
      store.upsertWorkspace({ id: "alias", name: "Alias", snapshot });
      const repositories = store.loadRepositoryRegistry();
      repositories[0]!.workspaces.push({ id: "alias", name: "Alias", updatedAt: "now" });
      repositories[0]!.workspacePathById = { ...repositories[0]!.workspacePathById, alias: root };
      store.saveRepositoryRegistry({ repositories });
      store.beginTurn({ id: "alias-running", workspaceId: "alias", taskId: "other", providerId: "codex" });
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).reason, "sharedWorktree");
      store.completeTurn({ id: "alias-running" });
      break;
    }
    case "refusals": {
      await service.capture(owner, "turn-1");
      store.beginTurn({ id: "running", workspaceId: owner.workspaceId, taskId: owner.taskId, providerId: "codex" });
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).reason, "runningTask");
      store.completeTurn({ id: "running" });
      store.beginTurn({ id: "shared", workspaceId: owner.workspaceId, taskId: "other", providerId: "codex" });
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).reason, "sharedWorktree");
      store.completeTurn({ id: "shared" });
      writeFileSync(path.join(root, "tracked.txt"), "other task");
      await service.capture({ ...owner, taskId: "other" }, "other-turn");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).reason, "otherTaskChanges");
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "other task");
      break;
    }
    case "undo-intervening-change": {
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "before restore");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      writeFileSync(path.join(root, "tracked.txt"), "new edit");
      assert.equal((await service.undo(owner)).reason, "otherTaskChanges");
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "new edit");
      break;
    }
    case "attributes-staged-bytes": {
      // A staged file's index entry holds the filtered blob; the snapshot keeps the bytes on disk.
      writeFileSync(path.join(root, ".gitattributes"), "*.txt text eol=lf\n");
      writeFileSync(path.join(root, "staged.txt"), Buffer.from("one\r\ntwo\r\n"));
      git("add", ".gitattributes", "staged.txt");
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "staged.txt"), "changed\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.deepEqual(readFileSync(path.join(root, "staged.txt")), Buffer.from("one\r\ntwo\r\n"));
      break;
    }
    case "capture-submodule": {
      const library = mkdtempSync(path.join(tmpdir(), "stave-turn-snapshot-library-"));
      try {
        execFileSync("git", ["init", "-q", "-b", "main"], { cwd: library });
        writeFileSync(path.join(library, "lib.txt"), "library\n");
        execFileSync("git", ["add", "."], { cwd: library });
        execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "test: library"], { cwd: library });
        git("-c", "protocol.file.allow=always", "submodule", "add", "-q", library, "vendor/library");
        git("commit", "-qm", "test: add submodule");
        writeFileSync(path.join(root, "tracked.txt"), "before turn\n");
        const row = await service.capture(owner, "turn-1");
        assert.ok(row, "a submodule repository records a snapshot");
        assert.match(git("ls-tree", "-r", row!.snapshotId, "vendor/library"), /^160000 commit /);
        writeFileSync(path.join(root, "tracked.txt"), "after turn\n");
        writeFileSync(path.join(root, "vendor/library/lib.txt"), "edited inside the submodule\n");
        assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
        assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "before turn\n");
        // Nested repositories are recorded as links and never rewritten.
        assert.equal(readFileSync(path.join(root, "vendor/library/lib.txt"), "utf8"), "edited inside the submodule\n");
      } finally { rmSync(library, { recursive: true, force: true }); }
      break;
    }
    case "capture-nested-worktrees": {
      git("worktree", "add", "-q", path.join(root, ".stave", "workspaces", "feature"), "-b", "feature");
      writeFileSync(path.join(root, ".stave", "workspaces", "feature", "feature.txt"), "worktree file\n");
      mkdirSync(path.join(root, "nested", "full"), { recursive: true });
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: path.join(root, "nested", "full") });
      writeFileSync(path.join(root, "nested", "full", "inner.txt"), "inner\n");
      execFileSync("git", ["add", "."], { cwd: path.join(root, "nested", "full") });
      execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "test: inner"], { cwd: path.join(root, "nested", "full") });
      mkdirSync(path.join(root, "nested", "empty"), { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: path.join(root, "nested", "empty") });
      writeFileSync(path.join(root, "nested", "empty", "draft.txt"), "draft\n");
      writeFileSync(path.join(root, "tracked.txt"), "before turn\n");
      const row = await service.capture(owner, "turn-1");
      assert.ok(row, "a default workspace with nested worktrees records a snapshot");
      const files = git("ls-tree", "-r", "--name-only", row!.snapshotId).split("\n");
      assert.equal(files.some(file => file.startsWith(".stave/workspaces/")), false);
      assert.match(git("ls-tree", row!.snapshotId, "nested/full"), /^160000 commit /);
      writeFileSync(path.join(root, "tracked.txt"), "after turn\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "before turn\n");
      assert.equal(readFileSync(path.join(root, ".stave", "workspaces", "feature", "feature.txt"), "utf8"), "worktree file\n");
      assert.equal(readFileSync(path.join(root, "nested", "empty", "draft.txt"), "utf8"), "draft\n");
      break;
    }
    case "capture-merge-conflict": {
      git("switch", "-q", "-c", "other");
      writeFileSync(path.join(root, "tracked.txt"), "other side\n");
      git("commit", "-qam", "test: other side");
      git("switch", "-q", "main");
      writeFileSync(path.join(root, "tracked.txt"), "main side\n");
      git("commit", "-qam", "test: main side");
      assert.throws(() => git("merge", "-q", "other"));
      const unmerged = git("ls-files", "-u");
      assert.notEqual(unmerged, "");
      const head = git("rev-parse", "HEAD");
      const conflicted = readFileSync(path.join(root, "tracked.txt"), "utf8");
      const row = await service.capture(owner, "turn-1");
      assert.ok(row, "a merge conflict records the working tree");
      assert.equal(git("ls-files", "-u"), unmerged);
      assert.equal(git("rev-parse", "HEAD"), head);
      writeFileSync(path.join(root, "tracked.txt"), "resolved by the turn\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), conflicted);
      break;
    }
    case "capture-unsaved-task": {
      const unsaved = { ...owner, taskId: "unsaved" };
      writeFileSync(path.join(root, "tracked.txt"), "before turn\n");
      const row = await service.capture(unsaved, "turn-1");
      assert.ok(row, "a task that has not been saved yet still records a snapshot");
      store.upsertWorkspace({ id: owner.workspaceId, name: "Workspace", snapshot: { ...snapshot, tasks: [...snapshot.tasks, { id: "unsaved", title: "unsaved", provider: "codex", unread: false, updatedAt: "now" }] } });
      assert.deepEqual((await service.list(unsaved)).snapshots.map(item => item.turnId), ["turn-1"]);
      break;
    }
    case "capture-failure": {
      const objects = path.join(root, ".git", "objects");
      writeFileSync(path.join(root, "tracked.txt"), "cannot be stored\n");
      chmodSync(objects, 0o555);
      let row: unknown;
      try { row = await service.capture(owner, "turn-1"); }
      finally { chmodSync(objects, 0o755); }
      assert.equal(row, undefined);
      const listed = await service.list(owner);
      assert.deepEqual(listed.snapshots, []);
      assert.deepEqual(listed.skipped, [{ turnId: "turn-1", reason: "captureFailed" }]);
      break;
    }
    case "restore-differing-only": {
      for (let i = 0; i < 20; i++) writeFileSync(path.join(root, `file-${i}.txt`), `content ${i}\n`);
      await service.capture(owner, "turn-1");
      const old = new Date("2020-01-01T00:00:00Z");
      for (let i = 0; i < 20; i++) utimesSync(path.join(root, `file-${i}.txt`), old, old);
      writeFileSync(path.join(root, "file-3.txt"), "changed\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.equal(readFileSync(path.join(root, "file-3.txt"), "utf8"), "content 3\n");
      for (let i = 0; i < 20; i++) if (i !== 3) assert.equal(statSync(path.join(root, `file-${i}.txt`)).mtimeMs, old.getTime(), `file-${i}.txt was rewritten`);
      break;
    }
    case "restore-large-blob": {
      const large = Buffer.alloc(65 * 1024 * 1024, 7);
      writeFileSync(path.join(root, "large.bin"), large);
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "large.bin"), "replaced");
      const result = await service.restore({ ...owner, turnId: "turn-1" });
      assert.equal(result.ok, true, result.detail);
      assert.equal(statSync(path.join(root, "large.bin")).size, large.length);
      assert.equal(readFileSync(path.join(root, "large.bin")).equals(large), true);
      break;
    }
    case "restore-file-directory": {
      writeFileSync(path.join(root, "entry"), "a file\n");
      mkdirSync(path.join(root, "folder"));
      writeFileSync(path.join(root, "folder", "inside.txt"), "inside\n");
      await service.capture(owner, "turn-1");
      rmSync(path.join(root, "entry"));
      mkdirSync(path.join(root, "entry"));
      writeFileSync(path.join(root, "entry", "child.txt"), "now a folder\n");
      rmSync(path.join(root, "folder"), { recursive: true });
      writeFileSync(path.join(root, "folder"), "now a file\n");
      const result = await service.restore({ ...owner, turnId: "turn-1" });
      assert.equal(result.ok, true, result.detail);
      assert.equal(readFileSync(path.join(root, "entry"), "utf8"), "a file\n");
      assert.equal(readFileSync(path.join(root, "folder", "inside.txt"), "utf8"), "inside\n");
      break;
    }
    case "restore-modes": {
      writeFileSync(path.join(root, "secret.env"), "TOKEN=1\n");
      chmodSync(path.join(root, "secret.env"), 0o600);
      writeFileSync(path.join(root, "group.sh"), "#!/bin/sh\n");
      chmodSync(path.join(root, "group.sh"), 0o750);
      await service.capture(owner, "turn-1");
      chmodSync(path.join(root, "secret.env"), 0o644);
      writeFileSync(path.join(root, "group.sh"), "#!/bin/sh\nexit 1\n");
      chmodSync(path.join(root, "group.sh"), 0o755);
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.equal(statSync(path.join(root, "secret.env")).mode & 0o777, 0o600);
      assert.equal(statSync(path.join(root, "group.sh")).mode & 0o777, 0o750);
      assert.equal(readFileSync(path.join(root, "group.sh"), "utf8"), "#!/bin/sh\n");
      break;
    }
    case "restore-precheck": {
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "after turn\n");
      writeFileSync(path.join(root, ".git", "index.lock"), "");
      const result = await service.restore({ ...owner, turnId: "turn-1" });
      rmSync(path.join(root, ".git", "index.lock"));
      assert.equal(result.ok, false);
      assert.equal(result.reason, "obstructed");
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "after turn\n");
      break;
    }
    case "restore-terminal-busy": {
      const ports = { hasRunningTerminal: (workspaceIds: string[]) => workspaceIds.includes(owner.workspaceId) };
      service = new TurnSnapshotService(store, 50, { ...ports, captureMode });
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "after turn\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).reason, "terminalRunning");
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "after turn\n");
      break;
    }
    case "backups-separate": {
      service = new TurnSnapshotService(store, 2, { captureMode });
      writeFileSync(path.join(root, "tracked.txt"), "turn 1\n");
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "turn 2\n");
      await service.capture(owner, "turn-2");
      writeFileSync(path.join(root, "tracked.txt"), "before restore\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      assert.deepEqual((await service.list(owner)).snapshots.map(item => item.turnId), ["turn-2", "turn-1"]);
      writeFileSync(path.join(root, "tracked.txt"), "turn 3\n");
      await service.capture(owner, "turn-3");
      const listed = await service.list(owner);
      assert.deepEqual(listed.snapshots.map(item => item.turnId), ["turn-3", "turn-2"]);
      assert.equal(listed.canUndo, true);
      assert.equal(git("for-each-ref", "--format=%(refname)", "refs/stave/turns").split("\n").filter(Boolean).length, 2);
      break;
    }
    case "delete-task": {
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "before restore\n");
      assert.equal((await service.restore({ ...owner, turnId: "turn-1" })).ok, true);
      await service.capture({ ...owner, taskId: "other" }, "other-turn");
      assert.notEqual(git("for-each-ref", "--format=%(refname)", "refs/stave"), "");
      store.upsertWorkspace({ id: owner.workspaceId, name: "Workspace", snapshot: { ...snapshot, tasks: snapshot.tasks.map(task => task.id === owner.taskId ? { ...task, archivedAt: "now" } : task) } });
      store.removeTaskFromWorkspace({ ...owner, permanently: true });
      const remaining = git("for-each-ref", "--format=%(refname)", "refs/stave").split("\n").filter(Boolean);
      assert.equal(remaining.length, 1, remaining.join("\n"));
      assert.equal(store.turnSnapshots.list(owner.workspaceId, owner.taskId).length, 0);
      assert.equal(store.turnSnapshots.list(owner.workspaceId, "other").length, 1);
      break;
    }
    case "delete-workspace": {
      const worktree = path.join(mkdtempSync(path.join(tmpdir(), "stave-turn-snapshot-worktree-")), "feature");
      git("worktree", "add", "-q", worktree, "-b", "feature");
      const feature = { workspaceId: "feature", taskId: "task" };
      store.upsertWorkspace({ id: feature.workspaceId, name: "Feature", snapshot });
      const repositories = store.loadRepositoryRegistry();
      repositories[0]!.workspaces.push({ id: feature.workspaceId, name: "Feature", updatedAt: "now" });
      repositories[0]!.workspacePathById = { ...repositories[0]!.workspacePathById, feature: worktree };
      store.saveRepositoryRegistry({ repositories });
      writeFileSync(path.join(worktree, "tracked.txt"), "feature edit\n");
      assert.ok(await service.capture(feature, "turn-1"));
      await service.capture(owner, "turn-1");
      git("worktree", "remove", "--force", worktree);
      store.permanentDeleteWorkspace({ workspaceId: feature.workspaceId });
      const remaining = git("for-each-ref", "--format=%(refname)", "refs/stave").split("\n").filter(Boolean);
      assert.equal(remaining.length, 1, remaining.join("\n"));
      assert.equal(store.turnSnapshots.list(feature.workspaceId).length, 0);
      break;
    }
    case "default-restore-while-worktree-runs": {
      const worktree = path.join(root, ".stave", "workspaces", "feature");
      git("worktree", "add", "-q", worktree, "-b", "feature");
      await service.capture(owner, "turn-1");
      writeFileSync(path.join(root, "tracked.txt"), "after turn\n");
      const release = workspaceExecutionGate.acquire({ workspaceId: "feature", cwd: worktree });
      try {
        const result = await service.restore({ ...owner, turnId: "turn-1" });
        assert.equal(result.ok, true, result.reason);
      } finally { release(); }
      assert.equal(readFileSync(path.join(root, "tracked.txt"), "utf8"), "committed\n");
      break;
    }
    default: throw new Error("Unknown snapshot scenario");
  }
} finally {
  store.close();
  rmSync(root, { recursive: true, force: true });
}

})().catch((error) => { console.error(error); process.exitCode = 1; });
