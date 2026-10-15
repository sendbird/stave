import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

/**
 * The OpenCode TUI accepts no new-session id on 1.x, so the id of the
 * conversation a PTY just started is learned by asking the CLI.
 * `opencode session list --format json` prints, on both 1.x and 2.x:
 *
 * ```json
 * [{"id":"ses_…","title":"…","updated":1791989656467,
 *   "created":1791989651841,"projectId":"…","directory":"/abs/path"}]
 * ```
 *
 * 1.x lists every project's sessions, so entries are filtered by directory.
 * Directories are compared by realpath because OpenCode reports either the
 * requested path or its realpath (`/tmp` vs `/private/tmp` on macOS).
 */
export interface OpenCodeSessionSummary {
  sessionId: string;
  /** Creation time: a session the PTY started cannot predate the PTY. */
  updatedAtMs: number;
}

export function canonicalOpenCodeDirectory(value: string) {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

export function parseOpenCodeSessionList(args: {
  stdout: string;
  cwd: string;
}): OpenCodeSessionSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const targetDirectory = canonicalOpenCodeDirectory(args.cwd);
  const summaries: OpenCodeSessionSummary[] = [];
  for (const session of parsed) {
    if (!session || typeof session !== "object") {
      continue;
    }
    const record = session as Record<string, unknown>;
    const sessionId = record.id;
    if (typeof sessionId !== "string" || !sessionId.startsWith("ses")) {
      continue;
    }
    if (
      typeof record.directory !== "string" ||
      canonicalOpenCodeDirectory(record.directory) !== targetDirectory
    ) {
      continue;
    }
    const created = record.created;
    summaries.push({
      sessionId,
      updatedAtMs:
        typeof created === "number" && Number.isFinite(created) ? created : 0,
    });
  }
  return summaries;
}

const OPENCODE_SESSION_LIST_TIMEOUT_MS = 10_000;
const OPENCODE_SESSION_LIST_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const OPENCODE_SESSION_LIST_MAX_COUNT = "20";

export function listOpenCodeSessions(args: {
  executablePath: string;
  cwd: string;
  env?: Record<string, string | undefined>;
}): Promise<OpenCodeSessionSummary[]> {
  return new Promise((resolve) => {
    execFile(
      args.executablePath,
      ["session", "list", "--format", "json", "-n", OPENCODE_SESSION_LIST_MAX_COUNT],
      {
        cwd: args.cwd,
        env: args.env as NodeJS.ProcessEnv | undefined,
        timeout: OPENCODE_SESSION_LIST_TIMEOUT_MS,
        maxBuffer: OPENCODE_SESSION_LIST_MAX_BUFFER_BYTES,
      },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(parseOpenCodeSessionList({ stdout, cwd: args.cwd }));
      },
    );
  });
}
