import { expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { describeTarsModelSelection } from "../src/lib/tars/model-selection";

function fixture() {
  applyAppLocale("en");
  const f = buildTarsTrayFixtures(new Date("2026-11-05T00:00:00.000Z"));
  return { row: f.responsibilities.find((row) => row.id === "billing")!, run: f.runs["run-billing"]! };
}

test("shows the latest linked selection and effort, rather than the run's initial model", () => {
  const { row, run } = fixture();
  expect(describeTarsModelSelection(row, run)).toBe("GPT-6.1 Sol · High");
  const selection = run.events[0]!.detail.routeSelection as Record<string, unknown>;
  selection.requestedEffort = null;
  expect(describeTarsModelSelection(row, run)).toBe("GPT-6.1 Sol");
});

test("does not borrow the previous attempt, stage, another run, or an unlinked turn", () => {
  const { row, run } = fixture();
  expect(describeTarsModelSelection(row, null)).toBeNull();
  expect(describeTarsModelSelection({ ...row, agentRunId: "other" }, run)).toBeNull();
  expect(describeTarsModelSelection(row, { ...run, events: [run.events[0]!] })).toBeNull();
  expect(describeTarsModelSelection(row, { ...run, stages: run.stages.map((stage) => ({ ...stage, attempt: 3 })) })).toBeNull();
  expect(describeTarsModelSelection(row, { ...run, agentRun: { ...run.agentRun, currentStageIndex: 2 } })).toBeNull();
});

test("a new incomplete dispatch replaces the previous selection instead of displaying it as current", () => {
  const { row, run } = fixture();
  const next = { ...run.events[0]!, id: "next", sequence: 3, idempotencyKey: "next-dispatch" };
  expect(describeTarsModelSelection(row, { ...run, events: [...run.events, next] })).toBeNull();
  next.detail = { ...next.detail, routeSelection: { invalid: true } };
  expect(describeTarsModelSelection(row, { ...run, events: [...run.events, next] })).toBeNull();
});

test("hides selections for paused, queued, completed and taken-over work", () => {
  const { row, run } = fixture();
  for (const state of ["paused", "queued", "completed", "takenOver"] as const)
    expect(describeTarsModelSelection({ ...row, state }, run)).toBeNull();
  expect(describeTarsModelSelection(row, { ...run, agentRun: { ...run.agentRun, state: "completed" } })).toBeNull();
});
