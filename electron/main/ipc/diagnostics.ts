import { ipcMain } from "electron";
import { RendererIssueReportArgsSchema } from "./schemas";
import { appendRuntimeDiagnostic } from "../runtime-diagnostic-log";

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
      await appendRuntimeDiagnostic(parsed.data);
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
