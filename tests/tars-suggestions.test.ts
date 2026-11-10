import { describe, expect, test } from "bun:test";
import en from "../src/locales/en/shell.json";
import ko from "../src/locales/ko/shell.json";
import { buildTarsSuggestions, TARS_SUGGESTIONS_MAX } from "../src/lib/tars/suggestions";
import { buildTarsTray } from "../src/lib/tars/tray-model";
import { buildTarsOutputs } from "../src/lib/tars/outputs-model";
import { filterTarsConversationView, projectTarsClearProposals, tarsClearKeeps } from "../src/lib/tars/clear-view";
import { isTarsDefaultInstructions, isTarsNewProfile, TARS_IDENTITY_UNSAVED_AT } from "../src/lib/tars/default-instructions";
import { TarsResponsibilitySchema, type TarsResponsibility } from "../src/lib/tars/types";
import type { TarsActionReceipt, TarsConversation, TarsMessageView } from "../src/lib/tars/conversation";
import type { TarsDecisionView } from "../src/lib/tars/decisions";

const NOW = "2026-11-05T12:00:00.000Z";
function work(id: string, overrides: Partial<TarsResponsibility> = {}): TarsResponsibility {
  return TarsResponsibilitySchema.parse({ id, requestId: `request-${id}`, title: `Work ${id}`, instruction: "Do it.", acceptanceCriteria: ["Done."],
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex", model: null, priority: 50, maxTurns: 30, revision: 1, state: "running",
    detail: null, taskId: null, executionWorkspaceId: null, agentRunId: `run-${id}`, reverifyAfter: null, createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z", ...overrides });
}
const tray = (rows: TarsResponsibility[], attention: Array<{ id: string; kind: string; tarsResponsibilityId: string }> = []) =>
  buildTarsTray({ responsibilities: rows, attentionItems: attention, runs: {} });
function message(id: string, overrides: Partial<TarsMessageView> = {}): TarsMessageView {
  return { requestId: id, text: "Words.", providerId: "codex", model: "m", maxTurns: 30, id, state: "answered", revision: 3, reply: "Reply.",
    error: null, decision: { reply: "Reply.", actions: [] }, createdAt: "2026-11-05T01:00:00.000Z", updatedAt: "2026-11-05T01:00:00.000Z", ...overrides } as TarsMessageView;
}
const delegated = (messageId: string, responsibilityId: string): TarsActionReceipt => ({ messageId, actionIndex: 0, requestHash: "a".repeat(64),
  action: { kind: "delegate", workspaceId: "source", title: "T", instruction: "I", acceptanceCriteria: ["A"], priority: 50 }, status: "applied",
  responsibilityId, error: null, reason: null, revision: 2, createdAt: NOW, updatedAt: NOW });

describe("suggestions", () => {
  test("come from the work as it is now, most useful first, one per piece of work and at most four", () => {
    const rows = [
      work("blocked", { state: "blocked" }), work("paused", { state: "paused" }), work("queued", { state: "queued", agentRunId: null }),
      work("done", { state: "completed", updatedAt: "2026-11-05T10:00:00.000Z" }), work("running"),
    ];
    const items = buildTarsSuggestions({ tray: tray(rows, [{ id: "a", kind: "tars-blocked", tarsResponsibilityId: "blocked" }]), messages: [], receipts: [], now: NOW });
    expect(items.map((item) => item.kind)).toEqual(["needsYou", "blocked", "resume", "startNow"]);
    expect(items).toHaveLength(TARS_SUGGESTIONS_MAX);
    expect(new Set(items.flatMap((item) => item.title ? [item.title] : [])).size).toBe(3);
    // Without the attention and the blocked work, the rest of the order shows: today's result and running work.
    const later = buildTarsSuggestions({ tray: tray(rows.slice(2)), messages: [], receipts: [], now: NOW });
    expect(later.map((item) => [item.kind, item.title])).toEqual([["startNow", "Work queued"], ["report", "Work done"], ["progress", "Work running"]]);
  });

  test("follow up on work the last reply delegated, unless it already has a more useful suggestion", () => {
    const rows = [work("new", { state: "waiting" }), work("older")];
    const items = buildTarsSuggestions({ tray: tray(rows), messages: [message("m1")], receipts: [delegated("m1", "new")], now: NOW });
    expect(items[0]).toMatchObject({ kind: "followUp", title: "Work new" });
    // Something said after the reply: the reply is no longer the last word.
    expect(buildTarsSuggestions({ tray: tray(rows), messages: [message("m1"), message("m2")], receipts: [delegated("m1", "new")], now: NOW })
      .some((item) => item.kind === "followUp")).toBe(false);
    // Blocked work gets "why is it blocked", not "how is it going".
    const blocked = buildTarsSuggestions({ tray: tray([work("new", { state: "blocked" })]), messages: [message("m1")], receipts: [delegated("m1", "new")], now: NOW });
    expect(blocked.map((item) => item.kind)).toEqual(["blocked"]);
  });

  test("offer a draft PR only for verified work that completed today, group several finished items, and shorten long titles", () => {
    const publishable = work("ship", { state: "completed", executionWorkspaceId: "exec", updatedAt: "2026-11-05T11:00:00.000Z",
      title: "Show the saved card first at checkout on every device" });
    const [first] = buildTarsSuggestions({ tray: tray([publishable]), messages: [], receipts: [], now: NOW });
    expect(first).toMatchObject({ kind: "publish", fullTitle: "Show the saved card first at checkout on every device" });
    expect(first!.title!.length).toBeLessThanOrEqual(32);
    expect(first!.title!.endsWith("…")).toBe(true);
    const two = buildTarsSuggestions({ tray: tray([publishable, work("b", { state: "completed", updatedAt: "2026-11-05T09:00:00.000Z" })]), messages: [], receipts: [], now: NOW });
    expect(two.map((item) => item.kind)).toEqual(["finishedToday", "publish"]);
    // Yesterday's work is not "today".
    const old = work("old", { state: "completed", updatedAt: "2026-11-04T09:00:00.000Z" });
    expect(buildTarsSuggestions({ tray: tray([old]), messages: [], receipts: [], now: NOW })).toEqual([]);
  });

  test("say nothing before the work was read, and leave out ended work the tray cleared", () => {
    expect(buildTarsSuggestions({ tray: null, messages: [], receipts: [], now: NOW })).toEqual([]);
    const done = work("done", { state: "completed", updatedAt: "2026-11-05T10:00:00.000Z" });
    const model = buildTarsTray({ responsibilities: [done], attentionItems: [], runs: {}, clearedDone: ["done"] });
    expect(model.lanes.done).toEqual([]);
    expect(model.counts.done).toBe(0);
    expect(buildTarsSuggestions({ tray: model, messages: [], receipts: [], now: NOW })).toEqual([]);
  });

  test("every kind has a chip label and the words it inserts, in English and Korean", () => {
    for (const locale of [en, ko]) for (const kind of ["needsYou", "followUp", "blocked", "resume", "startNow", "publish", "report", "finishedToday", "progress"] as const) {
      const entry = (locale.tars.suggestions as Record<string, Record<string, string>>)[kind]!;
      expect(entry.label?.length).toBeGreaterThan(0);
      expect(entry.prompt?.length).toBeGreaterThan(0);
    }
  });
});

describe("cleared tray models", () => {
  test("outputs of cleared ended work leave the list; running work's outputs never do", () => {
    const run = (id: string) => ({ agentRun: { id: `run-${id}`, workflow: { stages: [] } }, stages: [], report: { outcome: "completed", endedAt: NOW, links: [] } }) as never;
    const rows = [work("done", { state: "completed" }), work("running")];
    const runs = { "run-done": run("done"), "run-running": run("running") };
    expect(new Set(buildTarsOutputs({ responsibilities: rows, runs }).map((output) => output.responsibilityId))).toEqual(new Set(["done", "running"]));
    expect(buildTarsOutputs({ responsibilities: rows, runs, cleared: ["done"] }).map((output) => output.responsibilityId)).toEqual(["running"]);
  });
});

describe("the conversation view after a clear", () => {
  const conversation = (messages: TarsMessageView[], receipts: TarsActionReceipt[] = []): TarsConversation => ({
    settings: null, messages, receipts, activity: [], records: [], answers: [], events: [], publications: [], clears: [] });
  test("keeps entries after the clear, work under way, late replies and waiting decisions, and hides the rest", () => {
    const clearedAt = "2026-11-05T05:00:00.000Z";
    const old = message("old");
    const queued = message("queued", { state: "queued", reply: null, decision: null });
    const late = message("late", { updatedAt: "2026-11-05T06:00:00.000Z" });
    const asking = message("asking");
    const fresh = message("fresh", { createdAt: "2026-11-05T07:00:00.000Z", updatedAt: "2026-11-05T07:00:00.000Z" });
    const waiting = { id: "ask:asking:0", messageId: "asking", state: "waiting" } as TarsDecisionView;
    const retired = { id: "ask:old:0", messageId: "old", state: "retired" } as TarsDecisionView;
    const view = filterTarsConversationView(conversation([old, queued, late, asking, fresh]),
      { clearedAt, keeps: tarsClearKeeps({ decisions: [waiting, retired], receipts: [] }) });
    expect(view.messages.map((entry) => entry.id)).toEqual(["queued", "late", "asking", "fresh"]);
    // No clear: nothing changes.
    const all = conversation([old]);
    expect(filterTarsConversationView(all, { clearedAt: null, keeps: tarsClearKeeps({ decisions: [], receipts: [] }) })).toBe(all);
  });

  test("a clear proposal waits until its record exists; a refused one stays a receipt line", () => {
    const receipt = (index: number, status: TarsActionReceipt["status"]): TarsActionReceipt => ({ messageId: "m", actionIndex: index, requestHash: "a".repeat(64),
      action: { kind: "clear", scopes: ["done"] }, status, responsibilityId: null, error: status === "rejected" ? "No." : null,
      reason: status === "rejected" ? "notByFollowUp" : null, revision: 2, createdAt: NOW, updatedAt: NOW });
    const record = { requestId: "clear:m:1", source: "click" as const, scopes: ["done" as const], proposal: { messageId: "m", actionIndex: 1 }, status: "applied" as const,
      done: [], revision: 1, createdAt: NOW, updatedAt: NOW };
    expect(projectTarsClearProposals([receipt(0, "proposed"), receipt(1, "applied"), receipt(2, "rejected")], [record])
      .map((view) => [view.requestId, view.state])).toEqual([["clear:m:0", "waiting"], ["clear:m:1", "settled"]]);
  });
});

describe("default standing instructions", () => {
  test("apply by themselves only to a profile that never used Tars", () => {
    const identity = { updatedAt: TARS_IDENTITY_UNSAVED_AT, instructions: "" };
    expect(isTarsNewProfile(identity, null)).toBe(true);
    expect(isTarsNewProfile({ ...identity, updatedAt: NOW }, null)).toBe(false);
    expect(isTarsNewProfile({ ...identity, instructions: "Mine." }, null)).toBe(false);
    expect(isTarsNewProfile(identity, { providerId: "codex", model: "m", maxTurns: 30 })).toBe(false);
  });

  test("are concise, editable text in both languages, and either language counts as the default", () => {
    const defaults = [en.tars.instructionsDefault, ko.tars.instructionsDefault];
    for (const text of defaults) {
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(1_000);
      expect(text.split("\n").length).toBeLessThanOrEqual(6);
    }
    expect(isTarsDefaultInstructions(`  ${ko.tars.instructionsDefault}\n`, defaults)).toBe(true);
    expect(isTarsDefaultInstructions(`${en.tars.instructionsDefault} Also be terse.`, defaults)).toBe(false);
  });
});
