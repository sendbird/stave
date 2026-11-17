import { z } from "zod";

/** An explicit inclusive boundary also supports removing a task's first turn. */
export const TruncateTaskMessagesAfterArgsSchema = z.object({
  before: z.literal(true).optional(),
  workspaceId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
}).strict();

export const TruncateTaskMessagesResultSchema = z.object({
  ok: z.boolean(),
  removedCount: z.number().int().nonnegative(),
}).strict();
