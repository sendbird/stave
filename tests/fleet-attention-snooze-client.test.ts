import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  clearFleetAttentionSnoozes,
  invalidateFleetAttentionSnoozes,
  listFleetAttentionSnoozes,
  snoozeFleetAttention,
} from "../src/lib/fleet/attention-snooze-client";

const originalWindow = globalThis.window;
const STORAGE_KEY = "stave:fleet-attention-snoozes:v1";

function futureDeadline(offsetMs = 60_000) {
  return new Date(Date.now() + offsetMs).toISOString();
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    window: {
      api: undefined,
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    },
  });
  invalidateFleetAttentionSnoozes();
});
afterEach(() => {
  Object.assign(globalThis, { window: originalWindow });
  invalidateFleetAttentionSnoozes();
});

test("browser snoozes round-trip, drop on expiry, and restore by id", async () => {
  await snoozeFleetAttention({
    attentionId: "turn:result-ready:workspace:task:turn",
    workspaceId: "workspace",
    snoozedUntil: futureDeadline(),
  });
  await snoozeFleetAttention({
    attentionId: "pr:pr-ready-to-merge:workspace",
    workspaceId: "workspace",
    snoozedUntil: new Date(Date.now() - 1_000).toISOString(),
  });

  // The expired row never comes back out, so it can never hide anything.
  expect((await listFleetAttentionSnoozes()).map((row) => row.attentionId)).toEqual([
    "turn:result-ready:workspace:task:turn",
  ]);

  expect(
    await clearFleetAttentionSnoozes({
      attentionIds: ["turn:result-ready:workspace:task:turn"],
    }),
  ).toBe(1);
  expect(await listFleetAttentionSnoozes()).toEqual([]);
});

test("a failed desktop write never falls back to browser storage", async () => {
  await snoozeFleetAttention({
    attentionId: "a",
    workspaceId: "workspace",
    snoozedUntil: futureDeadline(),
  });
  const saved = window.localStorage.getItem(STORAGE_KEY);
  Object.assign(window, {
    api: {
      persistence: {
        snoozeFleetAttention: async () => ({ ok: false, snooze: null }),
      },
    },
  });

  await expect(
    snoozeFleetAttention({
      attentionId: "b",
      workspaceId: "workspace",
      snoozedUntil: futureDeadline(),
    }),
  ).rejects.toThrow("Snooze was not saved");
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe(saved);
  // A desktop bridge without the channel must report the gap, not hide rows.
  await expect(listFleetAttentionSnoozes()).rejects.toThrow(
    "storage is unavailable",
  );
});

test("a deadline in the past is rejected as unparseable input, not stored", async () => {
  await expect(
    snoozeFleetAttention({
      attentionId: "a",
      workspaceId: "workspace",
      snoozedUntil: "not a date",
    }),
  ).rejects.toThrow();
  expect(await listFleetAttentionSnoozes()).toEqual([]);
});
