import { z } from "zod";

export const FleetTaskControlArgsSchema = z.object({
  workspaceId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200),
}).strict();
export const FleetTaskControlResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(1000).optional(),
}).strict();
export const FleetStopChildrenResultSchema = z.object({
  ok: z.boolean(),
  stopped: z.number().int().min(0),
  skipped: z.array(z.object({ taskId: z.string(), reason: z.string() }).strict()),
  message: z.string().max(1000).optional(),
}).strict();
export type FleetTaskControlArgs = z.infer<typeof FleetTaskControlArgsSchema>;
export type FleetTaskControlResult = z.infer<typeof FleetTaskControlResultSchema>;
export type FleetStopChildrenResult = z.infer<typeof FleetStopChildrenResultSchema>;
