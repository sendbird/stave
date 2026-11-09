import { describe, expect, test } from "bun:test";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { buildTarsOutputs, tarsRecordedChangeCount } from "../src/lib/tars/outputs-model";
import { projectTarsReport, projectTarsReview, tarsRevisionFreshness } from "../src/lib/tars/report-model";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";

const start = new Date("2026-11-05T00:00:00.000Z");
const fixtures = () => buildTarsSideViewFixtures(start);
const rowOf = (f: ReturnType<typeof fixtures>, id: string) => f.responsibilities.find((row) => row.id === id)!;
const runOf = (f: ReturnType<typeof fixtures>, id: string) => f.runs[rowOf(f, id).agentRunId!]!;

describe("result report projection", () => {
  test("the report says what the run spent: the frozen report's usage first, else the live run's, else nothing", () => {
    const f = buildTarsSideViewFixtures(start);
    const run = runOf(f, "checkout")!;
    const frozen = { turns: 4, measuredTurns: 4, inputTokens: 9000, outputTokens: 1000, costUsd: 1.24 };
    const live = { turns: 5, measuredTurns: 5, inputTokens: 9900, outputTokens: 1100, costUsd: 1.5 };
    expect(projectTarsReport(rowOf(f, "checkout"), { ...run, report: { ...run.report!, usage: frozen }, usage: live }).usage).toEqual(frozen);
    expect(projectTarsReport(rowOf(f, "checkout"), { ...run, report: { ...run.report!, usage: undefined }, usage: live }).usage).toEqual(live);
    expect(projectTarsReport(rowOf(f, "checkout"), { ...run, report: { ...run.report!, usage: undefined }, usage: undefined }).usage).toBeNull();
  });

  test("is the run's frozen report: when it ended, the final revision, each criterion's status and what decided it", () => {
    const f = fixtures();
    const model = projectTarsReport(rowOf(f, "checkout"), runOf(f, "checkout"));
    expect(model).toMatchObject({ state: "frozen", frozenAt: "2026-11-05T00:40:00.000Z", outcome: "completed", finalRevision: "9e2b7c11", unmet: [] });
    // Verify reported both last, on the final revision: that report decided them.
    expect(model.criteria.map((criterion) => [criterion.text, criterion.status, criterion.source])).toEqual([
      ["Checkout shows the saved card first.", "met", { kind: "agent", stageTitle: "Verify", revision: "9e2b7c11", freshness: "current" }],
      ["The checkout tests pass.", "met", { kind: "agent", stageTitle: "Verify", revision: "9e2b7c11", freshness: "current" }],
    ]);
    expect(model.links).toEqual([{ label: "Draft pull request #42", url: "https://example.com/acme/shop/pull/42", source: "agent" }]);
  });

  test("evidence stays with the stage that reported it, once, labelled by source and revision", () => {
    const f = fixtures();
    const model = projectTarsReport(rowOf(f, "checkout"), runOf(f, "checkout"));
    expect(model.evidenceGroups.map((group) => [group.stageTitle, group.evidence.map((item) => [item.evidence.label, item.source, item.verified, item.revision, item.freshness])])).toEqual([
      ["Work", [["Checkout unit tests", "stave", true, "4f1c9a20", "superseded"]]],
      ["Review", [["Reviewed the diff and the test run", "agent", false, "9e2b7c11", "current"]]],
      ["Verify", [["Checkout unit tests", "stave", true, "9e2b7c11", "current"]]],
    ]);
    // No criterion carries a copy of a stage's evidence.
    expect(model.criteria.every((criterion) => !("evidence" in criterion))).toBe(true);
  });

  test("a criterion a Stave check decided shows that check's result and revision, overriding the agent's report in the stage", () => {
    const f = fixtures();
    const run = runOf(f, "checkout");
    const text = "The checkout tests pass.";
    const workflow = { ...run.agentRun.workflow, stages: run.agentRun.workflow.stages.map((stage) => stage.id === "verify" && stage.kind === "ai"
      ? { ...stage, acceptanceCriteria: [{ text, required: true, verification: "stave-check" as const, scriptIds: ["test"] }] } : stage) };
    const revision = { status: "known" as const, revision: "9e2b7c11a0d4f853" };
    const check = (exitCode: number) => ({ source: "stave" as const, type: "run-script" as const, scriptId: "test", exitCode,
      verification: { sourceRevision: revision, completedRevision: revision }, durationMs: 1000, outputTail: "" });
    const withCheck = (exitCode: number) => ({ ...run, agentRun: { ...run.agentRun, workflow },
      stages: run.stages.map((record) => record.stageId === "verify" ? { ...record, facts: { ...record.facts!, workspaceScripts: [check(exitCode)] } } : record) });
    expect(projectTarsReport(rowOf(f, "checkout"), withCheck(0)).criteria[1]!.source)
      .toEqual({ kind: "check", stageTitle: "Verify", name: "test", exitCode: 0, revision: "9e2b7c11", freshness: "current" });
    expect(projectTarsReport(rowOf(f, "checkout"), withCheck(1)).criteria[1]!.source).toMatchObject({ kind: "check", exitCode: 1 });
    const notRun = { ...withCheck(0), stages: run.stages };
    expect(projectTarsReport(rowOf(f, "checkout"), { ...notRun, agentRun: { ...run.agentRun, workflow } }).criteria[1]!.source).toMatchObject({ kind: "check", exitCode: null });
  });

  test("revision freshness: current, superseded, final revision unknown, unknown", () => {
    const known = (revision: string) => ({ status: "known" as const, revision });
    expect(tarsRevisionFreshness(known("a"), known("a"))).toBe("current");
    expect(tarsRevisionFreshness(known("a"), known("b"))).toBe("superseded");
    expect(tarsRevisionFreshness(known("a"), undefined)).toBe("finalUnknown");
    expect(tarsRevisionFreshness(known("a"), { status: "unknown", reason: "changing" })).toBe("finalUnknown");
    expect(tarsRevisionFreshness(undefined, known("b"))).toBe("unknown");
  });

  test("a stopped run lists what is unmet and what it left behind; agent claims stay agent claims", () => {
    const f = fixtures();
    const model = projectTarsReport(rowOf(f, "search"), runOf(f, "search"));
    expect(model).toMatchObject({ state: "frozen", outcome: "stopped", reason: "The rebuild time could not be measured on the production dataset." });
    expect(model.unmet.map((criterion) => [criterion.text, criterion.status, criterion.source.kind])).toEqual([["The rebuild finishes in under two minutes.", "unverified", "agent"]]);
    expect(model.leftBehind).toHaveLength(1);
    expect(model.evidenceGroups.flatMap((group) => group.evidence).every((item) => item.source === "agent" && !item.verified)).toBe(true);
  });

  test("a delegated criterion the report left out reads as not reported, never as met", () => {
    const f = fixtures();
    const row = { ...rowOf(f, "checkout"), acceptanceCriteria: [...rowOf(f, "checkout").acceptanceCriteria, "Saved cards survive a reload."] };
    const model = projectTarsReport(row, runOf(f, "checkout"));
    expect(model.unmet).toEqual([{ text: "Saved cards survive a reload.", required: true, status: "notReported", source: { kind: "none" } }]);
  });

  test("without an ended run there is no report: pending while it runs, unavailable when unread; never live text", () => {
    const tray = buildTarsTrayFixtures(start);
    const billing = tray.responsibilities.find((row) => row.id === "billing")!;
    const pending = projectTarsReport(billing, tray.runs[billing.agentRunId!]);
    expect(pending).toMatchObject({ state: "pending", frozenAt: null, outcome: null, evidenceGroups: [] });
    expect(pending.criteria.every((criterion) => criterion.status === "notReported")).toBe(true);
    expect(projectTarsReport(billing, undefined).state).toBe("unavailable");
  });
});

describe("review projection", () => {
  test("is the reviewer stage's verdict, findings and the revision it reviewed", () => {
    const f = fixtures();
    expect(projectTarsReview(runOf(f, "checkout"))).toMatchObject({
      stageId: "review", verdict: "passed", attempts: 1, revision: "9e2b7c11", freshness: "current", blocked: null,
      findings: [{ decision: "Rename savedId to preferredCardId" }, { decision: "Cover a wallet with no saved card" }],
    });
  });

  test("is absent before the reviewer starts or without a reviewer stage", () => {
    const f = fixtures();
    expect(projectTarsReview(runOf(f, "search"))).toBeNull();
    const tray = buildTarsTrayFixtures(start);
    expect(projectTarsReview(Object.values(tray.runs)[0])).toBeNull();
    expect(projectTarsReview(undefined)).toBeNull();
  });
});

describe("tray outputs", () => {
  test("per responsibility, newest first: report once ended, changes when recorded, review when present, then recorded links", () => {
    const f = fixtures();
    const outputs = buildTarsOutputs({ responsibilities: f.responsibilities, runs: f.runs });
    expect(outputs.map((output) => `${output.responsibilityId}:${output.kind}`)).toEqual([
      "search:report", "search:changes", "checkout:report", "checkout:changes", "checkout:review", "checkout:link",
    ]);
    expect(outputs.find((output) => output.kind === "changes" && output.responsibilityId === "checkout")).toMatchObject({ files: 2 });
    expect(outputs.find((output) => output.kind === "link")).toMatchObject({ url: "https://example.com/acme/shop/pull/42" });
  });

  test("running work without a report, changes or review has no outputs; an unread run has none", () => {
    const tray = buildTarsTrayFixtures(start);
    expect(buildTarsOutputs({ responsibilities: tray.responsibilities, runs: tray.runs })).toEqual([]);
    const f = fixtures();
    expect(buildTarsOutputs({ responsibilities: f.responsibilities, runs: {} })).toEqual([]);
  });

  test("a change count is the union of recorded paths; a truncated list has no count; none means no changes output", () => {
    const f = fixtures();
    const run = runOf(f, "checkout");
    expect(tarsRecordedChangeCount(run)).toBe(2);
    const truncated: AgentRunDetail = { ...run, stages: run.stages.map((record) => record.facts ? { ...record, facts: { ...record.facts, changedPathsTruncated: true } } : record) };
    expect(tarsRecordedChangeCount(truncated)).toBeNull();
    const unchanged: AgentRunDetail = { ...run, stages: run.stages.map((record) => record.facts ? { ...record, facts: { ...record.facts, changedPaths: [], diff: null } } : record) };
    expect(tarsRecordedChangeCount(unchanged)).toBe(0);
    // A stage Stave read whose change it could not tell is not "no change": Changes stays listed, without a count.
    const unknown: AgentRunDetail = { ...run, stages: run.stages.map((record) => record.facts ? { ...record, facts: { ...record.facts, changedPaths: undefined, diff: null } } : record) };
    expect(tarsRecordedChangeCount(unknown)).toBeNull();
    expect(buildTarsOutputs({ responsibilities: [rowOf(f, "checkout")], runs: { [run.agentRun.id]: unknown } }).find((output) => output.kind === "changes"))
      .toMatchObject({ files: null });
  });
});
