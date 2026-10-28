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

test("browser Undo preserves a replacement deadline and clears only the expected snooze", async () => {
  const first = futureDeadline();
  const replacement = futureDeadline(120_000);
  await snoozeFleetAttention({ attentionId: "a", workspaceId: "workspace", snoozedUntil: first });
  await snoozeFleetAttention({ attentionId: "b", workspaceId: "workspace", snoozedUntil: first });
  await snoozeFleetAttention({ attentionId: "b", workspaceId: "workspace", snoozedUntil: replacement });
  expect(await clearFleetAttentionSnoozes({ attentionIds: ["a", "b"], expectedSnoozedUntil: first })).toBe(1);
  expect(await listFleetAttentionSnoozes()).toMatchObject([{ attentionId: "b", snoozedUntil: replacement }]);
  expect(await clearFleetAttentionSnoozes({ attentionIds: ["b"], expectedSnoozedUntil: first })).toBe(0);
  expect(await clearFleetAttentionSnoozes({ attentionIds: ["b"], expectedSnoozedUntil: replacement })).toBe(1);
  expect(await listFleetAttentionSnoozes()).toEqual([]);
});

test("guarded clear forwards its deadline to desktop and rejects an invalid timestamp before writing", async () => {
  const calls: unknown[] = [];
  Object.assign(window, { api: { persistence: { clearFleetAttentionSnoozes: async (args: unknown) => {
    calls.push(args);
    return { ok: true, cleared: 0 };
  } } } });
  const args = { attentionIds: ["a"], expectedSnoozedUntil: futureDeadline() };
  expect(await clearFleetAttentionSnoozes(args)).toBe(0);
  expect(calls).toEqual([args]);
  await expect(clearFleetAttentionSnoozes({ attentionIds: ["a"], expectedSnoozedUntil: "invalid" })).rejects.toThrow();
  expect(calls).toHaveLength(1);
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
