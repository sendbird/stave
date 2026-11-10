import { describe, expect, test } from "bun:test";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { projectTarsResult, tarsResultOutcome } from "../src/lib/tars/result-model";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { buildTarsResultFixtures } from "../src/dev/tars-preview/tars-result-fixtures";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";

const START = new Date("2026-11-05T00:00:00.000Z");

function fixture(key: keyof ReturnType<typeof buildTarsResultFixtures>["ids"]) {
  const fixtures = buildTarsResultFixtures(START);
  const row = fixtures.responsibilities.find((entry) => entry.id === fixtures.ids[key])!;
  return { row, run: fixtures.runs[row.agentRunId!]! };
}

const project = (row: TarsResponsibility, run: AgentRunDetail | undefined, outcome: "completed" | "blocked" | "failed" = "completed") => projectTarsResult({ outcome, row, run });
const kinds = (model: ReturnType<typeof projectTarsResult>) => model.criteria.map((criterion) => criterion.kind);
/** The same run with one stage's latest record changed, as a later read would hold it. */
function withStage(run: AgentRunDetail, stageId: string, change: (record: AgentRunDetail["stages"][number]) => AgentRunDetail["stages"][number]): AgentRunDetail {
  return { ...run, stages: run.stages.map((record) => record.stageId === stageId ? change(structuredClone(record)) : record) };
}

describe("Tars result model", () => {
  test("a notice's outcome: completed, blocked, or failed when the run itself could not go on", () => {
    const of = (kind: "completed" | "blocked" | "cancelled", detailCode?: TarsResponsibility["detailCode"], reason?: string) =>
      tarsResultOutcome({ kind, activity: { detailCode, detailParams: reason ? { reason } : undefined } });
    expect(of("completed")).toBe("completed");
    expect(of("cancelled", "runCancelled")).toBeNull();
    expect(of("blocked")).toBe("blocked");
    expect(of("blocked", "waitingForUser")).toBe("blocked");
    // Unmet criteria are a result to read, not a breakdown.
    expect(of("blocked", "runStopped", "acceptance-unmet")).toBe("blocked");
    expect(of("blocked", "runStopped", "turn-cap-reached")).toBe("failed");
    expect(of("blocked", "runStopped")).toBe("failed");
    expect(of("blocked", "turnStartFailed")).toBe("failed");
  });

  test("verified work: a criterion is verified by its own passing check or by the review that stands, and says which", () => {
    const { row, run } = fixture("verified");
    const model = project(row, run);
    expect(model.criteria).toEqual([
      { text: "The exported file opens in a spreadsheet with one row per invoice.", kind: "verifiedReview" },
      { text: "The export tests pass.", kind: "verifiedCheck" },
    ]);
    expect(model.staveChecks).toEqual(["test"]);
    expect(model.changes).toEqual({ files: 3, lines: { insertions: 42, deletions: 7 } });
    expect(model.review).toEqual({ verdict: "passed", findings: 0, blocked: false });
    expect(model.summary).toStartWith("Added the CSV export");
    expect(model.report).toBe("frozen");
    expect(model.durationMs).toBe(40 * 60_000);
  });

  test("agent-reported work is never shown as verified", () => {
    const { row, run } = fixture("reported");
    const model = project(row, run);
    expect(kinds(model)).toEqual(["reported", "reported"]);
    expect(model.staveChecks).toEqual([]);
    expect(model.review).toBeNull();
  });

  test("a review that no longer stands verifies nothing", () => {
    const { row, run } = fixture("verified");
    // Reviewed on an earlier revision than the run ended on.
    const stale = withStage(run, "review", (record) => {
      if (record.report?.outcome === "complete") record.report.workspaceRevision = { status: "known", revision: "0000000000000000" };
      return record;
    });
    expect(kinds(project(row, stale))).toEqual(["reported", "verifiedCheck"]);
    // Changes were requested: the verdict is not a pass.
    const requested = withStage(run, "review", (record) => {
      if (record.report?.outcome === "complete") record.report.reviewVerdict = "changes-requested";
      return record;
    });
    expect(kinds(project(row, requested))).toEqual(["reported", "verifiedCheck"]);
    // Handed back after the review started: the host asks for a fresh one, so the old pass does not count.
    expect(kinds(project({ ...row, reverifyAfter: new Date(START.getTime() + 25 * 60_000).toISOString() }, run))).toEqual(["reported", "verifiedCheck"]);
    expect(kinds(project({ ...row, reverifyAfter: new Date(START.getTime() + 20 * 60_000).toISOString() }, run))).toEqual(["verifiedReview", "verifiedCheck"]);
  });

  test("a criterion its Stave check decides is not lifted by the review when the check did not pass on the final revision", () => {
    const { row, run } = fixture("verified");
    const failedCheck = withStage(run, "verify", (record) => {
      record.facts!.workspaceScripts![0]!.exitCode = 1;
      return record;
    });
    expect(kinds(project(row, failedCheck))).toEqual(["verifiedReview", "unverified"]);
    const earlierCheck = withStage(run, "verify", (record) => {
      record.facts!.workspaceScripts![0]!.verification.completedRevision = { status: "known", revision: "0000000000000000" };
      return record;
    });
    expect(kinds(project(row, earlierCheck))).toEqual(["verifiedReview", "unverified"]);
  });

  test("blocked work keeps the report's own statuses; failed work whose run never ended has no report to read", () => {
    const stalled = fixture("stalled");
    const blocked = project(stalled.row, stalled.run, "blocked");
    expect(kinds(blocked)).toEqual(["unmet", "reported"]);
    expect(blocked.changes).toEqual({ files: 4, lines: { insertions: 96, deletions: 31 } });
    expect(blocked.review).toBeNull();
    const failed = fixture("failed");
    const model = project(failed.row, failed.run, "failed");
    expect(model).toMatchObject({ outcome: "failed", report: "pending", criteria: [], staveChecks: [], changes: null, review: null, summary: null });
    // Its clock still counts, so the card names no duration.
    expect(model.durationMs).toBeNull();
  });

  test("work whose run this window has not read shows nothing it did not read", () => {
    const { row } = fixture("published");
    expect(project(row, undefined)).toEqual({ outcome: "completed", durationMs: null, report: "unavailable", criteria: [], staveChecks: [], changes: null, review: null, summary: null });
  });

  test("the side view's completed checkout: review findings are counted and Stave's own check is named", () => {
    const side = buildTarsSideViewFixtures(START);
    const row = side.responsibilities.find((entry) => entry.id === side.ids.checkout)!;
    const model = project(row, side.runs[row.agentRunId!]);
    expect(kinds(model)).toEqual(["verifiedReview", "verifiedReview"]);
    expect(model.review).toEqual({ verdict: "passed", findings: 2, blocked: false });
    expect(model.staveChecks).toEqual(["bun test checkout"]);
  });
});
