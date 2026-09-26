/**
 * Main-process bridge to the host service's mission supervisor.
 *
 * Used by:
 * - `electron/main/ipc/missions.ts` (the renderer's `window.api.missions`)
 * - `electron/main/stave-mcp-server.ts` (the stage-reporting tools, through
 *   `electron/main/stave-mission-tools.ts`)
 */
import { webContents } from "electron";
import {
  MISSION_IPC,
  type MissionChangedEvent,
  type MissionInvokeResult,
} from "../../src/lib/missions/api";
import type { MissionBriefing } from "../../src/lib/missions/briefing";
import type { MissionReportReceipt } from "../host-service/supervision/mission-runtime";
import type { HostMissionAction } from "../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";

let missionEventBridgeRegistered = false;

/** Forwards `mission.changed` from the host to every renderer. */
export function ensureMissionEventBridge() {
  if (missionEventBridgeRegistered) return;
  missionEventBridgeRegistered = true;
  onHostServiceEvent("mission.changed", (payload: MissionChangedEvent) => {
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) contents.send(MISSION_IPC.changed, payload);
    }
  });
}

export function invokeMission<T>(
  action: HostMissionAction,
  args: unknown,
): Promise<MissionInvokeResult<T>> {
  return invokeHostService("mission.invoke", { action, args }) as Promise<
    MissionInvokeResult<T>
  >;
}

/** For the stage-reporting tools: a refusal becomes the tool's error text. */
async function invokeForTool<T>(action: HostMissionAction, args: unknown): Promise<T> {
  const result = await invokeMission<T>(action, args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

export function getMissionForGrant(args: { missionKey: string }) {
  return invokeForTool<MissionBriefing>("get-for-grant", args);
}

export function reportMissionStage(args: { missionKey: string; report: unknown }) {
  return invokeForTool<MissionReportReceipt>("report-stage", args);
}

export function blockMissionStage(args: { missionKey: string; block: unknown }) {
  return invokeForTool<MissionReportReceipt>("block-stage", args);
}
