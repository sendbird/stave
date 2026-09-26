/**
 * Main-process bridge to the host service's project supervisor.
 *
 * Used by:
 * - `electron/main/ipc/projects.ts` (the renderer's `window.api.projects`)
 * - `electron/main/stave-mcp-server.ts` (the coordinator's tools, through
 *   `electron/main/stave-project-tools.ts`)
 */
import { webContents } from "electron";
import { PROJECT_IPC, type ProjectChangedEvent, type ProjectInvokeResult } from "../../src/lib/projects/api";
import type { ProjectBriefing } from "../../src/lib/projects/briefing";
import type { HostProjectAction } from "../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";

let projectEventBridgeRegistered = false;

/** Forwards `project.changed` from the host to every renderer. */
export function ensureProjectEventBridge() {
  if (projectEventBridgeRegistered) return;
  projectEventBridgeRegistered = true;
  onHostServiceEvent("project.changed", (payload: ProjectChangedEvent) => {
    for (const contents of webContents.getAllWebContents()) {
      if (!contents.isDestroyed()) contents.send(PROJECT_IPC.changed, payload);
    }
  });
}

export function invokeProject<T>(action: HostProjectAction, args: unknown): Promise<ProjectInvokeResult<T>> {
  return invokeHostService("project.invoke", { action, args }) as Promise<ProjectInvokeResult<T>>;
}

/** For the coordinator's tools: a refusal becomes the tool's error text. */
async function invokeForTool<T>(action: HostProjectAction, args: unknown): Promise<T> {
  const result = await invokeProject<T>(action, args);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

export function getProjectForGrant(args: { projectKey: string }) {
  return invokeForTool<ProjectBriefing>("get-for-grant", args);
}

export function startProjectMission(args: { projectKey: string; input: unknown }) {
  return invokeForTool<{ state: string; message: string }>("start-mission-for-grant", args);
}

export function getProjectMissionReport(args: { projectKey: string; missionId: string }) {
  return invokeForTool<Record<string, unknown>>("get-mission-report-for-grant", args);
}

export function noteProject(args: { projectKey: string; note?: string; summary?: string }) {
  return invokeForTool<{ recorded: boolean }>("note-for-grant", args);
}
