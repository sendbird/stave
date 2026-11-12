import { afterEach, beforeEach, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { describeTarsNotifications, readTarsNotificationTarget } from "@/lib/tars/notifications";
import { createTarsNotificationSync } from "@/lib/tars/notification-sync";
import { collectTarsAttention } from "@/lib/tars/attention";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import { buildFleetInbox, selectBellEntries } from "@/lib/fleet/inbox-model";
import { APP_NOTIFICATION_KINDS, isNotificationPendingAttention, type AppNotification, type AppNotificationCreateInput } from "@/lib/notifications/notification.types";
import { buildNotificationToastOptions } from "@/lib/notifications/notification.utils";
import { CreateNotificationArgsSchema } from "../electron/main/ipc/schemas";
import type { TarsPendingDecision, TarsSnapshot } from "@/lib/tars/types";
import { tarsResponsibility, TARS_AT } from "./fixtures/tars-host-bridge";

const decision: TarsPendingDecision = { responsibilityId: "goal", expectedRevision: 4, messageId: "message-1", actionIndex: 0,
  operation: "resume", proposedAt: TARS_AT };
const snapshot = (state: TarsSnapshot["responsibilities"][number]["state"] = "paused", pendingDecisions = [decision]): TarsSnapshot => ({
  identity: { id: "personal", name: "Tars", instructions: "", updatedAt: TARS_AT },
  responsibilities: [tarsResponsibility({ state })], pendingDecisions, runtime: "desktop",
});
const persisted = (draft: AppNotificationCreateInput): AppNotification => ({ ...draft, createdAt: TARS_AT, readAt: null });

beforeEach(() => applyAppLocale("en"));
afterEach(() => applyAppLocale("en"));

function syncFixture(initial: TarsSnapshot | null = snapshot()) {
  let current = initial;
  let ready = true;
  let notifications: AppNotification[] = [];
  const inserted: string[] = [];
  const resolved: string[] = [];
  let beforeInsert: (() => Promise<void>) | undefined;
  const sync = createTarsNotificationSync({
    getSnapshot: () => current,
    notificationsReady: () => ready,
    getNotifications: () => notifications,
    persist: async (drafts) => {
      await beforeInsert?.();
      for (const draft of drafts) {
        inserted.push(draft.id);
        notifications.push(persisted(draft));
      }
    },
    markRead: async ({ id, resolvedAt }) => {
      resolved.push(id);
      notifications = notifications.map((row) => row.id === id ? { ...row, readAt: row.readAt ?? TARS_AT, resolvedAt } : row);
    },
  });
  return { ...sync, inserted, resolved, rows: () => notifications, snapshot: (value: TarsSnapshot | null) => { current = value; },
    ready: (value: boolean) => { ready = value; }, seed: (rows: AppNotification[]) => { notifications = rows; },
    beforeInsert: (value: () => Promise<void>) => { beforeInsert = value; } };
}

test("a live fact inserts once across repeated changes, reads and restarts; its next revision is new", async () => {
  const f = syncFixture();
  await Promise.all([f.reconcile(), f.reconcile(), f.reconcile()]);
  expect(f.inserted).toEqual(["tars:decision:message-1:0"]);
  f.seed(f.rows().map((row) => ({ ...row, readAt: TARS_AT })));
  await f.reconcile();
  const restored = syncFixture(); restored.seed(f.rows()); await restored.reconcile();
  expect(restored.inserted).toEqual([]);
  // Clearing read history is not a new appearance of the same fact.
  restored.seed([]); await restored.reconcile(); expect(restored.inserted).toEqual([]);
  const next = snapshot("blocked", []); next.responsibilities[0]!.revision = 5;
  f.snapshot(next); await f.reconcile();
  expect(f.inserted).toEqual(["tars:decision:message-1:0", "tars:blocked:goal:5"]);
  expect(f.resolved).toEqual(["tars:decision:message-1:0"]);
});

test("removing a pending decision resolves its notification even after reading", async () => {
  const f = syncFixture(); await f.reconcile();
  f.seed(f.rows().map((row) => ({ ...row, readAt: TARS_AT })));
  f.snapshot(snapshot("running", [])); await f.reconcile(); await f.reconcile();
  expect(f.resolved).toEqual(["tars:decision:message-1:0"]);
  expect(f.rows()[0]?.resolvedAt).toBeTruthy();
});

test("an outdated, cancelled or missing target cannot raise a decision", () => {
  const stale = snapshot(); stale.responsibilities[0]!.revision++;
  expect(describeTarsNotifications(stale)).toEqual([]);
  expect(describeTarsNotifications(snapshot("cancelled"))).toEqual([]);
  expect(describeTarsNotifications({ ...snapshot(), responsibilities: [] })).toEqual([]);
});

test("hydration must finish in either order before creating or resolving; failed reads preserve needs", async () => {
  const f = syncFixture(); f.ready(false); await f.reconcile(); expect(f.inserted).toEqual([]);
  f.ready(true); await f.reconcile(); expect(f.inserted).toHaveLength(1);
  f.snapshot(null); await f.reconcile(); expect(f.resolved).toEqual([]);
  f.snapshot(snapshot("running", [])); await f.reconcile(); expect(f.resolved).toHaveLength(1);
  const g = syncFixture(null); g.seed([persisted(describeTarsNotifications(snapshot())[0]!)]);
  await g.reconcile(); expect(g.resolved).toEqual([]);
  g.snapshot(snapshot("running", [])); await g.reconcile(); expect(g.resolved).toHaveLength(1);
});

test("a fact that disappears during insertion is resolved immediately after insertion", async () => {
  const f = syncFixture();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  f.beforeInsert(async () => { started(); await gate; });
  const inserting = f.reconcile(); await entered;
  f.snapshot(snapshot("running", [])); const changed = f.reconcile(); release();
  await Promise.all([inserting, changed]);
  expect(f.inserted).toHaveLength(1); expect(f.resolved).toEqual(f.inserted);
});

test("results, blockers and unverified completions carry the right target; duplicate blocked facts stay quiet", () => {
  const result = describeTarsNotifications(snapshot("resultReady", []))[0]!;
  expect(result).toMatchObject({ kind: "tars.result_ready", id: "tars:blocked:goal:4", dedupeKey: "tars:blocked:goal:4" });
  expect(readTarsNotificationTarget(result)).toEqual({ responsibilityId: "goal" });
  const blocked = describeTarsNotifications(snapshot("blocked", []))[0]!;
  expect(blocked.kind).toBe("tars.blocked");
  const unverified = describeTarsNotifications(snapshot("blocked", [{ ...decision, kind: "unverifiedCompletion", messageId: null, actionIndex: null, operation: null }]));
  expect(unverified).toHaveLength(1);
  expect(readTarsNotificationTarget(unverified[0]!)).toEqual({ responsibilityId: "goal", decisionId: "unverified:goal:4" });
  expect(describeTarsNotifications(snapshot("blocked"))).toHaveLength(1);
  expect(readTarsNotificationTarget(describeTarsNotifications(snapshot())[0]!)).toEqual({ responsibilityId: "goal", decisionId: "confirm:message-1:0" });
  expect(readTarsNotificationTarget(describeTarsNotifications(snapshot("completed", [{ ...decision, kind: "ask", operation: null, question: "Ready?" }]))[0]!))
    .toEqual({ responsibilityId: "goal", decisionId: "ask:message-1:0" });
});

test("Tars kinds pass the shared IPC schema and remain protected until resolved", () => {
  for (const draft of [describeTarsNotifications(snapshot())[0]!, describeTarsNotifications(snapshot("resultReady", []))[0]!, describeTarsNotifications(snapshot("blocked", []))[0]!]) {
    expect(APP_NOTIFICATION_KINDS).toContain(draft.kind);
    expect(CreateNotificationArgsSchema.safeParse({ notification: draft }).success).toBe(true);
    expect(isNotificationPendingAttention(draft)).toBe(true);
    expect(isNotificationPendingAttention({ ...draft, resolvedAt: TARS_AT })).toBe(false);
  }
  expect(CreateNotificationArgsSchema.safeParse({ notification: { ...describeTarsNotifications(snapshot())[0], kind: "tars.unknown" } }).success).toBe(false);
});

test.each([
  ["en", ["Tars needs your decision: Verified result", "Tars has a result for you: Verified result", "Tars needs your help: Verified result"]],
  ["ko", ["Tars가 결정을 기다립니다: Verified result", "Tars가 결과를 준비했습니다: Verified result", "Tars에게 도움이 필요합니다: Verified result"]],
] as const)("%s: notifications and toast name the need and the work", async (locale, titles) => {
  await applyAppLocale(locale);
  const drafts = [describeTarsNotifications(snapshot())[0]!, describeTarsNotifications(snapshot("resultReady", []))[0]!, describeTarsNotifications(snapshot("blocked", []))[0]!];
  expect(drafts.map((draft) => draft.title)).toEqual([...titles]);
  expect(drafts.map((draft) => buildNotificationToastOptions(draft).title)).toEqual([...titles]);
});

test("Fleet and the bell share one unread entry per signal, including snoozes", () => {
  const tars = snapshot();
  const notifications = describeTarsNotifications(tars).map(persisted);
  const project = (snoozed: string[] = []) => buildFleetAttentionProjection({ notifications, liveWorkspaces: [], prWorkspaces: [],
    tarsAttention: collectTarsAttention(tars), snoozedAttentionIds: new Set(snoozed) });
  const projection = project();
  const inbox = buildFleetInbox({ items: projection.items, notifications });
  expect(inbox.unlinkedEntries).toEqual([]);
  expect(selectBellEntries(inbox, "unread").map((entry) => entry.id)).toEqual([notifications[0]!.id]);
  const snoozed = project([notifications[0]!.id]);
  expect(selectBellEntries(buildFleetInbox({ items: snoozed.items, snoozedItems: snoozed.snoozedItems, notifications }), "all")).toEqual([]);
});
