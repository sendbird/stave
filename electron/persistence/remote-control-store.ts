import {
  REMOTE_CONTROL_MAX_AUDIT,
  REMOTE_CONTROL_MAX_DEVICES,
  RemoteAuditSchema,
  RemoteConfigSchema,
  RemoteDeviceSchema,
  type RemoteAudit,
  type RemoteConfig,
} from "../../src/lib/remote-control";

interface RemoteControlDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  transaction<T>(operation: () => T): () => T;
}

export interface RemoteControlStoredDevice {
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  lastSeen: number;
}

export interface RemoteControlStoredState {
  devices: RemoteControlStoredDevice[];
  audit: RemoteAudit[];
}

const CONFIG_KEY = "remote_control_config";

/**
 * Paired remote-control devices and the recent remote action log.
 *
 * Devices keep only a SHA-256 digest of their bearer token. The audit log keeps
 * the last 100 entries and holds request identities and outcomes, never codes,
 * tokens or answer text (the server strips answers before an entry exists, and
 * `RemoteAuditSchema` is strict, so an answer field cannot be written here).
 * The listener configuration lives in `app_state` so the main process can
 * restore it at launch without the renderer.
 */
export class RemoteControlStore {
  constructor(private readonly db: RemoteControlDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS remote_control_devices (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS remote_control_audit (
        id TEXT NOT NULL PRIMARY KEY,
        time INTEGER NOT NULL,
        entry_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_remote_control_audit_time
        ON remote_control_audit(time);
    `);
  }

  load(): RemoteControlStoredState {
    const devices = (
      this.db
        .prepare(
          `SELECT id, name, token_hash AS hash, created_at AS createdAt, last_seen AS lastSeen
           FROM remote_control_devices ORDER BY created_at ASC, id ASC LIMIT ?`,
        )
        .all(REMOTE_CONTROL_MAX_DEVICES) as RemoteControlStoredDevice[]
    ).filter(
      // A row that no longer satisfies the device contract cannot authenticate.
      ({ hash, ...device }) => /^[a-f0-9]{64}$/.test(hash) && RemoteDeviceSchema.safeParse(device).success,
    );
    const rows = this.db
      .prepare(
        `SELECT entry_json AS json FROM (
           SELECT entry_json, time, rowid FROM remote_control_audit ORDER BY time DESC, rowid DESC LIMIT ?
         ) ORDER BY time ASC, rowid ASC`,
      )
      .all(REMOTE_CONTROL_MAX_AUDIT) as Array<{ json: string }>;
    const audit: RemoteAudit[] = [];
    for (const row of rows) {
      try {
        const parsed = RemoteAuditSchema.safeParse(JSON.parse(row.json));
        if (parsed.success) audit.push(parsed.data);
      } catch {
        // An unreadable entry is dropped rather than blocking the rest.
      }
    }
    return { devices, audit };
  }

  /** Replace devices and audit with the server's current state in one write. */
  replace(state: RemoteControlStoredState) {
    const audit = state.audit.slice(-REMOTE_CONTROL_MAX_AUDIT).map((entry) => RemoteAuditSchema.parse(entry));
    const devices = state.devices.slice(0, REMOTE_CONTROL_MAX_DEVICES);
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM remote_control_devices").run();
      const insertDevice = this.db.prepare(
        `INSERT INTO remote_control_devices (id, name, token_hash, created_at, last_seen)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const device of devices) {
        insertDevice.run(device.id, device.name, device.hash, device.createdAt, device.lastSeen);
      }
      this.db.prepare("DELETE FROM remote_control_audit").run();
      const insertAudit = this.db.prepare(
        "INSERT INTO remote_control_audit (id, time, entry_json) VALUES (?, ?, ?)",
      );
      for (const entry of audit) {
        insertAudit.run(entry.id, entry.time, JSON.stringify(entry));
      }
    })();
  }

  loadConfig(): RemoteConfig {
    const row = this.db.prepare("SELECT value_json AS json FROM app_state WHERE key = ?").get(CONFIG_KEY) as
      | { json: string }
      | undefined;
    if (row) {
      try {
        const parsed = RemoteConfigSchema.safeParse(JSON.parse(row.json));
        if (parsed.success) return parsed.data;
      } catch {
        // Fall through to the disabled default.
      }
    }
    return RemoteConfigSchema.parse({ enabled: false });
  }

  saveConfig(config: RemoteConfig) {
    const value = RemoteConfigSchema.parse(config);
    this.db
      .prepare(
        `INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(CONFIG_KEY, JSON.stringify(value), new Date().toISOString());
  }
}
