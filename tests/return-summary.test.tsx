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
    expect(findLastDecision(MESSAGES, null)).toEqual({
      kind: "approval", toolName: "Bash", description: "Run the migration", approved: true, at: at(5), messageId: "a1", requestId: "r1",
    });
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
    expect(findLastDecision(answered, null)).toEqual({ kind: "answer", question: "Which format?", answer: "CSV", at: at(3), messageId: "q", requestId: "q1" });
    expect(findLastDecision([user("u", 0, "hi")], null)).toBeNull();
  });

  test("an approval a Stave rule or the provider's mode decided is not your decision", async () => {
    const { collectGrantedApprovals } = await import("@/components/session/handoff-facts");
    const automatic = reply("auto", 80, [
      {
        type: "approval", toolName: "Edit", requestId: "r-auto", description: "Edit server/users.ts", state: "approval-responded",
        prompted: false, resolution: { decision: "allowed", source: "provider-auto", reason: "permission-mode", decidedAt: at(80) },
      },
      {
        type: "approval", toolName: "Bash", requestId: "r-rule", description: "Run the linter", state: "approval-responded",
        resolution: { decision: "allowed", source: "rule", reason: "trusted-tool", decidedAt: at(80) },
      },
    ]);
    const messages = [...MESSAGES, automatic];
    // The newest approval you answered is still a1's.
    expect(findLastDecision(messages, null)).toMatchObject({ kind: "approval", requestId: "r1" });
    expect(collectGrantedApprovals(messages).map((approval) => approval.description)).toEqual(["Run the migration"]);
    // One you answered, recorded as yours, counts.
    const yours = reply("yours", 85, [{
      type: "approval", toolName: "Bash", requestId: "r-yours", description: "Deploy", state: "output-denied",
      resolution: { decision: "denied", source: "user", decidedAt: at(85) },
    }]);
    expect(findLastDecision([...messages, yours], null)).toMatchObject({ kind: "approval", requestId: "r-yours", approved: false });
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

  test("leads with where it stands and the one action, then the facts, in English and Korean", () => {
    const summary = buildReturnSummary({ messages: MESSAGES, record: null, need: APPROVAL_NEED, running: true, baseline: SEEN_AT_U2 });
    const now = Date.parse(at(220));
    const view = describeReturnSummary(summary, now);
    expect(view.status).toEqual({
      state: "approval",
      text: "Waiting for your approval for 2h 5m",
      detail: "Run tests",
      next: null,
      action: { label: "Show request", target: { kind: "request" } },
      urgent: true,
    });
    expect(view.facts.map((line) => [line.id, line.text, line.link?.target.kind ?? null])).toEqual([
      ["changes", "2 turns finished · 2 files changed", "tab"],
      ["decision", "You allowed Run command: Run the migration", "decision"],
    ]);
    // An approval or answer links to where it was given in the conversation.
    expect(view.facts[1]?.link).toEqual({ label: "Show", target: { kind: "decision", messageId: "a1", requestId: "r1" } });
    applyAppLocale("ko");
    const ko = describeReturnSummary(summary, now);
    expect(ko.facts[0]?.text).toBe("턴 2개 완료 · 파일 2개 변경");
    expect(ko.status.text).toContain("승인 대기 중");
    expect(ko.status.action.label).toBe("요청 보기");
  });

  test("a fact with nothing to say is left out, and an idle task offers its next step quietly", () => {
    const record = applyHandoffDraft({ record: emptyHandoffRecord(), draft: { ...EMPTY_DRAFT, remaining: "- Add a filename prompt" }, at: at(20) });
    const caughtUp = captureReturnBaseline(MESSAGES);
    const idle = describeReturnSummary(
      buildReturnSummary({ messages: MESSAGES, record, need: null, running: false, baseline: caughtUp }),
      Date.parse(at(220)),
    );
    // Nothing changed since the visit, so only the decision stays.
    expect(idle.facts.map((line) => line.id)).toEqual(["decision"]);
    expect(idle.status).toMatchObject({
      state: "ready",
      next: "Add a filename prompt",
      action: { target: { kind: "tab", tab: "handoff" } },
      urgent: false,
    });
    const fresh = describeReturnSummary(
      buildReturnSummary({ messages: [user("u", 0, "hi")], record: null, need: null, running: true, baseline: caughtUp }),
      Date.parse(at(220)),
    );
    expect(fresh.facts).toEqual([]);
    // A pull request's wait is read in Activity, not answered in the composer.
    const prWait = describeReturnSummary(
      buildReturnSummary({
        messages: MESSAGES, record: null, running: false, baseline: caughtUp,
        need: { ...APPROVAL_NEED, kind: "pr-checks-failed", detail: null } as FleetAttentionItem,
      }),
      Date.parse(at(220)),
    );
    expect(prWait.status).toMatchObject({ action: { target: { kind: "tab", tab: "activity" } }, urgent: true });
    expect(fresh.status).toMatchObject({ state: "working", text: "Still working", action: { target: { kind: "side-question" } } });
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

describe("going to the last decision", () => {
  test("following an approval or answer asks the conversation to reveal it by its message and request", async () => {
    const { followReturnLink } = await import("@/components/session/return-summary/ReturnSummaryCard");
    const before = useAppStore.getState().focusTranscriptToolRequest;
    try {
      useTaskReturnStore.getState().noteArrived("task-1", at(220));
      followReturnLink({ kind: "decision", messageId: "a1", requestId: "r1" }, "ws-1", "task-1");
      expect(useAppStore.getState().focusTranscriptToolRequest).toMatchObject({
        taskId: "task-1",
        decision: { messageId: "a1", requestId: "r1" },
      });
      // The card closes so it does not cover the decision near the top of the conversation.
      expect(useTaskReturnStore.getState().dismissedByTask["task-1"]).toBe(at(220));
    } finally {
      useAppStore.setState({ focusTranscriptToolRequest: before });
    }
  });

  test("the conversation finds the decision in its own message, else wherever its request is, and opens that trace", async () => {
    const { findMessageIndexByDecision } = await import("@/components/session/chat-panel.utils");
    const { buildAssistantTrace, traceHasDecision } = await import("@/components/session/message/assistant-trace-builder");
    expect(findMessageIndexByDecision({ messages: MESSAGES, messageId: "a1", requestId: "r1" })).toBe(1);
    // A reply split for display keeps the request, not the message id.
    expect(findMessageIndexByDecision({ messages: MESSAGES, messageId: "a1:segment-0", requestId: "r1" })).toBe(1);
    expect(findMessageIndexByDecision({ messages: MESSAGES, messageId: "a1", requestId: "gone" })).toBe(-1);
    const trace = buildAssistantTrace({ message: MESSAGES[1]! });
    expect(traceHasDecision(trace.entries, "r1")).toBe(true);
    expect(traceHasDecision(trace.entries, "t1")).toBe(false);
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

  test("the card leads with the status and its action, then the facts, and goes after you write", () => {
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
      expect(html.match(/data-return-line=/g)).toHaveLength(3);
      expect(html).toContain("Waiting for your approval");
      expect(html.indexOf('data-return-line="status"')).toBeLessThan(html.indexOf('data-return-line="changes"'));
      expect(html).toContain('data-return-action="request"');
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
