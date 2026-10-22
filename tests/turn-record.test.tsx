import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { TurnRecordBody } from "@/components/session/TurnRecordView";
import {
  buildTurnPickerOptions,
  buildTurnRecordSteps,
  collectTurnPrompts,
  describeTurnDigestEntry,
  resolveTurnHistoryView,
  shortTurnId,
  TURN_RECORD_STEP_LIMIT,
} from "@/components/session/turn-record.utils";
import type { TurnHistoryEntry, TurnRecord, TurnRecordMessage } from "@/lib/providers/turn-history";
import type { ChatMessage } from "@/types/chat";

afterEach(() => applyAppLocale("en"));

const TURN: TurnHistoryEntry = {
  id: "4f2a91c3-0000-4000-8000-000000000001",
  providerId: "codex",
  createdAt: "2026-10-22T10:00:00.000Z",
  completedAt: "2026-10-22T10:04:10.000Z",
  outcome: "failed",
  error: "Tests failed to start",
  digest: { entryCount: 2, hasError: true, checks: "fail" },
};

function reply(parts: TurnRecordMessage["parts"]): TurnRecordMessage {
  return { id: "m2", role: "assistant", turnId: TURN.id, parts };
}

describe("rebuilding a turn's steps from saved messages", () => {
  test("lists every top-level call, approval and question, then the last todos, after the failure", () => {
    const { items, omitted } = buildTurnRecordSteps({
      turn: TURN,
      messages: [reply([
        { type: "tool_use", toolUseId: "t1", toolName: "Bash", input: JSON.stringify({ command: "bun test" }), output: "1 failed", state: "output-error" },
        { type: "tool_use", toolUseId: "t2", toolName: "Read", input: JSON.stringify({ file_path: "/repo/src/app.ts" }), output: "…", state: "output-available" },
        { type: "tool_use", toolUseId: "t3", toolName: "Read", input: "{}", ownerAgentId: "agent-1", state: "output-available" },
        { type: "tool_use", toolUseId: "t4", toolName: "Agent", input: JSON.stringify({ description: "Find the flaky test", subagent_type: "Explore" }), output: JSON.stringify({ content: [{ type: "text", text: "It is the clock mock." }] }), state: "output-available" },
        { type: "approval", toolName: "Bash", requestId: "r1", description: "Run migrations", state: "output-denied" },
        { type: "user_input", toolName: "AskUserQuestion", requestId: "q1", questions: [{ question: "Which database?", header: "DB", options: [] }], state: "input-responded" },
        { type: "tool_use", toolUseId: "t5", toolName: "TodoWrite", input: JSON.stringify({ todos: [{ content: "Fix test", status: "completed" }, { content: "Update docs", status: "in_progress" }] }), state: "output-available" },
        { type: "tool_use", toolUseId: "t6", toolName: "Edit", input: JSON.stringify({ file_path: "/repo/src/x.ts" }), state: "input-available" },
      ])],
    });
    expect(omitted).toBe(0);
    expect(items.map((item) => [item.title, item.status, item.iconKey])).toEqual([
      ["Turn failed", "failed", "alert"],
      ["Run command", "failed", "tool"],
      ["Read file", "completed", "tool"],
      ["Find the flaky test", "completed", "subagent"],
      ["Approval denied", "failed", "pause"],
      ["Question answered", "completed", "pause"],
      ["Edit file", "pending", "tool"],
      ["Fix test", "completed", "todo"],
      ["Update docs", "pending", "todo"],
    ]);
    expect(items[0]?.detail).toBe("Tests failed to start");
    expect(items[1]?.detail).toBe("1 failed");
    expect(items[2]).toMatchObject({ detail: "src/app.ts", toolUseId: "t2" });
    expect(items[3]).toMatchObject({ detail: "It is the clock mock.", badge: "Explore" });
    expect(items[5]?.detail).toBe("Which database?");
  });

  test("a very long turn keeps the first steps and counts the rest", () => {
    const parts = Array.from({ length: TURN_RECORD_STEP_LIMIT + 5 }, (_, index) => ({
      type: "tool_use" as const,
      toolUseId: `t${index}`,
      toolName: "Read",
      input: JSON.stringify({ file_path: `/repo/f${index}.ts` }),
      state: "output-available" as const,
    }));
    const { items, omitted } = buildTurnRecordSteps({ turn: { outcome: "completed", error: null }, messages: [reply(parts)] });
    expect(items).toHaveLength(TURN_RECORD_STEP_LIMIT);
    expect(omitted).toBe(5);
  });
});

describe("the turn picker", () => {
  test("names turns by time and outcome, and searches requests, ids and failures", () => {
    const options = buildTurnPickerOptions({
      turns: [TURN, { ...TURN, id: "older-turn", outcome: "completed", error: null, providerId: "claude-code" }],
      liveTurnId: "live-turn",
      prompts: { [TURN.id]: "Fix the flaky test" },
    });
    expect(options.map((option) => option.value)).toEqual(["live-turn", TURN.id, "older-turn"]);
    expect(options[1]).toMatchObject({ detail: `Fix the flaky test · Codex · ${shortTurnId(TURN.id)}` });
    expect(options[1]?.label).toContain("Turn failed");
    expect(options[1]?.keywords).toEqual(expect.arrayContaining([TURN.id, "Fix the flaky test", "Tests failed to start"]));
    expect(options[2]?.label).toContain("Turn finished");
    expect(options[0]?.label).toBe("Running");
  });

  test("requests are matched to the turn whose reply follows them", () => {
    const message = (id: string, role: "user" | "assistant", extra: Partial<ChatMessage> = {}): ChatMessage =>
      ({ id, role, model: "m", providerId: role === "user" ? "user" : "codex", content: `${id} text\nsecond line`, parts: [], ...extra }) as ChatMessage;
    expect(collectTurnPrompts([
      message("u1", "user"),
      message("a1", "assistant", { turnId: "turn-1" }),
      message("u2", "user", { steeredIntoTurnId: "turn-1" }),
      message("a1b", "assistant", { turnId: "turn-1" }),
      message("u3", "user", { displayContent: "shown request" }),
      message("a2", "assistant", { turnId: "turn-2" }),
    ])).toEqual({ "turn-1": "u1 text", "turn-2": "shown request" });
  });

  test("the live or last turn keeps the activity view; other turns, and the newest after a restart, open records", () => {
    expect(resolveTurnHistoryView({ selected: null, liveTurnId: "live", retainedTurnId: "last", latestTurnId: "live" }))
      .toEqual({ view: { kind: "activity" }, shownTurnId: "live" });
    expect(resolveTurnHistoryView({ selected: "last", liveTurnId: "live", retainedTurnId: "last", latestTurnId: "live" }))
      .toEqual({ view: { kind: "record", turnId: "last" }, shownTurnId: "last" });
    expect(resolveTurnHistoryView({ selected: "last", liveTurnId: null, retainedTurnId: "last", latestTurnId: "last" }))
      .toEqual({ view: { kind: "activity" }, shownTurnId: "last" });
    expect(resolveTurnHistoryView({ selected: null, liveTurnId: null, retainedTurnId: null, latestTurnId: "newest" }))
      .toEqual({ view: { kind: "record", turnId: "newest" }, shownTurnId: "newest" });
    expect(resolveTurnHistoryView({ selected: null, liveTurnId: null, retainedTurnId: null, latestTurnId: null }))
      .toEqual({ view: { kind: "activity" }, shownTurnId: null });
  });
});

describe("a turn's record", () => {
  const record: TurnRecord = {
    turn: TURN,
    prompt: "Fix the flaky test",
    digest: {
      version: 1,
      omitted: 1,
      accountProfileId: "acct-2",
      entries: [
        { kind: "retry", at: "2026-10-22T10:00:30.000Z", message: "Overloaded", count: 3, lastAt: "2026-10-22T10:01:00.000Z" },
        { kind: "stall", at: "2026-10-22T10:01:00.000Z", silentMs: 360_000, endedTurn: true },
        { kind: "account", at: "2026-10-22T10:00:00.000Z", providerId: "codex", fromAccountId: "acct-1", toAccountId: "acct-2", since: "previous-turn" },
        { kind: "checks", at: "2026-10-22T10:05:00.000Z", status: "fail", executed: 2, total: 2, failures: [{ scriptId: "test", message: "2 failed", blocking: true }], omittedFailures: 0 },
      ],
    },
    messages: [reply([{ type: "tool_use", toolUseId: "t1", toolName: "Bash", input: JSON.stringify({ command: "bun test" }), state: "output-error", output: "1 failed" }])],
  };

  test("entries read in Stave's words, with their time into the turn", () => {
    const describe = (index: number) => describeTurnDigestEntry(record.digest!.entries[index]!, {
      index,
      turnStartedAt: TURN.createdAt,
      accountLabel: (_provider, id) => `Label ${id}`,
    });
    expect(describe(0)).toMatchObject({ title: "Retried 3 times", detail: "Overloaded", tone: "warning", offsetSeconds: 30 });
    expect(describe(1)).toMatchObject({ title: "No updates for 6m", detail: "Then the turn ended.", tone: "warning" });
    expect(describe(2)).toMatchObject({ title: "Account changed since the previous turn: Label acct-1 → Label acct-2", tone: "neutral" });
    expect(describe(3)).toMatchObject({ title: "1 of 2 checks failed", tone: "danger", failures: [{ scriptId: "test", blocking: true }] });
  });

  test("renders the outcome, the request, the digest and the rebuilt steps under the turn's id", () => {
    const html = renderToStaticMarkup(createElement(TurnRecordBody, { record, taskId: "task-1" }));
    expect(html).toContain(`data-turn-id="${TURN.id}"`);
    expect(html).toContain(shortTurnId(TURN.id));
    expect(html).toContain("Turn failed");
    expect(html).toContain("Fix the flaky test");
    expect(html).toContain("Retried 3 times");
    expect(html).toContain("1 of 2 checks failed");
    expect(html).toContain("1 more entry was left out");
    expect(html).toContain("Run command");
  });

  test("a turn from before digests says No record, in English and Korean", () => {
    const old = { ...record, digest: null };
    expect(renderToStaticMarkup(createElement(TurnRecordBody, { record: old, taskId: "task-1" }))).toContain("No record.");
    applyAppLocale("ko");
    expect(renderToStaticMarkup(createElement(TurnRecordBody, { record: old, taskId: "task-1" }))).toContain("기록 없음.");
  });
});
