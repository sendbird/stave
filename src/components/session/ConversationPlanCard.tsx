import { ClipboardCheck } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements";

/**
 * Renders a plan response inline in the conversation.
 *
 * The floating `PlanViewer` only stays open while the task is under plan
 * review, so the transcript needs its own copy — otherwise an approved or
 * revised plan becomes unreadable the moment the conversation moves on.
 */
export function ConversationPlanCard(props: { planText: string }) {
  return (
    <div
      data-plan-card="true"
      className="overflow-hidden rounded-xl border border-border/80 bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border/80 px-4 py-2.5">
        <ClipboardCheck className="size-4 shrink-0 text-primary" />
        <p className="text-sm font-medium">Plan</p>
      </div>
      <div className="px-4 py-3">
        <MessageResponse>{props.planText}</MessageResponse>
      </div>
    </div>
  );
}
