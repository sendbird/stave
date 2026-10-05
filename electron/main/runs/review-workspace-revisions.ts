import path from "node:path";
import type { WorkspaceRevision } from "../../../src/lib/agent-runs/verification-contract";
import { ReviewRevisionStateSchema } from "../../../src/lib/reviews/review-revision";
import type { RunReceiptRecord, RunStepRecord } from "../../../src/lib/runs/run-domain";

export const UNKNOWN_REVIEW_REVISION: WorkspaceRevision = { status: "unknown", reason: "unavailable" };

export async function captureReviewRevision(args: {
  workspaceId: string;
  repositoryPath: string;
  resolveWorkspace: (args: { workspaceId: string }) => Promise<{ workspacePath: string; repositoryPath: string } | null>;
  readRevision?: (cwd: string) => Promise<WorkspaceRevision>;
}): Promise<WorkspaceRevision> {
  try {
    const workspace = await args.resolveWorkspace({ workspaceId: args.workspaceId });
    if (!workspace || !args.readRevision || path.resolve(workspace.repositoryPath) !== path.resolve(args.repositoryPath)) return UNKNOWN_REVIEW_REVISION;
    return await args.readRevision(workspace.workspacePath);
  } catch { return UNKNOWN_REVIEW_REVISION; }
}

export function reviewRevisionState(receipts: readonly RunReceiptRecord[], step: RunStepRecord, current: WorkspaceRevision) {
  const source = receipts.find((receipt) => receipt.type === "accepted" && receipt.detail?.attempt === step.attempt)?.detail?.reviewSourceRevision;
  const completed = [...receipts].reverse().find((receipt) => receipt.type === "completed" && receipt.executionId === step.executionId)?.detail?.reviewCompletedRevision;
  return ReviewRevisionStateSchema.parse({ source: source ?? UNKNOWN_REVIEW_REVISION, completed: completed ?? UNKNOWN_REVIEW_REVISION, current });
}
