import { tarsCanUpdatePublication } from "./publication";
import type { TarsActionReceipt } from "./conversation";
import { tarsPublishProposalRequestId, tarsPublicationResumeStep, type TarsPublishRecord, type TarsPublicationStep } from "./publication";
import type { TarsResponsibility } from "./types";

/**
 * A publish proposal from the user's words or a verified-result follow-up, as the conversation
 * shows it. `waiting`: the card can be confirmed; `invalid`: the work moved
 * past the revision Tars saw (or its draft pull request opened) before the
 * user confirmed; `settled`: admitted by confirmation or policy, with its recorded outcome.
 */
export interface TarsPublishProposalView {
  requestId: string;
  messageId: string;
  actionIndex: number;
  responsibilityId: string;
  expectedRevision: number;
  state: "waiting" | "invalid" | "settled";
  /** False before a snapshot was read: nothing is offered on a guess. */
  checked: boolean;
  record: TarsPublishRecord | null;
}

/** Whether completed work can show a publish card now, from the saved row alone; the host checks the workspace and GitHub. */
export function isTarsPublishable(row: Pick<TarsResponsibility, "state" | "detailCode" | "executionWorkspaceId" | "publication" | "resultVerifiedRunId" | "agentRunId" | "executionPending"> | undefined) {
  return Boolean(row && !row.executionPending && (row.state === "completed" || row.state === "resultReady") && row.detailCode !== "acceptedWithoutVerification" && row.executionWorkspaceId
    && (row.state !== "resultReady" || Boolean(row.agentRunId && row.resultVerifiedRunId === row.agentRunId))
    && (row.publication?.state !== "opened" || tarsCanUpdatePublication(row)));
}

export function projectTarsPublishProposals(sources: {
  receipts: readonly TarsActionReceipt[];
  publications: readonly TarsPublishRecord[];
  /** Null before a snapshot was read. */
  responsibilities: readonly TarsResponsibility[] | null;
}): TarsPublishProposalView[] {
  const records = new Map(sources.publications.map((record) => [record.requestId, record]));
  const rows = sources.responsibilities ? new Map(sources.responsibilities.map((row) => [row.id, row])) : null;
  return sources.receipts.flatMap((receipt): TarsPublishProposalView[] => {
    const { action } = receipt;
    if (action.kind !== "publish") return [];
    const requestId = tarsPublishProposalRequestId(receipt.messageId, receipt.actionIndex);
    const record = records.get(requestId) ?? null;
    const base = { requestId, messageId: receipt.messageId, actionIndex: receipt.actionIndex, responsibilityId: action.responsibilityId,
      expectedRevision: action.expectedRevision, record };
    if (record) return [{ ...base, state: "settled", checked: true }];
    // A proposal refused when it was made stays a receipt line with its reason.
    if (receipt.status !== "proposed") return [];
    if (!rows) return [{ ...base, state: "waiting", checked: false }];
    const row = rows.get(action.responsibilityId);
    const live = isTarsPublishable(row) && row!.revision === action.expectedRevision;
    return [{ ...base, state: live ? "waiting" : "invalid", checked: true }];
  });
}

/** The newest confirmation of one responsibility; it alone offers Retry. */
export function latestTarsPublishRecord(publications: readonly TarsPublishRecord[], responsibilityId: string) {
  return publications.filter((record) => record.responsibilityId === responsibilityId).at(-1) ?? null;
}

/** The step a confirmation would continue from, shown on the card; null when it starts from the beginning. */
export function tarsPublishContinuesFrom(row: Pick<TarsResponsibility, "publication">): TarsPublicationStep | null {
  if (row.publication?.state !== "failed") return null;
  const step = tarsPublicationResumeStep(row.publication);
  return step === "commit" ? null : step;
}
