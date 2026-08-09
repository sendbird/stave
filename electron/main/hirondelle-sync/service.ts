import { app } from "electron";

import type {
  StaveSyncEventV1,
  StaveSyncLinkV1,
} from "../../../src/lib/hirondelle-sync/contract";
import type { HirondelleSyncSettings } from "../../../src/lib/hirondelle-sync/types";
import { AtelierConnectorHttpClient } from "../atelier-connector/http-client";
import { getAtelierConnectorCredentialVault } from "../atelier-connector/credential-service";
import { ensurePersistenceReadySync } from "../state";
import { getMainWindow } from "../window";
import {
  HirondelleSyncRuntime,
  type HirondelleSyncPublicStatus,
} from "./runtime";

const STATUS_EVENT = "hirondelle-sync:status";
const MAPPING_STALE_EVENT = "hirondelle-sync:mapping-stale";

let runtime: HirondelleSyncRuntime | null = null;

function sendToRenderer(channel: string, payload: unknown) {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) return;
  renderer.send(channel, payload);
}

export function getHirondelleSyncRuntime() {
  if (runtime) return runtime;
  const allowInsecureLocalhost =
    process.env.STAVE_DEV === "1" && !app.isPackaged;
  const vault = getAtelierConnectorCredentialVault();
  runtime = new HirondelleSyncRuntime({
    persistence: ensurePersistenceReadySync(),
    getCredential: () => vault.getCredential(),
    createHttpClient: (baseUrl) =>
      new AtelierConnectorHttpClient({
        baseUrl,
        allowInsecureLocalhost,
      }),
    emitStatus: (status) => sendToRenderer(STATUS_EVENT, status),
    emitMappingStale: (payload) =>
      sendToRenderer(MAPPING_STALE_EVENT, payload),
  });
  return runtime;
}

export function configureHirondelleSync(
  settings: HirondelleSyncSettings,
): HirondelleSyncPublicStatus {
  return getHirondelleSyncRuntime().configure(settings);
}

export function getHirondelleSyncStatus(): HirondelleSyncPublicStatus {
  return getHirondelleSyncRuntime().getStatus();
}

export function enqueueHirondelleSyncEvent(args: {
  workspaceId: string;
  projectRef: string;
  event: StaveSyncEventV1;
}): void {
  getHirondelleSyncRuntime().enqueueEvent(args);
}

export function noteHirondelleWorkspaceLinksChanged(args: {
  workspaceId: string;
  projectRef: string;
  links: StaveSyncLinkV1[];
}): void {
  getHirondelleSyncRuntime().noteLinksChanged(args);
}

export function retryFailedHirondelleSync(): HirondelleSyncPublicStatus {
  const syncRuntime = getHirondelleSyncRuntime();
  syncRuntime.retryFailed();
  return syncRuntime.getStatus();
}

export function stopHirondelleSyncRuntime(): void {
  runtime?.shutdown();
}

export function resetHirondelleSyncRuntimeForTests(): void {
  runtime?.shutdown();
  runtime = null;
}
