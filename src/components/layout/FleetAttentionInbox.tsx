import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitMerge,
  Inbox,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { Button } from "@/components/ui";
import { attentionStyles as styles } from "./fleet-attention-inbox.styles";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
  type FleetAttentionKind,
} from "@/lib/fleet/attention-projection";
import { PR_STATUS_VISUAL } from "@/lib/pr-status";
import { formatTaskUpdatedAt } from "@/lib/tasks";

const FLEET_NEED_LABEL: Record<FleetAttentionKind, string> = {
  "user-input": "Question",
  approval: "Approval",
  "run-failed": "Run failed",
  "result-ready": "Result ready",
  "pr-changes-requested": "Changes requested",
  "pr-checks-failed": "Checks failed",
  "pr-merge-conflict": "Merge conflict",
  "pr-behind-base": "Behind base",
  "pr-ready-to-merge": "Ready to merge",
};

/** Which semantic family the need belongs to; the Badge owns the colors. */
const FLEET_NEED_TONE: Record<FleetAttentionKind, BadgeTone> = {
  "user-input": "warning",
  approval: "warning",
  "run-failed": "danger",
  "result-ready": "info",
  "pr-changes-requested": "danger",
  "pr-checks-failed": "danger",
  "pr-merge-conflict": "danger",
  "pr-behind-base": "warning",
  "pr-ready-to-merge": "success",
};

function getFleetNeedIcon(item: FleetAttentionItem): ReactNode {
  switch (item.kind) {
    case "user-input":
      return <MessageCircleQuestion className={sx(styles.needIcon)} aria-hidden="true" />;
    case "approval":
      return <ShieldCheck className={sx(styles.needIcon)} aria-hidden="true" />;
    case "run-failed":
      return <AlertTriangle className={sx(styles.needIcon)} aria-hidden="true" />;
    case "result-ready":
      return <CheckCircle2 className={sx(styles.needIcon)} aria-hidden="true" />;
    case "pr-ready-to-merge":
      return <GitMerge className={sx(styles.needIcon)} aria-hidden="true" />;
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return item.prStatus ? (
        <PrStatusIcon status={item.prStatus} className={sx(styles.needIcon)} />
      ) : (
        <AlertTriangle className={sx(styles.needIcon)} aria-hidden="true" />
      );
  }
}

function getFleetNeedTitle(item: FleetAttentionItem) {
  return item.taskTitle?.trim() || item.workspaceName;
}

function getFleetNeedPrimaryAction(item: FleetAttentionItem) {
  switch (item.kind) {
    case "user-input":
      return "Open question";
    case "approval":
      return "Open approval";
    case "run-failed":
      return "Open failure";
    case "result-ready":
      return "Review result";
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return "Open workspace";
    case "pr-ready-to-merge":
      return "Open merge controls";
  }
}

function getFleetNeedDetail(item: FleetAttentionItem) {
  if (item.prStatus) {
    return PR_STATUS_VISUAL[item.prStatus].label;
  }
  return item.detail;
}

function FleetNeedRow(args: {
  item: FleetAttentionItem;
  selected: boolean;
  busy: boolean;
  onOpen: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
}) {
  const { item, selected, busy } = args;
  const detail = getFleetNeedDetail(item);
  const title = getFleetNeedTitle(item);
  const canMarkRead =
    Boolean(item.notificationId) &&
    (item.kind === "run-failed" || item.kind === "result-ready");
  // An interaction can outlive the turn that asked it. Without an explicit
  // dismiss there is no way to clear it from the attention count. Live-sourced
  // attention items are excluded: dismissing resolves the notification, but
  // the pending request behind a live item would rebuild it on the next
  // projection, leaving the count unchanged and the button gone.
  const canDismiss =
    item.source === "notification" &&
    Boolean(item.notificationId) &&
    (item.kind === "approval" || item.kind === "user-input");
  const triggerId = `fleet-attention-trigger-${item.id}`;
  const controlTarget = item.taskId
    ? {
        projectPath: item.projectPath,
        workspaceId: item.workspaceId,
        taskId: item.taskId,
        taskTitle: item.taskTitle,
        turnId: item.turnId,
      }
    : null;

  return (
    <li className={sx(styles.row, selected && styles.rowSelected)}>
      <AdsButton
        layout="host"
        id={triggerId}
        type="button"
        xstyle={[styles.rowTrigger, focusRing.ringInset]}
        aria-label={`${getFleetNeedPrimaryAction(item)} for ${title} in ${item.workspaceName}`}
        aria-expanded={controlTarget ? selected : undefined}
        aria-controls={
          controlTarget && selected
            ? `fleet-attention-controls-${item.id}`
            : undefined
        }
        disabled={busy}
        onClick={() => args.onOpen(item)}
      >
        <span className={sx(styles.rowTop)}>
          <Badge
            variant="outline"
            tone={FLEET_NEED_TONE[item.kind]}
            className={sx(styles.needBadge)}
          >
            {getFleetNeedIcon(item)}
            {FLEET_NEED_LABEL[item.kind]}
          </Badge>
          <span className={sx(styles.rowTime)}>
            {formatTaskUpdatedAt({ value: item.createdAt })}
          </span>
        </span>
        <span className={sx(styles.rowTitle)}>{title}</span>
        <span className={sx(styles.rowMeta)}>
          <span className={sx(styles.rowMetaPart)}>{item.workspaceName}</span>
          <span aria-hidden="true">·</span>
          <span className={sx(styles.rowMetaPart)}>{item.projectName}</span>
        </span>
        {detail ? (
          <span className={sx(styles.rowDetail)}>{detail}</span>
        ) : null}
      </AdsButton>
      {canMarkRead || canDismiss || item.prUrl ? (
        <div className={sx(styles.rowActions)}>
          {canMarkRead ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={styles.rowAction}
              disabled={busy}
              onClick={() => args.onMarkRead(item)}
            >
              {item.kind === "result-ready" ? "Mark reviewed" : "Mark read"}
            </Button>
          ) : null}
          {canDismiss ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={styles.rowAction}
              disabled={busy}
              aria-label={`Dismiss ${item.kind === "approval" ? "approval" : "question"} for ${title} in ${item.workspaceName}`}
              onClick={() => args.onDismiss(item)}
            >
              Dismiss
            </Button>
          ) : null}
          {item.prUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={styles.rowAction}
              disabled={busy}
              onClick={() => args.onOpenPr(item)}
            >
              Open PR
            </Button>
          ) : null}
        </div>
      ) : null}
      {selected && controlTarget ? (
        <div
          id={`fleet-attention-controls-${item.id}`}
          className={sx(styles.rowControls)}
        >
          <FleetTaskControlPanel
            target={controlTarget}
            expectedInteraction={
              (item.kind === "approval" || item.kind === "user-input") &&
              item.requestId
                ? { kind: item.kind, requestId: item.requestId }
                : undefined
            }
            returnFocusElementId={triggerId}
            onOpenTask={args.onOpenTask}
            onClose={() => args.onOpen(item)}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The permanent attention column. It lives at the layout level rather than
 * above the board so it stays put no matter which board filter is active, and
 * so an urgent item never scrolls out of view behind workspace content.
 */
export function FleetAttentionInbox(args: {
  items: FleetAttentionItem[];
  selectedAttentionId: string | null;
  busyAttentionId: string | null;
  onOpen: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
  onClearSelection: () => void;
}) {
  const [showReview, setShowReview] = useState(false);

  const blocking = args.items.filter(
    (item) => getFleetAttentionTier(item.kind) === "blocking",
  );
  // Nothing is stalled on these, so they stay folded until asked for. That is
  // the difference between "an agent is waiting on you" and "worth a look".
  const review = args.items.filter(
    (item) => getFleetAttentionTier(item.kind) === "review",
  );
  // "Open next item" and the N shortcut can land on a review-tier item. Without
  // this the group stays folded and the selection has no visible effect.
  const showReviewGroup =
    showReview || review.some((item) => item.id === args.selectedAttentionId);
  const toggleReviewGroup = () => {
    if (showReviewGroup) {
      setShowReview(false);
      if (review.some((item) => item.id === args.selectedAttentionId)) {
        args.onClearSelection();
      }
      return;
    }
    setShowReview(true);
  };

  const renderRow = (item: FleetAttentionItem) => (
    <FleetNeedRow
      key={item.id}
      item={item}
      selected={args.selectedAttentionId === item.id}
      busy={args.busyAttentionId === item.id}
      onOpen={args.onOpen}
      onOpenTask={args.onOpenTask}
      onMarkRead={args.onMarkRead}
      onDismiss={args.onDismiss}
      onOpenPr={args.onOpenPr}
    />
  );

  return (
    <section
      className={sx(styles.root)}
      aria-labelledby="fleet-attention-heading"
    >
      <div className={sx(styles.header)}>
        <h2 id="fleet-attention-heading" className={sx(styles.groupHeading)}>
          Action required
        </h2>
        <span
          className={sx(
            styles.count,
            blocking.length > 0 ? styles.countBlocking : styles.countClear,
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          {blocking.length}
        </span>
      </div>

      <div className={sx(styles.scroller)}>
        {blocking.length === 0 ? (
          <div className={sx(styles.empty)}>
            <Inbox className={sx(styles.emptyIcon)} aria-hidden="true" />
            <p className={sx(styles.emptyTitle)}>Nothing blocked</p>
            <p className={sx(styles.emptyHint)}>
              No agent is waiting on you right now.
            </p>
          </div>
        ) : (
          <ul className={sx(styles.list)}>{blocking.map(renderRow)}</ul>
        )}

        {review.length > 0 ? (
          <div className={sx(styles.reviewGroup)}>
            <AdsButton
              layout="host"
              type="button"
              xstyle={[styles.reviewToggle, focusRing.ringInset]}
              aria-expanded={showReviewGroup}
              onClick={toggleReviewGroup}
            >
              {showReviewGroup ? (
                <ChevronDown
                  className={sx(styles.reviewIcon)}
                  aria-hidden="true"
                />
              ) : (
                <ChevronRight
                  className={sx(styles.reviewIcon)}
                  aria-hidden="true"
                />
              )}
              <span className={sx(styles.groupHeading)}>Worth a look</span>
              <span className={sx(styles.reviewCount)}>{review.length}</span>
            </AdsButton>
            {showReviewGroup ? (
              <ul className={sx(styles.list)}>{review.map(renderRow)}</ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
