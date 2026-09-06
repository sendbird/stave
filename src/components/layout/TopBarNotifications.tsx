import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleX,
  ShieldAlert,
  Archive,
  Trash2,
} from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
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
  toast,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  getNextNotificationView,
  type NotificationView,
  shouldShowNotificationApprovalActions,
} from "@/components/layout/top-bar-notifications.utils";
import { buildNotificationDetail } from "@/lib/notifications/notification.utils";
import { formatTaskUpdatedAt, isTaskArchived } from "@/lib/tasks";
import {
  isNotificationUnread,
  type AppNotification,
} from "@/lib/notifications/notification.types";
import { useAppStore } from "@/store/app.store";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { notificationsStyles } from "./top-bar-notifications.styles";

const HISTORY_PAGE_SIZE = 20;

interface ArchivedNotificationPrompt {
  notificationId: string;
  taskTitle: string;
}

function NotificationKindIcon({ kind }: { kind: AppNotification["kind"] }) {
  if (
    kind === "task.approval_requested" ||
    kind === "task.user_input_requested"
  ) {
    return (
      <ShieldAlert
        className={sx(
          notificationsStyles.kindIcon,
          notificationsStyles.kindIconWarning,
        )}
      />
    );
  }
  if (kind === "task.turn_failed") {
    return (
      <CircleX
        className={sx(
          notificationsStyles.kindIcon,
          notificationsStyles.kindIconDanger,
        )}
      />
    );
  }
  return (
    <CircleCheck
      className={sx(
        notificationsStyles.kindIcon,
        notificationsStyles.kindIconSuccess,
      )}
    />
  );
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

export function TopBarNotifications(props: { noDragStyle: CSSProperties }) {
  const [
    notifications,
    tasks,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotificationHistory,
    openNotificationContext,
    resolveNotificationApproval,
    restoreTask,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.notifications,
          state.tasks,
          state.markNotificationRead,
          state.markAllNotificationsRead,
          state.clearNotificationHistory,
          state.openNotificationContext,
          state.resolveNotificationApproval,
          state.restoreTask,
        ] as const,
    ),
  );
  const [open, setOpen] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [view, setView] = useState<NotificationView>("unread");
  const [archivedPrompt, setArchivedPrompt] =
    useState<ArchivedNotificationPrompt | null>(null);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const [clearHistoryPromptOpen, setClearHistoryPromptOpen] = useState(false);
  const [clearHistoryPromptPending, setClearHistoryPromptPending] =
    useState(false);
  const notificationsTriggerRef = useRef<HTMLButtonElement | null>(null);

  function closeClearHistoryPrompt() {
    setClearHistoryPromptOpen(false);
    window.requestAnimationFrame(() =>
      notificationsTriggerRef.current?.focus(),
    );
  }

  const unreadNotifications = notifications.filter(isNotificationUnread);
  const historyNotifications = notifications.filter(
    (notification) => !isNotificationUnread(notification),
  );
  const pagedHistoryNotifications = historyNotifications.slice(0, historyLimit);
  const hasMoreHistory = historyNotifications.length > historyLimit;
  const visibleNotifications =
    view === "unread" ? unreadNotifications : pagedHistoryNotifications;
  const unreadCount = unreadNotifications.length;
  const historyCount = historyNotifications.length;
  const unreadCountLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasNotifications = notifications.length > 0;

  function isNotificationActionPending(notificationId: string) {
    return (
      pendingActionId === `open:${notificationId}` ||
      pendingActionId === `mark:${notificationId}` ||
      pendingActionId === `approve:${notificationId}` ||
      pendingActionId === `deny:${notificationId}` ||
      pendingActionId === `restore:${notificationId}`
    );
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setArchivedPrompt(null);
      setHistoryLimit(HISTORY_PAGE_SIZE);
    }
    setView((previousView) =>
      getNextNotificationView({
        isOpening: nextOpen,
        previousView,
      }),
    );
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
      setArchivedPrompt((current) =>
        current?.notificationId === notificationId ? null : current,
      );
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleClearHistory() {
    setPendingActionId("clear-history");
    try {
      const count = await clearNotificationHistory();
      closeClearHistoryPrompt();
      toast.success(
        count === 1
          ? "Cleared 1 notification"
          : `Cleared ${count} notifications`,
        {
          description: "Every notification that was in History was removed.",
        },
      );
    } catch (error) {
      toast.error("Could not clear notification history", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleOpenNotification(notification: AppNotification) {
    setPendingActionId(`open:${notification.id}`);
    try {
      const result = await openNotificationContext({
        notificationId: notification.id,
      });
      if (result.status === "archived-task") {
        setArchivedPrompt({
          notificationId: notification.id,
          taskTitle: result.taskTitle,
        });
      } else {
        setArchivedPrompt((current) =>
          current?.notificationId === notification.id ? null : current,
        );
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
      const result = await openNotificationContext({
        notificationId: archivedPrompt.notificationId,
      });
      if (result.status === "archived-task") {
        restoreTask({ taskId: result.taskId });
      }
      setArchivedPrompt(null);
      setOpen(false);
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleResolveApproval(
    notificationId: string,
    approved: boolean,
  ) {
    setPendingActionId(`${approved ? "approve" : "deny"}:${notificationId}`);
    try {
      await resolveNotificationApproval({ notificationId, approved });
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen && clearHistoryPromptPending) {
            setClearHistoryPromptPending(false);
            setClearHistoryPromptOpen(true);
          }
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={<span className={sx(notificationsStyles.triggerWrap)} />}
          >
            <PopoverTrigger
              render={
                <Button
                  ref={notificationsTriggerRef}
                  variant="ghost"
                  size="icon-sm"
                  xstyle={notificationsStyles.trigger}
                  style={props.noDragStyle}
                  aria-label="notifications"
                />
              }
            >
              <Bell className={sx(notificationsStyles.triggerIcon)} />
              {unreadCount > 0 ? (
                <span className={sx(notificationsStyles.unreadCount)}>
                  {unreadCountLabel}
                </span>
              ) : null}
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Notifications</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={10}
          xstyle={notificationsStyles.panel}
          style={props.noDragStyle}
        >
          <PopoverHeader className={sx(notificationsStyles.header)}>
            <div className={sx(notificationsStyles.headerRow)}>
              <div>
                <PopoverTitle className={sx(notificationsStyles.headerTitle)}>
                  Notifications
                </PopoverTitle>
                <p className={sx(notificationsStyles.headerSubtitle)}>
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : historyCount > 0
                      ? "All caught up. Browse read history below."
                      : "No notifications yet."}
                </p>
                <div className={sx(notificationsStyles.viewSwitch)}>
                  <AdsButton layout="host"
                    type="button"
                    xstyle={[
                      notificationsStyles.viewTab,
                      view === "unread"
                        ? notificationsStyles.viewTabActive
                        : notificationsStyles.viewTabIdle,
                    ]}
                    onClick={() => setView("unread")}
                  >
                    Unread
                    <Badge variant={view === "unread" ? "secondary" : "outline"}>
                      {unreadCount}
                    </Badge>
                  </AdsButton>
                  <AdsButton layout="host"
                    type="button"
                    xstyle={[
                      notificationsStyles.viewTab,
                      view === "history"
                        ? notificationsStyles.viewTabActive
                        : notificationsStyles.viewTabIdle,
                    ]}
                    onClick={() => setView("history")}
                  >
                    History
                    <Badge
                      variant={view === "history" ? "secondary" : "outline"}
                    >
                      {historyCount}
                    </Badge>
                  </AdsButton>
                </div>
              </div>
              <div className={sx(notificationsStyles.headerActions)}>
                {view === "history" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    xstyle={notificationsStyles.destructiveAction}
                    disabled={
                      historyCount === 0 || pendingActionId === "clear-history"
                    }
                    onClick={() => {
                      setClearHistoryPromptPending(true);
                      setOpen(false);
                    }}
                  >
                    <Trash2 className={sx(notificationsStyles.smallIcon)} />
                    Clear history
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={unreadCount === 0 || pendingActionId === "mark-all"}
                  onClick={() => void handleMarkAllRead()}
                >
                  <CheckCheck className={sx(notificationsStyles.triggerIcon)} />
                  Mark all read
                </Button>
              </div>
            </div>
          </PopoverHeader>
          <div className={sx(notificationsStyles.scroller)}>
            {!hasNotifications ? (
              <div className={sx(notificationsStyles.emptyState)}>
                <p className={sx(notificationsStyles.emptyTitle)}>
                  No notifications yet.
                </p>
                <p className={sx(notificationsStyles.emptyBody)}>
                  Task completions and blocked requests will appear here.
                </p>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className={sx(notificationsStyles.emptyState)}>
                <p className={sx(notificationsStyles.emptyTitle)}>
                  {view === "unread"
                    ? "No unread notifications."
                    : "No read notifications yet."}
                </p>
                <p className={sx(notificationsStyles.emptyBody)}>
                  {view === "unread"
                    ? "Marked items move into History so the inbox stays focused."
                    : "Read notifications will collect here after you clear them from the unread list."}
                </p>
                {view === "unread" && historyCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    xstyle={notificationsStyles.emptyAction}
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
                    xstyle={notificationsStyles.emptyAction}
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
                  const showApprovalActions =
                    shouldShowNotificationApprovalActions({
                      unread,
                      action: notification.action,
                    });
                  const notificationTask = notification.taskId
                    ? (tasks.find((task) => task.id === notification.taskId) ??
                      null)
                    : null;
                  const taskIsArchived = isTaskArchived(
                    notificationTask ?? { archivedAt: null },
                  );
                  const createdLabel = formatTaskUpdatedAt({
                    value: notification.createdAt,
                  });
                  const notificationBusy =
                    pendingActionId === "mark-all" ||
                    isNotificationActionPending(notification.id);
                  const showArchivedPrompt =
                    archivedPrompt?.notificationId === notification.id;
                  const archivedTaskTitle = showArchivedPrompt
                    ? (archivedPrompt?.taskTitle ??
                      notification.taskTitle ??
                      "this task")
                    : null;
                  const notificationDetail =
                    buildNotificationDetail(notification);

                  return (
                    <div
                      key={notification.id}
                      className={sx(
                        notificationsStyles.row,
                        transition.colors,
                        unread && notificationsStyles.rowUnread,
                      )}
                    >
                      <div className={sx(notificationsStyles.rowBody)}>
                        <div className={sx(notificationsStyles.rowLead)}>
                          <span
                            className={sx(
                              notificationsStyles.unreadDot,
                              unread
                                ? notificationsStyles.unreadDotOn
                                : notificationsStyles.unreadDotOff,
                            )}
                          />
                          <div className={sx(notificationsStyles.rowMain)}>
                            <div className={sx(notificationsStyles.rowMainTop)}>
                              <AdsButton layout="host"
                                type="button"
                                xstyle={notificationsStyles.openAction}
                                disabled={notificationBusy}
                                onClick={() =>
                                  void handleOpenNotification(notification)
                                }
                              >
                                <div
                                  className={sx(
                                    notificationsStyles.openActionHead,
                                  )}
                                >
                                  <NotificationKindIcon
                                    kind={notification.kind}
                                  />
                                  <p className={sx(notificationsStyles.rowTitle)}>
                                    {notification.taskTitle ??
                                      notification.title}
                                  </p>
                                  <span className={sx(notificationsStyles.rowTime)}>
                                    {createdLabel}
                                  </span>
                                </div>
                                {notificationDetail ? (
                                  <p className={sx(notificationsStyles.rowDetail)}>
                                    {notificationDetail}
                                  </p>
                                ) : null}
                                <div className={sx(notificationsStyles.rowMeta)}>
                                  {locationLabel ? (
                                    <span
                                      className={sx(
                                        notificationsStyles.locationChip,
                                      )}
                                    >
                                      {locationLabel}
                                    </span>
                                  ) : null}
                                  {taskIsArchived ? (
                                    <span
                                      className={sx(
                                        notificationsStyles.archivedChip,
                                      )}
                                    >
                                      <Archive
                                        className={sx(
                                          notificationsStyles.chipIcon,
                                        )}
                                      />
                                      Archived
                                    </span>
                                  ) : null}
                                </div>
                              </AdsButton>
                              {unread ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  xstyle={notificationsStyles.markReadAction}
                                  disabled={notificationBusy}
                                  onClick={() =>
                                    void handleMarkRead(notification.id)
                                  }
                                >
                                  <Check
                                    className={sx(notificationsStyles.tinyIcon)}
                                  />
                                  Mark read
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {showApprovalActions ? (
                          <div className={sx(notificationsStyles.actionRow)}>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={notificationBusy}
                              onClick={() =>
                                void handleResolveApproval(
                                  notification.id,
                                  false,
                                )
                              }
                            >
                              Deny
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={notificationBusy}
                              onClick={() =>
                                void handleResolveApproval(
                                  notification.id,
                                  true,
                                )
                              }
                            >
                              Approve
                            </Button>
                          </div>
                        ) : null}
                        {showArchivedPrompt ? (
                          <div className={sx(notificationsStyles.archivedPrompt)}>
                            <p className={sx(notificationsStyles.promptTitle)}>
                              This task is archived.
                            </p>
                            <p className={sx(notificationsStyles.promptBody)}>
                              Restore{" "}
                              <span
                                className={sx(
                                  notificationsStyles.promptEmphasis,
                                )}
                              >
                                {archivedTaskTitle}
                              </span>{" "}
                              to reopen it from notifications.
                            </p>
                            <div className={sx(notificationsStyles.actionRow)}>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={notificationBusy}
                                onClick={() => setArchivedPrompt(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
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
                  <div className={sx(notificationsStyles.loadMore)}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      xstyle={notificationsStyles.quietAction}
                      onClick={() =>
                        setHistoryLimit((prev) => prev + HISTORY_PAGE_SIZE)
                      }
                    >
                      <ChevronDown
                        className={sx(notificationsStyles.smallIcon)}
                      />
                      Load more ({historyNotifications.length -
                        historyLimit}{" "}
                      remaining)
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={clearHistoryPromptOpen}
        title="Clear notification history?"
        description="This permanently removes every notification currently in History, including approval and input requests. Unread notifications remain available."
        confirmLabel="Clear history"
        loading={pendingActionId === "clear-history"}
        onCancel={closeClearHistoryPrompt}
        onConfirm={() => void handleClearHistory()}
      />
    </>
  );
}
