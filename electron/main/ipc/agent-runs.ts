import { ipcMain } from "electron";
import { z } from "zod";
import type { AgentRunInsights } from "../../../src/lib/agent-runs/insights";
import {
  AGENT_RUN_IPC,
  type AgentRunCommandResponse,
  type AgentRunDetail,
  type AgentRunInsightsResponse,
  type AgentRunShareReportResponse,
  type AgentRunListResponse,
  type AgentRunReportPublishResponse,
} from "../../../src/lib/agent-runs/api";
import type { AgentRun } from "../../../src/lib/agent-runs/domain";
import type { HostAgentRunAction } from "../../host-service/protocol";
import { ensureAgentRunEventBridge, invokeAgentRun } from "../agent-runs-service";
import {
  AgentRunIdArgsSchema,
  AgentRunListArgsSchema,
  AgentRunNoteUserTurnArgsSchema,
  AgentRunRequestChangesArgsSchema,
  AgentRunStageRefSchema,
  AgentRunStartArgsSchema,
} from "./agent-run-schemas";

function describeInvalidArgs(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return issue
    ? `Invalid run request${path ? ` (${path})` : ""}: ${issue.message}`
    : "Invalid run request.";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Every agent run command answers with the agent run as it is after the command,
 * or with the refusal's code and sentence. A refused stage command
 * (`stale-identity`) tells the surface to refresh rather than to report a
 * failure.
 */
function handleCommand(
  channel: string,
  action: HostAgentRunAction,
  schema: z.ZodType,
) {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<AgentRunCommandResponse> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        agentRun: null,
        code: "invalid-args",
        message: describeInvalidArgs(parsed.error),
      };
    }
    try {
      const result = await invokeAgentRun<AgentRunDetail>(action, parsed.data);
      return result.ok
        ? { ok: true, agentRun: result.value }
        : { ok: false, agentRun: null, code: result.code, message: result.message };
    } catch (error) {
      return {
        ok: false,
        agentRun: null,
        code: "failed",
        message: errorMessage(error, "The run request failed."),
      };
    }
  });
}

export function registerAgentRunHandlers() {
  ensureAgentRunEventBridge();

  handleCommand(AGENT_RUN_IPC.start, "start", AgentRunStartArgsSchema);
  handleCommand(AGENT_RUN_IPC.get, "get", AgentRunIdArgsSchema);
  handleCommand(AGENT_RUN_IPC.signOff, "sign-off", AgentRunStageRefSchema);
  handleCommand(AGENT_RUN_IPC.requestChanges, "request-changes", AgentRunRequestChangesArgsSchema);
  handleCommand(AGENT_RUN_IPC.skipStage, "skip-stage", AgentRunStageRefSchema);
  handleCommand(AGENT_RUN_IPC.retryStage, "retry-stage", AgentRunStageRefSchema);
  handleCommand(AGENT_RUN_IPC.pause, "pause", AgentRunIdArgsSchema);
  handleCommand(AGENT_RUN_IPC.resume, "resume", AgentRunIdArgsSchema);
  handleCommand(AGENT_RUN_IPC.takeOver, "take-over", AgentRunIdArgsSchema);
  handleCommand(AGENT_RUN_IPC.acceptRuntime, "accept-runtime", AgentRunIdArgsSchema);
  handleCommand(AGENT_RUN_IPC.noteUserTurn, "note-user-turn", AgentRunNoteUserTurnArgsSchema);
  handleCommand(AGENT_RUN_IPC.cancel, "cancel", AgentRunIdArgsSchema);

  ipcMain.handle(AGENT_RUN_IPC.shareReport, async (_event, args: unknown): Promise<AgentRunShareReportResponse> => {
    const parsed = z
      .object({ agentRunId: z.string().trim().min(1).max(200), threadUrl: z.url().max(2_048) })
      .strict()
      .safeParse(args);
    if (!parsed.success) return { ok: false, code: "invalid-args", message: describeInvalidArgs(parsed.error) };
    try {
      const result = await invokeAgentRun<{ shared: true }>("share-report", parsed.data);
      return result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message };
    } catch (error) {
      return { ok: false, code: "failed", message: errorMessage(error, "Failed to share the report.") };
    }
  });

  ipcMain.handle(
    AGENT_RUN_IPC.addReportToPullRequest,
    async (_event, args: unknown): Promise<AgentRunReportPublishResponse> => {
      const parsed = AgentRunIdArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, code: "invalid-args", message: describeInvalidArgs(parsed.error) };
      }
      try {
        const result = await invokeAgentRun<{ prUrl: string }>("add-report-to-pr", parsed.data);
        return result.ok
          ? { ok: true, prUrl: result.value.prUrl }
          : { ok: false, code: result.code, message: result.message };
      } catch (error) {
        return { ok: false, code: "failed", message: errorMessage(error, "Failed to update the pull request.") };
      }
    },
  );

  ipcMain.handle(AGENT_RUN_IPC.insights, async (_event, args: unknown): Promise<AgentRunInsightsResponse> => {
    const parsed = z.object({ days: z.number().int().min(1).max(365).optional() }).strict().safeParse(args ?? {});
    if (!parsed.success) return { ok: false, insights: null, message: describeInvalidArgs(parsed.error) };
    try {
      const result = await invokeAgentRun<AgentRunInsights>("insights", parsed.data);
      return result.ok ? { ok: true, insights: result.value } : { ok: false, insights: null, message: result.message };
    } catch (error) {
      return { ok: false, insights: null, message: errorMessage(error, "Failed to load run insights.") };
    }
  });

  ipcMain.handle(AGENT_RUN_IPC.list, async (_event, args: unknown): Promise<AgentRunListResponse> => {
    const parsed = AgentRunListArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        agentRuns: [],
        code: "invalid-args",
        message: describeInvalidArgs(parsed.error),
      };
    }
    try {
      const result = await invokeAgentRun<{ agentRuns: AgentRun[] }>("list", parsed.data);
      return result.ok
        ? { ok: true, agentRuns: result.value.agentRuns }
        : { ok: false, agentRuns: [], code: result.code, message: result.message };
    } catch (error) {
      return {
        ok: false,
        agentRuns: [],
        code: "failed",
        message: errorMessage(error, "Failed to load runs."),
      };
    }
  });
}
