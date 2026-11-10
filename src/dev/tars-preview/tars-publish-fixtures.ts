import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { TarsActionReceipt, TarsConversation, TarsMessage } from "@/lib/tars/conversation";
import {
  parseTarsPublishProposalRequestId, tarsPublishHeadBranch, type TarsPublishInput, type TarsPublishPreview, type TarsPublishRecord, type TarsPublishResult,
} from "@/lib/tars/publication";
import { buildTarsPublicationBody } from "@/lib/tars/publication-body";
import { projectTarsReport } from "@/lib/tars/report-model";
import type { TarsSnapshot } from "@/lib/tars/types";

/**
 * `publish=true`: the user asked Tars to open a draft pull request for the
 * completed checkout work, so its publish proposal waits as a card; the tray
 * and the report also offer "Create draft PR". `publish=failed` makes the
 * preview's push fail once, so the record offers Retry. UI only: nothing runs git.
 */
export function buildTarsPublishFixtures(start: Date, args: { responsibilityId: string; revision: number; korean: boolean }) {
  const at = new Date(start.getTime() + 45 * 60_000).toISOString();
  const text = args.korean ? "결제 화면 작업으로 Draft PR 올려줘." : "Open a draft PR for the checkout work.";
  const reply = args.korean ? "결제 화면 작업을 Draft PR로 올릴 수 있게 확인 카드를 띄웠습니다. 카드에서 확인하시면 커밋하고 푸시한 뒤 Draft PR을 엽니다."
    : "I put a confirmation card below. When you confirm it, Stave commits the checkout work, pushes its branch and opens a draft pull request.";
  const action = { kind: "publish" as const, responsibilityId: args.responsibilityId, expectedRevision: args.revision };
  const message: TarsMessage = { id: "message-publish", requestId: "request-message-publish", text, providerId: "codex", model: "gpt-5.5", maxTurns: 30,
    revision: 2, state: "answered", reply, decision: { reply, actions: [action] }, error: null, createdAt: at, updatedAt: at };
  const receipt: TarsActionReceipt = { messageId: message.id, actionIndex: 0, requestHash: "e".repeat(64), action, status: "proposed", responsibilityId: null,
    error: null, reason: null, revision: 2, createdAt: at, updatedAt: at };
  return { message, receipt };
}

/** The preview's stand-in for the host's publish path: it records the confirmation and opens a pretend pull request. */
export function createPreviewPublishBridge(args: {
  getSnapshot: () => TarsSnapshot;
  setSnapshot: (snapshot: TarsSnapshot) => void;
  /** Publications and receipts only; messages are never read here. */
  conversation: Pick<TarsConversation, "publications" | "receipts">;
  runs: Readonly<Record<string, AgentRunDetail>>;
  failOnce: boolean;
  save: () => void;
}) {
  let failed = !args.failOnce;
  const previewPublish = async ({ responsibilityId }: { responsibilityId: string }): Promise<TarsPublishPreview> => {
    const row = args.getSnapshot().responsibilities.find((candidate) => candidate.id === responsibilityId);
    if (!row) throw new Error("Preview responsibility is missing.");
    await new Promise((resolve) => setTimeout(resolve, 150));
    const report = projectTarsReport(row, row.agentRunId ? args.runs[row.agentRunId] : undefined);
    return { responsibilityId: row.id, revision: row.revision, reason: row.state === "completed" ? null : "notCompleted", repository: "example/web",
      repositoryUrl: "https://github.com/example/web", base: "main", head: tarsPublishHeadBranch(row), changedFiles: 2,
      body: buildTarsPublicationBody({ title: row.title, report }), publication: row.publication ?? null };
  };
  const publish = async (input: TarsPublishInput): Promise<TarsPublishResult> => {
    const existing = args.conversation.publications?.find((record) => record.requestId === input.requestId);
    if (existing) return { record: structuredClone(existing) };
    await new Promise((resolve) => setTimeout(resolve, 600));
    const snapshot = args.getSnapshot();
    const row = snapshot.responsibilities.find((candidate) => candidate.id === input.responsibilityId);
    const at = new Date().toISOString();
    const proposal = parseTarsPublishProposalRequestId(input.requestId);
    const fail = !failed;
    failed = true;
    const stale = !row || row.revision !== input.expectedRevision;
    const url = "https://github.com/example/web/pull/12";
    const record: TarsPublishRecord = { requestId: input.requestId, source: input.source, requestHash: "f".repeat(64), responsibilityId: input.responsibilityId,
      expectedRevision: input.expectedRevision, commitMessage: input.commitMessage, title: input.title, proposal, revision: 2, createdAt: at, updatedAt: at,
      ...(stale ? { status: "rejected" as const, reason: "stale" as const, error: "Preview responsibility changed.", url: null, number: null }
        : fail ? { status: "rejected" as const, reason: "publishFailed" as const, error: "fatal: unable to access 'https://github.com/example/web.git/': Could not resolve host", url: null, number: null }
          : { status: "applied" as const, reason: null, error: null, url, number: 12 }) };
    if (row && !stale) {
      const publication = fail
        ? { state: "failed" as const, failedStep: "push" as const, commit: "f00ba12", branch: tarsPublishHeadBranch(row), base: "main", commitMessage: input.commitMessage,
          title: input.title, url: null, number: null, error: record.error, reason: "publishFailed" as const, updatedAt: at }
        : { state: "opened" as const, failedStep: null, commit: "f00ba12", branch: tarsPublishHeadBranch(row), base: "main", commitMessage: input.commitMessage,
          title: input.title, url, number: 12, error: null, reason: null, updatedAt: at };
      args.setSnapshot({ ...snapshot, responsibilities: snapshot.responsibilities.map((candidate) => candidate.id !== row.id ? candidate
        : { ...candidate, revision: candidate.revision + 1, updatedAt: at, publication }) });
    }
    (args.conversation.publications ??= []).push(record);
    const receipt = proposal && args.conversation.receipts.find((entry) => entry.messageId === proposal.messageId && entry.actionIndex === proposal.actionIndex);
    if (receipt?.status === "proposed") Object.assign(receipt, record.status === "applied" ? { status: "applied", responsibilityId: record.responsibilityId }
      : { status: "rejected", error: record.error, reason: record.reason }, { revision: receipt.revision + 1 });
    args.save();
    return { record: structuredClone(record) };
  };
  return { previewPublish, publish };
}
