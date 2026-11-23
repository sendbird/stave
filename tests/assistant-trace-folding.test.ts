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

test("starts folding at four tool steps, independent of intervening prose", () => {
  const prose = interim("Intermediate note");
  const short = [...finished.slice(0, 3), prose];
  expect(foldAssistantTrace(short, completedTurn)).toMatchObject({ visible: short, history: [], foldedStepCount: 0 });
  const long = [...finished, prose];
  expect(foldAssistantTrace(long, completedTurn)).toMatchObject({ visible: [], history: long, foldedStepCount: 4 });
});

test("keeps failed and subagent steps visible through turn completion", () => {
  const failure = step("failure", "output-error");
  const nonzeroExit = step("nonzero", "output-available", { exitCode: 1 });
  const doneAgent = { ...step("agent"), kind: "subagent" } as AssistantTraceEntry;
  const running = step("running", "input-available");
  const entries = [...finished, failure, nonzeroExit, doneAgent, running];
  expect(foldAssistantTrace(entries, { isRunning: true, hasTrailingResponse: false })).toMatchObject({
    visible: [failure, nonzeroExit, doneAgent, running],
    history: finished,
    failureCount: 2,
  });
  expect(foldAssistantTrace(entries, completedTurn)).toMatchObject({
    visible: [failure, nonzeroExit, doneAgent, running],
    history: finished,
    failureCount: 2,
  });
});

test("keeps the latest interim visible until newer prose or the end of the turn", () => {
  const old = interim("Earlier update");
  const latest = interim("Latest update");
  const entries = [old, ...finished, latest, step("running", "input-available")];
  const running = { isRunning: true, hasTrailingResponse: false };
  expect(foldAssistantTrace(entries, running).visible).toContain(latest);
  expect(foldAssistantTrace(entries, running).history).toContain(old);
  expect(foldAssistantTrace(entries, { ...running, hasTrailingResponse: true }).history).toContain(latest);
  expect(foldAssistantTrace(entries, completedTurn).history).toContain(latest);
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
