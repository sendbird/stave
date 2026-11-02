import { useMemo } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Plan } from "@/components/ads/components/Plan";
import { parseTodoInput } from "@/lib/todo-progress";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { findLatestTodoPart } from "./turn-todo.utils";

const NO_MESSAGES: ChatMessage[] = [];

/** The latest primary plan in this turn; a new user turn clears the old plan. */
export function TaskTurnPlan({ taskId }: { taskId: string }) {
  useTranslation();
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  const turnId = useAppStore((state) => state.activeTurnIdsByTask[taskId]);
  const steps = useMemo(() => {
    const part = findLatestTodoPart(messages, turnId);
    return (part ? parseTodoInput({ input: part.input }).todos : []).map((item, index) => ({
      id: `${index}:${item.content}`,
      title: item.content,
      status: item.status === "completed" ? "done" as const : item.status === "in_progress" && turnId ? "running" as const : "pending" as const,
    }));
  }, [messages, turnId]);
  return steps.length ? <Plan steps={steps} announce={false} title={i18n.t("ui:plan.plan")} /> : null;
}
