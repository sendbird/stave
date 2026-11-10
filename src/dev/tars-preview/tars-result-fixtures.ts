import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildAgentRunStartInput } from "@/lib/agent-runs/agent-run";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { createAgentRun, type AgentRun, type AgentRunStageRecord, type StageFacts } from "@/lib/agent-runs/domain";
import { buildAgentRunReport } from "@/lib/agent-runs/report";
import { agentRunTurnStartFailureDetail } from "@/lib/agent-runs/turn-start-failure";
import type { WorkspaceRevision } from "@/lib/agent-runs/verification-contract";
import type { TarsResponsibility } from "@/lib/tars/types";
import type { Workflow, WorkflowStage } from "@/lib/workflows/schema";

const revision = (value: string): WorkspaceRevision => ({ status: "known", revision: value });
const REV_WORK = revision("1c7d40a9e2b3f556");
const REV_FINAL = revision("6a0f93d2c4e1b877");
/** The frozen definition of the workspace's test script: a check counts only against the definition the criterion was admitted with. */
const TEST_SCRIPT_HASH = "e".repeat(64);

/**
 * Ended Tars work for the conversation's result card, in the preview gallery
 * and its tests. Each row's run is built from the real saved shapes, so the
 * card's own projection decides what it shows:
 * - `verified`: completed; one criterion a Stave check passed on the final
 *   revision, one the independent review confirmed, and changed files.
 * - `reported`: completed after the user accepted it; the review never ran,
 *   so every criterion is the agent's report alone.
 * - `published`: completed and reviewed, with its draft pull request open.
 * - `stalled`: blocked; its run stopped with a criterion unmet and left its
 *   own words as the diagnostic.
 * - `failed`: its stage's turn could not start; the provider's diagnostic is
 *   kept, and the run never ended, so there is no report.
 * Times count from `start`; nothing here runs.
 */
export function buildTarsResultFixtures(start: Date) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const base = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id" | "title" | "acceptanceCriteria">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, instruction: "Inspect the actual result.", workspaceId: "preview-workspace", executionWorkspaceId: `exec-${patch.id}`,
    repositoryPath: "/tmp/preview", providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 3, state: "completed", detail: null,
    taskId: `task-${patch.id}`, agentRunId: `run-${patch.id}`, reverifyAfter: null, createdAt: at(0), updatedAt: at(40), ...patch,
  });
  const verified = base({ id: "result-verified", title: "Export invoices as CSV", agentId: "implementer",
    acceptanceCriteria: ["The exported file opens in a spreadsheet with one row per invoice.", "The export tests pass."] });
  const reported = base({ id: "result-reported", title: "Tidy the notification settings copy", revision: 4,
    detail: "Completion was accepted without a Stave-verified check.", detailCode: "acceptedWithoutVerification",
    acceptanceCriteria: ["Every toggle has a one-line description.", "No description is longer than its toggle's row."] });
  const published = base({ id: "result-published", title: "Add keyboard shortcuts to the command palette", revision: 5, branchName: "feat/palette-shortcuts-5d2e7a10",
    acceptanceCriteria: ["Each command shows its shortcut beside its name."],
    publication: { state: "opened", failedStep: null, commit: "5d2e7a1", branch: "feat/palette-shortcuts-5d2e7a10", base: "main",
      commitMessage: "feat: show shortcuts in the command palette", title: "feat: show shortcuts in the command palette",
      url: "https://github.com/example/web/pull/57", number: 57, error: null, reason: null, updatedAt: at(44) } });
  const stalled = base({ id: "result-stalled", title: "Bring the search API under 500 ms", state: "blocked", revision: 4, updatedAt: at(50),
    detail: "The load test kept p95 at 840 ms against the 500 ms limit after three attempts.", detailCode: "runStopped", detailParams: { reason: "acceptance-unmet" },
    acceptanceCriteria: ["p95 latency stays under 500 ms in the load test.", "Search results stay identical."] });
  const failed = base({ id: "result-failed", title: "Regenerate the API client", state: "blocked", revision: 2, updatedAt: at(6),
    detail: agentRunTurnStartFailureDetail("codex app-server exited with code 137 before the turn started (out of memory)."), detailCode: "turnStartFailed",
    acceptanceCriteria: ["The generated client matches the current schema."] });

  const criteriaOf = (row: TarsResponsibility) => row.acceptanceCriteria.map((text) => ({ text, required: true }));
  const workflowOf = (row: TarsResponsibility, verify: Partial<Extract<WorkflowStage, { kind: "ai" }>> = {}): Workflow => ({
    version: 1, id: `tars-${row.id}`, name: "Tars", purpose: "Carry this delegated responsibility through a reviewed, verified result.",
    checkIns: "when-stuck", team: "workers", createdAt: at(0), updatedAt: at(0),
    stages: [
      { id: "work", title: "Work", kind: "ai", instruction: "Plan and execute the responsibility.", doneWhen: "The result is implemented and verified.", acceptanceCriteria: criteriaOf(row) },
      { id: "review", title: "Review", kind: "ai", agentConfigId: "reviewer", instruction: "Independently review the result.", doneWhen: "A review reported findings or a passed verdict." },
      { id: "verify", title: "Verify", kind: "ai", instruction: "Resolve findings and rerun the decisive checks.", doneWhen: "All required criteria are met and verified.", ...verify },
    ],
  });
  const runOf = (row: TarsResponsibility, workflow: Workflow, patch: Partial<AgentRun>) => {
    const created = createAgentRun({ id: row.agentRunId!, input: buildAgentRunStartInput({ workspaceId: row.executionWorkspaceId!, taskId: row.taskId!,
      agent: getBuiltinAgent("implementer")!, assignment: row.title, now: start }), repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "gpt-5.5" }, now: start });
    const agentRun: AgentRun = { ...created.agentRun, workflow, ...patch };
    const record = (stageId: string, recordPatch: Partial<AgentRunStageRecord>): AgentRunStageRecord =>
      ({ ...created.upserts[0]!, agentRunId: agentRun.id, stageId, ...recordPatch });
    return { agentRun, record };
  };
  const facts = (patch: Partial<StageFacts>): StageFacts => ({ diff: null, commands: [], toolCalls: [], action: null, ...patch });
  const met = (row: TarsResponsibility) => row.acceptanceCriteria.map((text) => ({ text, status: "met" as const, required: true }));
  const ended = (run: ReturnType<typeof runOf>, stages: AgentRunStageRecord[], branch: string, minute: number): AgentRunDetail => ({ agentRun: run.agentRun, stages, events: [],
    report: buildAgentRunReport({ aggregate: { agentRun: run.agentRun, stages }, workspace: { branch, branchPushed: false, openPullRequest: null }, endedAt: new Date(at(minute)) }) });
  /** The three stages of work that completed: its report, a review (or none) and the final verification. */
  const completedStages = (row: TarsResponsibility, run: ReturnType<typeof runOf>, parts: { summary: string; diff: NonNullable<StageFacts["diff"]>; paths: string[];
    review: Partial<AgentRunStageRecord>; verifyFacts?: Partial<StageFacts> }) => [
    run.record("work", { status: "completed", startedAt: at(1), endedAt: at(20), startHeadSha: "c0ffee1",
      report: { outcome: "complete", summary: "Implemented the change.", decisions: [], evidence: [], artifacts: [], acceptanceCriteria: met(row),
        workspaceRevision: REV_WORK, reportedAt: at(20), turnId: "turn-work" },
      facts: facts({ diff: parts.diff, changedPaths: parts.paths, currentTurnId: "turn-work", workspaceRevision: REV_WORK }) }),
    run.record("review", { startedAt: at(21), endedAt: at(30), startHeadSha: "c0ffee1", ...parts.review }),
    run.record("verify", { status: "completed", startedAt: at(31), endedAt: at(40), startHeadSha: "c0ffee1",
      report: { outcome: "complete", summary: parts.summary, decisions: [], evidence: [], artifacts: [], acceptanceCriteria: met(row),
        workspaceRevision: REV_FINAL, reportedAt: at(40), turnId: "turn-verify" },
      facts: facts({ diff: parts.diff, changedPaths: parts.paths, currentTurnId: "turn-verify", workspaceRevision: REV_FINAL, ...parts.verifyFacts }) }),
  ];
  const passedReview: Partial<AgentRunStageRecord> = { status: "completed",
    report: { outcome: "complete", summary: "The change does what the criteria ask.", reviewVerdict: "passed", decisions: [],
      evidence: [{ label: "Reviewed the diff and the test run", kind: "observation" }], artifacts: [], workspaceRevision: REV_FINAL, reportedAt: at(30), turnId: "turn-review" },
    facts: facts({ currentTurnId: "turn-review", workspaceRevision: REV_FINAL }) };

  // Verified: the final stage owns a Stave check for the tests criterion, and the review passed on the final revision.
  const verifiedRun = runOf(verified, workflowOf(verified, { acceptanceCriteria: [{ text: verified.acceptanceCriteria[1]!, required: true, verification: "stave-check", scriptIds: ["test"],
    scriptDefinitions: [{ scriptId: "test", definitionHash: TEST_SCRIPT_HASH }] }] }),
    { state: "completed", currentStageIndex: 2, turnCount: 16, updatedAt: at(40) });
  const verifiedDetail = ended(verifiedRun, completedStages(verified, verifiedRun, {
    summary: "Added the CSV export with a header row and one line per invoice. The export tests and the spreadsheet import check pass on the final revision.",
    diff: { filesChanged: 3, insertions: 42, deletions: 7 }, paths: ["src/billing/export.ts", "src/billing/export.test.ts", "src/billing/csv.ts"], review: passedReview,
    verifyFacts: { workspaceScripts: [{ source: "stave", type: "run-script", scriptId: "test", exitCode: 0, verification: { sourceRevision: REV_FINAL, completedRevision: REV_FINAL },
      durationMs: 8_200, outputTail: "12 pass, 0 fail", definitionHash: TEST_SCRIPT_HASH }] } }), "tars/invoice-csv", 40);

  // Reported: the review stage was skipped and no Stave check ran, so the agent's report is all there is.
  const reportedRun = runOf(reported, workflowOf(reported), { state: "completed", currentStageIndex: 2, turnCount: 7, updatedAt: at(40) });
  const reportedDetail = ended(reportedRun, completedStages(reported, reportedRun, {
    summary: "Rewrote the twelve toggle descriptions to one line each.", diff: { filesChanged: 1, insertions: 12, deletions: 12 }, paths: ["src/settings/notifications.tsx"],
    review: { status: "skipped" } }), "tars/notification-copy", 40);

  const publishedRun = runOf(published, workflowOf(published), { state: "completed", currentStageIndex: 2, turnCount: 11, updatedAt: at(40) });
  const publishedDetail = ended(publishedRun, completedStages(published, publishedRun, {
    summary: "Each palette row now shows its shortcut, read from the keybinding registry.", diff: { filesChanged: 2, insertions: 31, deletions: 4 },
    paths: ["src/palette/CommandRow.tsx", "src/palette/shortcuts.ts"], review: passedReview }), published.branchName!, 40);

  const stalledRun = runOf(stalled, workflowOf(stalled), { state: "stopped", stopReason: "acceptance-unmet", reasonDetail: stalled.detail, currentStageIndex: 0, turnCount: 21, updatedAt: at(50) });
  const stalledStages = [stalledRun.record("work", { status: "stuck", startedAt: at(2), endedAt: at(50), startHeadSha: "c0ffee1", detail: stalled.detail,
    report: { outcome: "complete", summary: "Cached the tokenizer and batched the index reads. Latency fell from 1.4 s to 840 ms, still over the limit.", decisions: [],
      evidence: [{ label: "Load test at 200 requests per second", kind: "observation" }], artifacts: [],
      acceptanceCriteria: [{ text: stalled.acceptanceCriteria[0]!, status: "unmet", required: true }, { text: stalled.acceptanceCriteria[1]!, status: "met", required: true }],
      workspaceRevision: REV_WORK, reportedAt: at(48), turnId: "turn-stalled" },
    facts: facts({ diff: { filesChanged: 4, insertions: 96, deletions: 31 }, changedPaths: ["src/search/tokenizer.ts", "src/search/index.ts", "src/search/cache.ts", "src/search/load.test.ts"],
      currentTurnId: "turn-stalled", workspaceRevision: REV_WORK }) })];
  const stalledDetail = ended(stalledRun, stalledStages, "tars/search-latency", 50);

  // Failed: the first stage's turn never started, so the run recorded no report and no changes.
  const failedRun = runOf(failed, workflowOf(failed), { currentStageIndex: 0, turnCount: 0, updatedAt: at(6) });
  const failedDetail: AgentRunDetail = { agentRun: failedRun.agentRun, events: [], report: null,
    stages: [failedRun.record("work", { status: "stuck", startedAt: at(5), endedAt: at(6), detail: failed.detail })] };

  const responsibilities = [verified, reported, published, stalled, failed];
  return {
    responsibilities,
    runs: Object.fromEntries([verifiedDetail, reportedDetail, publishedDetail, stalledDetail, failedDetail].map((detail) => [detail.agentRun.id, detail])) as Record<string, AgentRunDetail>,
    ids: { verified: verified.id, reported: reported.id, published: published.id, stalled: stalled.id, failed: failed.id },
  };
}
