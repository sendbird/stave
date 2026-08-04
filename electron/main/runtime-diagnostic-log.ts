import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const RUNTIME_ISSUE_LOG_NAME = "renderer-errors.log";
const RUNTIME_ISSUE_LOG_MAX_BYTES = 2 * 1024 * 1024;
const DUPLICATE_WINDOW_MS = 2_000;
const lastReportAtByFingerprint = new Map<string, number>();

export async function appendRuntimeDiagnostic(args: {
  scope: string;
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const fingerprint = JSON.stringify({
    scope: args.scope,
    context: args.context,
    message: args.message,
    metadata: args.metadata ?? {},
  });
  const now = Date.now();
  const previous = lastReportAtByFingerprint.get(fingerprint) ?? 0;
  if (now - previous < DUPLICATE_WINDOW_MS) {
    return;
  }
  lastReportAtByFingerprint.set(fingerprint, now);

  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
  const logPath = path.join(userDataPath, RUNTIME_ISSUE_LOG_NAME);
  const backupPath = `${logPath}.1`;
  const size = await stat(logPath)
    .then((entry) => entry.size)
    .catch(() => 0);
  if (size >= RUNTIME_ISSUE_LOG_MAX_BYTES) {
    await rm(backupPath, { force: true }).catch(() => undefined);
    await rename(logPath, backupPath).catch(() => undefined);
  }
  const timestamp = new Date(now).toISOString();
  const metadata =
    args.metadata && Object.keys(args.metadata).length > 0
      ? JSON.stringify(args.metadata)
      : "{}";
  const stack = args.stack?.trim() ? `\nstack=${args.stack.trim()}` : "";
  const line =
    `[${timestamp}] scope=${args.scope} context=${args.context} ` +
    `message=${JSON.stringify(args.message)} metadata=${metadata}${stack}\n`;
  await appendFile(logPath, line, "utf8");
}
