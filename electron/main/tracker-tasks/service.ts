import { app } from "electron";

import type { TrackerSourceAdapter } from "../../../src/lib/tracker-tasks/source";
import type { TrackerTasksSettings } from "../../../src/lib/tracker-tasks/settings";
import type {
  TrackerSourceId,
  TrackerTaskAttachStaveTaskArgs,
  TrackerTaskDetail,
  TrackerTaskKickoffArgs,
  TrackerTaskKickoffResult,
  TrackerTaskListItem,
  TrackerTaskRefArgs,
  TrackerTaskStaveLink,
  TrackerTasksListArgs,
  TrackerTasksPublicStatus,
  TrackerTasksRefreshArgs,
  TrackerTasksSurfaceVisibleArgs,
} from "../../../src/lib/tracker-tasks/types";
import { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import { getAtelierConnectorCredentialVault } from "../atelier-connector/credential-service";
import {
  getCraneConnectorRuntime,
  getCraneConnectorStatus,
} from "../crane-connector/service";
import { onHostServiceEvent } from "../host-service-client";
import {
  getJiraConnectorSettings,
  getJiraIssue,
  listJiraIssuesForCurrentUser,
  loadJiraConnectorStatus,
} from "../jira-connector/service";
import { ensurePersistenceReadySync } from "../state";
import {
  addWorkspaceCraneIssue,
  addWorkspaceJiraIssue,
  createWorkspace,
  listKnownProjects,
  runLocallyApprovedCraneTask,
} from "../stave-mcp-service";
import { getMainWindow } from "../window";
import {
  createCraneTrackerSource,
  type CraneTrackerSource,
} from "./crane-source";
import { createJiraTrackerSource } from "./jira-source";
import { safeTrackerErrorMessage } from "./errors";
import { kickoffTrackerTask as runKickoff } from "./kickoff";
import { TrackerTasksRuntime } from "./runtime";

const STATUS_EVENT = "tracker-tasks:status";
const CACHE_UPDATED_EVENT = "tracker-tasks:cache-updated";
const KICKOFF_UPDATED_EVENT = "tracker-tasks:kickoff-updated";

/** Finished kickoffs older than this are swept; matches the binding retention. */
const KICKOFF_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

let runtime: TrackerTasksRuntime | null = null;
let craneSource: CraneTrackerSource | null = null;
let stopTurnSubscription: (() => void) | null = null;
let pruneTimer: NodeJS.Timeout | null = null;

function sendToRenderer(channel: string, payload: unknown) {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }
  renderer.send(channel, payload);
}

function allowInsecureLocalhost() {
  return process.env.STAVE_DEV === "1" && !app.isPackaged;
}

function buildCraneSource(): CraneTrackerSource {
  const vault = getAtelierConnectorCredentialVault();
  return createCraneTrackerSource({
    // The connector's enabled flag lives only in the runtime state; mirror the
    // default source wiring so the two surfaces agree on "enabled".
    getSettings: () => ({
      enabled: getCraneConnectorStatus().runtimeState !== "disabled",
    }),
    getCredential: () => vault.getCredential(),
    getSecureStorageStatus: () => ({
      available: vault.isSecureStorageAvailable(),
    }),
    httpClient: (baseUrl) =>
      new AtelierConnectorHttpClient({
        baseUrl,
        allowInsecureLocalhost: allowInsecureLocalhost(),
      }),
  });
}

function buildJiraSource(): TrackerSourceAdapter {
  return createJiraTrackerSource({
    getSettings: () => getJiraConnectorSettings(),
    getStatus: () => loadJiraConnectorStatus(),
    listIssues: (args) => listJiraIssuesForCurrentUser(args),
    getIssue: (args) => getJiraIssue(args),
  });
}

export function getTrackerTasksRuntime(): TrackerTasksRuntime {
  if (runtime) {
    return runtime;
  }
  craneSource = buildCraneSource();
  runtime = new TrackerTasksRuntime({
    persistence: ensurePersistenceReadySync(),
    sources: [craneSource, buildJiraSource()],
    emitStatus: (status) => sendToRenderer(STATUS_EVENT, status),
    emitCacheUpdated: (payload) => sendToRenderer(CACHE_UPDATED_EVENT, payload),
    emitKickoffUpdated: (link) => sendToRenderer(KICKOFF_UPDATED_EVENT, link),
  });
  return runtime;
}

function requireCraneSource(): CraneTrackerSource {
  // The runtime builds the Crane source; touching it first guarantees it exists.
  getTrackerTasksRuntime();
  if (!craneSource) {
    throw new Error("The Crane tracker source is not initialized.");
  }
  return craneSource;
}

function pruneKickoffs() {
  const cutoff = new Date(Date.now() - KICKOFF_RETENTION_MS).toISOString();
  try {
    ensurePersistenceReadySync().pruneTrackerTaskKickoffs(cutoff);
  } catch (error) {
    console.error("[tracker-tasks] kickoff prune failed", error);
  }
}

export function startTrackerTasksRuntime(): void {
  getTrackerTasksRuntime();
  if (!stopTurnSubscription) {
    // Non-Crane kickoffs report completion through the host task-turn stream;
    // Crane kickoffs report through the connector's job updates instead.
    stopTurnSubscription = onHostServiceEvent(
      "local-mcp.task-turn-updated",
      (payload) => {
        try {
          getTrackerTasksRuntime().noteTaskTurnUpdate(payload);
        } catch (error) {
          // Host-service listeners run inside the stdout frame loop, so a throw
          // here would abort every listener after this one.
          console.error("[tracker-tasks] failed to note a turn update", error);
        }
      },
    );
  }
  pruneKickoffs();
  if (!pruneTimer) {
    pruneTimer = setInterval(pruneKickoffs, PRUNE_INTERVAL_MS);
    pruneTimer.unref?.();
  }
}

export function stopTrackerTasksRuntime(): void {
  runtime?.shutdown();
  stopTurnSubscription?.();
  stopTurnSubscription = null;
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

export function getTrackerTasksStatus(): TrackerTasksPublicStatus {
  return getTrackerTasksRuntime().getStatus();
}

export function listTrackerTasks(
  args: TrackerTasksListArgs,
): TrackerTaskListItem[] {
  return getTrackerTasksRuntime().listItems(args.source);
}

export function refreshTrackerTasks(
  args: TrackerTasksRefreshArgs,
): Promise<TrackerTasksPublicStatus> {
  return getTrackerTasksRuntime().refresh({
    source: args.source,
    reason: "manual",
  });
}

export function getTrackerTaskDetail(
  args: TrackerTaskRefArgs,
): Promise<TrackerTaskDetail> {
  return getTrackerTasksRuntime().getDetail(args);
}

export function setTrackerTasksSurfaceVisible(
  args: TrackerTasksSurfaceVisibleArgs,
): void {
  getTrackerTasksRuntime().setSurfaceVisible(args.visible);
}

export function configureTrackerTasks(settings: TrackerTasksSettings): void {
  getTrackerTasksRuntime().configure(settings);
}

export function refreshTrackerSourceAvailability(): Promise<TrackerTasksPublicStatus> {
  return getTrackerTasksRuntime().refreshAvailability();
}

export function attachTrackerTaskStaveTask(
  args: TrackerTaskAttachStaveTaskArgs,
): TrackerTaskStaveLink | null {
  return getTrackerTasksRuntime().attachStaveTask({
    kickoffId: args.kickoffId,
    taskId: args.taskId,
  });
}

export function kickoffTrackerTask(
  args: TrackerTaskKickoffArgs,
): Promise<TrackerTaskKickoffResult> {
  const source = requireCraneSource();
  const persistence = ensurePersistenceReadySync();
  return runKickoff(
    {
      persistence,
      getAdapter: buildAdapterFor,
      craneWriteBackAvailable: async () =>
        (await source.availability()) === "ready",
      createCraneTaskJob: (claimArgs) =>
        source.createTaskJobForKickoff(claimArgs),
      kickoffClaimedJob: (kickoffArgs) =>
        getCraneConnectorRuntime().kickoffClaimedJob(kickoffArgs),
      listKnownProjects,
      createWorkspace: async (workspaceArgs) => {
        const created = await createWorkspace(workspaceArgs);
        return { workspaceId: created.workspaceId };
      },
      runLocallyApprovedRun: async (runArgs) => {
        const run = await runLocallyApprovedCraneTask(runArgs);
        return { workspaceId: run.workspaceId, taskId: run.taskId };
      },
      registerWorkspaceIssues: async ({ workspaceId, crane, jira }) => {
        if (crane) {
          await addWorkspaceCraneIssue({
            workspaceId,
            url: crane.url,
            issueKey: crane.issueKey,
            title: crane.title,
          });
        }
        if (jira) {
          await addWorkspaceJiraIssue({
            workspaceId,
            url: jira.url,
            issueKey: jira.issueKey,
          });
        }
      },
    },
    args,
  );
}

/** Resolve the tracker adapter for a source without rebuilding the runtime. */
function buildAdapterFor(id: TrackerSourceId): TrackerSourceAdapter {
  if (id === "crane") {
    return requireCraneSource();
  }
  return buildJiraSource();
}

export { safeTrackerErrorMessage };

export function resetTrackerTasksRuntimeForTests(): void {
  stopTrackerTasksRuntime();
  runtime = null;
  craneSource = null;
}
