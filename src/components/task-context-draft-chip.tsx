import { useEffect, useState, type ComponentProps } from "react";
import { TaskContextChip } from "@/components/task-context-chip";
import { hasPartialAttachedTaskReply, type TaskContextAttachment } from "@/lib/task-context/attached-task-context";
import { useAppStore } from "@/store/app.store";
import { readAttachedTaskMessages } from "@/store/attached-task-context-runtime";
import type { ChatMessage } from "@/types/chat";

/** Live status belongs to the draft; a sent chip must not describe later turns. */
export function TaskContextDraftChip({ attachment, ...props }: {
  attachment: TaskContextAttachment;
} & Omit<ComponentProps<typeof TaskContextChip>, "title" | "scope" | "findingCount" | "partialReply">) {
  const { taskId, workspaceId } = attachment;
  const loaded = useAppStore((state) => workspaceId === state.activeWorkspaceId
    ? state.messagesByTask[taskId]
    : state.workspaceRuntimeCacheById[workspaceId]?.messagesByTask[taskId]);
  const [stored, setStored] = useState<{ taskId: string; workspaceId: string; messages: ChatMessage[] } | null>(null);
  const hasLoaded = Boolean(loaded?.length);
  useEffect(() => {
    if (hasLoaded) return;
    let cancelled = false;
    void readAttachedTaskMessages({ getState: useAppStore.getState, attachment: { taskId, workspaceId } }).then((messages) => {
      if (!cancelled) setStored({ taskId, workspaceId, messages });
    });
    return () => { cancelled = true; };
  }, [hasLoaded, taskId, workspaceId]);
  const messages = hasLoaded ? loaded : stored?.taskId === taskId && stored.workspaceId === workspaceId ? stored.messages : undefined;
  return <TaskContextChip {...props} title={attachment.title} scope={attachment.scope}
    findingCount={attachment.findingIds?.length}
    partialReply={Boolean(messages && hasPartialAttachedTaskReply({ attachment, messages }))} />;
}
