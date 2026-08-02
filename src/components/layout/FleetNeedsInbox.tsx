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
import { Badge, Button } from "@/components/ui";
import {
  getFleetNeedTier,
  type FleetNeedItem,
  type FleetNeedKind,
} from "@/lib/fleet/attention-projection";
import { PR_STATUS_VISUAL } from "@/lib/pr-status";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const FLEET_NEED_LABEL: Record<FleetNeedKind, string> = {
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

const FLEET_NEED_BADGE_CLASS: Record<FleetNeedKind, string> = {
  "user-input": "border-warning/40 bg-warning/10 text-warning",
  approval: "border-warning/40 bg-warning/10 text-warning",
  "run-failed": "border-destructive/30 bg-destructive/10 text-destructive",
  "result-ready": "border-info/30 bg-info/10 text-info",
  "pr-changes-requested":
    "border-destructive/30 bg-destructive/10 text-destructive",
  "pr-checks-failed":
    "border-destructive/30 bg-destructive/10 text-destructive",
  "pr-merge-conflict":
    "border-destructive/30 bg-destructive/10 text-destructive",
  "pr-behind-base": "border-warning/40 bg-warning/10 text-warning",
  "pr-ready-to-merge": "border-success/35 bg-success/10 text-success",
};

function getFleetNeedIcon(item: FleetNeedItem): ReactNode {
  switch (item.kind) {
    case "user-input":
      return <MessageCircleQuestion className="size-3" aria-hidden="true" />;
    case "approval":
      return <ShieldCheck className="size-3" aria-hidden="true" />;
    case "run-failed":
      return <AlertTriangle className="size-3" aria-hidden="true" />;
    case "result-ready":
      return <CheckCircle2 className="size-3" aria-hidden="true" />;
    case "pr-ready-to-merge":
      return <GitMerge className="size-3" aria-hidden="true" />;
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return item.prStatus ? (
        <PrStatusIcon status={item.prStatus} className="size-3" />
      ) : (
        <AlertTriangle className="size-3" aria-hidden="true" />
      );
  }
}

function getFleetNeedTitle(item: FleetNeedItem) {
  return item.taskTitle?.trim() || item.workspaceName;
}

function getFleetNeedPrimaryAction(item: FleetNeedItem) {
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

function getFleetNeedDetail(item: FleetNeedItem) {
  if (item.prStatus) {
    return PR_STATUS_VISUAL[item.prStatus].label;
  }
  return item.detail;
}

function FleetNeedRow(args: {
  item: FleetNeedItem;
  selected: boolean;
  busy: boolean;
  onOpen: (item: FleetNeedItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetNeedItem) => void;
  onDismiss: (item: FleetNeedItem) => void;
  onOpenPr: (item: FleetNeedItem) => void;
}) {
  const { item, selected, busy } = args;
  const detail = getFleetNeedDetail(item);
  const title = getFleetNeedTitle(item);
  const canMarkRead =
    Boolean(item.notificationId) &&
    (item.kind === "run-failed" || item.kind === "result-ready");
  // An interaction can outlive the turn that asked it. Without an explicit
  // dismiss there is no way to clear it from the attention count. Live-sourced
  // needs are excluded: dismissing resolves the notification, but the pending
  // request behind a live need would rebuild the same item on the next
  // projection, leaving the count unchanged and the button gone.
  const canDismiss =
    item.source === "notification" &&
    Boolean(item.notificationId) &&
    (item.kind === "approval" || item.kind === "user-input");
  const triggerId = `fleet-need-trigger-${item.id}`;
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
    <li
      className={cn(
        "border-b border-border/40 last:border-b-0",
        selected && "bg-accent/18",
      )}
    >
      <button
        id={triggerId}
        type="button"
        className="flex w-full min-w-0 flex-col gap-1 px-3 py-2 text-left hover:bg-accent/18 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
        aria-label={`${getFleetNeedPrimaryAction(item)} for ${title} in ${item.workspaceName}`}
        aria-expanded={controlTarget ? selected : undefined}
        aria-controls={
          controlTarget && selected
            ? `fleet-need-controls-${item.id}`
            : undefined
        }
        disabled={busy}
        onClick={() => args.onOpen(item)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 rounded-sm px-1 text-[9px] leading-4",
              FLEET_NEED_BADGE_CLASS[item.kind],
            )}
          >
            {getFleetNeedIcon(item)}
            {FLEET_NEED_LABEL[item.kind]}
          </Badge>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatTaskUpdatedAt({ value: item.createdAt })}
          </span>
        </span>
        <span className="block truncate text-xs font-medium text-foreground">
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">{item.workspaceName}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{item.projectName}</span>
        </span>
        {detail ? (
          <span className="line-clamp-2 text-[10px] text-muted-foreground/85">
            {detail}
          </span>
        ) : null}
      </button>
      {canMarkRead || canDismiss || item.prUrl ? (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-1.5">
          {canMarkRead ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
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
              className="h-6 px-1.5 text-[10px]"
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
              className="h-6 px-1.5 text-[10px]"
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
          id={`fleet-need-controls-${item.id}`}
          className="border-t border-border/40 bg-background/60"
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
export function FleetNeedsInbox(args: {
  items: FleetNeedItem[];
  selectedNeedId: string | null;
  busyNeedId: string | null;
  onOpen: (item: FleetNeedItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetNeedItem) => void;
  onDismiss: (item: FleetNeedItem) => void;
  onOpenPr: (item: FleetNeedItem) => void;
  onClearSelection: () => void;
}) {
  const [showReview, setShowReview] = useState(false);

  const blocking = args.items.filter(
    (item) => getFleetNeedTier(item.kind) === "blocking",
  );
  // Nothing is stalled on these, so they stay folded until asked for. That is
  // the difference between "an agent is waiting on you" and "worth a look".
  const review = args.items.filter(
    (item) => getFleetNeedTier(item.kind) === "review",
  );
  // "Open next item" and the N shortcut can land on a review-tier need. Without
  // this the group stays folded and the selection has no visible effect.
  const showReviewGroup =
    showReview || review.some((item) => item.id === args.selectedNeedId);
  const toggleReviewGroup = () => {
    if (showReviewGroup) {
      setShowReview(false);
      if (review.some((item) => item.id === args.selectedNeedId)) {
        args.onClearSelection();
      }
      return;
    }
    setShowReview(true);
  };

  const renderRow = (item: FleetNeedItem) => (
    <FleetNeedRow
      key={item.id}
      item={item}
      selected={args.selectedNeedId === item.id}
      busy={args.busyNeedId === item.id}
      onOpen={args.onOpen}
      onOpenTask={args.onOpenTask}
      onMarkRead={args.onMarkRead}
      onDismiss={args.onDismiss}
      onOpenPr={args.onOpenPr}
    />
  );

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col border-border/65 bg-surface/25 sm:border-r"
      aria-labelledby="fleet-needs-heading"
    >
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border/55 px-3 py-2">
        <h2
          id="fleet-needs-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Needs me
        </h2>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            blocking.length > 0 ? "text-warning" : "text-muted-foreground",
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          {blocking.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {blocking.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <Inbox
              className="size-5 text-muted-foreground/70"
              aria-hidden="true"
            />
            <p className="text-xs font-medium text-foreground">
              Nothing blocked
            </p>
            <p className="text-[10px] text-muted-foreground">
              No agent is waiting on you right now.
            </p>
          </div>
        ) : (
          <ul className="min-w-0">{blocking.map(renderRow)}</ul>
        )}

        {review.length > 0 ? (
          <div className="border-t border-border/55">
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
              aria-expanded={showReviewGroup}
              onClick={toggleReviewGroup}
            >
              {showReviewGroup ? (
                <ChevronDown
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <ChevronRight
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Worth a look
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {review.length}
              </span>
            </button>
            {showReviewGroup ? (
              <ul className="min-w-0">{review.map(renderRow)}</ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
