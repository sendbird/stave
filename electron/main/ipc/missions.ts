import { ipcMain } from "electron";
import type { z } from "zod";
import {
  MISSION_IPC,
  type MissionCommandResponse,
  type MissionDetail,
  type MissionListResponse,
  type MissionReportPublishResponse,
} from "../../../src/lib/missions/api";
import type { Mission } from "../../../src/lib/missions/domain";
import type { HostMissionAction } from "../../host-service/protocol";
import { ensureMissionEventBridge, invokeMission } from "../missions-service";
import {
  MissionIdArgsSchema,
  MissionListArgsSchema,
  MissionNoteUserTurnArgsSchema,
  MissionRequestChangesArgsSchema,
  MissionStageRefSchema,
  MissionStartArgsSchema,
} from "./mission-schemas";

function describeInvalidArgs(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".");
  return issue
    ? `Invalid mission request${path ? ` (${path})` : ""}: ${issue.message}`
    : "Invalid mission request.";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Every mission command answers with the mission as it is after the command,
 * or with the refusal's code and sentence. A refused stage command
 * (`stale-identity`) tells the surface to refresh rather than to report a
 * failure.
 */
function handleCommand(
  channel: string,
  action: HostMissionAction,
  schema: z.ZodType,
) {
  ipcMain.handle(channel, async (_event, args: unknown): Promise<MissionCommandResponse> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return {
        ok: false,
        mission: null,
        code: "invalid-args",
        message: describeInvalidArgs(parsed.error),
      };
    }
    try {
      const result = await invokeMission<MissionDetail>(action, parsed.data);
      return result.ok
        ? { ok: true, mission: result.value }
        : { ok: false, mission: null, code: result.code, message: result.message };
    } catch (error) {
      return {
        ok: false,
        mission: null,
        code: "failed",
        message: errorMessage(error, "The mission request failed."),
      };
    }
  });
}

export function registerMissionHandlers() {
  ensureMissionEventBridge();

  handleCommand(MISSION_IPC.start, "start", MissionStartArgsSchema);
  handleCommand(MISSION_IPC.get, "get", MissionIdArgsSchema);
  handleCommand(MISSION_IPC.signOff, "sign-off", MissionStageRefSchema);
  handleCommand(MISSION_IPC.requestChanges, "request-changes", MissionRequestChangesArgsSchema);
  handleCommand(MISSION_IPC.skipStage, "skip-stage", MissionStageRefSchema);
  handleCommand(MISSION_IPC.retryStage, "retry-stage", MissionStageRefSchema);
  handleCommand(MISSION_IPC.pause, "pause", MissionIdArgsSchema);
  handleCommand(MISSION_IPC.resume, "resume", MissionIdArgsSchema);
  handleCommand(MISSION_IPC.takeOver, "take-over", MissionIdArgsSchema);
  handleCommand(MISSION_IPC.acceptRuntime, "accept-runtime", MissionIdArgsSchema);
  handleCommand(MISSION_IPC.noteUserTurn, "note-user-turn", MissionNoteUserTurnArgsSchema);
  handleCommand(MISSION_IPC.cancel, "cancel", MissionIdArgsSchema);

  ipcMain.handle(
    MISSION_IPC.addReportToPullRequest,
    async (_event, args: unknown): Promise<MissionReportPublishResponse> => {
      const parsed = MissionIdArgsSchema.safeParse(args);
      if (!parsed.success) {
        return { ok: false, code: "invalid-args", message: describeInvalidArgs(parsed.error) };
      }
      try {
        const result = await invokeMission<{ prUrl: string }>("add-report-to-pr", parsed.data);
        return result.ok
          ? { ok: true, prUrl: result.value.prUrl }
          : { ok: false, code: result.code, message: result.message };
      } catch (error) {
        return { ok: false, code: "failed", message: errorMessage(error, "Failed to update the pull request.") };
      }
    },
  );

  ipcMain.handle(MISSION_IPC.list, async (_event, args: unknown): Promise<MissionListResponse> => {
    const parsed = MissionListArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        missions: [],
        code: "invalid-args",
        message: describeInvalidArgs(parsed.error),
      };
    }
    try {
      const result = await invokeMission<{ missions: Mission[] }>("list", parsed.data);
      return result.ok
        ? { ok: true, missions: result.value.missions }
        : { ok: false, missions: [], code: result.code, message: result.message };
    } catch (error) {
      return {
        ok: false,
        missions: [],
        code: "failed",
        message: errorMessage(error, "Failed to load missions."),
      };
    }
  });
}
