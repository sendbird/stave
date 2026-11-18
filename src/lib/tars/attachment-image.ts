import { z } from "zod";
import { AttachmentContextSchema, type AttachmentContext } from "../providers/attachment-context";
import { TARS_MESSAGE_ATTACHMENTS_MAX } from "./types";

/**
 * One image of a saved message (`tars:get-attachment-image`), named by the
 * message and the image's position among its attachments. A conversation
 * carries attachment summaries only, so each preview reads its own image on
 * demand instead of every image riding on every conversation read.
 */
export const TarsAttachmentImageInputSchema = z.object({
  messageId: z.string().trim().min(1).max(256),
  index: z.number().int().min(0).max(TARS_MESSAGE_ATTACHMENTS_MAX - 1),
}).strict();
export type TarsAttachmentImageInput = z.infer<typeof TarsAttachmentImageInputSchema>;

export type TarsAttachmentImage = Extract<AttachmentContext, { type: "image_context" }>;

/**
 * The saved image itself, or null when the message is gone or holds no image
 * at that position. A file attachment's content is never read back this way:
 * a window shows files by their summary only.
 */
export const TarsAttachmentImageSchema = AttachmentContextSchema.nullable()
  .refine((part) => part === null || part.type === "image_context", "Only an image attachment is read back.") as z.ZodType<TarsAttachmentImage | null>;
