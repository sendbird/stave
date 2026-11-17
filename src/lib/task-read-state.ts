import { z } from "zod";
const Identity = z.string().trim().min(1).max(1000);
export const TASK_READ_BATCH_LIMIT = 500;
export const TaskReadTargetSchema = z.object({workspaceId: Identity, taskId: Identity}).strict();
export const ListTaskReadStatesArgsSchema = z.object({targets: z.array(TaskReadTargetSchema).max(TASK_READ_BATCH_LIMIT)}).strict();
export const SetTaskReadStateArgsSchema = TaskReadTargetSchema.extend({read: z.boolean(), attentionOnly: z.literal(true).optional()}).strict();
/** One write for every selected task: bulk read never fans out into N calls. */
export const SetTaskReadStatesArgsSchema = z.object({
  targets: z.array(TaskReadTargetSchema).min(1).max(TASK_READ_BATCH_LIMIT),
  read: z.boolean(),
  attentionOnly: z.literal(true).optional(),
}).strict();
export const TaskReadStateSchema = TaskReadTargetSchema.extend({unread: z.boolean()}).strict();
/** A notification whose read mark the write changed, so the renderer can mirror it. */
export const TaskReadNotificationChangeSchema = z.object({id: z.string().min(1), readAt: z.string().nullable(), expiresAt: z.string().nullable()}).strict();
export const TaskReadStatesResponseSchema = z.object({ok: z.boolean(), states: z.array(TaskReadStateSchema).max(TASK_READ_BATCH_LIMIT)}).strict();
export const SetTaskReadStatesResponseSchema = TaskReadStatesResponseSchema.extend({notifications: z.array(TaskReadNotificationChangeSchema)}).strict();
export type TaskReadTarget = z.infer<typeof TaskReadTargetSchema>;
export type ListTaskReadStatesArgs = z.infer<typeof ListTaskReadStatesArgsSchema>;
export type SetTaskReadStateArgs = z.infer<typeof SetTaskReadStateArgsSchema>;
export type SetTaskReadStatesArgs = z.infer<typeof SetTaskReadStatesArgsSchema>;
export type TaskReadState = z.infer<typeof TaskReadStateSchema>;
export type TaskReadNotificationChange = z.infer<typeof TaskReadNotificationChangeSchema>;
export type SetTaskReadStatesResult = Omit<z.infer<typeof SetTaskReadStatesResponseSchema>, "ok">;
export const taskReadKey = (target: TaskReadTarget) => JSON.stringify([target.workspaceId,target.taskId]);
