import { expect, test } from "bun:test";
import type { AssistantTraceEntry } from "@/components/session/message/assistant-trace-builder";
import { findTraceSearchEntry, foldAssistantTrace, getTraceElapsedMs } from "@/components/session/message/assistant-trace-folding";
import type { ToolUsePart } from "@/types/chat";

function step(
  id: string,
  state: ToolUsePart["state"] = "output-available",
  options: Partial<ToolUsePart> = {},
): AssistantTraceEntry {
  return { id, kind: "tool", part: { type: "tool_use", toolUseId: id, toolName: "Read", input: "", state, ...options } };
}

function interim(text: string): AssistantTraceEntry {
  return { id: text, kind: "assistant_text", parts: [{ type: "text", text }] };
}

const finished = [step("one"), step("two"), step("three"), step("four")];
const completedTurn = { isRunning: false, hasTrailingResponse: true };
const runningTurn = { isRunning: true, hasTrailingResponse: false };

test("keeps every entry in history in the order it happened, whatever the step count", () => {
  const prose = interim("Intermediate note");
  const short = [step("one"), prose, step("two")];
  expect(foldAssistantTrace(short, completedTurn)).toEqual({ visible: [], history: short, stepCount: 2 });
  const long = [...finished, prose];
  expect(foldAssistantTrace(long, completedTurn)).toEqual({ visible: [], history: long, stepCount: 4 });
});

test("keeps failed tool steps inside history instead of pinning them outside", () => {
  const failure = step("failure", "output-error");
  const nonzeroExit = step("nonzero", "output-available", { exitCode: 1 });
  const running = step("running", "input-available");
  const entries = [step("one"), failure, nonzeroExit, step("two"), running];
  expect(foldAssistantTrace(entries, runningTurn)).toEqual({ visible: [], history: entries, stepCount: 5 });
  expect(foldAssistantTrace(entries, completedTurn).visible).toEqual([]);
});

test("shows running subagents while the turn runs and folds finished ones", () => {
  const doneAgent = { ...step("done-agent"), kind: "subagent" } as AssistantTraceEntry;
  const liveAgent = { ...step("live-agent", "input-available"), kind: "subagent" } as AssistantTraceEntry;
  const entries = [...finished, doneAgent, liveAgent];
  expect(foldAssistantTrace(entries, runningTurn).visible).toEqual([liveAgent]);
  expect(foldAssistantTrace(entries, completedTurn).visible).toEqual([]);
});

test("keeps only the latest interim visible until newer prose or the end of the turn", () => {
  const old = interim("Earlier update");
  const latest = interim("Latest update");
  const entries = [old, ...finished, latest, step("running", "input-available")];
  expect(foldAssistantTrace(entries, runningTurn).visible).toEqual([latest]);
  expect(foldAssistantTrace(entries, { ...runningTurn, hasTrailingResponse: true }).visible).toEqual([]);
  expect(foldAssistantTrace(entries, completedTurn).visible).toEqual([]);
});

test("keeps requests that still need a decision visible while folded", () => {
  const approval = (state: string) => ({
    id: `approval-${state}`, kind: "approval",
    part: { type: "approval", toolName: "Bash", description: "", requestId: state, state },
  }) as AssistantTraceEntry;
  const diff = (status: string) => ({
    id: `diff-${status}`, kind: "diff",
    parts: [{ type: "code_diff", filePath: "a.ts", oldContent: "", newContent: "", status }],
  }) as AssistantTraceEntry;
  const pending = approval("approval-requested");
  const answered = approval("approval-responded");
  const pendingDiff = diff("pending");
  const entries = [step("one"), pending, answered, pendingDiff, diff("accepted")];
  expect(foldAssistantTrace(entries, runningTurn).visible).toEqual([pending, pendingDiff]);
  // A settled turn shows pending file changes in the block below the trace.
  expect(foldAssistantTrace(entries, completedTurn).visible).toEqual([pending]);
});

test("leaves question cards out of the trace", () => {
  const question = { id: "question", kind: "user_input" } as AssistantTraceEntry;
  expect(foldAssistantTrace([step("one"), question], completedTurn).history).toEqual([step("one")]);
});

test("finds indexed interim prose and tool names for exact row reveal", () => {
  const note = interim("A queued export is ready.");
  const read = step("read", "output-available", { output: "Secret tool payload" });
  expect(findTraceSearchEntry([note, read], "QUEUED export")).toBe(note);
  expect(findTraceSearchEntry([note, read], "read")).toBe(note); // First indexed occurrence is in “ready”.
  expect(findTraceSearchEntry([read], "read")).toBe(read);
  expect(findTraceSearchEntry([note, read], "Secret tool")).toBeUndefined();
});

test("uses wall-clock time for active and completed turns and omits missing timing", () => {
  const startedAt = "2026-11-22T10:00:00Z";
  const completedAt = "2026-11-22T10:01:30Z";
  const later = Date.parse("2026-11-22T10:10:00Z");
  expect(getTraceElapsedMs({ startedAt, completedAt }, later)).toBe(90_000);
  expect(getTraceElapsedMs({ startedAt }, Date.parse("2026-11-22T10:00:45Z"))).toBe(45_000);
  expect(getTraceElapsedMs({ startedAt })).toBeUndefined();
  expect(getTraceElapsedMs({ startedAt: "invalid", completedAt })).toBeUndefined();
  expect(getTraceElapsedMs({ startedAt: completedAt, completedAt: startedAt })).toBeUndefined();
});
