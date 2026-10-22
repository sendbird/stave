import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { ReturnSummaryCard } from "@/components/session/return-summary/ReturnSummaryCard";
import { describeReturnSummary } from "@/components/session/return-summary/return-summary.utils";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { applyHandoffDraft, emptyHandoffRecord, type HandoffDraft } from "@/lib/task-context/handoff-record";
import {
  buildReturnSummary,
  captureReturnBaseline,
  countChangesSince,
  findLastDecision,
  hasReturnNews,
  isReturn,
  resolveLastVisit,
  RETURN_AWAY_MS,
} from "@/lib/task-context/return-summary";
import { useAppStore } from "@/store/app.store";
import { useFleetAttentionStore } from "@/store/fleet-attention-store";
import { taskHandoffKey, useTaskHandoffStore } from "@/store/task-handoff-store";
import { useTaskReturnStore } from "@/store/task-return-store";
import type { ChatMessage } from "@/types/chat";

const T0 = Date.parse("2026-10-22T08:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const EMPTY_DRAFT: HandoffDraft = { goal: "", decisions: "", verified: "", remaining: "", cautions: "" };

function user(id: string, minute: number, content: string): ChatMessage {
  return { id, role: "user", model: "user", providerId: "user", content, startedAt: at(minute), parts: [{ type: "text", text: content }] };
}
function reply(id: string, minute: number, parts: ChatMessage["parts"], extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id, role: "assistant", model: "claude-sonnet-5", providerId: "claude-code", content: "", turnId: `turn-${id}`,
    startedAt: at(minute - 1), completedAt: at(minute), terminalStopReason: "end_turn", parts, ...extra,
  };
}

// Before the visit: an approval you gave. After it: two finished turns with edits.
const MESSAGES: ChatMessage[] = [
  user("u1", 0, "Add CSV export."),
  reply("a1", 5, [
    { type: "approval", toolName: "Bash", requestId: "r1", description: "Run the migration\nmore", state: "approval-responded" },
  ]),
  user("u2", 10, "Keep the column order."),
  reply("a2", 70, [
    { type: "tool_use", toolUseId: "t1", toolName: "Edit", input: "{}", state: "output-available" },
    { type: "code_diff", filePath: "src/export.ts", oldContent: "", newContent: "x", status: "accepted" },
  ]),
  reply("a3", 90, [
    { type: "tool_use", toolUseId: "t2", toolName: "Bash", input: "{}", state: "output-available" },
    { type: "tool_use", toolUseId: "t3", toolName: "Read", input: "{}", state: "output-available", ownerAgentId: "sub" },
    { type: "code_diff", filePath: "src/export.ts", oldContent: "x", newContent: "y", status: "accepted" },
    { type: "code_diff", filePath: "src/csv.ts", oldContent: "", newContent: "z", status: "accepted" },
  ]),
];

/** What you had seen when your last message (u2) went: a1. */
const SEEN_AT_U2 = { partsByMessage: { a1: 1 }, finished: ["a1"] };

const APPROVAL_NEED = {
  id: "need-1", kind: "approval", priority: 1, repositoryPath: "/tmp/p", repositoryName: "p",
  workspaceId: "ws-1", workspaceName: "Default", taskId: "task-1", createdAt: at(95), waitingSince: at(95),
  source: "live", detail: "Run tests",
} as FleetAttentionItem;

afterEach(() => applyAppLocale("en"));

describe("the return summary's facts", () => {
  test("the last decision is the handoff record's newest approved decision, else your newest approval or answer", () => {
    expect(findLastDecision(MESSAGES, null)).toMatchObject({ kind: "approval", toolName: "Bash", description: "Run the migration", approved: true });
    const record = applyHandoffDraft({
      record: emptyHandoffRecord(),
      draft: { ...EMPTY_DRAFT, decisions: "- Use semicolons\n- Keep the public API stable" },
      at: at(20),
    });
    expect(findLastDecision(MESSAGES, record)).toEqual({ kind: "record", text: "Keep the public API stable", at: at(20) });
    const answered = [reply("q", 3, [{
      type: "user_input", requestId: "q1", toolName: "AskUserQuestion", state: "input-responded",
      questions: [{ question: "Which format?", header: "Format", options: [] }], answers: { "Which format?": "CSV" },
    }])];
    expect(findLastDecision(answered, null)).toEqual({ kind: "answer", question: "Which format?", answer: "CSV", at: at(3) });
    expect(findLastDecision([user("u", 0, "hi")], null)).toBeNull();
  });

  test("what changed counts finished turns, changed files and top-level steps after the visit", () => {
    expect(countChangesSince(MESSAGES, SEEN_AT_U2)).toEqual({ turns: 2, files: 2, steps: 2 });
    expect(countChangesSince(MESSAGES, captureReturnBaseline(MESSAGES))).toEqual({ turns: 0, files: 0, steps: 0 });
  });

  test("why it stopped comes from Fleet's attention item and its wait, and decides the next action", () => {
    const waiting = buildReturnSummary({ messages: MESSAGES, record: null, need: APPROVAL_NEED, running: true, baseline: SEEN_AT_U2 });
    expect(waiting.stop).toEqual({ kind: "need", need: "approval", since: at(95), detail: "Run tests" });
    expect(waiting.next).toEqual({ kind: "answer" });
    const record = applyHandoffDraft({ record: emptyHandoffRecord(), draft: { ...EMPTY_DRAFT, remaining: "- Add a filename prompt\n- Docs" }, at: at(20) });
    const idle = buildReturnSummary({ messages: MESSAGES, record, need: null, running: false, baseline: SEEN_AT_U2 });
    expect(idle.stop).toEqual({ kind: "finished", at: at(90) });
    expect(idle.next).toEqual({ kind: "remaining", text: "Add a filename prompt" });
    const failed = buildReturnSummary({
      messages: [...MESSAGES, reply("a4", 100, [], { terminalStopReason: "runtime_failure" })],
      record: null, need: null, running: false, baseline: SEEN_AT_U2,
    });
    expect(failed.stop).toMatchObject({ kind: "failed" });
    expect(failed.next).toEqual({ kind: "inspect-failure" });
    expect(buildReturnSummary({ messages: MESSAGES, record: null, need: null, running: true, baseline: SEEN_AT_U2 }).next).toEqual({ kind: "wait" });
  });

  test("the last visit is when you left this session, else your last message; a return is fifteen minutes away", () => {
    expect(resolveLastVisit({ messages: MESSAGES, leftAt: at(60), baseline: SEEN_AT_U2 })).toEqual({ at: at(60), kind: "visit", baseline: SEEN_AT_U2 });
    // Without one captured when you left, the replies begun by then count as seen.
    expect(resolveLastVisit({ messages: MESSAGES, leftAt: at(60) })).toEqual({ at: at(60), kind: "visit", baseline: SEEN_AT_U2 });
    expect(resolveLastVisit({ messages: MESSAGES, leftAt: null })).toEqual({ at: at(10), kind: "message", baseline: SEEN_AT_U2 });
    expect(resolveLastVisit({ messages: [], leftAt: null })).toBeNull();
    expect(isReturn({ lastVisitAt: at(0), now: T0 + RETURN_AWAY_MS })).toBe(true);
    expect(isReturn({ lastVisitAt: at(0), now: T0 + RETURN_AWAY_MS - 1 })).toBe(false);
    expect(hasReturnNews(buildReturnSummary({ messages: MESSAGES, record: null, need: null, running: false, baseline: captureReturnBaseline(MESSAGES) }))).toBe(false);
  });

  test("reads as four lines in English and Korean, each with where it comes from", () => {
    const summary = buildReturnSummary({ messages: MESSAGES, record: null, need: APPROVAL_NEED, running: true, baseline: SEEN_AT_U2 });
    const now = Date.parse(at(220));
    const lines = describeReturnSummary(summary, now);
    expect(lines.map((line) => [line.id, line.text, line.link?.target.kind ?? null])).toEqual([
      ["decision", "You allowed Run command: Run the migration", null],
      ["changes", "2 turns finished, 2 files changed, 2 steps", "tab"],
      ["stop", "Waiting for your approval for 2h 5m: Run tests", "request"],
      ["next", "Answer the request.", "request"],
    ]);
    applyAppLocale("ko");
    const ko = describeReturnSummary(summary, now);
    expect(ko[1]?.text).toBe("턴 2개 완료, 파일 2개 변경, 단계 2개");
    expect(ko[2]?.text).toContain("승인을 기다리는 중: Run tests");
  });
});

describe("what changed while you were away, against what you had seen", () => {
  // You left at minute 30, while a turn that began at minute 20 had made two steps.
  const LEFT = at(30);
  const step = (id: string): ChatMessage["parts"][number] => ({ type: "tool_use", toolUseId: id, toolName: "Bash", input: "{}", state: "output-available" });
  const diff: ChatMessage["parts"][number] = { type: "code_diff", filePath: "src/export.ts", oldContent: "", newContent: "x", status: "accepted" };
  const live = (parts: ChatMessage["parts"], extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: "live", role: "assistant", model: "claude-sonnet-5", providerId: "claude-code", content: "", turnId: "turn-live",
    startedAt: at(20), isStreaming: true, parts, ...extra,
  });
  const atDeparture = [user("u1", 19, "Migrate the export."), live([step("s1"), step("s2")])];
  const seen = { partsByMessage: { live: 2 }, finished: [] };
  const afterward = [step("s1"), step("s2"), step("s3"), diff, step("s4"), step("s5")];

  test("a turn that was running when you left counts the steps it made since, while it still runs", () => {
    const summary = buildReturnSummary({
      messages: [atDeparture[0]!, live(afterward)], record: null, need: null, running: true, baseline: seen,
    });
    expect(summary.changes).toEqual({ turns: 0, files: 1, steps: 3 });
  });

  test("once that turn finishes, it counts as a finished turn and still counts only the steps since you left", () => {
    const finished = live(afterward, { isStreaming: false, completedAt: at(50), terminalStopReason: "end_turn" });
    const summary = buildReturnSummary({
      messages: [atDeparture[0]!, finished], record: null, need: null, running: false, baseline: seen,
    });
    expect(summary.changes).toEqual({ turns: 1, files: 1, steps: 3 });
  });

  test("a page of older messages loaded after you came back is not news", () => {
    const older = reply("older", 5, [step("old-1"), diff]);
    const summary = buildReturnSummary({
      messages: [older, ...atDeparture], record: null, need: null, running: true, baseline: seen,
    });
    expect(summary.changes).toEqual({ turns: 0, files: 0, steps: 0 });
  });

  test("leaving a task keeps what you had seen of it, and coming back carries that", () => {
    const store = useTaskReturnStore.getState();
    store.noteLeft("task-seen", LEFT, atDeparture);
    store.noteArrived("task-seen", at(60));
    expect(useTaskReturnStore.getState().arrivalByTask["task-seen"]).toEqual({ at: at(60), leftAt: LEFT, baseline: seen });
  });
});

describe("returning to a task", () => {
  test("arriving remembers when you had left, and dismissing hides that return only", () => {
    const store = useTaskReturnStore.getState();
    store.noteLeft("task-x", at(0));
    store.noteArrived("task-x", at(30));
    expect(useTaskReturnStore.getState().arrivalByTask["task-x"]).toEqual({ at: at(30), leftAt: at(0), baseline: null });
    store.dismiss("task-x");
    expect(useTaskReturnStore.getState().dismissedByTask["task-x"]).toBe(at(30));
  });

  test("the card shows the four lines at the top of the conversation, and not after you write", () => {
    // Server rendering reads each store's initial state, so the return is seeded there.
    const app = useAppStore.getInitialState();
    const returns = useTaskReturnStore.getInitialState();
    const attention = useFleetAttentionStore.getInitialState();
    const handoff = useTaskHandoffStore.getInitialState();
    const original = {
      app: { activeWorkspaceId: app.activeWorkspaceId, messagesByTask: app.messagesByTask, activeTurnIdsByTask: app.activeTurnIdsByTask },
      returns: { arrivalByTask: returns.arrivalByTask },
      attention: { snapshot: attention.snapshot },
      handoff: { records: handoff.records },
    };
    try {
      Object.assign(app, { activeWorkspaceId: "ws-1", messagesByTask: { "task-1": MESSAGES }, activeTurnIdsByTask: { "task-1": "turn-live" } });
      Object.assign(returns, { arrivalByTask: { "task-1": { at: at(220), leftAt: null, baseline: null } } });
      Object.assign(attention, { snapshot: { ...attention.snapshot, items: [APPROVAL_NEED] } });
      Object.assign(handoff, { records: { [taskHandoffKey("ws-1", "task-1")]: emptyHandoffRecord() } });
      const html = renderToStaticMarkup(createElement(ReturnSummaryCard, { taskId: "task-1" }));
      expect(html).toContain("Welcome back");
      expect(html.match(/data-return-line=/g)).toHaveLength(4);
      expect(html).toContain("Waiting for your approval");
      Object.assign(app, { messagesByTask: { "task-1": [...MESSAGES, user("u3", 230, "Back now")] } });
      expect(renderToStaticMarkup(createElement(ReturnSummaryCard, { taskId: "task-1" }))).toBe("");
    } finally {
      Object.assign(app, original.app);
      Object.assign(returns, original.returns);
      Object.assign(attention, original.attention);
      Object.assign(handoff, original.handoff);
    }
  });
});
