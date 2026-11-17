import { isExternallyManagedTask } from "../tasks";
import type { Task } from "../../types/chat";

/** Delegated children need the user; external root controllers handle their own requests. */
export function publishesInteractionNotifications(
  task: Pick<Task, "controlMode" | "controlOwner" | "parentTaskId">,
) {
  return !isExternallyManagedTask(task) || Boolean(task.parentTaskId?.trim());
}
