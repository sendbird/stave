import { useAsync, type AsyncState } from "@/components/ads/utils/async";
import type { LensReviewRecord } from "@/lib/lens/lens-review-record";

export interface SavedLensReview {
  record: LensReviewRecord | null;
  /** The record's "after" capture; absent when its file is gone. */
  image?: string;
}

/**
 * The newest saved Lens review of one sent annotation in one task, with its
 * "after" capture. Main answers a confirmation of a page document the session
 * no longer shows as needing a re-check, so reading again after a navigation
 * is what moves a record there.
 */
export function useLensReviewRecord(args: { taskId: string; annotationId: string }): { state: AsyncState<SavedLensReview>; refresh: () => void } {
  const { taskId, annotationId } = args;
  return useAsync(async () => {
    const api = typeof window === "undefined" ? undefined : window.api?.lens;
    if (!api?.listReviewRecords) return { record: null };
    const listed = await api.listReviewRecords({ taskId, annotationId });
    if (!listed.ok) throw new Error(listed.message || "unavailable"); // i18n-ignore: replaced by the boundary's own words
    const record = listed.records?.[0] ?? null;
    if (!record) return { record: null };
    const image = await api.readReviewRecordImage({ id: record.id });
    return { record, image: image.ok ? image.dataUrl : undefined };
  }, [taskId, annotationId]);
}
