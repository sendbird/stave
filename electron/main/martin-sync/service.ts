import { app } from "electron";

import type {
  StaveSyncEventV1,
  StaveSyncLinkV1,
} from "../../../src/lib/martin-sync/contract";
import type { MartinSyncSettings } from "../../../src/lib/martin-sync/types";
import { buildMartinSyncLinks } from "../../../src/lib/martin-sync/links";
import { onHostServiceEvent } from "../host-service-client";
import {
  getWorkspaceInformation,
  setWorkspaceMartinProject,
} from "../stave-mcp-service";
import { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import { getAtelierConnectorCredentialVault } from "../atelier-connector/credential-service";
import { ensurePersistenceReadySync } from "../state";
import { getMainWindow } from "../window";
import { MartinSyncRuntime, type MartinSyncPublicStatus } from "./runtime";

const STATUS_EVENT = "martin-sync:status";
const MAPPING_STALE_EVENT = "martin-sync:mapping-stale";

let runtime: MartinSyncRuntime | null = null;
let stopWorkspaceInformationSubscription: (() => void) | null = null;
const linksFingerprintByWorkspace = new Map<string, string>();

function sendToRenderer(channel: string, payload: unknown) {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) return;
  renderer.send(channel, payload);
}

async function markWorkspaceMappingStale(args: {
  workspaceId: string;
  projectRef: string;
}) {
  const result = await getWorkspaceInformation({
    workspaceId: args.workspaceId,
  });
  const project = result.workspaceInformation.martinProject;
  if (!project || project.ref !== args.projectRef || project.stale) return;
  await setWorkspaceMartinProject({
    workspaceId: args.workspaceId,
    project: { ...project, stale: true },
  });
}

function ensureWorkspaceInformationSubscription() {
  if (stopWorkspaceInformationSubscription) return;
  stopWorkspaceInformationSubscription = onHostServiceEvent(
    "local-mcp.workspace-information-updated",
    (payload) => {
      // Host-service listeners run synchronously inside the stdout frame loop,
      // so anything thrown here would abort the remaining frames and every
      // listener registered after this one. Sync work must never escape.
      try {
        const project = payload.workspaceInformation.martinProject;
        const settings = getMartinSyncRuntime().getSettings();
        if (
          !project ||
          project.stale ||
          !settings.enabled ||
          !settings.resourceLinks
        ) {
          linksFingerprintByWorkspace.delete(payload.workspaceId);
          return;
        }
        const links = buildMartinSyncLinks(payload.workspaceInformation);
        const fingerprint = JSON.stringify({ projectRef: project.ref, links });
        if (
          linksFingerprintByWorkspace.get(payload.workspaceId) === fingerprint
        ) {
          return;
        }
        linksFingerprintByWorkspace.set(payload.workspaceId, fingerprint);
        getMartinSyncRuntime().noteLinksChanged({
          workspaceId: payload.workspaceId,
          projectRef: project.ref,
          links,
        });
      } catch (error) {
        linksFingerprintByWorkspace.delete(payload.workspaceId);
        console.error(
          "[martin-sync] failed to queue a resource link merge",
          error,
        );
      }
    },
  );
}

export function getMartinSyncCredential() {
  return getAtelierConnectorCredentialVault().getCredential();
}

/** Single place that decides whether insecure localhost URLs are allowed. */
export function createMartinHttpClient(baseUrl: string) {
  return new AtelierConnectorHttpClient({
    baseUrl,
    allowInsecureLocalhost: process.env.STAVE_DEV === "1" && !app.isPackaged,
  });
}

export function getMartinSyncRuntime() {
  if (runtime) return runtime;
  const vault = getAtelierConnectorCredentialVault();
  runtime = new MartinSyncRuntime({
    persistence: ensurePersistenceReadySync(),
    getCredential: () => vault.getCredential(),
    createHttpClient: createMartinHttpClient,
    emitStatus: (status) => sendToRenderer(STATUS_EVENT, status),
    emitMappingStale: (payload) => {
      sendToRenderer(MAPPING_STALE_EVENT, payload);
      void markWorkspaceMappingStale(payload).catch((error) => {
        console.error(
          "[martin-sync] failed to mark a stale workspace mapping",
          error,
        );
      });
    },
  });
  ensureWorkspaceInformationSubscription();
  return runtime;
}

export function configureMartinSync(
  settings: MartinSyncSettings,
): MartinSyncPublicStatus {
  return getMartinSyncRuntime().configure(settings);
}

export function getMartinSyncStatus(): MartinSyncPublicStatus {
  return getMartinSyncRuntime().getStatus();
}

export function enqueueMartinSyncEvent(args: {
  workspaceId: string;
  projectRef: string;
  event: StaveSyncEventV1;
}): void {
  getMartinSyncRuntime().enqueueEvent(args);
}

export function noteMartinWorkspaceLinksChanged(args: {
  workspaceId: string;
  projectRef: string;
  links: StaveSyncLinkV1[];
}): void {
  getMartinSyncRuntime().noteLinksChanged(args);
}

export function retryFailedMartinSync(): MartinSyncPublicStatus {
  const syncRuntime = getMartinSyncRuntime();
  syncRuntime.retryFailed();
  return syncRuntime.getStatus();
}

export function stopMartinSyncRuntime(): void {
  runtime?.shutdown();
}

export function resetMartinSyncRuntimeForTests(): void {
  runtime?.shutdown();
  runtime = null;
  stopWorkspaceInformationSubscription?.();
  stopWorkspaceInformationSubscription = null;
  linksFingerprintByWorkspace.clear();
}
