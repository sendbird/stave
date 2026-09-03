import { app } from "electron";
import type {
  CraneConnectorConfigInput,
  CraneConnectorPairInput,
  CraneDispatchApprovalResponse,
  CraneDispatchJobUpdate,
} from "../../../src/lib/crane-connector/types";
import {
  addWorkspaceCraneIssue,
  addWorkspaceJiraIssue,
  createWorkspace,
  getTaskStatus,
  listKnownProjects,
  releaseLocallyManagedCraneTask,
  runLocallyApprovedCraneTask,
} from "../stave-mcp-service";
import { ensurePersistenceReadySync } from "../state";
import { getMainWindow } from "../window";
import { getCraneConnectorCredentialVault } from "./credential-service";
import { CraneConnectorHttpClient } from "./http-client";
import { CraneConnectorRuntime } from "./runtime";

const STATUS_EVENT = "crane-connector:status";
const APPROVAL_EVENT = "crane-connector:approval-required";
const JOB_UPDATE_EVENT = "crane-connector:job-updated";

let runtime: CraneConnectorRuntime | null = null;

function sendToRenderer(channel: string, payload: unknown) {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return;
  }
  renderer.send(channel, payload);
}

/**
 * Mirror a job update onto the tracker surface so a ticket's Stave-run badge
 * follows the dispatch. Lazily imported to keep the two singleton services free
 * of an import cycle, and fully guarded: the tracker is a read-side mirror and
 * its failure must never break Crane dispatch.
 */
function forwardJobUpdateToTracker(update: CraneDispatchJobUpdate) {
  void import("../tracker-tasks/service")
    .then(({ getTrackerTasksRuntime }) => {
      getTrackerTasksRuntime().noteCraneJobUpdate(update);
    })
    .catch((error) => {
      console.error(
        "[crane-connector] failed to forward a job update to the tracker",
        error,
      );
    });
}

export function getCraneConnectorRuntime() {
  if (runtime) {
    return runtime;
  }
  const allowInsecureLocalhost =
    process.env.STAVE_DEV === "1" && !app.isPackaged;
  runtime = new CraneConnectorRuntime({
    vault: getCraneConnectorCredentialVault(),
    persistence: ensurePersistenceReadySync(),
    appVersion: app.getVersion(),
    createHttpClient: (baseUrl) =>
      new CraneConnectorHttpClient({
        baseUrl,
        allowInsecureLocalhost,
      }),
    listKnownProjects,
    createWorkspace: (args) => createWorkspace(args),
    runTask: (args) => runLocallyApprovedCraneTask(args),
    getTaskStatus,
    releaseTaskControl: releaseLocallyManagedCraneTask,
    registerWorkspaceIssues: async ({ workspaceId, crane, jira }) => {
      await addWorkspaceCraneIssue({
        workspaceId,
        url: crane.url,
        issueKey: crane.issueKey,
        title: crane.title,
      });
      if (jira) {
        await addWorkspaceJiraIssue({
          workspaceId,
          url: jira.url,
          issueKey: jira.issueKey,
        });
      }
    },
    emitStatus: (status) => sendToRenderer(STATUS_EVENT, status),
    emitApproval: (request) => sendToRenderer(APPROVAL_EVENT, request),
    emitJobUpdate: (update) => {
      sendToRenderer(JOB_UPDATE_EVENT, update);
      forwardJobUpdateToTracker(update);
    },
  });
  return runtime;
}

export function getCraneConnectorStatus() {
  return getCraneConnectorRuntime().getStatus();
}

export function getCraneTasksEnabled() {
  return getCraneConnectorRuntime().getTasksEnabled();
}

export function configureCraneConnector(input: CraneConnectorConfigInput) {
  return getCraneConnectorRuntime().configure(input);
}

export function pairCraneConnector(input: CraneConnectorPairInput) {
  return getCraneConnectorRuntime().pair(input);
}

export function disconnectCraneConnector() {
  return getCraneConnectorRuntime().disconnect();
}

export function approveCraneDispatch(input: CraneDispatchApprovalResponse) {
  return getCraneConnectorRuntime().approve(input);
}

export function prepareCraneTaskTakeover(input: {
  workspaceId: string;
  taskId: string;
}) {
  return getCraneConnectorRuntime().prepareTaskTakeover(input);
}

export function declineCraneDispatch(jobId: string) {
  return getCraneConnectorRuntime().decline(jobId);
}

export function stopCraneConnectorRuntime() {
  runtime?.shutdown();
}

export function resetCraneConnectorRuntimeForTests() {
  runtime?.shutdown();
  runtime = null;
}
