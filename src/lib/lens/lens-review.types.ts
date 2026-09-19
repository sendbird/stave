import type { LensAnnotation } from "./lens.types";

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
}
