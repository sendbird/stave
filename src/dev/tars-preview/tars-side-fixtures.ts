import { getBuiltinAgent } from "@/lib/agents/starters";
import { buildAgentRunStartInput } from "@/lib/agent-runs/agent-run";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { createAgentRun, type AgentRun, type AgentRunStageRecord, type StageFacts } from "@/lib/agent-runs/domain";
import { buildAgentRunReport } from "@/lib/agent-runs/report";
import type { WorkspaceRevision } from "@/lib/agent-runs/verification-contract";
import type { ScmReviewDiffResult, ScmReviewFileDiffResult } from "@/lib/review/review-diff-contract";
import type { TarsActionReceipt, TarsMessage } from "@/lib/tars/conversation";
import type { TarsActivity, TarsResponsibility } from "@/lib/tars/types";
import type { Workflow } from "@/lib/workflows/schema";

const revision = (value: string): WorkspaceRevision => ({ status: "known", revision: value });
const REV_WORK = revision("4f1c9a20b7d3e5f6");
const REV_FINAL = revision("9e2b7c11a0d4f853");

const BEFORE = `export function orderCards(cards: Card[]) {
  return [...cards].sort((a, b) => a.addedAt - b.addedAt);
}
`;
const AFTER = `export function orderCards(cards: Card[], savedId?: string) {
  const saved = cards.find((card) => card.id === savedId);
  const rest = cards.filter((card) => card !== saved);
  return [...(saved ? [saved] : []), ...rest.sort((a, b) => a.addedAt - b.addedAt)];
}
`;
const TEST = `test("the saved card comes first", () => {
  expect(orderCards([a, b], b.id)[0]).toBe(b);
});
`;

/**
 * Tars work with artifacts for the side-view preview and its tests: a
 * completed checkout fix whose run ended with a frozen report, an independent
 * review that passed with findings, changed files and a recorded pull request
 * link; and a search speed-up whose run stopped stuck, leaving unmet criteria
 * and a pushed branch. Times count from `start`; nothing here runs.
 */
export function buildTarsSideViewFixtures(start: Date) {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const base = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id" | "title" | "acceptanceCriteria">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, instruction: "Inspect the actual result.", workspaceId: "preview-workspace", executionWorkspaceId: `exec-${patch.id}`,
    repositoryPath: "/tmp/preview", providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 3, state: "completed", detail: null,
    taskId: `task-${patch.id}`, agentRunId: `run-${patch.id}`, reverifyAfter: null, createdAt: at(0), updatedAt: at(40), ...patch,
  });
  const checkout = base({ id: "checkout", title: "Show the saved card first at checkout",
    acceptanceCriteria: ["Checkout shows the saved card first.", "The checkout tests pass."] });
  const search = base({ id: "search", title: "Speed up the search index rebuild", state: "blocked", revision: 4, updatedAt: at(50),
    detail: "The run stopped.", detailCode: "runStopped", detailParams: { reason: "acceptance-unmet" },
    acceptanceCriteria: ["The rebuild finishes in under two minutes.", "Search results stay identical."] });

  const workflowOf = (row: TarsResponsibility): Workflow => ({
    version: 1, id: `tars-${row.id}`, name: "Tars", purpose: "Carry this delegated responsibility through a reviewed, verified result.",
    checkIns: "when-stuck", team: "workers", createdAt: at(0), updatedAt: at(0),
    stages: [
      { id: "work", title: "Work", kind: "ai", instruction: "Plan and execute the responsibility.", doneWhen: "The result is implemented and verified.",
        acceptanceCriteria: row.acceptanceCriteria.map((text) => ({ text, required: true })) },
      { id: "review", title: "Review", kind: "ai", agentConfigId: "reviewer", instruction: "Independently review the result.", doneWhen: "A review reported findings or a passed verdict." },
      { id: "verify", title: "Verify", kind: "ai", instruction: "Resolve findings and rerun the decisive checks.", doneWhen: "All required criteria are met and verified." },
    ],
  });
  const runOf = (row: TarsResponsibility, patch: Partial<AgentRun>) => {
    const created = createAgentRun({ id: row.agentRunId!, input: buildAgentRunStartInput({ workspaceId: row.executionWorkspaceId!, taskId: row.taskId!,
      agent: getBuiltinAgent("implementer")!, assignment: row.title, now: start }), repositoryPath: row.repositoryPath, fingerprint: { providerId: "codex", model: "gpt-5.5" }, now: start });
    const agentRun: AgentRun = { ...created.agentRun, workflow: workflowOf(row), ...patch };
    const record = (stageId: string, recordPatch: Partial<AgentRunStageRecord>): AgentRunStageRecord =>
      ({ ...created.upserts[0]!, agentRunId: agentRun.id, stageId, ...recordPatch });
    return { agentRun, record };
  };
  const facts = (patch: Partial<StageFacts>): StageFacts => ({ diff: null, commands: [], toolCalls: [], action: null, ...patch });

  const checkoutRun = runOf(checkout, { state: "completed", currentStageIndex: 2, turnCount: 14, updatedAt: at(40) });
  const checkoutStages = [
    checkoutRun.record("work", { status: "completed", startedAt: at(1), endedAt: at(20), startHeadSha: "a1b2c3d",
      report: { outcome: "complete", summary: "Ordered the saved card first and added a test.", decisions: [{ decision: "Keep the add-card prompt for an empty wallet", reason: "The design asks for it." }],
        evidence: [{ label: "Checkout unit tests", kind: "check", command: "bun test checkout" }], artifacts: [],
        acceptanceCriteria: checkout.acceptanceCriteria.map((text) => ({ text, status: "met" as const, required: true })),
        workspaceRevision: REV_WORK, reportedAt: at(20), turnId: "turn-work" },
      facts: facts({ diff: { filesChanged: 2, insertions: 16, deletions: 2 }, changedPaths: ["src/checkout/cards.ts", "src/checkout/cards.test.ts"],
        commands: [{ command: "bun test checkout", exitCode: 0, toolCallId: null, turnId: "turn-work", outcome: "succeeded", provenance: "provider-structured", sourceRevision: REV_WORK }],
        toolCalls: [{ toolCallId: "tool-edit", name: "apply_patch", ok: true, turnId: "turn-work" }], currentTurnId: "turn-work", workspaceRevision: REV_WORK }) }),
    checkoutRun.record("review", { status: "completed", startedAt: at(21), endedAt: at(30), startHeadSha: "a1b2c3d",
      report: { outcome: "complete", summary: "The change does what the criteria ask. Two small findings were fixed in Verify.", reviewVerdict: "passed",
        decisions: [{ decision: "Rename savedId to preferredCardId", reason: "It is the user's preference, not the last saved card." },
          { decision: "Cover a wallet with no saved card", reason: "The fallback order had no test." }],
        evidence: [{ label: "Reviewed the diff and the test run", kind: "observation" }], artifacts: [], workspaceRevision: REV_FINAL, reportedAt: at(30), turnId: "turn-review" },
      facts: facts({ currentTurnId: "turn-review", workspaceRevision: REV_FINAL }) }),
    checkoutRun.record("verify", { status: "completed", startedAt: at(31), endedAt: at(40), startHeadSha: "a1b2c3d",
      report: { outcome: "complete", summary: "Resolved both findings and reran the checks on the final revision.", decisions: [],
        evidence: [{ label: "Checkout unit tests", kind: "check", command: "bun test checkout" }],
        artifacts: [{ label: "Draft pull request #42", url: "https://example.com/acme/shop/pull/42" }],
        acceptanceCriteria: checkout.acceptanceCriteria.map((text) => ({ text, status: "met" as const, required: true })),
        workspaceRevision: REV_FINAL, reportedAt: at(40), turnId: "turn-verify" },
      facts: facts({ diff: { filesChanged: 2, insertions: 18, deletions: 2 }, changedPaths: ["src/checkout/cards.ts", "src/checkout/cards.test.ts"],
        commands: [{ command: "bun test checkout", exitCode: 0, toolCallId: null, turnId: "turn-verify", outcome: "succeeded", provenance: "stave-runner", sourceRevision: REV_FINAL }],
        currentTurnId: "turn-verify", workspaceRevision: REV_FINAL }) }),
  ];
  const checkoutDetail: AgentRunDetail = { agentRun: checkoutRun.agentRun, stages: checkoutStages, events: [],
    report: buildAgentRunReport({ aggregate: { agentRun: checkoutRun.agentRun, stages: checkoutStages }, workspace: { branch: "tars/checkout", branchPushed: false, openPullRequest: null }, endedAt: new Date(at(40)) }) };

  const searchRun = runOf(search, { state: "stopped", stopReason: "acceptance-unmet", reasonDetail: "The rebuild time could not be measured on the production dataset.",
    currentStageIndex: 0, turnCount: 9, updatedAt: at(50) });
  const searchStages = [
    searchRun.record("work", { status: "stuck", startedAt: at(2), endedAt: at(50), startHeadSha: "b4c5d6e",
      detail: "The benchmark needs the production dataset, which this workspace does not have.",
      report: { outcome: "complete", summary: "Batched the index writes; results match on the sample data.", decisions: [],
        evidence: [{ label: "Compared results on the sample dataset", kind: "observation" }], artifacts: [],
        acceptanceCriteria: [{ text: search.acceptanceCriteria[0]!, status: "unverified", required: true }, { text: search.acceptanceCriteria[1]!, status: "met", required: true }],
        workspaceRevision: REV_WORK, reportedAt: at(45), turnId: "turn-search" },
      facts: facts({ diff: { filesChanged: 1, insertions: 30, deletions: 12 }, changedPaths: ["src/search/rebuild.ts"], currentTurnId: "turn-search", workspaceRevision: REV_WORK }) }),
  ];
  const searchDetail: AgentRunDetail = { agentRun: searchRun.agentRun, stages: searchStages, events: [],
    report: buildAgentRunReport({ aggregate: { agentRun: searchRun.agentRun, stages: searchStages }, workspace: { branch: "tars/search-rebuild", branchPushed: true, openPullRequest: null }, endedAt: new Date(at(50)) }) };

  const delegate = (row: TarsResponsibility, minute: number): { message: TarsMessage; receipt: TarsActionReceipt } => {
    const reply = `I delegated "${row.title}". It is reviewed independently before it can complete.`;
    const action = { kind: "delegate" as const, workspaceId: row.workspaceId, title: row.title, instruction: row.instruction, acceptanceCriteria: row.acceptanceCriteria, priority: row.priority };
    const message: TarsMessage = { id: `message-${row.id}`, requestId: `request-message-${row.id}`, text: row.title, providerId: "codex", model: "gpt-5.5", maxTurns: 30,
      revision: 2, state: "answered", reply, decision: { reply, actions: [action] }, error: null, createdAt: at(minute), updatedAt: at(minute) };
    return { message, receipt: { messageId: message.id, actionIndex: 0, requestHash: "d".repeat(64), action, status: "applied", responsibilityId: row.id,
      error: null, reason: null, revision: 2, createdAt: at(minute), updatedAt: at(minute) } };
  };
  const flows = [delegate(checkout, 1), delegate(search, 2)];
  const activity: TarsActivity[] = [
    { id: "activity-checkout-completed", responsibilityId: checkout.id, revision: 3, title: checkout.title, state: "completed", detail: null, createdAt: at(41) },
  ];
  const files: Record<string, { before: string; after: string }> = {
    "src/checkout/cards.ts": { before: BEFORE, after: AFTER },
    "src/checkout/cards.test.ts": { before: "", after: TEST },
  };
  const diff: ScmReviewDiffResult = { ok: true, baseSha: "a1b2c3d", baseRef: null, headSha: "f00ba12", stderr: "",
    files: [{ path: "src/checkout/cards.ts", status: "M", additions: 4, deletions: 2 }, { path: "src/checkout/cards.test.ts", status: "A", additions: 3, deletions: 0 }] };
  const fileDiff = (path: string): ScmReviewFileDiffResult => files[path]
    ? { ok: true, oldContent: files[path]!.before, newContent: files[path]!.after, stderr: "" } : { ok: false, oldContent: "", newContent: "", stderr: "Unknown file." };
  return {
    responsibilities: [checkout, search], runs: { [checkoutDetail.agentRun.id]: checkoutDetail, [searchDetail.agentRun.id]: searchDetail },
    messages: flows.map((flow) => flow.message), receipts: flows.map((flow) => flow.receipt), activity,
    workspacePaths: { [checkout.executionWorkspaceId!]: "/tmp/preview-checkout", [search.executionWorkspaceId!]: "/tmp/preview-search" },
    diff, fileDiff, ids: { checkout: checkout.id, search: search.id },
  };
}
