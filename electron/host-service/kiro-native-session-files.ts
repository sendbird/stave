import { execFile } from "node:child_process";

/**
 * `kiro-cli chat` accepts no session id up front, so the only way to learn the
 * id of the conversation a PTY just started is to ask the CLI. Run in the
 * session cwd, `kiro-cli chat --list-sessions --format json` prints:
 *
 * ```json
 * [{"cwd":"/abs/path","sessions":[{"sessionId":"<uuid>","source":"classic",
 *   "title":"...","updatedAt":"2026-09-10T00:07:23.097Z","messageCount":2}],
 *   "complete":true}]
 * ```
 *
 * Entries are flattened here: the command is always run with the session cwd,
 * and the CLI reports that directory's realpath, which would not compare equal
 * to the requested path on macOS (`/tmp` vs `/private/tmp`).
 */
export interface KiroSessionSummary {
  sessionId: string;
  updatedAtMs: number;
}

export function parseKiroSessionList(args: {
  stdout: string;
}): KiroSessionSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const summaries: KiroSessionSummary[] = [];
  for (const group of parsed) {
    if (!group || typeof group !== "object") {
      continue;
    }
    const sessions = (group as { sessions?: unknown }).sessions;
    if (!Array.isArray(sessions)) {
      continue;
    }
    for (const session of sessions) {
      if (!session || typeof session !== "object") {
        continue;
      }
      const sessionId = (session as { sessionId?: unknown }).sessionId;
      const updatedAt = (session as { updatedAt?: unknown }).updatedAt;
      if (typeof sessionId !== "string" || !sessionId) {
        continue;
      }
      const updatedAtMs =
        typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
      summaries.push({
        sessionId,
        updatedAtMs: Number.isNaN(updatedAtMs) ? 0 : updatedAtMs,
      });
    }
  }
  return summaries;
}

const KIRO_SESSION_LIST_TIMEOUT_MS = 10_000;
const KIRO_SESSION_LIST_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export function listKiroSessions(args: {
  executablePath: string;
  cwd: string;
  env?: Record<string, string | undefined>;
}): Promise<KiroSessionSummary[]> {
  return new Promise((resolve) => {
    execFile(
      args.executablePath,
      ["chat", "--list-sessions", "--format", "json"],
      {
        cwd: args.cwd,
        env: args.env as NodeJS.ProcessEnv | undefined,
        timeout: KIRO_SESSION_LIST_TIMEOUT_MS,
        maxBuffer: KIRO_SESSION_LIST_MAX_BUFFER_BYTES,
      },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(parseKiroSessionList({ stdout }));
      },
    );
  });
}
