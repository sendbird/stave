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
import type { Project } from "../../src/lib/projects/domain";
import type { ObservedIssue } from "../../src/lib/projects/policy";
import type { HostProjectAction } from "../host-service/protocol";
import { invokeHostService, onHostServiceEvent } from "./host-service-client";
import {
  listTrackerIssues,
  onTrackerIssuesCacheUpdated,
  setTrackerIssuesBackgroundDemand,
} from "./tracker-issues/service";

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

/** Open issues assigned to the user, as a project's "issue assigned" trigger reads them. */
function openAssignedIssues(): ObservedIssue[] {
  return listTrackerIssues({})
    .map((item) => item.task)
    .filter((task) => task.status.category !== "done" && task.status.category !== "closed")
    .map((task) => ({
      source: task.source,
      key: task.key,
      title: task.title,
      url: task.url,
      labels: task.labels.map((label) => label.name),
      project: task.project?.name ?? null,
      createdAt: task.createdAt,
    }));
}

let issueBridgeRegistered = false;

/**
 * Hands every Issues refresh to the host, where projects that watch for newly
 * assigned issues wake their coordinator, and keeps the list fresh in the
 * background while any active project watches.
 */
export function ensureProjectIssueBridge() {
  if (issueBridgeRegistered) return;
  issueBridgeRegistered = true;
  let watching = false;
  const forward = () => {
    if (!watching) return;
    void invokeProject("observe-issues", { items: openAssignedIssues() }).catch((error) => {
      console.warn("[projects] could not hand issues to the host", error);
    });
  };
  let pending: ReturnType<typeof setTimeout> | null = null;
  const refreshDemand = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(async () => {
      pending = null;
      const listed = await invokeProject<{ projects: Project[] }>("list", { openOnly: true }).catch(() => null);
      const next = Boolean(
        listed?.ok &&
          listed.value.projects.some((project) => project.state === "active" && project.settings.triggers?.issueAssigned),
      );
      const started = next && !watching;
      watching = next;
      try {
        setTrackerIssuesBackgroundDemand(next);
      } catch (error) {
        console.warn("[projects] could not change issue polling", error);
      }
      if (started) forward();
    }, 2_000);
  };
  onTrackerIssuesCacheUpdated(() => forward());
  onHostServiceEvent("project.changed", () => refreshDemand());
  refreshDemand();
}

