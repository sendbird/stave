import { tmpdir } from "node:os";
import path from "node:path";
import { SqliteStore } from "../persistence/sqlite-store";

let sqliteStore: SqliteStore | null = null;

export function resolveHostServiceUserDataPath(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuredPath = env.STAVE_USER_DATA_PATH?.trim();
  if (configuredPath) {
    return path.resolve(configuredPath);
  }
  return path.join(tmpdir(), "stave-host-service");
}

export function ensureHostServicePersistenceReady(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (sqliteStore) {
    return sqliteStore;
  }

  sqliteStore = new SqliteStore({
    dbPath: path.join(resolveHostServiceUserDataPath(env), "stave.sqlite"),
  });
  return sqliteStore;
}

export function resetHostServicePersistence() {
  sqliteStore?.close();
  sqliteStore = null;
}
