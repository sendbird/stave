import { z } from "zod";
import type { NormalizedProviderEvent } from "./provider.types";

export const BACKGROUND_TASK_LIMIT = 24;
export const BACKGROUND_LOG_TAIL_BYTES = 8192;
const backgroundTaskIdSchema = z.uuid();

const backgroundLogTailSchema = z.object({
  text: z.string().max(BACKGROUND_LOG_TAIL_BYTES),
  truncated: z.boolean(),
}).strict();

export const BackgroundTaskEventSchema = z.object({
  type: z.literal("background_task"),
  id: backgroundTaskIdSchema,
  providerId: z.enum(["claude-code", "codex"]),
  description: z.string().max(512),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().optional(),
  status: z.enum(["running", "paused", "completed", "failed", "stopped", "unknown"]),
  confidence: z.enum(["confirmed", "inferred"]),
  canStop: z.boolean(),
  hasOutput: z.boolean(),
  finalOutput: backgroundLogTailSchema.optional(),
}).strict();

export const BackgroundTaskRequestSchema = z.object({
  operation: z.enum(["read", "stop"]),
  workspaceId: z.string().min(1).max(512),
  taskId: z.string().min(1).max(200),
  turnId: z.string().min(1).max(200),
  id: backgroundTaskIdSchema,
}).strict();

export type BackgroundTaskEvent = z.infer<typeof BackgroundTaskEventSchema>;
export type BackgroundTaskRequest = z.infer<typeof BackgroundTaskRequestSchema>;
export type BackgroundLogTail = z.infer<typeof backgroundLogTailSchema>;
export type BackgroundTaskResponse = { ok: false } | { ok: true; output?: BackgroundLogTail };

export function canStopBackgroundTask(row: BackgroundTaskEvent, live: boolean): boolean {
  return live && row.canStop && row.confidence === "confirmed"
    && (row.status === "running" || row.status === "paused");
}

export function settleBackgroundTasks(rows: readonly BackgroundTaskEvent[], now: number) {
  return rows.map((row): BackgroundTaskEvent => {
    if (row.status !== "running" && row.status !== "paused") return row;
    return {
      ...row, status: "unknown", confidence: "inferred", canStop: false, endedAt: Math.max(row.startedAt, now),
    };
  });
}

export function applyBackgroundTaskEvents(
  current: readonly BackgroundTaskEvent[],
  events: readonly NormalizedProviderEvent[],
): readonly BackgroundTaskEvent[] {
  let rows = current;
  for (const event of events) {
    if (event.type !== "background_task") continue;
    const index = rows.findIndex((row) => row.id === event.id);
    if (index !== -1) {
      rows = rows.map((row, rowIndex) => rowIndex === index ? event : row);
    } else {
      rows = [...rows, event];
      if (rows.length > BACKGROUND_TASK_LIMIT) {
        const settled = rows.findIndex((row) => row.endedAt !== undefined);
        rows = rows.filter((_, rowIndex) => rowIndex !== (settled === -1 ? 0 : settled));
      }
    }
  }
  return rows;
}
