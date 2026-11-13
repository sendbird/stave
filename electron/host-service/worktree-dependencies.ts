import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { WorktreeDependenciesArgs, WorktreeDependenciesResult } from "../../src/lib/worktree-dependencies";

const execute = promisify(execFile);
const TIMEOUT_MS = 30_000;
type Run = (command: string, argv: string[], options: {
  cwd: string; timeout: number; signal?: AbortSignal;
}) => Promise<{ stdout: string }>;
const run: Run = (command, argv, options) => execute(command, argv, {
  ...options, encoding: "utf8", killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024,
});
const entries = (text: string) => text.split("\0").filter(Boolean);
const inside = (root: string, target: string) => target === root || target.startsWith(`${root}${path.sep}`);
// Default seeds exclude local authentication/configuration material at every depth.
const sensitive = (name: string) => /^(?:\.envrc|\.npmrc|\.pypirc|\.netrc|\.ssh|\.aws|\.gnupg|\.git-credentials|id_rsa|id_ed25519|secrets?(?:\..*)?|credentials(?:\..*)?)$/i.test(name) || /\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/i.test(name);

/** Best effort only: setup remains authoritative for lockfiles, ABI and relocatable environments. */
export async function seedWorktreeDependencies(args: WorktreeDependenciesArgs & { signal?: AbortSignal }, deps: {
  platform?: NodeJS.Platform; timeoutMs?: number; run?: Run;
} = {}): Promise<WorktreeDependenciesResult> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux") return { status: "skipped" };
  const deadline = Date.now() + (deps.timeoutMs ?? TIMEOUT_MS);
  const check = () => {
    args.signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error("Dependency copy timed out");
  };
  const command = async (cwd: string, executable: string, argv: string[]) => {
    check();
    return (await (deps.run ?? run)(executable, argv, { cwd, timeout: Math.max(1, deadline - Date.now()), signal: args.signal })).stdout;
  };
  let staging: string | undefined;
  try {
    const source = await fs.realpath(args.sourcePath);
    const target = await fs.realpath(args.workspacePath);
    if (source === target || !(await fs.lstat(path.join(target, ".git"))).isFile()) throw new Error("Expected a new linked worktree");
    const common = async (cwd: string) => (await command(cwd, "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    if (await common(source) !== await common(target)) throw new Error("Worktrees belong to different repositories");
    const includePath = path.join(source, ".worktreeinclude");
    const includeStat = await fs.lstat(includePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (includeStat && !includeStat.isFile()) throw new Error("Expected a regular allowlist file");
    const custom = includeStat !== null;
    const list = async (options: string[], paths: string[] = []) => entries(await command(source, "git", ["ls-files", "--others", "--ignored", "-z", ...options, "--", ...paths]));
    let roots: string[];
    let included: Set<string> | undefined;
    if (custom) {
      roots = await list([`--exclude-from=${includePath}`, "--directory"]);
      included = new Set(await list([`--exclude-from=${includePath}`]));
    } else {
      roots = ["node_modules", ".venv"];
      const manifest = await fs.readFile(path.join(source, "package.json"), "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return "{}"; });
      const workspaces = JSON.parse(manifest).workspaces;
      const patterns: unknown = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
      if (Array.isArray(patterns) && patterns.length) {
        const manifests = entries(await command(source, "git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "**/package.json"]));
        for (const file of manifests) {
          const directory = path.posix.dirname(file);
          if (patterns.some((pattern) => typeof pattern === "string" && path.matchesGlob(directory, pattern.replace(/\/$/, "")))) roots.push(`${directory}/node_modules`);
        }
      }
    }
    roots = [...new Set(roots.map((root) => root.replace(/\/$/, "")))].filter((root) => {
      const absolute = path.resolve(source, root);
      return root !== "." && inside(source, absolute) && !inside(absolute, target) && !root.split("/").includes(".git") && !(args.skipRootNodeModules && (root === "node_modules" || root.startsWith("node_modules/")));
    }).sort((a, b) => a.length - b.length);
    roots = roots.filter((root, index) => !roots.slice(0, index).some((parent) => root.startsWith(`${parent}/`)));
    if (!roots.length) return { status: "skipped" };
    if (roots.length > 256) throw new Error("Too many dependency roots");
    const allowed = new Set((await list(["--exclude-standard"], roots)).filter((file) => (!included || included.has(file)) && (custom || !file.split("/").some(sensitive))));
    if (allowed.size > 100_000) throw new Error("Dependency seed is too large");
    let visited = 0;
    // Collapse wholly allowed subtrees so cp can clone directories in one operation.
    const plan = async (relative: string): Promise<{ whole: boolean; units: string[] }> => {
      check();
      if (++visited > 150_000) throw new Error("Dependency seed is too large");
      const absolute = path.join(source, relative);
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) {
        const link = await fs.readlink(absolute);
        const resolved = await fs.realpath(absolute).catch(() => null);
        if (path.isAbsolute(link) || !resolved || !inside(source, resolved)) return { whole: false, units: [] };
      }
      if (!stat.isDirectory()) return { whole: allowed.has(relative), units: allowed.has(relative) ? [relative] : [] };
      const children = await fs.readdir(absolute);
      const units: string[] = [];
      let whole = children.length > 0;
      for (const child of children) {
        const result = await plan(`${relative}/${child}`);
        whole &&= result.whole;
        units.push(...result.units);
      }
      return { whole, units: whole ? [relative] : units };
    };
    let copied = false;
    for (const root of roots) {
      check();
      // Never follow a source or destination parent symlink or overwrite an existing seed.
      let safe = true;
      for (const base of [source, target]) {
        let parent = base;
        for (const part of root.split("/").slice(0, -1)) {
          parent = path.join(parent, part);
          const stat = await fs.lstat(parent).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
          if (stat && !stat.isDirectory()) safe = false;
        }
      }
      if (!safe || await fs.lstat(path.join(target, root)).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return false; })) continue;
      if (![...allowed].some((file) => file === root || file.startsWith(`${root}/`))) continue;
      const { units } = await plan(root);
      if (!units.length) continue;
      staging ??= await fs.mkdtemp(path.join(target, ".stave-dependencies-"));
      for (const unit of units) {
        check();
        const destination = path.join(staging, path.dirname(unit));
        await fs.mkdir(destination, { recursive: true });
        await command(source, "cp", [...(platform === "darwin" ? ["-R", "-P", "-c"] : ["-R", "-P", "--reflink=auto"]), path.join(source, unit), destination]);
      }
      check();
      await fs.mkdir(path.dirname(path.join(target, root)), { recursive: true });
      await fs.rename(path.join(staging, root), path.join(target, root));
      copied = true;
    }
    return { status: copied ? "copied" : "skipped" };
  } catch {
    // Cancellation still belongs to the caller, which checks before running setup.
    return { status: "fallback" };
  } finally {
    // Cleanup cannot hold up normal setup; only private staging paths are removed.
    if (staging) void fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
