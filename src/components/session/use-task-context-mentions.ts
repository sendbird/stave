import { useMemo } from "react";
import { toast } from "@/lib/notifications/toast";
import {
  MAX_ATTACHED_TASKS,
  addTaskContextAttachment,
  buildTaskMentionOptions,
  createTaskContextAttachment,
} from "@/lib/task-context/attached-task-context";
import { useAppStore } from "@/store/app.store";
import type { Attachment } from "@/types/chat";

/**
 * The composer's side of attaching another task as context: the tasks `@`
 * offers (this workspace's, most recent first) and the attach action shared
 * by the palette and a drop, which may come from any workspace.
 */
export function useTaskContextMentions(args: {
  taskId: string;
  attachments: readonly Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
}) {
  const workspaceId = useAppStore(
    (state) => state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId,
  );
  const tasks = useAppStore((state) => state.tasks);
  const attachedTaskIds = useMemo(
    () =>
      new Set(
        args.attachments.flatMap((attachment) =>
          attachment.kind === "task-context" ? [attachment.taskId] : [],
        ),
      ),
    [args.attachments],
  );
  const options = useMemo(
    () =>
      buildTaskMentionOptions({
        tasks,
        workspaceId,
        currentTaskId: args.taskId,
        attachedTaskIds,
      }),
    [args.taskId, attachedTaskIds, tasks, workspaceId],
  );
  const attach = (task: { taskId: string; workspaceId: string; title: string }) => {
    if (task.taskId === args.taskId) {
      toast.message("This is the current task", {
        description: "Its conversation is already the context.",
      });
      return;
    }
    const next = addTaskContextAttachment({
      attachments: args.attachments,
      attachment: createTaskContextAttachment(task),
      currentTaskId: args.taskId,
    });
    if (next === args.attachments) {
      toast.message(
        attachedTaskIds.has(task.taskId) ? "Task already attached" : "Too many attached tasks",
        attachedTaskIds.has(task.taskId)
          ? undefined
          : { description: `Attach up to ${MAX_ATTACHED_TASKS} tasks to one message.` },
      );
      return;
    }
    args.onAttachmentsChange([...next]);
  };
  return { options, attach };
}
