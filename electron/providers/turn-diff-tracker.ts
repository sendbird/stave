import { readFile, readdir } from "node:fs/promises";
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
]);

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function normalizeWorkspaceRoot(args: { cwd?: string }) {
  if (args.cwd && path.isAbsolute(args.cwd)) {
    return args.cwd;
  }
  return process.cwd();
}

function normalizeRelativePath(args: { cwd?: string; filePath?: string }) {
  const workspaceRoot = normalizeWorkspaceRoot({ cwd: args.cwd });
  const filePath = args.filePath?.trim();
  if (!filePath) {
    return "";
  }
  const candidate = path.isAbsolute(filePath)
    ? path.relative(workspaceRoot, filePath)
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

async function readEligibleTextFile(args: { absolutePath: string }) {
  try {
    const buffer = await readFile(args.absolutePath);
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

async function snapshotDirectory(args: { cwd?: string }) {
  const workspaceRoot = normalizeWorkspaceRoot({ cwd: args.cwd });
  const baselineByPath = new Map<string, string>();
  const skippedExistingPaths = new Set<string>();
  let totalBytes = 0;

  async function walk(currentDir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeRelativePath({ cwd: workspaceRoot, filePath: absolutePath });
      if (!relativePath) {
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) {
          continue;
        }
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const readResult = await readEligibleTextFile({ absolutePath });
      if (readResult.kind === "text") {
        if (totalBytes + readResult.bytes > MAX_TOTAL_BYTES) {
          skippedExistingPaths.add(relativePath);
          continue;
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

  await walk(workspaceRoot);

  return {
    baselineByPath,
    skippedExistingPaths,
  };
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

export async function createTurnDiffTracker(args: { cwd: string }) {
  const workspaceRoot = normalizeWorkspaceRoot({ cwd: args.cwd });
  const snapshot = await snapshotDirectory({ cwd: workspaceRoot });

  async function buildDiffEvents(args: { changedPaths: string[] }): Promise<{
    diffEvents: BridgeEvent[];
    unresolvedPaths: string[];
  }> {
    const diffEvents: BridgeEvent[] = [];
    const unresolvedPaths: string[] = [];
    const uniquePaths = [...new Set(
      args.changedPaths
        .map((filePath) => normalizeRelativePath({ cwd: workspaceRoot, filePath }))
        .filter(Boolean),
    )];

    for (const relativePath of uniquePaths) {
      const oldContent = snapshot.baselineByPath.get(relativePath);
      const current = await readEligibleTextFile({ absolutePath: path.join(workspaceRoot, relativePath) });

      if (oldContent === undefined && snapshot.skippedExistingPaths.has(relativePath)) {
        unresolvedPaths.push(relativePath);
        continue;
      }

      if (oldContent === undefined) {
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
