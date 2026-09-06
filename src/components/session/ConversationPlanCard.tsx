import { ClipboardCheck } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements";
import { sx } from "@/components/ads/utils/stylex";
import { conversationPlanCardStyles as styles } from "./conversation-plan-card.styles";

/**
 * Renders a plan response inline in the conversation.
 *
 * The floating `PlanViewer` only stays open while the task is under plan
 * review, so the transcript needs its own copy — otherwise an approved or
 * revised plan becomes unreadable the moment the conversation moves on.
 */
export function ConversationPlanCard(props: { planText: string }) {
  return (
    <div data-plan-card="true" className={sx(styles.root)}>
      <div className={sx(styles.header)}>
        <ClipboardCheck className={sx(styles.headerIcon)} />
        <p className={sx(styles.headerTitle)}>Plan</p>
      </div>
      <div className={sx(styles.body)}>
        <MessageResponse>{props.planText}</MessageResponse>
      </div>
    </div>
  );
}
