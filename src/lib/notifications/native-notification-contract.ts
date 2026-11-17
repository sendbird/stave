import { z } from "zod";

const identity = z.string().min(1).max(200);
export const NativeNotificationResolvedSchema = z.object({
  workspaceId: identity, taskId: identity, turnId: identity,
  requestId: identity, messageId: identity,
  response: z.discriminatedUnion("type", [
    z.object({ type: z.literal("approval"), approved: z.boolean() }).strict(),
    z.object({ type: z.literal("answer"), answers: z.record(z.string(), z.string()) }).strict(),
  ]),
}).strict();
export type NativeNotificationResolved = z.infer<typeof NativeNotificationResolvedSchema>;

export const NotificationTaskStatusArgsSchema = z.object({
  workspaceId: identity, taskId: identity, turnId: identity.optional(), refresh: z.boolean().optional(),
}).strict();
