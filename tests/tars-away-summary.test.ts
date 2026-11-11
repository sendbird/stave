import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import {
  TARS_AWAY_INITIAL_STATE, TARS_AWAY_MIN_GAP_MS, TarsAwayStateSchema, dismissTarsAway, markTarsAwaySeen, mergeTarsAwayState, returnToTarsAway, type TarsAwayState,
} from "../src/lib/tars/away-state";
import { buildTarsAwaySummary, placeTarsAwayCard, type TarsAwaySummary } from "../src/lib/tars/away-summary";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { projectTarsPublishProposals } from "../src/lib/tars/publish-model";
import { buildTarsAwayFixtures } from "../src/dev/tars-preview/tars-away-fixtures";
import type { TarsConversation } from "../src/lib/tars/conversation";

const T0 = Date.parse("2026-11-05T09:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

describe("away state", () => {
  const seen = (minutes: number): TarsAwayState => ({ lastSeenAt: at(minutes), summary: null });

  test("a profile that never saw the conversation gets no summary, however long it was closed", () => {
    expect(returnToTarsAway(TARS_AWAY_INITIAL_STATE, at(600))).toBe(TARS_AWAY_INITIAL_STATE);
    // Seeing the end for the first time starts the clock.
    expect(markTarsAwaySeen(TARS_AWAY_INITIAL_STATE, at(0))).toEqual(seen(0));
  });

  test("a gap under ten minutes changes nothing; ten minutes opens the span since the end was last seen", () => {
    const state = seen(0);
    expect(TARS_AWAY_MIN_GAP_MS).toBe(600_000);
    expect(returnToTarsAway(state, at(9.99))).toBe(state);
    expect(returnToTarsAway(state, at(10))).toEqual({ lastSeenAt: at(0), summary: { since: at(0), until: at(10) } });
  });

  test("the seen time never moves backward", () => {
    const state = seen(5);
    expect(markTarsAwaySeen(state, at(3))).toBe(state);
    expect(markTarsAwaySeen(state, at(5))).toBe(state);
    expect(markTarsAwaySeen(state, at(6)).lastSeenAt).toBe(at(6));
  });

  test("a summary the user never reached the end after keeps its start; one they did is replaced by the next absence", () => {
    const first = returnToTarsAway(seen(0), at(30));
    // Left again without scrolling to the end: the next return still covers everything since the first leaving.
    expect(returnToTarsAway(first, at(60)).summary).toEqual({ since: at(0), until: at(60) });
    // Reached the end at 35, then away again: only what happened after 35.
    expect(returnToTarsAway(markTarsAwaySeen(first, at(35)), at(60)).summary).toEqual({ since: at(35), until: at(60) });
    // A short step away leaves the summary on screen as it is.
    expect(returnToTarsAway(markTarsAwaySeen(first, at(35)), at(40)).summary).toEqual({ since: at(0), until: at(30) });
  });

  test("dismissing counts what the summary covered as seen, so the same span cannot open again", () => {
    const open = returnToTarsAway(seen(0), at(30));
    const dismissed = dismissTarsAway(open);
    expect(dismissed).toEqual({ lastSeenAt: at(30), summary: null });
    expect(dismissTarsAway(dismissed)).toBe(dismissed);
    // Restarting a few minutes later is a short gap from the return; nothing opens.
    expect(returnToTarsAway(dismissed, at(35))).toBe(dismissed);
    // A real absence after it covers only what came after the dismissed span.
    expect(returnToTarsAway(dismissed, at(90)).summary).toEqual({ since: at(30), until: at(90) });
  });

  test("merging is idempotent, keeps the later seen time and never brings back a dismissed summary", () => {
    const open = returnToTarsAway(seen(0), at(30));
    expect(mergeTarsAwayState(open, open)).toBe(open);
    expect(mergeTarsAwayState(seen(10), seen(5))).toEqual(seen(10));
    expect(mergeTarsAwayState(seen(0), open)).toEqual(open);
    const dismissed = dismissTarsAway(open);
    // A write that was on its way when the summary was dismissed.
    expect(mergeTarsAwayState(dismissed, markTarsAwaySeen(open, at(20)))).toEqual(dismissed);
    // A new absence after the dismissal is a new summary.
    const next = returnToTarsAway(dismissed, at(90));
    expect(mergeTarsAwayState(dismissed, next)).toEqual(next);
  });

  test("the saved shape is strict", () => {
    expect(TarsAwayStateSchema.safeParse({ lastSeenAt: at(0), summary: { since: at(0), until: at(10) } }).success).toBe(true);
    for (const invalid of [{ lastSeenAt: at(0) }, { lastSeenAt: "yesterday", summary: null }, { lastSeenAt: null, summary: null, dismissed: true },
      { lastSeenAt: null, summary: { since: at(10), until: at(0) } }, { lastSeenAt: null, summary: { since: at(0), until: at(10), items: [] } }])
      expect(TarsAwayStateSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("away summary", () => {
  const anchor = new Date(T0);
  /** The preview's away conversation as of `minutes` after the user left, with its decisions and publish proposals projected as the view does. */
  function sources(minutes: number, patch: (conversation: TarsConversation) => void = () => undefined) {
    const view = buildTarsAwayFixtures(anchor, false).at(T0 + minutes * 60_000);
    const conversation: TarsConversation = { settings: null, messages: view.messages, receipts: view.receipts, activity: view.activity, records: [], answers: [],
      events: view.events, publications: view.publications };
    patch(conversation);
    const decisions = projectTarsDecisions({ messages: conversation.messages, receipts: conversation.receipts, records: conversation.records,
      answers: conversation.answers ?? [], activity: conversation.activity, responsibilities: view.responsibilities });
    const publishProposals = projectTarsPublishProposals({ receipts: conversation.receipts, publications: conversation.publications ?? [], responsibilities: view.responsibilities });
    const titleOf = (id: string) => view.responsibilities.find((row) => row.id === id)?.title;
    return { conversation, decisions, publishProposals, titleOf };
  }
  const summarize = (minutes: number, span = { since: at(0), until: at(minutes) }, patch?: (conversation: TarsConversation) => void) =>
    buildTarsAwaySummary({ span, ...sources(minutes, patch) });
  const group = (summary: TarsAwaySummary | null, kind: TarsAwaySummary["groups"][number]["kind"]) => summary?.groups.find((entry) => entry.kind === kind);

  test("counts what finished, what is blocked or failed, what waits for the user and the draft PR that opened", () => {
    const summary = summarize(45)!;
    expect(summary.groups.map((entry) => [entry.kind, entry.count])).toEqual([["waiting", 1], ["blocked", 2], ["finished", 4], ["pullRequests", 1]]);
    expect(summary.total).toBe(8);
    // The question names the work it is about and links to its own card.
    expect(group(summary, "waiting")!.items).toMatchObject([{ responsibilityId: "away-release", title: "Verify the release candidate",
      link: { kind: "decision", decisionId: "ask:away-message-ask:0" } }]);
    // The newest first; a block opens the report's unmet criteria, an unasked end the timeline.
    expect(group(summary, "blocked")!.items).toMatchObject([
      { responsibilityId: "away-queue", trouble: "cancelled", link: { kind: "side", target: { responsibilityId: "away-queue", kind: "timeline" } } },
      { responsibilityId: "away-upload", trouble: "blocked", link: { kind: "side", target: { responsibilityId: "away-upload", kind: "report", focus: { unmet: true } } } }]);
    // Three are named, the fourth is "and 1 more"; work that finished before the user left is not news.
    const finished = group(summary, "finished")!;
    expect(finished.items.map((item) => item.responsibilityId)).toEqual(["away-webhook", "away-keys", "away-docs"]);
    expect(finished.more).toBe(1);
    expect(finished.items[0]!.link).toEqual({ kind: "side", target: { responsibilityId: "away-webhook", kind: "report" } });
    expect(group(summary, "pullRequests")!.items).toMatchObject([{ responsibilityId: "away-checkout", pullRequest: 128, link: { kind: "publishRecord", requestId: "away-publish" } }]);
  });

  test("says nothing when nothing happened, without a span, or before the conversation was read", () => {
    // Away, but the first change comes three minutes after leaving.
    expect(summarize(2)).toBeNull();
    expect(buildTarsAwaySummary({ span: null, ...sources(45) })).toBeNull();
    expect(buildTarsAwaySummary({ ...sources(45), span: { since: at(0), until: at(45) }, conversation: null })).toBeNull();
    // A span that starts after everything happened.
    expect(summarize(45, { since: at(30), until: at(45) })).toBeNull();
  });

  test("only what happened inside the span counts", () => {
    const early = summarize(45, { since: at(0), until: at(7) })!;
    expect(early.groups.map((entry) => [entry.kind, entry.count])).toEqual([["blocked", 1], ["finished", 1]]);
    const late = summarize(45, { since: at(13), until: at(45) })!;
    expect(late.groups.map((entry) => [entry.kind, entry.count])).toEqual([["blocked", 1], ["finished", 2], ["pullRequests", 1]]);
  });

  test("work is listed as it stands now: a block it left is not blocked, and a block that became a waiting decision is the decision", () => {
    // The blocked upload fix went on and finished at minute 30.
    const moved = summarize(45, undefined, (conversation) => conversation.activity.push(
      { id: "upload-running", responsibilityId: "away-upload", revision: 4, title: "Fix the flaky upload test", state: "running", detail: null, createdAt: at(25) },
      { id: "upload-done", responsibilityId: "away-upload", revision: 5, title: "Fix the flaky upload test", state: "completed", detail: null, createdAt: at(30) }))!;
    expect(group(moved, "blocked")!.items.map((item) => item.responsibilityId)).toEqual(["away-queue"]);
    expect(group(moved, "finished")!.count).toBe(5);
    // A cancel the user applied themselves is theirs, not a failure.
    const cancelledByYou = summarize(45, undefined, (conversation) => conversation.records.push({ requestId: "cancel-queue", source: "click", requestHash: "b".repeat(64),
      action: { kind: "control", responsibilityId: "away-queue", expectedRevision: 2, operation: "cancel" }, status: "applied", error: null, reason: null, revision: 2,
      createdAt: at(15), updatedAt: at(15) }))!;
    expect(group(cancelledByYou, "blocked")!.items.map((item) => item.responsibilityId)).toEqual(["away-upload"]);
    // Completion Stave could not verify blocks the work and asks the user: it is one waiting decision, not also a block.
    const unverified = buildTarsAwaySummary({ span: { since: at(0), until: at(45) }, conversation: { receipts: [], records: [], events: [], publications: [],
      activity: [{ id: "a", responsibilityId: "w", revision: 2, title: "Ship it", state: "blocked", detail: null, detailCode: "unverifiedCompletion", createdAt: at(5) }] },
      decisions: projectTarsDecisions({ messages: [], receipts: [], records: [], answers: [], responsibilities: null,
        activity: [{ id: "a", responsibilityId: "w", revision: 2, title: "Ship it", state: "blocked", detail: null, detailCode: "unverifiedCompletion", createdAt: at(5) }] }) })!;
    expect(unverified.groups.map((entry) => [entry.kind, entry.count])).toEqual([["waiting", 1]]);
    expect(unverified.groups[0]!.items[0]).toMatchObject({ title: "Ship it", link: { kind: "decision" } });
  });

  test("an answered decision no longer waits, a failed draft PR and a follow-up Tars gave up on are trouble", () => {
    const answered = summarize(45, undefined, (conversation) => conversation.answers!.push({ decisionId: "ask:away-message-ask:0", optionIndex: 0, source: "click",
      effect: { kind: "reply" }, label: "Approve and continue", status: "applied", reason: null, error: null, actRequestId: null, messageId: null, revision: 2,
      createdAt: at(40), updatedAt: at(40) }))!;
    expect(group(answered, "waiting")).toBeUndefined();
    const failed = summarize(45, undefined, (conversation) => {
      Object.assign(conversation.publications![0]!, { status: "rejected", reason: "publishFailed", error: "push failed", url: null, number: null });
      conversation.events!.push({ key: "blocked:away-docs:9", responsibilityId: "away-export", kind: "blocked", episode: "9", observedRevision: 9, observedState: "blocked",
        attempt: null, status: "exhausted", messageId: null, createdAt: at(20), processedAt: at(21) });
    })!;
    expect(group(failed, "pullRequests")).toBeUndefined();
    expect(group(failed, "blocked")!.items.map((item) => [item.responsibilityId, item.trouble])).toEqual([
      ["away-checkout", "publishFailed"], ["away-queue", "cancelled"], ["away-upload", "blocked"]]);
    // The follow-up limit names work that is still stuck; the export work finished, so it is not listed.
    const stuck = summarize(45, undefined, (conversation) => conversation.events!.push({ key: "blocked:x:2", responsibilityId: "away-release", kind: "waitExpired", episode: "2",
      observedRevision: 3, observedState: "waiting", attempt: null, status: "exhausted", messageId: null, createdAt: at(20), processedAt: at(21) }))!;
    // It already waits on the user's decision, which is the one thing to do about it.
    expect(group(stuck, "blocked")!.items.map((item) => item.trouble)).toEqual(["cancelled", "blocked"]);
  });

  test("the card goes before the first entry newer than the leaving time, on that entry's day", () => {
    const entries = [{ id: "a", at: at(-30) }, { id: "b", at: at(-2) }, { id: "c", at: at(3) }, { id: "d", at: at(6) }];
    const card = (time: string, firstNewId: string | null) => ({ id: "away", at: time, firstNewId });
    expect(placeTarsAwayCard(entries, at(0), card).map((entry) => entry.id)).toEqual(["a", "b", "away", "c", "d"]);
    expect(placeTarsAwayCard(entries, at(0), card)[2]).toEqual({ id: "away", at: at(3), firstNewId: "c" });
    // Nothing newer in the transcript: it closes it and offers no jump.
    expect(placeTarsAwayCard(entries, at(10), card).at(-1)).toEqual({ id: "away", at: at(6), firstNewId: null });
    expect(placeTarsAwayCard([], at(10), card)).toEqual([{ id: "away", at: at(10), firstNewId: null }]);
  });
});

describe("away store", () => {
  function file() {
    const directory = mkdtempSync(path.join(tmpdir(), "tars-away-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    return path.join(directory, "store.sqlite");
  }
  function open(filename: string) {
    const db = new Database(filename);
    cleanup.push(() => { if (!db.closed) db.close(); });
    return { db, store: new TarsStore(db, { now: () => at(0) }) };
  }

  test("starts with nothing seen, saves idempotently, and announces nothing", () => {
    const { db, store } = open(":memory:");
    let announced = 0;
    store.view.onChange(() => { announced++; });
    expect(store.view.getAway()).toEqual({ lastSeenAt: null, summary: null });
    const seen = store.view.saveAway({ lastSeenAt: at(0), summary: null });
    expect(seen).toEqual({ lastSeenAt: at(0), summary: null });
    const before = db.query("SELECT total_changes() AS n").get() as { n: number };
    // The same state, and an older one, write nothing.
    expect(store.view.saveAway({ lastSeenAt: at(0), summary: null })).toEqual(seen);
    expect(store.view.saveAway({ lastSeenAt: at(-5), summary: null })).toEqual(seen);
    expect((db.query("SELECT total_changes() AS n").get() as { n: number }).n).toBe(before.n);
    expect(announced).toBe(0);
    for (const invalid of [{ lastSeenAt: at(0) }, { lastSeenAt: at(0), summary: null, extra: 1 }, null]) expect(() => store.view.saveAway(invalid)).toThrow();
  });

  test("a dismissed summary stays dismissed after a restart, and a late write cannot bring it back", () => {
    const filename = file();
    const first = open(filename);
    first.store.view.saveAway({ lastSeenAt: at(0), summary: null });
    const opened = returnToTarsAway(first.store.view.getAway(), at(30));
    expect(first.store.view.saveAway(opened).summary).toEqual({ since: at(0), until: at(30) });
    first.db.close();
    // Restart: the summary is still on screen.
    const second = open(filename);
    expect(second.store.view.getAway()).toEqual(opened);
    const dismissed = second.store.view.saveAway(dismissTarsAway(second.store.view.getAway()));
    expect(dismissed).toEqual({ lastSeenAt: at(30), summary: null });
    expect(second.store.view.saveAway(opened)).toEqual(dismissed);
    second.db.close();
    // Restart again: gone, and returning right away opens nothing.
    const third = open(filename);
    expect(third.store.view.getAway()).toEqual(dismissed);
    expect(returnToTarsAway(third.store.view.getAway(), at(35)).summary).toBeNull();
  });

  test("the view settings and the away state share one row without overwriting each other", () => {
    const { db, store } = open(":memory:");
    store.view.configure({ retentionDays: 30 });
    store.view.saveAway({ lastSeenAt: at(0), summary: null });
    expect(store.view.getSettings()).toEqual({ retentionDays: 30 });
    store.view.configure({ retentionDays: 3 });
    expect(store.view.getAway()).toEqual({ lastSeenAt: at(0), summary: null });
    expect(store.view.getSettings()).toEqual({ retentionDays: 3 });
    expect((db.query("SELECT COUNT(*) AS n FROM tars_view_settings").get() as { n: number }).n).toBe(1);
    // Saving the away state first leaves the retention default in force.
    const fresh = open(":memory:").store;
    fresh.view.saveAway({ lastSeenAt: at(0), summary: null });
    expect(fresh.view.getSettings()).toEqual({ retentionDays: 7 });
    // An unreadable away part reads as nothing seen and keeps the settings.
    db.query("UPDATE tars_view_settings SET body_json = ?").run(JSON.stringify({ retentionDays: 14, away: { lastSeenAt: "soon" } }));
    expect(store.view.getAway()).toEqual({ lastSeenAt: null, summary: null });
    expect(store.view.getSettings()).toEqual({ retentionDays: 14 });
  });
});

test("away IPC takes no input to read and only the strict state to save, and never reaches the host", () => {
  // Isolate Electron module mocks from other boundary tests in the shared Bun process.
  const source = `
    import { mock } from "bun:test";
    const handlers = new Map(); const calls = [];
    mock.module("electron", () => ({ webContents: { getAllWebContents: () => [] }, ipcMain: { handle: (key, callback) => handlers.set(key, callback) } }));
    mock.module("./electron/main/host-service-client", () => ({ onHostServiceEvent: () => () => {}, invokeHostService: async () => { throw new Error("Away state must not use the host"); } }));
    mock.module("./electron/main/tars-conversation-instance", () => ({ getTarsConversationService: async () => ({
      getAway: () => { calls.push(["get"]); return { lastSeenAt: null, summary: null }; },
      saveAway: (input) => { calls.push(["save", input]); return input; },
    }) }));
    const { registerTarsHandlers } = await import("./electron/main/ipc/tars"); registerTarsHandlers();
    const state = { lastSeenAt: "2026-11-05T09:00:00.000Z", summary: { since: "2026-11-05T08:00:00.000Z", until: "2026-11-05T09:00:00.000Z" } };
    const read = await handlers.get("tars:get-away")(null, undefined);
    const saved = await handlers.get("tars:save-away")(null, state);
    let denied = 0;
    const invalid = [["tars:get-away", {}], ["tars:save-away", undefined], ["tars:save-away", { ...state, responsibilityId: "x" }], ["tars:save-away", { lastSeenAt: 5, summary: null }],
      ["tars:save-away", { lastSeenAt: null, summary: { since: state.summary.until, until: state.summary.since } }]];
    for (const [channel, input] of invalid) { try { await handlers.get(channel)(null, input); } catch { denied++; } }
    console.log(JSON.stringify({ read, saved, denied, total: invalid.length, calls }));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const output = JSON.parse(result.stdout.toString());
  expect(output.read).toEqual({ lastSeenAt: null, summary: null });
  expect(output.saved.summary.until).toBe("2026-11-05T09:00:00.000Z");
  expect(output.denied).toBe(output.total);
  expect(output.calls).toHaveLength(2);
});
