import { z } from "zod";

/** Immutable file snapshots; no path on its own grants filesystem access. */
export const AttachmentContextSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file_context"),
    filePath: z.string().trim().min(1).max(500).regex(/^[^/\\]+$/),
    content: z.string().max(32_000),
    // The native provider reserves "image" for filesystem-backed inputs. These are snapshots only.
    language: z.string().max(200).refine((value) => value !== "image"),
  }).strict(),
  z.object({
    type: z.literal("image_context"),
    label: z.string().trim().min(1).max(500),
    dataUrl: z.string().max(6_000_000).regex(/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  }).strict().refine((image) => image.dataUrl.startsWith(`data:${image.mimeType};base64,`)),
]);

export const AttachmentContextsSchema = z.array(AttachmentContextSchema).max(8)
  .refine((parts) => parts.reduce((total, part) => total + (part.type === "file_context" ? new TextEncoder().encode(part.content).byteLength : 0), 0) <= 32_000)
  .refine((parts) => parts.reduce((total, part) => total + (part.type === "image_context" ? part.dataUrl.length : 0), 0) <= 8_000_000);
export type AttachmentContext = z.infer<typeof AttachmentContextSchema>;
