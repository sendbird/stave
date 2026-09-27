import { app } from "electron";

import type { TrackerSourceAdapter } from "../../../src/lib/tracker-issues/source";
import {
  DEFAULT_TRACKER_ISSUES_SETTINGS,
  type TrackerIssuesSettings,
} from "../../../src/lib/tracker-issues/settings";
import type {
  TrackerSourceId,
  TrackerIssueAttachStaveTaskArgs,
  TrackerIssueDetail,
  TrackerIssueKickoffArgs,
  TrackerIssueKickoffResult,
  TrackerIssueListItem,
  TrackerIssueRefArgs,
  TrackerIssueStaveLink,
  TrackerIssuesListArgs,
  TrackerIssuesPublicStatus,
  TrackerIssuesRefreshArgs,
  TrackerIssuesSurfaceVisibleArgs,
} from "../../../src/lib/tracker-issues/types";
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
  listKnownRepositories,
  runLocallyApprovedCraneTask,
} from "../stave-mcp-service";
import { getMainWindow } from "../window";
import {
  createCraneTrackerSource,
  type CraneTrackerSource,
} from "./crane-source";
import { createJiraTrackerSource } from "./jira-source";
import { safeTrackerErrorMessage } from "./errors";
import { kickoffTrackerIssue as runKickoff } from "./kickoff";
import { TrackerIssuesRuntime } from "./runtime";

const STATUS_EVENT = "tracker-issues:status";
const CACHE_UPDATED_EVENT = "tracker-issues:cache-updated";
const KICKOFF_UPDATED_EVENT = "tracker-issues:kickoff-updated";

/** Finished kickoffs older than this are swept; matches the binding retention. */
const KICKOFF_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

let runtime: TrackerIssuesRuntime | null = null;
let craneSource: CraneTrackerSource | null = null;
let stopTurnSubscription: (() => void) | null = null;
let pruneTimer: NodeJS.Timeout | null = null;
let latestTasksSettings: TrackerIssuesSettings = DEFAULT_TRACKER_ISSUES_SETTINGS;

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
      enabled:
        latestTasksSettings.sourceEnabled.crane &&
        getCraneConnectorStatus().runtimeState !== "disabled",
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
    getSettings: () => {
      const connector = getJiraConnectorSettings();
      return {
        ...connector,
        enabled: latestTasksSettings.sourceEnabled.jira && connector.enabled,
      };
    },
    getStatus: () => loadJiraConnectorStatus(),
    listIssues: (args) => listJiraIssuesForCurrentUser(args),
    getIssue: (args) => getJiraIssue(args),
  });
}

const cacheListeners = new Set<(payload: { source: TrackerSourceId }) => void>();

/** Runs after every cache refresh, in the main process; returns the unsubscribe. */
export function onTrackerIssuesCacheUpdated(listener: (payload: { source: TrackerSourceId }) => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

/** Keeps the issue list fresh while Issues is hidden, for projects that watch it. */
export function setTrackerIssuesBackgroundDemand(demand: boolean): void {
  getTrackerIssuesRuntime().setBackgroundDemand(demand);
}

export function getTrackerIssuesRuntime(): TrackerIssuesRuntime {
  if (runtime) {
    return runtime;
  }
  craneSource = buildCraneSource();
  runtime = new TrackerIssuesRuntime({
    persistence: ensurePersistenceReadySync(),
    sources: [buildJiraSource(), craneSource],
    emitStatus: (status) => sendToRenderer(STATUS_EVENT, status),
    emitCacheUpdated: (payload) => {
      sendToRenderer(CACHE_UPDATED_EVENT, payload);
      for (const listener of cacheListeners) {
        try {
          listener(payload);
        } catch (error) {
          console.error("[tracker-issues] a cache listener failed", error);
        }
      }
    },
    emitKickoffUpdated: (link) => sendToRenderer(KICKOFF_UPDATED_EVENT, link),
  });
  return runtime;
}

function requireCraneSource(): CraneTrackerSource {
  // The runtime builds the Crane source; touching it first guarantees it exists.
  getTrackerIssuesRuntime();
  if (!craneSource) {
    throw new Error("The Crane tracker source is not initialized.");
  }
  return craneSource;
}

function pruneKickoffs() {
  const cutoff = new Date(Date.now() - KICKOFF_RETENTION_MS).toISOString();
  try {
    ensurePersistenceReadySync().pruneTrackerIssueKickoffs(cutoff);
  } catch (error) {
    console.error("[tracker-issues] kickoff prune failed", error);
  }
}

export function startTrackerIssuesRuntime(): void {
  getTrackerIssuesRuntime();
  if (!stopTurnSubscription) {
    // Non-Crane kickoffs report completion through the host task-turn stream;
    // Crane kickoffs report through the connector's job updates instead.
    stopTurnSubscription = onHostServiceEvent(
      "local-mcp.task-turn-updated",
      (payload) => {
        try {
          getTrackerIssuesRuntime().noteTaskTurnUpdate(payload);
        } catch (error) {
          // Host-service listeners run inside the stdout frame loop, so a throw
          // here would abort every listener after this one.
          console.error("[tracker-issues] failed to note a turn update", error);
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

export function stopTrackerIssuesRuntime(): void {
  runtime?.shutdown();
  stopTurnSubscription?.();
  stopTurnSubscription = null;
  if (pruneTimer) {
    clearInterval(pruneTimer);
    pruneTimer = null;
  }
}

export function getTrackerIssuesStatus(): TrackerIssuesPublicStatus {
  return getTrackerIssuesRuntime().getStatus();
}

export function listTrackerIssues(
  args: TrackerIssuesListArgs,
): TrackerIssueListItem[] {
  return getTrackerIssuesRuntime().listItems(args.source);
}

export function refreshTrackerIssues(
  args: TrackerIssuesRefreshArgs,
): Promise<TrackerIssuesPublicStatus> {
  return getTrackerIssuesRuntime().refresh({
    source: args.source,
    reason: "manual",
  });
}

export function getTrackerIssueDetail(
  args: TrackerIssueRefArgs,
): Promise<TrackerIssueDetail> {
  return getTrackerIssuesRuntime().getDetail(args);
}

export function setTrackerIssuesSurfaceVisible(
  args: TrackerIssuesSurfaceVisibleArgs,
): void {
  getTrackerIssuesRuntime().setSurfaceVisible(args.visible);
}

export async function configureTrackerIssues(
  settings: TrackerIssuesSettings,
): Promise<TrackerIssuesPublicStatus> {
  const previous = latestTasksSettings;
  latestTasksSettings = settings;
  const runtimeInstance = getTrackerIssuesRuntime();
  runtimeInstance.configure(settings);
  const sourcesChanged =
    previous.sourceEnabled.jira !== settings.sourceEnabled.jira ||
    previous.sourceEnabled.crane !== settings.sourceEnabled.crane;
  if (sourcesChanged) {
    return runtimeInstance.refreshAvailability();
  }
  return runtimeInstance.getStatus();
}

export function refreshTrackerSourceAvailability(): Promise<TrackerIssuesPublicStatus> {
  return getTrackerIssuesRuntime().refreshAvailability();
}

export function attachTrackerIssueStaveTask(
  args: TrackerIssueAttachStaveTaskArgs,
): TrackerIssueStaveLink | null {
  return getTrackerIssuesRuntime().attachStaveTask({
    kickoffId: args.kickoffId,
    taskId: args.taskId,
  });
}

export function kickoffTrackerIssue(
  args: TrackerIssueKickoffArgs,
): Promise<TrackerIssueKickoffResult> {
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
      listKnownRepositories,
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

export function resetTrackerIssuesRuntimeForTests(): void {
  stopTrackerIssuesRuntime();
  runtime = null;
  craneSource = null;
}
