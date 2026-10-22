import { z } from "zod";
import { PersistedLensAnnotationSchema } from "./lens-annotation-schema";

/**
 * A kept Lens verification: the user compared sent visual feedback with a
 * fresh capture of the same target and said whether the issue is resolved.
 * The "before" image stays where it already is, in the conversation's sent
 * feedback; the record names it. The "after" capture is a PNG under the app's
 * artifacts folder. Records belong to a task, are capped per task (oldest
 * dropped) and are deleted with the task's data.
 *
 * A confirmation is about one page document. When the Lens session shows
 * another document (it navigated or reloaded, or the app restarted), the
 * record is kept and marked as needing a re-check, so an old record never
 * reads as confirming a new page.
 */
export const LENS_REVIEW_VERDICTS = ["confirmed", "needs-recheck"] as const;
export type LensReviewVerdict = (typeof LENS_REVIEW_VERDICTS)[number];

/** Why a record needs a re-check: the reviewer said so, or the page changed after a confirmation. */
export const LENS_RECHECK_REASONS = ["reviewer", "page-changed"] as const;
export type LensRecheckReason = (typeof LENS_RECHECK_REASONS)[number];

export const MAX_LENS_REVIEW_RECORDS_PER_TASK = 20;
/** Decoded size of one "after" capture. A target clip is far smaller; this only bounds a hostile payload. */
export const MAX_LENS_REVIEW_IMAGE_BYTES = 8 * 1024 * 1024;
export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
export const MAX_PNG_DATA_URL_LENGTH = PNG_DATA_URL_PREFIX.length + Math.ceil(MAX_LENS_REVIEW_IMAGE_BYTES / 3) * 4;

const id = z.string().trim().min(1).max(200);

/**
 * Stored records are read with this schema. It is not strict, so a record
 * written by a newer version (with fields this one does not know) still loads.
 */
export const LensReviewRecordSchema = z.object({
  id,
  taskId: id,
  workspaceId: id,
  lensSessionId: id,
  annotationId: id,
  /** The captured page address, without query or fragment (as the feedback recorded it). */
  pageUrl: z.string().max(4096),
  viewport: z.object({
    width: z.number().nonnegative().max(100_000),
    height: z.number().nonnegative().max(100_000),
    devicePixelRatio: z.number().positive().max(16),
  }),
  /** The sent feedback image in the conversation, by its attachment ID. */
  before: z.object({ imageId: z.string().min(1).max(600) }),
  /** The "after" capture, relative to the artifacts folder. */
  afterImagePath: z.string().min(1).max(400),
  /** The page document the "after" image was captured from. Document IDs do not survive a restart. */
  documentId: id,
  verdict: z.enum(LENS_REVIEW_VERDICTS),
  recheckReason: z.enum(LENS_RECHECK_REASONS).optional(),
  /** When the user last confirmed it; kept when the record later needs a re-check. */
  confirmedAt: z.iso.datetime().optional(),
  capturedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LensReviewRecord = z.infer<typeof LensReviewRecordSchema>;

export const SaveLensReviewRecordArgsSchema = z.object({
  taskId: id,
  workspaceId: id,
  lensSessionId: id,
  annotation: PersistedLensAnnotationSchema,
  beforeImageId: z.string().min(1).max(600),
  /** The document the comparison captured, as `compareAnnotation` returned it. */
  documentId: id,
  afterDataUrl: z.string().startsWith(PNG_DATA_URL_PREFIX).max(MAX_PNG_DATA_URL_LENGTH),
  verdict: z.enum(LENS_REVIEW_VERDICTS),
}).strict();
export type SaveLensReviewRecordArgs = z.input<typeof SaveLensReviewRecordArgsSchema>;

export const ListLensReviewRecordsArgsSchema = z.object({ taskId: id, annotationId: id.optional() }).strict();
export type ListLensReviewRecordsArgs = z.infer<typeof ListLensReviewRecordsArgsSchema>;

export const SetLensReviewVerdictArgsSchema = z.object({ id, verdict: z.enum(LENS_REVIEW_VERDICTS) }).strict();
export type SetLensReviewVerdictArgs = z.infer<typeof SetLensReviewVerdictArgsSchema>;

export const ReadLensReviewImageArgsSchema = z.object({ id }).strict();

/** The newest record first; among records captured together, by ID for a stable order. */
export function compareLensReviewRecords(left: LensReviewRecord, right: LensReviewRecord): number {
  return right.capturedAt.localeCompare(left.capturedAt) || right.id.localeCompare(left.id);
}
