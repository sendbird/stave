import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  CircleX,
  ShieldAlert,
  Target,
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
import { CountBadge } from "@/components/system/CountBadge";
import {
  getNextNotificationView,
  type NotificationView,
  describeNotificationRow,
  shouldShowNotificationApprovalActions,
} from "@/components/layout/top-bar-notifications.utils";
import { formatTaskUpdatedAt, isTaskArchived } from "@/lib/tasks";
import {
  isNotificationUnread,
  type AppNotification,
} from "@/lib/notifications/notification.types";
import { useAppStore } from "@/store/app.store";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { hostSurface } from "@/components/ui/host-surface.styles";
import { notificationsStyles } from "./top-bar-notifications.styles";

const HISTORY_PAGE_SIZE = 20;

interface ArchivedNotificationPrompt {
  notificationId: string;
  taskTitle: string;
}

function NotificationKindIcon({ kind }: { kind: AppNotification["kind"] }) {
  useTranslation();
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
  if (kind === "agent_run.sign_off_requested") {
    return (
      <Target
        className={sx(
          notificationsStyles.kindIcon,
          notificationsStyles.kindIconWarning,
        )}
      />
    );
  }
  if (kind === "agent_run.blocked" || kind === "agent_run.stuck") {
    return (
      <Target
        className={sx(
          notificationsStyles.kindIcon,
          notificationsStyles.kindIconDanger,
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
  repositoryName: string | null;
  workspaceName: string | null;
}) {
  return [args.repositoryName, args.workspaceName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

export function TopBarNotifications(props: { noDragStyle: CSSProperties }) {
  useTranslation();
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
          ? i18n.t("shell:topBarNotifications.cleared1Notification")
          : i18n.t("shell:topBarNotifications.clearedNotifications", { value1: count }),
        {
          description: i18n.t("shell:topBarNotifications.everyNotificationThatWasInHistoryWas"),
        },
      );
    } catch (error) {
      toast.error(i18n.t("shell:topBarNotifications.couldNotClearNotificationHistory"), {
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
                  aria-label={i18n.t("shell:topBarNotifications.notifications")}
                  indicator={
                    unreadCount > 0 ? (
                      <CountBadge cap={99} count={unreadCount} />
                    ) : null
                  }
                />
              }
            >
              <Bell className={sx(notificationsStyles.triggerIcon)} />
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{i18n.t("shell:topBarNotifications.notifications2")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={10}
          xstyle={notificationsStyles.panel}
          style={props.noDragStyle}
        >
          <PopoverHeader className={sx(notificationsStyles.header)}>
            <div className={sx(notificationsStyles.headerRow)}>
              <div className={sx(notificationsStyles.headerTitleColumn)}>
                <PopoverTitle className={sx(notificationsStyles.headerTitle)}>
                  {i18n.t("shell:topBarNotifications.notifications2")}
                </PopoverTitle>
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
                    {i18n.t("shell:topBarNotifications.clearHistory")}
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
                  {i18n.t("shell:topBarNotifications.markAllRead")}
                </Button>
              </div>
            </div>
            <p className={sx(notificationsStyles.headerSubtitle)}>
              {unreadCount > 0
                ? i18n.t("shell:topBarNotifications.unread", { value1: unreadCount })
                : historyCount > 0
                  ? i18n.t("shell:topBarNotifications.allCaughtUpBrowseReadHistoryBelow")
                  : i18n.t("shell:topBarNotifications.noNotificationsYet")}
            </p>
            <div className={sx(notificationsStyles.viewSwitch)}>
              <AdsButton
                layout="host"
                type="button"
                xstyle={[
                  notificationsStyles.viewTab,
                  view === "unread"
                    ? notificationsStyles.viewTabActive
                    : notificationsStyles.viewTabIdle,
                ]}
                aria-pressed={view === "unread"}
                onClick={() => setView("unread")}
              >
                <span className={sx(notificationsStyles.viewTabLabel)}>
                  {i18n.t("shell:topBarNotifications.unread2")}
                </span>
                {/* Always `outline`. The selected arm used to be `secondary`,
                    whose `colorCanvasSubtle` fill sits 1.5% of lightness from
                    the active tab's own `colorCanvas` — so on the tab you were
                    looking at, the chip disappeared. A ring does not depend on
                    the fill behind it, so the count reads the same on both. */}
                <Badge className={sx(notificationsStyles.viewTabCount)} variant="outline">
                  {unreadCount}
                </Badge>
              </AdsButton>
              <AdsButton
                layout="host"
                type="button"
                xstyle={[
                  notificationsStyles.viewTab,
                  view === "history"
                    ? notificationsStyles.viewTabActive
                    : notificationsStyles.viewTabIdle,
                ]}
                aria-pressed={view === "history"}
                onClick={() => setView("history")}
              >
                <span className={sx(notificationsStyles.viewTabLabel)}>
                  {i18n.t("shell:topBarNotifications.history")}
                </span>
                <Badge className={sx(notificationsStyles.viewTabCount)} variant="outline">
                  {historyCount}
                </Badge>
              </AdsButton>
            </div>
          </PopoverHeader>
          <div className={sx(notificationsStyles.scroller)}>
            {!hasNotifications ? (
              <div className={sx(notificationsStyles.emptyState)}>
                <p className={sx(notificationsStyles.emptyTitle)}>
                  {i18n.t("shell:topBarNotifications.noNotificationsYet")}
                </p>
                <p className={sx(notificationsStyles.emptyBody)}>
                  {i18n.t("shell:topBarNotifications.taskCompletionsAndBlockedRequestsWillAppear")}
                </p>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className={sx(notificationsStyles.emptyState)}>
                <p className={sx(notificationsStyles.emptyTitle)}>
                  {view === "unread"
                    ? i18n.t("shell:topBarNotifications.noUnreadNotifications")
                    : i18n.t("shell:topBarNotifications.noReadNotificationsYet")}
                </p>
                <p className={sx(notificationsStyles.emptyBody)}>
                  {view === "unread"
                    ? i18n.t("shell:topBarNotifications.markedItemsMoveIntoHistorySoThe")
                    : i18n.t("shell:topBarNotifications.readNotificationsWillCollectHereAfterYou")}
                </p>
                {view === "unread" && historyCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    xstyle={notificationsStyles.emptyAction}
                    onClick={() => setView("history")}
                  >
                    {i18n.t("shell:topBarNotifications.viewHistory")}
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
                    {i18n.t("shell:topBarNotifications.showUnread")}
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                {visibleNotifications.map((notification) => {
                  const unread = isNotificationUnread(notification);
                  const row = describeNotificationRow(notification);
                  const locationLabel = buildLocationLabel({
                    repositoryName: notification.repositoryName,
                    workspaceName: row.workspaceName,
                  });
                  const showApprovalActions =
                    shouldShowNotificationApprovalActions({
                      unread,
                      action: notification.action,
                    });
                  const notificationTask = row.taskId
                    ? (tasks.find((task) => task.id === row.taskId) ?? null)
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
                      i18n.t("shell:topBarNotifications.thisTask"))
                    : null;
                  const notificationDetail = row.detail;

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
                              <AdsButton
                                layout="host"
                                type="button"
                                xstyle={[
                                  notificationsStyles.openAction,
                                  hostSurface.inertChrome,
                                ]}
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
                                  <p
                                    className={sx(notificationsStyles.rowTitle)}
                                  >
                                    {row.title}
                                  </p>
                                  <span
                                    className={sx(notificationsStyles.rowTime)}
                                  >
                                    {createdLabel}
                                  </span>
                                </div>
                                {notificationDetail ? (
                                  <p
                                    className={sx(
                                      notificationsStyles.rowDetail,
                                    )}
                                  >
                                    {notificationDetail}
                                  </p>
                                ) : null}
                                <div
                                  className={sx(notificationsStyles.rowMeta)}
                                >
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
                                      {i18n.t("shell:topBarNotifications.archived")}
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
                                  {i18n.t("shell:topBarNotifications.markRead")}
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
                              {i18n.t("shell:topBarNotifications.deny")}
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
                              {i18n.t("shell:topBarNotifications.approve")}
                            </Button>
                          </div>
                        ) : null}
                        {showArchivedPrompt ? (
                          <div
                            className={sx(notificationsStyles.archivedPrompt)}
                          >
                            <p className={sx(notificationsStyles.promptTitle)}>
                              {i18n.t("shell:topBarNotifications.thisTaskIsArchived")}
                            </p>
                            <p className={sx(notificationsStyles.promptBody)}>{i18n.t("shell:topBarNotifications.restoreTask", { title: archivedTaskTitle })}</p>
                            <div className={sx(notificationsStyles.actionRow)}>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={notificationBusy}
                                onClick={() => setArchivedPrompt(null)}
                              >
                                {i18n.t("shell:topBarNotifications.cancel")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={notificationBusy}
                                onClick={() => void handleRestoreArchivedTask()}
                              >
                                {i18n.t("shell:topBarNotifications.restoreAndOpen")}
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
                    >{i18n.t("shell:topBarNotifications.loadMoreCount", { count: historyNotifications.length - pagedHistoryNotifications.length })}</Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={clearHistoryPromptOpen}
        title={i18n.t("shell:topBarNotifications.clearNotificationHistory")}
        description={i18n.t("shell:topBarNotifications.thisPermanentlyRemovesEveryNotificationCurrentlyIn")}
        confirmLabel={i18n.t("shell:topBarNotifications.clearHistory")}
        loading={pendingActionId === "clear-history"}
        onCancel={closeClearHistoryPrompt}
        onConfirm={() => void handleClearHistory()}
      />
    </>
  );
}
