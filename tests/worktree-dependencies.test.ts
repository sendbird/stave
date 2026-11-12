import { afterEach, expect, test } from "bun:test";
import { execFileSync, execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { seedWorktreeDependencies } from "../electron/host-service/worktree-dependencies";
import { runWorkspacePreparation } from "../electron/host-service/workspace-preparation";
import { WorktreeDependenciesArgsSchema } from "../src/lib/worktree-dependencies";

const execute = promisify(execFile);
const cleanup: string[] = [];
afterEach(async () => { for (const directory of cleanup.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });

async function fixture(include?: string, workspaces: unknown = ["packages/*"]) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), "worktree-dependencies-"));
  cleanup.push(directory);
  const sourcePath = path.join(directory, "source"), workspacePath = path.join(directory, "target");
  await fs.mkdir(sourcePath);
  const write = async (file: string, value = "fixture") => {
    await fs.mkdir(path.dirname(path.join(sourcePath, file)), { recursive: true });
    await fs.writeFile(path.join(sourcePath, file), value);
  };
  const git = (...argv: string[]) => execFileSync("git", argv, { cwd: sourcePath, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  await write(".gitignore", "node_modules/\n.venv/\n.cache/\n.env*\nsecret.key\n");
  await write("package.json", JSON.stringify({ workspaces }));
  await write("packages/app/package.json", "{}");
  await write("other/package.json", "{}");
  if (include !== undefined) await write(".worktreeinclude", include);
  git("add", ".");
  const tree = git("write-tree");
  const commit = execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit-tree", tree], { cwd: sourcePath, input: "Fixture\n", encoding: "utf8" }).trim();
  git("update-ref", "refs/heads/main", commit);
  git("worktree", "add", "-b", "new-work", workspacePath);
  const read = (file: string) => fs.readFile(path.join(workspacePath, file), "utf8");
  const exists = (file: string) => fs.lstat(path.join(workspacePath, file)).then(() => true, () => false);
  return { sourcePath, workspacePath, write, read, exists, git };
}

test.skipIf(process.platform === "win32")("defaults seed only ignored dependency roots, preserve internal links and isolate source writes", async () => {
  const f = await fixture();
  for (const file of ["node_modules/pkg/index.js", "node_modules/pkg/env.js", "packages/app/node_modules/pkg/index.js", ".venv/lib/pkg.py", "other/node_modules/no.js", ".cache/no", ".env", "secret.key", "node_modules/pkg/.env.local", ".venv/credentials.json"]) await f.write(file);
  await f.write("node_modules/pkg/tracked.js", "tracked");
  f.git("add", "-f", "node_modules/pkg/tracked.js");
  await fs.mkdir(path.join(f.sourcePath, "node_modules/.bin"));
  await fs.symlink("../pkg/index.js", path.join(f.sourcePath, "node_modules/.bin/pkg"));
  await fs.symlink(tmpdir(), path.join(f.sourcePath, "node_modules/external"));
  expect(await seedWorktreeDependencies(f)).toEqual({ status: "copied" });
  for (const file of ["node_modules/pkg/index.js", "node_modules/pkg/env.js", "packages/app/node_modules/pkg/index.js", ".venv/lib/pkg.py"]) expect(await f.read(file)).toBe("fixture");
  for (const file of ["other/node_modules/no.js", ".cache/no", ".env", "secret.key", "node_modules/pkg/.env.local", ".venv/credentials.json", "node_modules/external", "node_modules/pkg/tracked.js"]) expect(await f.exists(file), file).toBe(false);
  expect(await fs.readlink(path.join(f.workspacePath, "node_modules/.bin/pkg"))).toBe("../pkg/index.js");
  await fs.writeFile(path.join(f.workspacePath, "node_modules/pkg/index.js"), "changed");
  expect(await fs.readFile(path.join(f.sourcePath, "node_modules/pkg/index.js"), "utf8")).toBe("fixture");
});

test.skipIf(process.platform === "win32")("custom gitignore patterns replace defaults and honor comments, globs and negation; env requires inclusion", async () => {
  const f = await fixture("# Explicit cache only\n/.cache/**\n!/.cache/**/\n!/.cache/**/private*\n/.env.local\n/package.json\n");
  for (const file of [".cache/tool/data", ".cache/tool/private-key", ".env.local", ".env.other", "node_modules/pkg/index.js", ".venv/lib/pkg.py"]) await f.write(file);
  expect(await seedWorktreeDependencies(f)).toEqual({ status: "copied" });
  expect(await f.read(".cache/tool/data")).toBe("fixture");
  expect(await f.read(".env.local")).toBe("fixture");
  for (const file of [".cache/tool/private-key", ".env.other", "node_modules", ".venv"]) expect(await f.exists(file), file).toBe(false);
  expect(await f.read("package.json")).toContain("workspaces");
});

test.skipIf(process.platform === "win32")("empty allowlist disables seeding, workspace object syntax works, shared root wins, existing destinations survive", async () => {
  const empty = await fixture("");
  await empty.write("node_modules/a");
  expect(await seedWorktreeDependencies(empty)).toEqual({ status: "skipped" });
  const f = await fixture(undefined, { packages: ["packages/*"] });
  await f.write("node_modules/a"); await f.write("packages/app/node_modules/a"); await f.write(".venv/a");
  await fs.mkdir(path.join(f.workspacePath, ".venv"));
  await fs.writeFile(path.join(f.workspacePath, ".venv/a"), "keep");
  expect(await seedWorktreeDependencies({ ...f, skipRootNodeModules: true })).toEqual({ status: "copied" });
  expect(await f.exists("node_modules")).toBe(false);
  expect(await f.read("packages/app/node_modules/a")).toBe("fixture");
  expect(await f.read(".venv/a")).toBe("keep");
  const nested = await fixture("/node_modules/pkg/**\n");
  await nested.write("node_modules/pkg/a");
  expect(await seedWorktreeDependencies({ ...nested, skipRootNodeModules: true })).toEqual({ status: "skipped" });
  expect(await nested.exists("node_modules")).toBe(false);
});

test.each(["darwin", "linux"] as const)("%s invokes the native clone option; failure leaves setup usable", async (platform) => {
  const f = await fixture(); await f.write("node_modules/pkg/index.js");
  const copies: string[][] = [];
  const result = await seedWorktreeDependencies(f, { platform, run: async (command, argv, options) => {
    if (command === "cp") { copies.push(argv); throw new Error("Clone unavailable"); }
    return execute(command, argv, { ...options, encoding: "utf8" });
  } });
  expect(result).toEqual({ status: "fallback" });
  expect(copies[0]).toContain(platform === "darwin" ? "-c" : "--reflink=auto");
  expect(await f.exists("node_modules")).toBe(false);
  await runWorkspacePreparation({ cwd: f.workspacePath, command: "printf ready > setup-proof" });
  expect(await f.read("setup-proof")).toBe("ready");
});

test.skipIf(process.platform === "win32")("a hung clone is killed within budget and never promotes a partial dependency tree", async () => {
  const f = await fixture(); await f.write("node_modules/a");
  const started = Date.now();
  const result = await seedWorktreeDependencies(f, { timeoutMs: 300, run: (command, argv, options) => execute(command === "cp" ? "sleep" : command, command === "cp" ? ["30"] : argv, { ...options, encoding: "utf8", killSignal: "SIGKILL" }) });
  expect(result).toEqual({ status: "fallback" });
  expect(Date.now() - started).toBeLessThan(2_000);
  expect(await f.exists("node_modules")).toBe(false);
});

test("unsupported platforms skip silently without accessing the filesystem; IPC rejects unknown fields", async () => {
  expect(await seedWorktreeDependencies({ sourcePath: "/missing", workspacePath: "/missing" }, { platform: "win32", run: async () => { throw new Error("Must not run"); } })).toEqual({ status: "skipped" });
  expect(WorktreeDependenciesArgsSchema.safeParse({ sourcePath: "/repo", workspacePath: "/tree" }).success).toBe(true);
  expect(WorktreeDependenciesArgsSchema.safeParse({ sourcePath: "/repo", workspacePath: "/tree", command: "cp" }).success).toBe(false);
});

test.skipIf(process.platform === "win32")("foreign worktrees and symlink parents cannot receive a seed", async () => {
  const f = await fixture(); const other = await fixture();
  await f.write("node_modules/a");
  expect(await seedWorktreeDependencies({ sourcePath: f.sourcePath, workspacePath: other.workspacePath })).toEqual({ status: "fallback" });
  await f.write("packages/app/node_modules/a");
  await fs.rm(path.join(f.workspacePath, "packages/app"), { recursive: true });
  await fs.symlink(other.workspacePath, path.join(f.workspacePath, "packages/app"));
  await seedWorktreeDependencies({ ...f, skipRootNodeModules: true });
  expect(await other.exists("node_modules")).toBe(false);
});
