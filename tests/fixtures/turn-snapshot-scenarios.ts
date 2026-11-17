import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync, statSync, symlinkSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TurnSnapshotService } from "../../electron/host-service/turn-snapshots";
import { SqliteStore } from "../../electron/persistence/sqlite-store";

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
let service = new TurnSnapshotService(store, process.argv[2] === "pruning" ? 2 : 50);
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
      const small=new TurnSnapshotService(store,2);
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
      service = new TurnSnapshotService(store);
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
    default: throw new Error("Unknown snapshot scenario");
  }
} finally {
  store.close();
  rmSync(root, { recursive: true, force: true });
}

})().catch((error) => { console.error(error); process.exitCode = 1; });
