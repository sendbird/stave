import type { LensAnnotation } from "./lens.types";
import type { ListLensReviewRecordsArgs, LensReviewRecord, SaveLensReviewRecordArgs, SetLensReviewVerdictArgs } from "./lens-review-record";

export interface LensReviewTarget {
  workspaceId: string;
  lensSessionId?: string;
}
export interface LensAutomationState extends LensReviewTarget {
  paused: boolean;
  running: number;
  tool?: string;
  capturedAt?: string;
  preview?: string;
}
export interface LensReviewApi {
  getAutomation: (args: LensReviewTarget & { includePreview?: boolean }) => Promise<{ ok: boolean; state?: LensAutomationState; message?: string }>;
  setAutomationPaused: (args: LensReviewTarget & { paused: boolean }) => Promise<{ ok: boolean; state?: LensAutomationState; message?: string }>;
  compareAnnotation: (args: LensReviewTarget & { annotation: LensAnnotation }) => Promise<{ ok: boolean; dataUrl?: string; documentId?: string; message?: string }>;
  /** A task's Lens review records, newest first; a confirmation of a page no longer shown comes back as needing a re-check. */
  listReviewRecords: (args: ListLensReviewRecordsArgs) => Promise<{ ok: boolean; records?: LensReviewRecord[]; message?: string }>;
  saveReviewRecord: (args: SaveLensReviewRecordArgs) => Promise<LensReviewRecordResponse>;
  setReviewRecordVerdict: (args: SetLensReviewVerdictArgs) => Promise<LensReviewRecordResponse>;
  readReviewRecordImage: (args: { id: string }) => Promise<{ ok: boolean; dataUrl?: string; code?: "not-found"; message?: string }>;
}

/** `page-changed`: the page is no longer the captured document, so it cannot be confirmed from this capture. */
export type LensReviewRecordResponse = {
  ok: boolean;
  record?: LensReviewRecord;
  code?: "page-changed" | "invalid-image" | "not-found";
  message?: string;
};
