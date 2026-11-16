import { z } from "zod";

export const FleetTaskControlArgsSchema = z.object({
  workspaceId: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(200),
}).strict();
export const FleetTaskControlResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().max(1000).optional(),
  reason: z.string().max(100).optional(),
}).strict();
export const FleetStopChildrenResultSchema = z.object({
  ok: z.boolean(),
  stopped: z.number().int().min(0),
  skipped: z.array(z.object({ taskId: z.string(), reason: z.string() }).strict()),
  message: z.string().max(1000).optional(),
  reason: z.string().max(100).optional(),
}).strict();
export type FleetTaskControlArgs = z.infer<typeof FleetTaskControlArgsSchema>;
export type FleetTaskControlResult = z.infer<typeof FleetTaskControlResultSchema>;
export type FleetStopChildrenResult = z.infer<typeof FleetStopChildrenResultSchema>;

export const FleetStopPreviewArgsSchema = z.object({ targets: z.array(FleetTaskControlArgsSchema).min(1).max(500) }).strict();
const FleetStopPreviewItemSchema = FleetTaskControlArgsSchema.extend({
  turns: z.number().int().nonnegative(), children: z.number().int().nonnegative(), runs: z.number().int().nonnegative(), owned: z.number().int().nonnegative(),
});
export const FleetStopPreviewResultSchema = z.object({
  ok: z.boolean(), turns: z.number().int().nonnegative(), children: z.number().int().nonnegative(), runs: z.number().int().nonnegative(), owned: z.number().int().nonnegative(),
  items: z.array(FleetStopPreviewItemSchema).max(500), reason: z.string().max(100).optional(),
}).strict();
export type FleetStopPreviewArgs = z.infer<typeof FleetStopPreviewArgsSchema>;
export type FleetStopPreviewResult = z.infer<typeof FleetStopPreviewResultSchema>;

export const FleetArchiveArgsSchema = FleetTaskControlArgsSchema.extend({ restore: z.boolean().optional(), expectedArchivedAt: z.string().max(100).optional() });
export const FleetArchiveResultSchema = FleetTaskControlResultSchema.extend({ archivedAt: z.string().nullable().optional() });
export type FleetArchiveArgs = z.infer<typeof FleetArchiveArgsSchema>;
export type FleetArchiveResult = z.infer<typeof FleetArchiveResultSchema>;
