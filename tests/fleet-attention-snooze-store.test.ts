import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { FleetAttentionSnoozeStore } from "../electron/persistence/fleet-attention-snooze-store";

let db: Database;
let store: FleetAttentionSnoozeStore;

const PAST = "2026-09-05T00:00:00.000Z";
const SOON = "2026-09-07T01:00:00.000Z";
const LATER = "2026-09-07T09:00:00.000Z";
const NOW = "2026-09-07T00:00:00.000Z";

beforeEach(() => {
  db = new Database(":memory:");
  store = new FleetAttentionSnoozeStore(db);
});
afterEach(() => db.close());

describe("fleet attention snooze store", () => {
  test("keeps an unexpired snooze and retires an expired one on read", () => {
    store.snooze({
      attentionId: "turn:result-ready:workspace-1:task-1:turn-1",
      workspaceId: "workspace-1",
      snoozedUntil: SOON,
    });
    store.snooze({
      attentionId: "pr:pr-ready-to-merge:workspace-2",
      workspaceId: "workspace-2",
      snoozedUntil: PAST,
    });

    expect(store.list({ now: NOW }).map((row) => row.attentionId)).toEqual([
      "turn:result-ready:workspace-1:task-1:turn-1",
    ]);
    // The expired row is gone for good, not merely filtered out of one read.
    expect(
      (
        db
          .prepare("SELECT count(*) AS count FROM fleet_attention_snoozes")
          .get() as { count: number }
      ).count,
    ).toBe(1);
  });

  test("re-snoozing replaces the deadline instead of extending it", () => {
    store.snooze({
      attentionId: "pr:pr-behind-base:workspace-1",
      workspaceId: "workspace-1",
      snoozedUntil: LATER,
    });
    store.snooze({
      attentionId: "pr:pr-behind-base:workspace-1",
      workspaceId: "workspace-1",
      snoozedUntil: SOON,
    });

    const rows = store.list({ now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.snoozedUntil).toBe(SOON);
  });

  test("clears by attention id, by workspace, and wholesale", () => {
    const seed = () => {
      store.clear();
      store.snooze({
        attentionId: "a",
        workspaceId: "workspace-1",
        snoozedUntil: LATER,
      });
      store.snooze({
        attentionId: "b",
        workspaceId: "workspace-1",
        snoozedUntil: LATER,
      });
      store.snooze({
        attentionId: "c",
        workspaceId: "workspace-2",
        snoozedUntil: LATER,
      });
    };

    seed();
    expect(store.clear({ attentionIds: ["a", "missing"] })).toBe(1);
    expect(store.list({ now: NOW }).map((row) => row.attentionId)).toEqual([
      "b",
      "c",
    ]);

    seed();
    expect(store.clear({ workspaceIds: ["workspace-1"] })).toBe(2);
    expect(store.list({ now: NOW }).map((row) => row.attentionId)).toEqual([
      "c",
    ]);

    seed();
    expect(store.clear()).toBe(3);
    expect(store.list({ now: NOW })).toEqual([]);
  });

  test("an empty id list clears nothing rather than everything", () => {
    store.snooze({
      attentionId: "a",
      workspaceId: "workspace-1",
      snoozedUntil: LATER,
    });
    expect(store.clear({ attentionIds: [] })).toBe(0);
    expect(store.list({ now: NOW })).toHaveLength(1);
  });
});
