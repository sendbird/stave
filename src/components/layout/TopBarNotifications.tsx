import { Bell, Check, CheckCheck, ChevronDown, CircleCheck, ShieldAlert, Archive } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  getNextNotificationView,
  type NotificationView,
  shouldShowNotificationApprovalActions,
} from "@/components/layout/top-bar-notifications.utils";
import { buildNotificationDetail } from "@/lib/notifications/notification.utils";
import { formatTaskUpdatedAt, isTaskArchived, isTaskManaged } from "@/lib/tasks";
import { isNotificationUnread } from "@/lib/notifications/notification.types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

const HISTORY_PAGE_SIZE = 20;

interface ArchivedNotificationPrompt {
  notificationId: string;
  taskTitle: string;
}

function NotificationKindIcon({ kind }: { kind: "task.turn_completed" | "task.approval_requested" }) {
  if (kind === "task.approval_requested") {
    return <ShieldAlert className="size-3.5 shrink-0 text-warning" />;
  }
  return <CircleCheck className="size-3.5 shrink-0 text-success" />;
}

function buildLocationLabel(args: {
  projectName: string | null;
  workspaceName: string | null;
}) {
  return [args.projectName, args.workspaceName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

export function TopBarNotifications(props: {
  noDragStyle: CSSProperties;
}) {
  const [notifications, tasks, markNotificationRead, markAllNotificationsRead, openNotificationContext, resolveNotificationApproval, restoreTask] = useAppStore(
    useShallow((state) => [
      state.notifications,
      state.tasks,
      state.markNotificationRead,
      state.markAllNotificationsRead,
      state.openNotificationContext,
      state.resolveNotificationApproval,
      state.restoreTask,
    ] as const),
  );
  const [open, setOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [view, setView] = useState<NotificationView>("unread");
  const [archivedPrompt, setArchivedPrompt] = useState<ArchivedNotificationPrompt | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);

  const unreadNotifications = notifications.filter(isNotificationUnread);
  const historyNotifications = notifications.filter((notification) => !isNotificationUnread(notification));
  const pagedHistoryNotifications = historyNotifications.slice(0, historyLimit);
  const hasMoreHistory = historyNotifications.length > historyLimit;
  const visibleNotifications = view === "unread" ? unreadNotifications : pagedHistoryNotifications;
  const unreadCount = unreadNotifications.length;
  const historyCount = historyNotifications.length;
  const unreadCountLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasNotifications = notifications.length > 0;

  function isNotificationActionPending(notificationId: string) {
    return pendingActionId === `open:${notificationId}`
      || pendingActionId === `mark:${notificationId}`
      || pendingActionId === `approve:${notificationId}`
      || pendingActionId === `deny:${notificationId}`
      || pendingActionId === `restore:${notificationId}`;
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setArchivedPrompt(null);
      setHistoryLimit(HISTORY_PAGE_SIZE);
    }
    setView((previousView) => getNextNotificationView({
      isOpening: nextOpen,
      previousView,
    }));
  }

  async function handleMarkAllRead() {
    setPendingActionId("mark-all");
    try {
      await markAllNotificationsRead();
      setArchivedPrompt(null);
      setView("history");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleMarkRead(notificationId: string) {
    setPendingActionId(`mark:${notificationId}`);
    try {
      await markNotificationRead({ id: notificationId });
      setArchivedPrompt((current) => current?.notificationId === notificationId ? null : current);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleOpenNotification(notificationId: string) {
    setPendingActionId(`open:${notificationId}`);
    try {
      const result = await openNotificationContext({ notificationId });
      if (result.status === "archived-task") {
        setArchivedPrompt({
          notificationId,
          taskTitle: result.taskTitle,
        });
      } else {
        setArchivedPrompt((current) => current?.notificationId === notificationId ? null : current);
      }
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleRestoreArchivedTask() {
    if (!archivedPrompt) {
      return;
    }

    setPendingActionId(`restore:${archivedPrompt.notificationId}`);
    try {
      const result = await openNotificationContext({ notificationId: archivedPrompt.notificationId });
      if (result.status === "archived-task") {
        restoreTask({ taskId: result.taskId });
      }
      setArchivedPrompt(null);
      setOpen(false);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleResolveApproval(notificationId: string, approved: boolean) {
    setPendingActionId(`${approved ? "approve" : "deny"}:${notificationId}`);
    try {
      await resolveNotificationApproval({ notificationId, approved });
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative h-8 w-8 shrink-0 rounded-md p-0 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                style={props.noDragStyle}
                aria-label="notifications"
              >
                <Bell className="size-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-background bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {unreadCountLabel}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifications</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(28rem,calc(100vw-1rem))] overflow-hidden rounded-xl border-border/80 bg-card p-0 shadow-2xl"
        style={props.noDragStyle}
      >
        <PopoverHeader className="border-b border-border/70 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <PopoverTitle className="text-sm font-semibold text-foreground">
                Notifications
              </PopoverTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : historyCount > 0
                    ? "All caught up. Browse read history below."
                    : "No notifications yet."}
              </p>
              <div className="mt-3 inline-flex rounded-lg border border-border/70 bg-muted/50 p-1">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    view === "unread"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setView("unread")}
                >
                  Unread
                  <Badge variant={view === "unread" ? "secondary" : "outline"} className="h-4 min-w-4 rounded-full px-1.5 text-[10px]">
                    {unreadCount}
                  </Badge>
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    view === "history"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setView("history")}
                >
                  History
                  <Badge variant={view === "history" ? "secondary" : "outline"} className="h-4 min-w-4 rounded-full px-1.5 text-[10px]">
                    {historyCount}
                  </Badge>
                </button>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs"
              disabled={unreadCount === 0 || pendingActionId === "mark-all"}
              onClick={() => void handleMarkAllRead()}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>
        </PopoverHeader>
        <div className="max-h-[min(70vh,40rem)] overflow-y-auto">
          {!hasNotifications ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">No notifications yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Task completions and approval requests will appear here.
              </p>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {view === "unread" ? "No unread notifications." : "No read notifications yet."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {view === "unread"
                  ? "Marked items move into History so the inbox stays focused."
                  : "Read notifications will collect here after you clear them from the unread list."}
              </p>
              {view === "unread" && historyCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setView("history")}
                >
                  View history
                </Button>
              ) : null}
              {view === "history" && unreadCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setView("unread")}
                >
                  Show unread
                </Button>
              ) : null}
            </div>
          ) : (
            <>
            {visibleNotifications.map((notification) => {
              const unread = isNotificationUnread(notification);
              const locationLabel = buildLocationLabel({
                projectName: notification.projectName,
                workspaceName: notification.workspaceName,
              });
              const showApprovalActions = shouldShowNotificationApprovalActions({
                unread,
                action: notification.action,
              });
              const approvalAction = notification.action?.type === "approval";
              const notificationTask = notification.taskId
                ? tasks.find((task) => task.id === notification.taskId) ?? null
                : null;
              const taskIsArchived = isTaskArchived(notificationTask ?? { archivedAt: null });
              const approvalHandledExternally = approvalAction && isTaskManaged(notificationTask);
              const createdLabel = formatTaskUpdatedAt({ value: notification.createdAt });
              const notificationBusy = pendingActionId === "mark-all" || isNotificationActionPending(notification.id);
              const showArchivedPrompt = archivedPrompt?.notificationId === notification.id;
              const archivedTaskTitle = showArchivedPrompt
                ? (archivedPrompt?.taskTitle ?? notification.taskTitle ?? "this task")
                : null;
              const notificationDetail = buildNotificationDetail(notification);

              return (
                <div
                  key={notification.id}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    unread && "bg-primary/[0.04]",
                  )}
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-2 size-1.5 shrink-0 rounded-full",
                          unread ? "bg-primary" : "bg-transparent",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-lg p-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none"
                            disabled={notificationBusy}
                            onClick={() => void handleOpenNotification(notification.id)}
                          >
                            <div className="flex items-center gap-1.5">
                              <NotificationKindIcon kind={notification.kind} />
                              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                {notification.taskTitle ?? notification.title}
                              </p>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {createdLabel}
                              </span>
                            </div>
                            {notificationDetail ? (
                              <p className="mt-1 truncate pl-5 text-xs text-muted-foreground">
                                {notificationDetail}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5 text-[11px] text-muted-foreground">
                              {locationLabel ? (
                                <span className="rounded-sm border border-border/60 bg-background/70 px-1.5 py-0.5">
                                  {locationLabel}
                                </span>
                              ) : null}
                              {taskIsArchived ? (
                                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning dark:bg-warning/15">
                                  <Archive className="size-3" />
                                  Archived
                                </span>
                              ) : null}
                            </div>
                          </button>
                          {unread ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="mt-1 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                              disabled={notificationBusy}
                              onClick={() => void handleMarkRead(notification.id)}
                            >
                              <Check className="size-3" />
                              Mark read
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {showApprovalActions ? (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        {approvalHandledExternally ? (
                          <p className="text-xs text-muted-foreground">
                            This approval is managed externally. Open the task to monitor it or answer from the originating client.
                          </p>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              disabled={notificationBusy}
                              onClick={() => void handleResolveApproval(notification.id, false)}
                            >
                              Deny
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8"
                              disabled={notificationBusy}
                              onClick={() => void handleResolveApproval(notification.id, true)}
                            >
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                    {showArchivedPrompt ? (
                      <div className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3">
                        <p className="text-sm font-medium text-foreground">This task is archived.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Restore <span className="font-medium text-foreground">{archivedTaskTitle}</span> to reopen it from notifications.
                        </p>
                        <div className="mt-3 flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={notificationBusy}
                            onClick={() => setArchivedPrompt(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            disabled={notificationBusy}
                            onClick={() => void handleRestoreArchivedTask()}
                          >
                            Restore and open
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {view === "history" && hasMoreHistory ? (
              <div className="flex items-center justify-center border-t border-border/60 px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setHistoryLimit((prev) => prev + HISTORY_PAGE_SIZE)}
                >
                  <ChevronDown className="size-3.5" />
                  Load more ({historyNotifications.length - historyLimit} remaining)
                </Button>
              </div>
            ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
