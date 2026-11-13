import { expect, test } from "bun:test";
import { createTarsInspectionReader } from "../electron/main/tars-inspection-readers";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import type { invokeHostService } from "../electron/main/host-service-client";

function fixture() {
  const fixtures = buildTarsSideViewFixtures(new Date("2026-11-05T00:00:00.000Z"));
  const row = fixtures.responsibilities.find((row) => row.id === "checkout")!;
  const savedDetail = fixtures.runs[row.agentRunId!]!;
  const check = { source: "stave" as const, type: "run-script" as const, scriptId: "test", exitCode: 1,
    durationMs: 12, outputTail: "Search assertion failed", verification: { sourceRevision: { status: "unknown", reason: "unavailable" }, completedRevision: { status: "unknown", reason: "unavailable" } } };
  const detail = { ...savedDetail, stages: savedDetail.stages.map((stage) => ({ ...stage,
    facts: { ...stage.facts!, workspaceScripts: [check] } })) } as typeof savedDetail;
  const calls: Array<{ method: string; args: unknown }> = [];
  let live = row;
  let run = detail;
  let prAvailable = true;
  let transcriptReads = 0;
  const invoke = (async (method: string, args: unknown) => {
    calls.push({ method, args });
    if (method === "agent-run.invoke") return { ok: true, value: run };
    if (method === "scm.get-pr-status-for-url") return prAvailable ? { ok: true, pr: { number: 42, state: "open", checks: { failed: 1 } } } : { ok: false, pr: null };
    if (method === "scm.review-diff") return { ok: true, baseSha: "a".repeat(40), headSha: "b".repeat(40), files: Array.from({ length: 7 }, (_, i) => ({ path: `file-${i}.ts`, status: "M" })) };
    if (method === "scm.review-file-diff") return { ok: true, oldContent: "old".repeat(2000), newContent: "new".repeat(2000) };
    throw new Error(`Unexpected write or read: ${method}`);
  }) as typeof invokeHostService;
  const read = createTarsInspectionReader({ tars: { get: () => live } as never,
    loadRepositoryRegistry: () => [{ repositoryPath: row.repositoryPath, workspaces: [{ id: row.executionWorkspaceId! }],
      workspacePathById: { [row.executionWorkspaceId!]: "/tmp/execution" } }] as never,
    loadTaskMessagesPage: () => { transcriptReads++; return { messages: [{ role: "assistant", content: "Transcript evidence" }], hasMoreOlder: true } as never; },
  }, invoke);
  return { row, detail, calls, read, setRow: (value: typeof row) => { live = value; }, setRun: (value: typeof run) => { run = value; },
    failPr: () => { prAvailable = false; }, transcriptReads: () => transcriptReads };
}

test("inspection uses the report and stage facts from the same existing run-detail reader", async () => {
  const f = fixture();
  const report = await f.read(f.row, "report");
  expect(report).toMatchObject({ source: "agent-run-detail", report: f.detail.report });
  const checks = await f.read(f.row, "checks") as { stages: Array<{ workspaceScripts: unknown[] }> };
  expect(checks.stages.some((stage) => stage.workspaceScripts.length > 0)).toBe(true);
  const transcript = await f.read(f.row, "transcript");
  expect(transcript).toMatchObject({ source: "recent-task-transcript", omittedOlder: true, messages: [{ role: "assistant", content: "Transcript evidence" }] });
  expect(f.calls.map((call) => call.method)).toEqual(["agent-run.invoke", "agent-run.invoke", "agent-run.invoke"]);
});

test("a changed execution or another run's task cannot grant transcript or diff access", async () => {
  const f = fixture();
  f.setRow({ ...f.row, agentRunId: "different-run" });
  await expect(f.read(f.row, "changes")).rejects.toThrow("execution changed");
  expect(f.calls).toEqual([]);
  f.setRow(f.row);
  f.setRun({ ...f.detail, agentRun: { ...f.detail.agentRun, leadTaskId: "unrelated-task" } });
  await expect(f.read(f.row, "transcript")).rejects.toThrow("does not belong");
  expect(f.transcriptReads()).toBe(0);
  expect(f.calls.map((call) => call.method)).toEqual(["agent-run.invoke"]);
});

test("diff reads use the recorded run base and guarded readers, with bounded file count and excerpts", async () => {
  const f = fixture();
  const result = await f.read(f.row, "changes") as { omittedFiles: number; files: Array<{ oldContent: string; newContent: string; truncated: boolean }> };
  expect(result.files).toHaveLength(4);
  expect(result.omittedFiles).toBe(3);
  expect(result.files.every((file) => file.oldContent.length === 2000 && file.newContent.length === 2000 && file.truncated)).toBe(true);
  expect(f.calls[1]).toMatchObject({ method: "scm.review-diff", args: { cwd: "/tmp/execution", base: { kind: "commit" } } });
  expect(f.calls.slice(2).every((call) => call.method === "scm.review-file-diff")).toBe(true);
});

test("PR inspections keep saved publication separate from live checks and survive failed live reads", async () => {
  const f = fixture();
  const publication = { ...f.row.publication!, state: "opened" as const, number: 42, url: "https://example.com/acme/project/pull/42" };
  const row = { ...f.row, publication };
  f.setRow(row);
  expect(await f.read(row, "pullRequest")).toMatchObject({ publication, liveChecks: "read", live: { checks: { failed: 1 } } });
  f.failPr();
  expect(await f.read(row, "pullRequest")).toMatchObject({ publication, liveChecks: "unavailable", live: null });
  expect(f.calls.every((call) => call.method === "scm.get-pr-status-for-url")).toBe(true);
});
