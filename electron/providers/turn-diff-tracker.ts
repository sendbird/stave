import { readFile, readdir, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BridgeEvent } from "./types";

const IGNORED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  ".idea",
  ".vscode",
  "dist",
  "build",
  "out",
  "coverage",
  // Build output and agent-owned state. Without these a snapshot of Stave's own
  // repository walks `release/` (a full packaged app, ~500MB of binaries) and
  // every sibling worktree under `.stave/workspaces/` on every single turn.
  ".stave",
  "release",
  // Language/tool caches that are large, generated, and never hand-edited.
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".gradle",
  ".cache",
  ".parcel-cache",
  ".svelte-kit",
  ".output",
  ".terraform",
  ".yarn",
  "Pods",
]);

/**
 * Directory suffixes that are opaque platform bundles. They contain only build
 * artifacts, and descending into them is how a snapshot ends up reading
 * hundreds of megabytes of frameworks and dylibs.
 */
const IGNORED_DIR_SUFFIXES = [".app", ".framework", ".xcarchive", ".bundle"];

/**
 * Electron's asar patch stays installed under `ELECTRON_RUN_AS_NODE`, which is
 * how the host-service child runs. That makes `.asar` files behave like mounted
 * archives rather than regular files:
 *
 *   stat("app.asar")     -> size 0, isDirectory() === true
 *   readFile("app.asar") -> ENOENT
 *
 * Neither call reads the body, but *both* force Electron to parse the archive
 * header and cache it permanently — measured at ~71MB of unreclaimable RSS for
 * a 1.16GB archive. A size check cannot help here because the patched stat
 * reports size 0, so these paths must be filtered before any fs call.
 *
 * Disabling the patch globally (`process.noAsar = true`) is not an option: the
 * packaged build sets `asar: true`, so the host-service child imports its own
 * modules out of `app.asar`.
 */
const IGNORED_FILE_SUFFIXES = [".asar"];

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

/** Hard ceiling on directory entries inspected during one snapshot. */
const MAX_ENTRIES = 25_000;

/** Hard ceiling on recursion depth. */
const MAX_DEPTH = 32;

/**
 * Wall-clock budget for one snapshot. The tracker is awaited before the provider
 * turn starts, so this doubles as the worst-case turn startup delay.
 */
const MAX_DURATION_MS = 5_000;

/**
 * Roots that can never be a real workspace. A provider turn that reaches the
 * runtime without a usable `cwd` falls back to `process.cwd()`, and the
 * host-service child is spawned without a `cwd` option — so it inherits the
 * Electron main process's working directory, which is `/` for an app launched
 * from Finder or the Dock. Snapshotting any of these walks the whole machine.
 */
const UNSAFE_SNAPSHOT_ROOTS = new Set([
  "/",
  "/Applications",
  "/Library",
  "/System",
  "/System/Volumes/Data",
  "/Users",
  "/Volumes",
  "/bin",
  "/etc",
  "/opt",
  "/private",
  "/sbin",
  "/tmp",
  "/usr",
  "/var",
]);

export type SnapshotRootResolution =
  | { ok: true; root: string }
  | { ok: false; reason: string };

/**
 * Decides whether `cwd` may be used as a snapshot root. Rejecting here is what
 * keeps a bad `cwd` contract from turning into a full filesystem scan.
 */
export function resolveSnapshotRoot(args: { cwd?: string }): SnapshotRootResolution {
  const candidate = args.cwd?.trim();
  if (!candidate) {
    return { ok: false, reason: "cwd is missing" };
  }
  if (!path.isAbsolute(candidate)) {
    return { ok: false, reason: "cwd is not an absolute path" };
  }

  const resolved = path.resolve(candidate);
  if (resolved === path.parse(resolved).root) {
    return { ok: false, reason: "cwd is a filesystem root" };
  }
  if (UNSAFE_SNAPSHOT_ROOTS.has(resolved)) {
    return { ok: false, reason: "cwd is a system directory" };
  }

  const homeDirectory = os.homedir();
  if (homeDirectory && path.resolve(homeDirectory) === resolved) {
    return { ok: false, reason: "cwd is the user home directory" };
  }

  return { ok: true, root: resolved };
}

function hasIgnoredSuffix(args: { name: string; suffixes: string[] }) {
  const lowerName = args.name.toLowerCase();
  return args.suffixes.some((suffix) => lowerName.endsWith(suffix));
}

function isIgnoredDirectoryEntry(args: { name: string }) {
  return (
    IGNORED_DIR_NAMES.has(args.name) ||
    hasIgnoredSuffix({ name: args.name, suffixes: IGNORED_DIR_SUFFIXES })
  );
}

function isIgnoredFileEntry(args: { name: string }) {
  return hasIgnoredSuffix({ name: args.name, suffixes: IGNORED_FILE_SUFFIXES });
}

function normalizeRelativePath(args: { root: string; filePath?: string }) {
  const filePath = args.filePath?.trim();
  if (!filePath) {
    return "";
  }
  const candidate = path.isAbsolute(filePath)
    ? path.relative(args.root, filePath)
    : filePath;
  return candidate.split(path.sep).join("/");
}

function isProbablyBinary(args: { buffer: Buffer }) {
  const sample = args.buffer.subarray(0, 4096);
  let suspiciousBytes = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspiciousBytes += 1;
    }
  }
  return sample.length > 0 && suspiciousBytes / sample.length > 0.1;
}

async function resolveRealPath(targetPath: string) {
  try {
    return await realpath(targetPath);
  } catch {
    return null;
  }
}

function isPathInsideRoot(args: { rootRealPath: string; candidateRealPath: string }) {
  const relative = path.relative(args.rootRealPath, args.candidateRealPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Reads a file only when it is small enough to be worth diffing.
 *
 * The size check runs *before* the read. The previous implementation read the
 * whole file first and checked afterwards, so a 179MB framework binary was
 * fully materialised into a Buffer (measured: +173MB RSS) purely to be
 * discarded on the next line.
 */
async function readEligibleTextFile(args: { absolutePath: string }) {
  if (isIgnoredFileEntry({ name: path.basename(args.absolutePath) })) {
    return { kind: "skipped" as const };
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(args.absolutePath);
  } catch {
    return { kind: "missing" as const };
  }

  if (!fileStat.isFile()) {
    return { kind: "skipped" as const };
  }
  if (fileStat.size > MAX_FILE_BYTES) {
    return { kind: "skipped" as const };
  }

  try {
    const buffer = await readFile(args.absolutePath);
    // The file may have grown between stat() and read().
    if (buffer.byteLength > MAX_FILE_BYTES) {
      return { kind: "skipped" as const };
    }
    if (isProbablyBinary({ buffer })) {
      return { kind: "skipped" as const };
    }
    return {
      kind: "text" as const,
      content: buffer.toString("utf8"),
      bytes: buffer.byteLength,
    };
  } catch {
    return { kind: "missing" as const };
  }
}

interface DirectorySnapshot {
  baselineByPath: Map<string, string>;
  skippedExistingPaths: Set<string>;
  /** True when budgets stopped the walk before the tree was fully covered. */
  truncated: boolean;
}

/**
 * Maps a workspace-relative path back to an absolute path, but only when the
 * result genuinely stays inside the workspace.
 *
 * `buildDiffEvents` is driven by paths the provider reports as changed, which
 * are not trusted input. Without this check a `../` path or a symlink pointing
 * outside the workspace would have its full contents read and embedded in the
 * turn transcript.
 */
async function resolveContainedAbsolutePath(args: {
  root: string;
  rootRealPath: string;
  relativePath: string;
}) {
  if (path.isAbsolute(args.relativePath)) {
    return null;
  }
  const segments = args.relativePath.split("/");
  if (segments.includes("..")) {
    return null;
  }

  const absolutePath = path.join(args.root, args.relativePath);
  const realPath = await resolveRealPath(absolutePath);
  if (realPath) {
    return isPathInsideRoot({ rootRealPath: args.rootRealPath, candidateRealPath: realPath })
      ? absolutePath
      : null;
  }

  // The file may have been deleted during the turn, so fall back to checking
  // that its parent directory is still inside the workspace.
  const parentRealPath = await resolveRealPath(path.dirname(absolutePath));
  if (!parentRealPath) {
    return null;
  }
  return isPathInsideRoot({ rootRealPath: args.rootRealPath, candidateRealPath: parentRealPath })
    ? absolutePath
    : null;
}

async function snapshotDirectory(args: {
  root: string;
  rootRealPath: string;
  signal?: AbortSignal;
}): Promise<DirectorySnapshot> {
  const baselineByPath = new Map<string, string>();
  const skippedExistingPaths = new Set<string>();
  let totalBytes = 0;
  let entryCount = 0;
  let truncated = false;

  const deadline = Date.now() + MAX_DURATION_MS;
  const rootRealPath = args.rootRealPath;

  /**
   * Real paths already descended into. This is what stops the same directory
   * from being walked twice, which matters more than it sounds on macOS: APFS
   * firmlinks expose `/Applications`, `/Users`, `/Library`, `/opt` and
   * `/private` at a second path under `/System/Volumes/Data/` with the *same
   * inode*, and they are not symlinks — so a naive walk reads everything twice.
   * It also breaks symlink cycles.
   */
  const visitedRealPaths = new Set<string>([rootRealPath]);

  function budgetExhausted() {
    return (
      args.signal?.aborted === true ||
      entryCount >= MAX_ENTRIES ||
      totalBytes >= MAX_TOTAL_BYTES ||
      Date.now() > deadline
    );
  }

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }

    let entries: Dirent<string>[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      // Unreadable directory (EPERM, EACCES, ENOENT, ...). Nothing to baseline.
      return;
    }

    for (const entry of entries) {
      if (budgetExhausted()) {
        truncated = true;
        return;
      }

      entryCount += 1;
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeRelativePath({ root: args.root, filePath: absolutePath });
      if (!relativePath) {
        continue;
      }

      if (entry.isDirectory()) {
        if (isIgnoredDirectoryEntry({ name: entry.name })) {
          continue;
        }
        const entryRealPath = await resolveRealPath(absolutePath);
        if (!entryRealPath) {
          continue;
        }
        if (!isPathInsideRoot({ rootRealPath, candidateRealPath: entryRealPath })) {
          continue;
        }
        if (visitedRealPaths.has(entryRealPath)) {
          continue;
        }
        visitedRealPaths.add(entryRealPath);
        await walk(absolutePath, depth + 1);
        continue;
      }

      // Symlinks are intentionally not followed for file entries.
      if (!entry.isFile()) {
        continue;
      }

      const readResult = await readEligibleTextFile({ absolutePath });
      if (readResult.kind === "text") {
        if (totalBytes + readResult.bytes > MAX_TOTAL_BYTES) {
          // Budget is spent. Stop walking instead of continuing to read every
          // remaining file for results that can no longer be retained.
          skippedExistingPaths.add(relativePath);
          truncated = true;
          return;
        }
        baselineByPath.set(relativePath, readResult.content);
        totalBytes += readResult.bytes;
        continue;
      }

      if (readResult.kind === "skipped") {
        skippedExistingPaths.add(relativePath);
      }
    }
  }

  await walk(args.root, 0);

  return { baselineByPath, skippedExistingPaths, truncated };
}

function buildPathSummary(args: { prefix: string; paths: string[] }) {
  return `${args.prefix}: ${args.paths.join(", ")}`;
}

function buildFileChangeFallbackEvent(args: {
  appliedPaths?: string[];
  skippedPaths?: string[];
  failedPaths?: Array<{ path: string; error?: string }>;
}): BridgeEvent | null {
  const appliedPaths = (args.appliedPaths ?? []).filter(Boolean);
  const skippedPaths = (args.skippedPaths ?? []).filter(Boolean);
  const failedPaths = (args.failedPaths ?? []).filter((item) => item.path);
  const outputLines: string[] = [];

  if (appliedPaths.length > 0) {
    outputLines.push(buildPathSummary({ prefix: "Applied file change(s)", paths: appliedPaths }));
  }
  if (skippedPaths.length > 0) {
    outputLines.push(buildPathSummary({ prefix: "Skipped inline diff for file(s)", paths: skippedPaths }));
  }
  if (failedPaths.length > 0) {
    outputLines.push(`Failed file change(s): ${failedPaths
      .map((item) => `${item.path}${item.error ? ` (${item.error})` : ""}`)
      .join(", ")}`);
  }

  if (outputLines.length === 0) {
    return null;
  }

  return {
    type: "tool",
    toolName: "file_change",
    input: JSON.stringify({
      ...(appliedPaths.length > 0 ? { appliedPaths } : {}),
      ...(skippedPaths.length > 0 ? { skippedPaths } : {}),
      ...(failedPaths.length > 0
        ? {
            failedPaths: failedPaths.map((item) => ({
              path: item.path,
              ...(item.error ? { error: item.error } : {}),
            })),
          }
        : {}),
    }),
    output: outputLines.join("\n"),
    state: failedPaths.length > 0 ? "output-error" : "output-available",
  };
}

export async function createTurnDiffTracker(args: { cwd: string; signal?: AbortSignal }) {
  const rootResolution = resolveSnapshotRoot({ cwd: args.cwd });

  if (!rootResolution.ok) {
    console.warn(
      `[turn-diff-tracker] Skipping workspace snapshot: ${rootResolution.reason}.`,
    );
  }

  const workspaceRoot = rootResolution.ok ? rootResolution.root : null;
  const workspaceRootRealPath = workspaceRoot ? await resolveRealPath(workspaceRoot) : null;

  if (workspaceRoot && !workspaceRootRealPath) {
    console.warn(
      "[turn-diff-tracker] Skipping workspace snapshot: cwd does not exist on disk.",
    );
  }

  const snapshot: DirectorySnapshot =
    workspaceRoot && workspaceRootRealPath
      ? await snapshotDirectory({
          root: workspaceRoot,
          rootRealPath: workspaceRootRealPath,
          signal: args.signal,
        })
      : { baselineByPath: new Map(), skippedExistingPaths: new Set(), truncated: true };

  async function buildDiffEvents(args: { changedPaths: string[] }): Promise<{
    diffEvents: BridgeEvent[];
    unresolvedPaths: string[];
  }> {
    const diffEvents: BridgeEvent[] = [];
    const unresolvedPaths: string[] = [];

    if (!workspaceRoot || !workspaceRootRealPath) {
      // No baseline was captured, so any diff would be fabricated. Report the
      // paths instead and let the caller emit a fallback summary.
      return {
        diffEvents,
        unresolvedPaths: [...new Set(args.changedPaths.filter(Boolean))],
      };
    }

    const uniquePaths = [...new Set(
      args.changedPaths
        .map((filePath) => normalizeRelativePath({ root: workspaceRoot, filePath }))
        .filter(Boolean),
    )];

    for (const relativePath of uniquePaths) {
      const absolutePath = await resolveContainedAbsolutePath({
        root: workspaceRoot,
        rootRealPath: workspaceRootRealPath,
        relativePath,
      });
      if (!absolutePath) {
        // Outside the workspace. Name it, but never read or echo its contents.
        unresolvedPaths.push(relativePath);
        continue;
      }

      const oldContent = snapshot.baselineByPath.get(relativePath);
      const current = await readEligibleTextFile({ absolutePath });

      if (oldContent === undefined && snapshot.skippedExistingPaths.has(relativePath)) {
        unresolvedPaths.push(relativePath);
        continue;
      }

      if (oldContent === undefined) {
        // A truncated snapshot cannot distinguish "created this turn" from
        // "existed but was never scanned", so do not claim it is a new file.
        if (snapshot.truncated) {
          unresolvedPaths.push(relativePath);
          continue;
        }
        if (current.kind !== "text") {
          continue;
        }
        diffEvents.push({
          type: "diff",
          filePath: relativePath,
          oldContent: "",
          newContent: current.content,
          status: "accepted",
        });
        continue;
      }

      if (current.kind === "missing") {
        diffEvents.push({
          type: "diff",
          filePath: relativePath,
          oldContent,
          newContent: "",
          status: "accepted",
        });
        continue;
      }

      if (current.kind !== "text") {
        unresolvedPaths.push(relativePath);
        continue;
      }

      if (current.content === oldContent) {
        continue;
      }

      diffEvents.push({
        type: "diff",
        filePath: relativePath,
        oldContent,
        newContent: current.content,
        status: "accepted",
      });
    }

    return {
      diffEvents,
      unresolvedPaths,
    };
  }

  function buildFallbackEvents(args: {
    appliedPaths?: string[];
    skippedPaths?: string[];
    failedPaths?: Array<{ path: string; error?: string }>;
  }) {
    const fallbackEvent = buildFileChangeFallbackEvent(args);
    return fallbackEvent ? [fallbackEvent] : [];
  }

  return {
    buildDiffEvents,
    buildFallbackEvents,
  };
}
