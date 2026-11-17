import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RemoteControlStore } from "../electron/persistence/remote-control-store";
import type { RemoteAudit } from "../src/lib/remote-control";

let db: Database;
let store: RemoteControlStore;

const DEVICE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Phone",
  hash: "a".repeat(64),
  createdAt: 1_000,
  lastSeen: 2_000,
};

function audit(index: number): RemoteAudit {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    deviceId: DEVICE.id,
    deviceName: DEVICE.name,
    time: 10_000 + index,
    action: { kind: "question", workspaceId: "w", taskId: "t", turnId: null, requestId: `q${index}`, messageId: "m" },
    result: { ok: true, reason: "applied" },
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  // The app store creates `app_state` before its sub-stores.
  db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  store = new RemoteControlStore(db);
});
afterEach(() => db.close());

describe("remote control store", () => {
  test("starts empty and disabled", () => {
    expect(store.load()).toEqual({ devices: [], audit: [] });
    expect(store.loadConfig()).toEqual({ enabled: false, address: "127.0.0.1", port: 6500, confirmNetwork: false });
  });

  test("keeps devices with token digests only and the last 100 audit entries in order", () => {
    store.replace({ devices: [DEVICE], audit: Array.from({ length: 105 }, (_, index) => audit(index)) });
    const loaded = store.load();
    expect(loaded.devices).toEqual([DEVICE]);
    expect(loaded.audit).toHaveLength(100);
    expect(loaded.audit[0]?.action).toMatchObject({ requestId: "q5" });
    expect(loaded.audit.at(-1)?.action).toMatchObject({ requestId: "q104" });
    // Revoke all.
    store.replace({ devices: [], audit: loaded.audit });
    expect(store.load().devices).toEqual([]);
  });

  test("an audit entry carrying answer text cannot be written", () => {
    const withAnswers = { ...audit(1), action: { ...audit(1).action, answers: { key: "secret answer" } } } as unknown as RemoteAudit;
    expect(() => store.replace({ devices: [], audit: [withAnswers] })).toThrow();
    expect(JSON.stringify(db.prepare("SELECT * FROM remote_control_audit").all())).not.toContain("secret answer");
  });

  test("an unreadable device row cannot authenticate", () => {
    db.prepare("INSERT INTO remote_control_devices VALUES (?, ?, ?, ?, ?)").run("not-a-uuid", "Phone", "b".repeat(64), 1, 1);
    db.prepare("INSERT INTO remote_control_devices VALUES (?, ?, ?, ?, ?)").run(DEVICE.id, "Phone", "short", 1, 1);
    expect(store.load().devices).toEqual([]);
  });

  test("round-trips the listener configuration, falling back to off when unreadable", () => {
    store.saveConfig({ enabled: true, address: "192.168.1.20", port: 6510, confirmNetwork: true });
    expect(store.loadConfig()).toEqual({ enabled: true, address: "192.168.1.20", port: 6510, confirmNetwork: true });
    db.prepare("UPDATE app_state SET value_json = ? WHERE key = 'remote_control_config'").run('{"enabled":true,"port":1}');
    expect(store.loadConfig().enabled).toBe(false);
  });
});
