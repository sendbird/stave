import { describe, expect, test } from "bun:test";
import {
  findAutoSettleReason,
  normalizeWorkspaceSettleAfterDays,
  normalizeWorkspaceSettlementMap,
  noteWorkspaceMessage,
  resolveWorkspaceSettlement,
  resolveWorkspaceSnoozeUntil,
  settleWorkspaceRecord,
  snoozeWorkspaceRecord,
  unsettleWorkspaceRecord,
  type WorkspaceSettlementRecord,
  type WorkspaceSettlementSignals,
} from "@/lib/fleet/workspace-settlement";
import { buildSidebarWorkQueueSections } from "@/lib/fleet/sidebar-work-queue";
import { createWorkspaceSettlementActions } from "@/store/app-store-workspace-settlement-actions";
import type { AppState } from "@/store/app-store.types";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const iso = (offsetHours: number) => new Date(NOW + offsetHours * 3_600_000).toISOString();
const DAY = 24;

const idle: WorkspaceSettlementSignals = {
  lane: "idle",
  isActive: false,
  isDefault: false,
  pullRequest: null,
  lastOpenedAt: iso(-1),
};
const rules = { settleOnMerge: true, settleAfterDays: 7 };

describe("where a workspace shows", () => {
  test("anything that needs the user or is running stays in its lane, settled or not", () => {
    const record = settleWorkspaceRecord(undefined, "manual", iso(-2));
    for (const lane of ["action-required", "in-progress"] as const) {
      expect(resolveWorkspaceSettlement({ record, signals: { ...idle, lane }, nowMs: NOW })).toEqual({ state: "active" });
    }
    expect(resolveWorkspaceSettlement({ record, signals: idle, nowMs: NOW })).toMatchObject({
      state: "settled",
      reason: "manual",
    });
  });

  test("new activity brings a settled workspace back; a visit does not", () => {
    const record = settleWorkspaceRecord(undefined, "merged", iso(-2));
    const visited = { ...idle, lastOpenedAt: iso(-1) };
    expect(resolveWorkspaceSettlement({ record, signals: visited, nowMs: NOW }).state).toBe("settled");
    for (const signals of [
      { ...idle, lastTaskActivityAt: iso(-1) },
      { ...idle, lastResultAt: iso(-1) },
    ]) {
      expect(resolveWorkspaceSettlement({ record, signals, nowMs: NOW }).state).toBe("active");
    }
    const messaged = noteWorkspaceMessage({ w: record }, "w", iso(-1)).w;
    expect(resolveWorkspaceSettlement({ record: messaged, signals: idle, nowMs: NOW }).state).toBe("active");
  });

  test("a snooze hides until its time, or until something happens first", () => {
    const record = snoozeWorkspaceRecord(undefined, iso(3), iso(-1));
    expect(resolveWorkspaceSettlement({ record, signals: idle, nowMs: NOW })).toEqual({ state: "snoozed", until: iso(3) });
    expect(resolveWorkspaceSettlement({ record, signals: idle, nowMs: NOW + 4 * 3_600_000 }).state).toBe("active");
    expect(
      resolveWorkspaceSettlement({ record, signals: { ...idle, lastTaskActivityAt: iso(-0.5) }, nowMs: NOW }).state,
    ).toBe("active");
  });
});

describe("automatic settling", () => {
  const merged = (mergedAt: string) => ({ state: "MERGED" as const, mergedAt });

  test("settles when the PR merged after the user's last message", () => {
    const record: WorkspaceSettlementRecord = { lastMessageAt: iso(-5) };
    expect(
      findAutoSettleReason({ record, signals: { ...idle, pullRequest: merged(iso(-2)) }, rules, nowMs: NOW }),
    ).toBe("merged");
  });

  test("leaves a workspace the user kept working in after the merge", () => {
    const record: WorkspaceSettlementRecord = { lastMessageAt: iso(-1) };
    expect(
      findAutoSettleReason({ record, signals: { ...idle, pullRequest: merged(iso(-2)) }, rules, nowMs: NOW }),
    ).toBeNull();
    // Bringing it back after the merge counts the same way.
    expect(
      findAutoSettleReason({
        record: { unsettledAt: iso(-1) },
        signals: { ...idle, pullRequest: merged(iso(-2)) },
        rules,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  test("settles after the inactivity window, which a visit restarts", () => {
    expect(
      findAutoSettleReason({ signals: { ...idle, lastOpenedAt: iso(-8 * DAY) }, rules, nowMs: NOW }),
    ).toBe("inactive");
    expect(
      findAutoSettleReason({ signals: { ...idle, lastOpenedAt: iso(-6 * DAY) }, rules, nowMs: NOW }),
    ).toBeNull();
    expect(
      findAutoSettleReason({
        signals: { ...idle, lastOpenedAt: iso(-8 * DAY) },
        rules: { settleOnMerge: true, settleAfterDays: null },
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  test("never settles the current, default, opted-out, pending, or open-PR workspace", () => {
    const stale = { ...idle, lastOpenedAt: iso(-30 * DAY), pullRequest: merged(iso(-29 * DAY)) };
    const blocked: Array<{ record?: WorkspaceSettlementRecord; signals: WorkspaceSettlementSignals }> = [
      { signals: { ...stale, isActive: true } },
      { signals: { ...stale, isDefault: true } },
      { record: { autoSettleDisabled: true }, signals: stale },
      { signals: { ...stale, lane: "in-review" } },
      { signals: { ...stale, pullRequest: { state: "OPEN", mergedAt: null } } },
    ];
    for (const { record, signals } of blocked) {
      expect(findAutoSettleReason({ record, signals, rules, nowMs: NOW })).toBeNull();
    }
  });

  test("without any known activity, only a merge can settle", () => {
    const unknown = { ...idle, lastOpenedAt: null };
    expect(findAutoSettleReason({ signals: unknown, rules, nowMs: NOW })).toBeNull();
    expect(
      findAutoSettleReason({ signals: { ...unknown, pullRequest: merged(iso(-1)) }, rules, nowMs: NOW }),
    ).toBe("merged");
  });
});

describe("record changes", () => {
  test("settle, snooze and bring back replace each other and keep the rest", () => {
    const base: WorkspaceSettlementRecord = { lastMessageAt: iso(-3), autoSettleDisabled: true };
    const snoozed = snoozeWorkspaceRecord(base, iso(5), iso(0));
    const settled = settleWorkspaceRecord(snoozed, "manual", iso(1));
    expect(settled).toEqual({ ...base, settledAt: iso(1), settledReason: "manual" });
    expect(unsettleWorkspaceRecord(settled, iso(2))).toEqual({ ...base, unsettledAt: iso(2) });
  });

  test("the persisted map keeps well-formed fields of known workspaces only", () => {
    expect(
      normalizeWorkspaceSettlementMap(
        {
          known: { settledAt: iso(-1), settledReason: "bogus", lastMessageAt: "not a date", autoSettleDisabled: "yes" },
          gone: { settledAt: iso(-1) },
          empty: { snoozedAt: iso(-1) },
        },
        new Set(["known", "empty"]),
      ),
    ).toEqual({ known: { settledAt: iso(-1), settledReason: "manual" } });
    expect(normalizeWorkspaceSettlementMap("garbage")).toEqual({});
  });

  test("the inactivity setting is off, or a whole number of days in range", () => {
    expect(normalizeWorkspaceSettleAfterDays(null)).toBeNull();
    expect(normalizeWorkspaceSettleAfterDays(undefined)).toBe(7);
    expect(normalizeWorkspaceSettleAfterDays(0)).toBe(1);
    expect(normalizeWorkspaceSettleAfterDays(400)).toBe(90);
  });
});

describe("snooze presets", () => {
  test("tomorrow and next week land on 9:00 local time", () => {
    const wednesday = new Date(2026, 9, 7, 15, 30);
    expect(resolveWorkspaceSnoozeUntil("hour", wednesday).getTime()).toBe(wednesday.getTime() + 3_600_000);
    expect(resolveWorkspaceSnoozeUntil("tomorrow", wednesday)).toEqual(new Date(2026, 9, 8, 9, 0));
    expect(resolveWorkspaceSnoozeUntil("next-week", wednesday)).toEqual(new Date(2026, 9, 12, 9, 0));
    const monday = new Date(2026, 9, 12, 8, 0);
    expect(resolveWorkspaceSnoozeUntil("next-week", monday)).toEqual(new Date(2026, 9, 19, 9, 0));
  });
});

describe("Work queue sections", () => {
  test("shelved entries leave their lanes; empty lanes disappear", () => {
    const entry = (workspaceId: string) => ({ workspaceId });
    const sections = buildSidebarWorkQueueSections({
      groups: [
        { lane: "in-review", label: "In review", entries: [entry("a"), entry("b")] },
        { lane: "idle", label: "Idle", entries: [entry("c"), entry("d"), entry("e")] },
      ],
      shelfOf: ({ workspaceId }) =>
        workspaceId === "b"
          ? { section: "settled", at: iso(-5) }
          : workspaceId === "c"
            ? { section: "settled", at: iso(-1) }
            : workspaceId === "d"
              ? { section: "snoozed", at: iso(2) }
              : workspaceId === "e"
                ? { section: "snoozed", at: iso(1) }
                : null,
    });
    expect(sections.map((section) => [section.section, section.entries.map((item) => item.workspaceId)])).toEqual([
      ["in-review", ["a"]],
      ["snoozed", ["e", "d"]],
      ["settled", ["c", "b"]],
    ]);
  });
});

describe("settlement actions", () => {
  function createStore(initial: Record<string, WorkspaceSettlementRecord> = {}) {
    let state = { workspaceSettlementById: initial } as AppState;
    const set = (update: Partial<AppState> | ((current: AppState) => Partial<AppState>)) => {
      state = { ...state, ...(typeof update === "function" ? update(state) : update) };
    };
    const actions = createWorkspaceSettlementActions({ set: set as never, get: () => state });
    return { actions, read: () => state.workspaceSettlementById };
  }

  test("undo puts a workspace back in the queue so a rule cannot re-settle it at once", () => {
    const { actions, read } = createStore({ w: { lastMessageAt: iso(-10) } });
    const previous = actions.settleWorkspaces({ settlements: [{ workspaceId: "w", reason: "merged" }] });
    expect(read().w?.settledReason).toBe("merged");
    actions.restoreWorkspaceSettlements({ records: previous });
    const restored = read().w;
    expect(restored?.settledAt).toBeUndefined();
    expect(restored?.lastMessageAt).toBe(iso(-10));
    expect(restored?.unsettledAt).toBeDefined();
  });

  test("undoing a snooze over a settle restores the settle", () => {
    const { actions, read } = createStore({ w: settleWorkspaceRecord(undefined, "manual", iso(-1)) });
    const previous = actions.snoozeWorkspace({ workspaceId: "w", until: iso(5) });
    expect(read().w?.snoozedUntil).toBe(iso(5));
    actions.restoreWorkspaceSettlements({ records: { w: previous } });
    expect(read().w).toEqual({ settledAt: iso(-1), settledReason: "manual" });
  });

  test("opting out of automatic settling is a flag that the other actions keep", () => {
    const { actions, read } = createStore();
    actions.setWorkspaceAutoSettle({ workspaceId: "w", enabled: false });
    actions.settleWorkspaces({ settlements: [{ workspaceId: "w", reason: "manual" }] });
    actions.unsettleWorkspace({ workspaceId: "w" });
    expect(read().w?.autoSettleDisabled).toBe(true);
    actions.setWorkspaceAutoSettle({ workspaceId: "w", enabled: true });
    expect(read().w?.autoSettleDisabled).toBeUndefined();
  });
});
