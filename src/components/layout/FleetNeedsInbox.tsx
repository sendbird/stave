import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  MessageCircleQuestion,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { Badge, Button } from "@/components/ui";
import type {
  FleetNeedItem,
  FleetNeedKind,
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
  "run-failed":
    "border-destructive/30 bg-destructive/10 text-destructive",
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
      return <MessageCircleQuestion className="size-3.5" aria-hidden="true" />;
    case "approval":
      return <ShieldCheck className="size-3.5" aria-hidden="true" />;
    case "run-failed":
      return <AlertTriangle className="size-3.5" aria-hidden="true" />;
    case "result-ready":
      return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
    case "pr-ready-to-merge":
      return <GitMerge className="size-3.5" aria-hidden="true" />;
    case "pr-changes-requested":
    case "pr-checks-failed":
    case "pr-merge-conflict":
    case "pr-behind-base":
      return item.prStatus ? (
        <PrStatusIcon status={item.prStatus} className="size-3.5" />
      ) : (
        <AlertTriangle className="size-3.5" aria-hidden="true" />
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

export function FleetNeedsInbox(args: {
  items: FleetNeedItem[];
  selectedNeedId: string | null;
  busyNeedId: string | null;
  onOpen: (item: FleetNeedItem) => void;
  onResolveApproval: (item: FleetNeedItem, approved: boolean) => void;
  onMarkRead: (item: FleetNeedItem) => void;
  onOpenPr: (item: FleetNeedItem) => void;
}) {
  if (args.items.length === 0) {
    return null;
  }

  return (
    <section
      className="shrink-0 border-b border-border/65 bg-surface/20"
      aria-labelledby="fleet-needs-heading"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0">
          <h2
            id="fleet-needs-heading"
            className="text-xs font-semibold text-foreground"
          >
            Needs me
          </h2>
          <p
            className="mt-0.5 text-[11px] text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            {args.items.length} actionable item
            {args.items.length === 1 ? "" : "s"}, ordered by urgency
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Press N for next
        </span>
      </div>
      <ul className="max-h-64 overflow-y-auto border-t border-border/45">
        {args.items.map((item) => {
          const selected = args.selectedNeedId === item.id;
          const busy = args.busyNeedId === item.id;
          const detail = getFleetNeedDetail(item);
          const title = getFleetNeedTitle(item);
          const canResolveApproval =
            item.kind === "approval" && Boolean(item.notificationId);
          const canMarkRead =
            Boolean(item.notificationId) &&
            (item.kind === "run-failed" ||
              item.kind === "result-ready" ||
              item.kind === "user-input" ||
              item.kind === "approval");

          return (
            <li
              key={item.id}
              className={cn(
                "grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-stretch border-b border-border/45 last:border-b-0",
                selected && "bg-accent/18",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/18 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
                aria-label={`${getFleetNeedPrimaryAction(item)} for ${title} in ${item.workspaceName}`}
                disabled={busy}
                onClick={() => args.onOpen(item)}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 rounded-sm",
                    FLEET_NEED_BADGE_CLASS[item.kind],
                  )}
                >
                  {getFleetNeedIcon(item)}
                  {FLEET_NEED_LABEL[item.kind]}
                </Badge>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {title}
                  </span>
                  <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{item.workspaceName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{item.projectName}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTaskUpdatedAt({ value: item.createdAt })}</span>
                    {detail ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="max-w-80 truncate">{detail}</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1 px-3 py-2">
                {canResolveApproval ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => args.onResolveApproval(item, true)}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => args.onResolveApproval(item, false)}
                    >
                      Deny
                    </Button>
                  </>
                ) : null}
                {canMarkRead ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => args.onMarkRead(item)}
                  >
                    {item.kind === "result-ready"
                      ? "Mark reviewed"
                      : item.kind === "user-input" || item.kind === "approval"
                        ? "Dismiss"
                        : "Mark read"}
                  </Button>
                ) : null}
                {item.prUrl ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => args.onOpenPr(item)}
                  >
                    Open PR
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
