import { QuestionReplySchema } from "@/lib/question-reply";
import { z } from "zod";

/** A bounded snapshot captured at run start, replayed without resolving sources again. */
export const AgentRunInitialContextSchema = z.object({
  questionReply: QuestionReplySchema.optional(),
  fileContexts: z.array(z.object({
    filePath: z.string().max(4096),
    content: z.string().max(500_000),
    language: z.string().max(200),
    instruction: z.string().max(5000).optional(),
  }).strict()).max(32).optional(),
  imageContexts: z.array(z.object({
    dataUrl: z.string().max(10_000_000),
    label: z.string().max(500),
    mimeType: z.string().max(200),
  }).strict()).max(16).optional(),
  retrievedContextParts: z.array(z.object({
    type: z.literal("retrieved_context"),
    sourceId: z.string().max(200),
    title: z.string().max(500).optional(),
    content: z.string().max(500_000),
  }).strict()).max(32).optional(),
  /**
   * Attachments another host store keeps (a Tars work's message), named by an
   * opaque reference. The host reads them only for the run's first turn and
   * sends them as that turn's file and image contexts, so their content is
   * never copied into the run and later turns do not send it again. Set only
   * by the host; the renderer's start request cannot name one.
   */
  attachmentSource: z.string().trim().min(1).max(300).optional(),
}).strict();

export type AgentRunInitialContext = z.infer<typeof AgentRunInitialContextSchema>;
