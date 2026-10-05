import { i18n, useTranslation } from "@/i18n";
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
  useTranslation();
  const ownerLabel =
    props.owner === "external" ? i18n.t("session:managedTaskTakeoverNotice.ownerLabel") : i18n.t("session:managedTaskTakeoverNotice.ownerLabel2");
  const detail = props.isTurnActive
    ? i18n.t("session:managedTaskTakeoverNotice.detail")
    : i18n.t("session:managedTaskTakeoverNotice.detail2");

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
            {i18n.t("session:managedTaskTakeoverNotice.managedTaskTakeoverNotice")}</Badge>
        </div>
        <p className={sx(styles.detail)}>{detail}</p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!props.canTakeOver}
        aria-label={i18n.t("session:managedTaskTakeoverNotice.ariaLabel")}
        onClick={props.onTakeOver}
      >
        <Hand aria-hidden="true" />
        {i18n.t("session:managedTaskTakeoverNotice.managedTaskTakeoverNotice2")}</Button>
    </div>
  );
}
