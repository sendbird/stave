import { Hand, ShieldCheck } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import { managedTaskTakeoverNoticeStyles as styles } from "./managed-task-takeover-notice.styles";
import type { TaskControlOwner } from "@/types/chat";

export function ManagedTaskTakeoverNotice(props: {
  owner: TaskControlOwner;
  isTurnActive: boolean;
  canTakeOver: boolean;
  onTakeOver: () => void;
  className?: string;
}) {
  const ownerLabel =
    props.owner === "external" ? "Managed externally" : "Managed by Stave";
  const detail = props.isTurnActive
    ? "Take over to stop the current managed run and continue directly."
    : "The managed run ended. Take over to continue directly in this task.";

  return (
    <div
      data-managed-task-notice="true"
      data-testid="managed-task-takeover-notice"
      // `className` stays an integration hook: framed mode overrides
      // margin-inline from `globals.css` via the data hook, and callers pass
      // layout overrides through the prop.
      className={cx(sx(styles.root), props.className)}
      role="status"
    >
      <span className={sx(styles.iconBadge)}>
        <ShieldCheck className={sx(styles.badgeIcon)} aria-hidden="true" />
      </span>
      <div className={sx(styles.body)}>
        <div className={sx(styles.headerRow)}>
          <p className={sx(styles.ownerLabel)}>{ownerLabel}</p>
          <Badge variant="secondary" className={sx(styles.managedBadge)}>
            Managed
          </Badge>
        </div>
        <p className={sx(styles.detail)}>{detail}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!props.canTakeOver}
        aria-label="Take over managed task"
        onClick={props.onTakeOver}
      >
        <Hand aria-hidden="true" />
        Take Over
      </Button>
    </div>
  );
}
