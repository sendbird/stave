/**
 * Locates the Codex CLI rollout file that belongs to a freshly spawned native
 * CLI session, so Stave can adopt its native session id.
 *
 * Extracted verbatim from `terminal-runtime.ts` to keep that file within the
 * max-lines ratchet; no behavior changed. The inlined `normalizeSessionCwd` call
 * is `resolveCommandCwd({ cwd })`, exactly as before.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { resolveCommandCwd } from "../main/utils/command";

export function readCodexSessionMeta(args: { filePath: string }) {
  try {
    const firstLine = readFileSync(args.filePath, "utf8")
      .split("\n", 1)[0]
      ?.trim();
    if (!firstLine) {
      return null;
    }
    const parsed = JSON.parse(firstLine) as {
      type?: string;
      payload?: { id?: string; cwd?: string; timestamp?: string };
    };
    if (parsed.type !== "session_meta") {
      return null;
    }
    const nativeSessionId = parsed.payload?.id?.trim();
    const cwd = parsed.payload?.cwd?.trim();
    const timestamp = parsed.payload?.timestamp?.trim();
    if (!nativeSessionId || !cwd || !timestamp) {
      return null;
    }
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs)) {
      return null;
    }
    return {
      nativeSessionId,
      cwd: resolveCommandCwd({ cwd }),
      timestampMs,
    };
  } catch {
    return null;
  }
}

export function collectRecentCodexSessionFiles(args: {
  rootPath: string;
  earliestMtimeMs: number;
}) {
  const recentFiles: string[] = [];
  const stack = [args.rootPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }
      if (stats.mtimeMs >= args.earliestMtimeMs) {
        recentFiles.push(fullPath);
      }
    }
  }

  recentFiles.sort((left, right) => {
    try {
      return statSync(right).mtimeMs - statSync(left).mtimeMs;
    } catch {
      return 0;
    }
  });

  return recentFiles;
}
