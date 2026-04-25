import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { app, ipcMain } from "electron";
import { RendererIssueReportArgsSchema } from "./schemas";

const RENDERER_ISSUE_LOG_NAME = "renderer-errors.log";
const DUPLICATE_WINDOW_MS = 2_000;

const lastReportAtByFingerprint = new Map<string, number>();

function buildFingerprint(args: {
  scope: string;
  context: string;
  message: string;
  metadata?: Record<string, string>;
}) {
  return JSON.stringify({
    scope: args.scope,
    context: args.context,
    message: args.message,
    metadata: args.metadata ?? {},
  });
}

async function appendRendererIssueLog(args: {
  scope: string;
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, string>;
}) {
  const fingerprint = buildFingerprint(args);
  const now = Date.now();
  const previous = lastReportAtByFingerprint.get(fingerprint) ?? 0;
  if (now - previous < DUPLICATE_WINDOW_MS) {
    return;
  }
  lastReportAtByFingerprint.set(fingerprint, now);

  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
  const logPath = path.join(userDataPath, RENDERER_ISSUE_LOG_NAME);
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

export function registerDiagnosticsHandlers() {
  ipcMain.handle("diagnostics:report-renderer-issue", async (_event, args) => {
    const parsed = RendererIssueReportArgsSchema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        stderr: parsed.error.flatten().formErrors.join("\n"),
      };
    }

    try {
      await appendRendererIssueLog(parsed.data);
      return { ok: true };
    } catch (error) {
      console.error("[diagnostics] failed to write renderer issue log", error);
      return {
        ok: false,
        stderr: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
