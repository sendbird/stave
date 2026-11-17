import { z } from "zod";
import { isExternallyManagedTask } from "../tasks";
import type { Task } from "../../types/chat";

/** Delegated children need the user; external root controllers handle their own requests. */
export function publishesInteractionNotifications(
  task: Pick<Task, "controlMode" | "controlOwner" | "parentTaskId">,
) {
  return !isExternallyManagedTask(task) || Boolean(task.parentTaskId?.trim());
}

const StoredNotificationTaskControlSchema = z.object({
  controlMode: z.enum(["interactive", "managed"]).default("interactive"),
  controlOwner: z.enum(["stave", "external"]).default("stave"),
  parentTaskId: z.string().nullable().optional(),
}).strict();

/** Validate the ownership projection of a persisted task before offering an action. */
export function publishesStoredInteractionNotifications(task: {
  controlMode?: unknown; controlOwner?: unknown; parentTaskId?: unknown;
}) {
  const parsed = StoredNotificationTaskControlSchema.safeParse({
    controlMode: task.controlMode, controlOwner: task.controlOwner, parentTaskId: task.parentTaskId,
  });
  return parsed.success && publishesInteractionNotifications(parsed.data);
}
