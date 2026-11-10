import type { ReactNode } from "react";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { isSideChatProvider } from "@/lib/side-chat/side-chat";
import { useAppStore } from "@/store/app.store";
import { SideQuestionComposerControl } from "./SideQuestionComposerControl";

/**
 * The composer's side question control for the task it is scoped to, or
 * `null` when the toolbar should spend no slot on it: the task's provider has
 * no side questions, or the task has no conversation yet to ask about (its
 * start screen has no panel to open).
 */
export function useSideQuestionComposerControl(): ReactNode {
  const taskId = useScopedTaskId();
  // Side questions go to the task's own provider, as the panel asks them.
  const supported = useAppStore((state) => isSideChatProvider(state.tasks.find((task) => task.id === taskId)?.provider));
  // Counted as ChatArea counts it to choose between the start screen and the conversation.
  const hasConversation = useAppStore((state) => Math.max(state.messageCountByTask[taskId] ?? 0, state.messagesByTask[taskId]?.length ?? 0) > 0);
  return supported && hasConversation && taskId ? <SideQuestionComposerControl taskId={taskId} /> : null;
}
