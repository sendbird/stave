import { ipcMain } from "electron";
import {
  API_CONNECTION_IPC,
  ApiConnectionCreateArgsSchema,
  ApiConnectionIdArgsSchema,
  ApiConnectionUpdateArgsSchema,
} from "../../../src/lib/providers/api-connections";
import { getProviderAccountRegistry } from "../../provider-accounts/registry";
import { revealSecret } from "../browser/secret-service";
import { checkStoredApiConnection, discoverApiConnectionModels } from "../api-connection-check";

function failure(error: unknown, fallback: string) {
  return { ok: false as const, message: error instanceof Error ? error.message : fallback };
}

export function registerApiConnectionHandlers() {
  // temporary-migration: claude-gateway-api-connections
  try {
    const migrated = getProviderAccountRegistry().persistMigrations();
    if (migrated > 0) console.info(`[api-connections] moved ${migrated} Claude gateway account(s) to API connections`);
  } catch {
    console.warn("[api-connections] gateway account migration deferred; storage is read compatibly until it succeeds");
  }
  // end temporary-migration: claude-gateway-api-connections
  ipcMain.handle(API_CONNECTION_IPC.list, () => {
    try { return { ok: true, connections: getProviderAccountRegistry().listApiConnections() }; }
    catch (error) { return { ...failure(error, "API connections could not be read."), connections: [] }; }
  });
  ipcMain.handle(API_CONNECTION_IPC.create, (_event, input: unknown) => {
    const parsed = ApiConnectionCreateArgsSchema.safeParse(input);
    if (!parsed.success) return failure(null, "Invalid API connection details.");
    try { return { ok: true, connection: getProviderAccountRegistry().createApiConnection(parsed.data) }; }
    catch (error) { return failure(error, "The API connection could not be saved."); }
  });
  ipcMain.handle(API_CONNECTION_IPC.update, (_event, input: unknown) => {
    const parsed = ApiConnectionUpdateArgsSchema.safeParse(input);
    if (!parsed.success) return failure(null, "Invalid API connection details.");
    try { return { ok: true, connection: getProviderAccountRegistry().updateApiConnection(parsed.data) }; }
    catch (error) { return failure(error, "The API connection could not be saved."); }
  });
  ipcMain.handle(API_CONNECTION_IPC.remove, (_event, input: unknown) => {
    const parsed = ApiConnectionIdArgsSchema.safeParse(input);
    if (!parsed.success) return failure(null, "Invalid API connection id.");
    try { getProviderAccountRegistry().removeApiConnection(parsed.data.id); return { ok: true }; }
    catch (error) { return failure(error, "The API connection could not be removed."); }
  });
  ipcMain.handle(API_CONNECTION_IPC.check, async (_event, input: unknown) => {
    const parsed = ApiConnectionIdArgsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, status: "unexpected", missingModels: [], message: "Invalid API connection id." };
    return checkStoredApiConnection(parsed.data.id, revealSecret);
  });
  ipcMain.handle(API_CONNECTION_IPC.discoverModels, () => discoverApiConnectionModels());
}
