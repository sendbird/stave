import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { countUnansweredInteractions } from "@/lib/fleet/inbox-model";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { repositorySidebarStyles } from "./repository-workspace-sidebar.styles";

/**
 * How many requests in a workspace an agent is blocked on until someone
 * answers — approvals, questions and sign-offs — read from the shared
 * attention snapshot. Nothing renders when there are none.
 */
export function useWorkspaceUnansweredCount(workspaceId: string) {
  return useFleetAttention((snapshot) =>
    countUnansweredInteractions(snapshot.attentionItemsByWorkspaceId[workspaceId]),
  );
}

export function WorkspaceUnansweredCount(props: {
  workspaceId: string;
  /** Where the row hides its counts behind hover actions, the same rule. */
  xstyle?: StyleXValue;
}) {
  const { t } = useTranslation(["workspace"]);
  const count = useWorkspaceUnansweredCount(props.workspaceId);
  if (count === 0) {
    return null;
  }
  const label = t("workspace:workspaceSidebarRows.unansweredCount", { count });
  return (
    <Badge
      aria-label={label}
      className={sx(repositorySidebarStyles.respondingBadgeInline, props.xstyle)}
      data-unanswered-count={count}
      title={label}
      tone="warning"
      variant="outline"
    >
      {count}
    </Badge>
  );
}
