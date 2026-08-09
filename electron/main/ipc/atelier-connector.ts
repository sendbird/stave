import { app, ipcMain } from "electron";

import type {
  AtelierConnectorPairInput,
  AtelierConnectorPublicStatus,
} from "../../../src/lib/atelier-connector/types";
import { getAtelierConnectorCredentialVault } from "../atelier-connector/credential-service";
import {
  AtelierConnectorHttpClient,
  AtelierConnectorHttpError,
} from "../atelier-connector/http-client";
import { getHirondelleSyncRuntime } from "../hirondelle-sync/service";
import { AtelierConnectorPairArgsSchema } from "./schemas";

function connectorErrorCode(error: unknown) {
  return error instanceof AtelierConnectorHttpError
    ? error.code
    : "connector_error";
}

function safeConnectorErrorMessage(error: unknown) {
  if (error instanceof AtelierConnectorHttpError) {
    switch (error.code) {
      case "invalid_pairing_code":
        return "The pairing code is invalid or expired.";
      case "unauthorized":
      case "forbidden":
        return "Atelier rejected this connector. Pair it again.";
      case "network_unavailable":
        return "Atelier is currently unreachable.";
      default:
        return `Atelier connector request failed (${error.code}).`;
    }
  }
  if (
    error instanceof Error &&
    error.message.includes("OS credential encryption")
  ) {
    return error.message;
  }
  return "The Atelier connector operation failed.";
}

export async function getAtelierConnectorStatus(
  lastErrorCode: string | null = null,
): Promise<AtelierConnectorPublicStatus> {
  const vault = getAtelierConnectorCredentialVault();
  if (!vault.isSecureStorageAvailable()) {
    return {
      paired: false,
      connector: null,
      scopes: [],
      secureStorageAvailable: false,
      lastErrorCode: lastErrorCode ?? "secure_storage_unavailable",
    };
  }
  try {
    const credential = await vault.getMetadata();
    return {
      paired: credential !== null,
      connector: credential?.connector ?? null,
      scopes: credential?.scopes ?? [],
      secureStorageAvailable: true,
      lastErrorCode,
    };
  } catch {
    return {
      paired: false,
      connector: null,
      scopes: [],
      secureStorageAvailable: true,
      lastErrorCode: lastErrorCode ?? "credential_unavailable",
    };
  }
}

async function pairAtelierConnector(
  pairing: AtelierConnectorPairInput,
): Promise<AtelierConnectorPublicStatus> {
  const vault = getAtelierConnectorCredentialVault();
  if (!vault.isSecureStorageAvailable()) {
    throw new Error(
      "OS credential encryption is unavailable. Unlock the system credential store and retry.",
    );
  }
  const client = new AtelierConnectorHttpClient({
    baseUrl: pairing.baseUrl,
    allowInsecureLocalhost:
      process.env.STAVE_DEV === "1" && !app.isPackaged,
  });
  const exchanged = await client.exchangePairingCode({
    code: pairing.code,
    name: pairing.name,
    appVersion: app.getVersion(),
    requestedScopes: pairing.requestedScopes,
  });
  await vault.saveCredential({
    baseUrl: pairing.baseUrl,
    connector: exchanged.connector,
    scopes: exchanged.scopes,
    secret: exchanged.secret,
  });
  const syncRuntime = getHirondelleSyncRuntime();
  syncRuntime.configure(syncRuntime.getSettings());
  return getAtelierConnectorStatus();
}

export function registerAtelierConnectorHandlers() {
  ipcMain.handle("atelier-connector:get-status", async () => ({
    ok: true,
    status: await getAtelierConnectorStatus(),
  }));

  ipcMain.handle(
    "atelier-connector:pair",
    async (_event, args: unknown) => {
      const parsed = AtelierConnectorPairArgsSchema.safeParse(args);
      if (!parsed.success) {
        return {
          ok: false,
          status: await getAtelierConnectorStatus(),
          message: "Invalid Atelier pairing request.",
        };
      }
      try {
        return {
          ok: true,
          status: await pairAtelierConnector(parsed.data),
        };
      } catch (error) {
        return {
          ok: false,
          status: await getAtelierConnectorStatus(
            connectorErrorCode(error),
          ),
          message: safeConnectorErrorMessage(error),
        };
      }
    },
  );
}
