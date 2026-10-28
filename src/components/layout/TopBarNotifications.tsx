import { i18n, useTranslation } from "@/i18n";
import { AsyncBoundary, type AsyncState } from "@/components/system/AsyncBoundary";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { Archive, Bell, Check, CheckCheck, Trash2 } from "lucide-react";
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
  toast,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { FleetAttentionBulkMenu } from "@/components/layout/FleetAttentionBulkMenu";
import { useFleetBulkActions } from "@/components/layout/useFleetBulkActions";
import { clearFleetAttentionSnoozes } from "@/lib/fleet/attention-snooze-client";
import { CountBadge } from "@/components/system/CountBadge";
import {
  getNextNotificationView,
  type NotificationView,
  shouldShowNotificationApprovalActions,
} from "@/components/layout/top-bar-notifications.utils";
import { InboxRow, moveInboxFocus } from "@/components/layout/InboxRow";
import { markInboxEntryRead, openInboxEntry } from "@/components/layout/inbox-actions";
import { inboxRowStyles as rowStyles } from "@/components/layout/inbox-row.styles";
import { describeFleetAttentionPrimaryAction } from "@/lib/fleet/fleet-vocabulary";
import {
  selectBellEntries,
  selectBellHistory,
  type FleetInboxEntry,
} from "@/lib/fleet/inbox-model";
import { isTaskArchived } from "@/lib/tasks";
import { isNotificationUnread } from "@/lib/notifications/notification.types";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { sx } from "@/components/ads/utils/stylex";
import { notificationsStyles } from "./top-bar-notifications.styles";

const HISTORY_PAGE_SIZE = 20;

interface ArchivedNotificationPrompt {
  notificationId: string;
  taskTitle: string;
}

const VIEW_LABEL_KEY = {
  all: "shell:topBarNotifications.all",
  unread: "shell:topBarNotifications.unread2",
  errors: "shell:topBarNotifications.errors",
  history: "shell:topBarNotifications.history",
} as const satisfies Record<NotificationView, string>;

/** "Open approval for Review cache in checkout", the name both inboxes give a row. */
export function describeInboxEntryLabel(entry: FleetInboxEntry) {
  const action = describeFleetAttentionPrimaryAction(entry.kind);
  return entry.workspaceName
    ? i18n.t("fleet:fleetAttentionInbox.rowLabel", {
        action,
        title: entry.title,
        workspace: entry.workspaceName,
      })
    : i18n.t("fleet:fleetAttentionInbox.rowLabelNoWorkspace", {
        action,
        title: entry.title,
      });
}

/**
 * The notification bell: the same inbox as Fleet's rail, drawn with the same
 * row, so an entry reads and is read the same in both. All, Unread and Errors
 * filter the live inbox; History keeps what was read and has no item left.
 */
export function TopBarNotifications(props: { noDragStyle: CSSProperties }) {
  useTranslation();
  const [
    notificationsLoad,
    hydrateNotifications,
    tasks,
    markAllNotificationsRead,
    clearNotificationHistory,
    openNotificationContext,
    resolveNotificationApproval,
    restoreTask,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.notificationsLoad,
          state.hydrateNotifications,
          state.tasks,
          state.markAllNotificationsRead,
          state.clearNotificationHistory,
          state.openNotificationContext,
          state.resolveNotificationApproval,
          state.restoreTask,
        ] as const,
    ),
  );
  const notificationCount = useAppStore((state) => state.notifications.length);
  const inbox = useFleetAttention((snapshot) => snapshot.inbox);
  const attentionItems = useFleetAttention((snapshot) => snapshot.items);
  const snoozedAttentionIds = useFleetAttention((snapshot) => snapshot.snoozedAttentionIds);
  const bulk = useFleetBulkActions();
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

  async function restoreSnoozed() {
    setPendingActionId("restore-snoozed");
    try {
      await Promise.all(Array.from({ length: Math.ceil(snoozedAttentionIds.length / 1000) }, (_, index) =>
        clearFleetAttentionSnoozes({ attentionIds: snoozedAttentionIds.slice(index * 1000, (index + 1) * 1000) })));
    } catch {
      toast.error(i18n.t("fleet:fleetView.snoozedItemsWereNotRestoredRetry"));
    } finally {
      setPendingActionId(null);
    }
  }

  function closeClearHistoryPrompt() {
    setClearHistoryPromptOpen(false);
    window.requestAnimationFrame(() =>
      notificationsTriggerRef.current?.focus(),
    );
  }

  const allEntries = selectBellEntries(inbox, "all");
  const unreadEntries = selectBellEntries(inbox, "unread");
  const errorEntries = selectBellEntries(inbox, "errors");
  const historyEntries = selectBellHistory(inbox);
  const pagedHistoryEntries = historyEntries.slice(0, historyLimit);
  const hasMoreHistory = historyEntries.length > historyLimit;
  const visibleEntries =
    view === "all"
      ? allEntries
      : view === "unread"
        ? unreadEntries
        : view === "errors"
          ? errorEntries
          : pagedHistoryEntries;
  const viewCount: Record<NotificationView, number> = {
    all: allEntries.length,
    unread: unreadEntries.length,
    errors: errorEntries.length,
    history: historyEntries.length,
  };
  const unreadCount = unreadEntries.length;
  const historyCount = historyEntries.length;
  const hasEntries = allEntries.length > 0 || historyCount > 0;
  // A failed read keeps the list it had under a notice, and before any list it
  // is an error with Retry, never "no notifications".
  const inboxState: AsyncState<FleetInboxEntry[]> =
    notificationsLoad.status === "error"
      ? notificationCount > 0 || hasEntries
        ? { status: "ready", data: visibleEntries, stale: true, refreshError: notificationsLoad.message }
        : { status: "error", error: notificationsLoad.message }
      : notificationsLoad.status === "pending" && !hasEntries
        ? { status: "pending" }
        : { status: "ready", data: visibleEntries };

  function isEntryActionPending(entryId: string) {
    return (
      pendingActionId === `open:${entryId}` ||
      pendingActionId === `mark:${entryId}` ||
      pendingActionId === `approve:${entryId}` ||
      pendingActionId === `deny:${entryId}` ||
      pendingActionId === `restore:${entryId}`
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

  function handleMarkRead(entry: FleetInboxEntry) {
    markInboxEntryRead(entry);
    setArchivedPrompt((current) =>
      current && entry.notifications.some((item) => item.id === current.notificationId)
        ? null
        : current,
    );
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

  async function handleOpenEntry(entry: FleetInboxEntry) {
    setPendingActionId(`open:${entry.id}`);
    try {
      const result = await openInboxEntry(entry);
      const notificationId = entry.notifications[0]?.id;
      if (result.status === "archived-task" && notificationId) {
        setArchivedPrompt({ notificationId, taskTitle: result.taskTitle });
      } else {
        setArchivedPrompt((current) =>
          current?.notificationId === notificationId ? null : current,
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
    entry: FleetInboxEntry,
    notificationId: string,
    approved: boolean,
  ) {
    setPendingActionId(`${approved ? "approve" : "deny"}:${entry.id}`);
    try {
      await resolveNotificationApproval({ notificationId, approved });
    } finally {
      setPendingActionId(null);
    }
  }

  function renderEntry(entry: FleetInboxEntry) {
    const primary = entry.notifications[0] ?? null;
    const unreadNotification = entry.notifications.find(isNotificationUnread) ?? null;
    const approvalNotification =
      primary &&
      !primary.resolvedAt &&
      shouldShowNotificationApprovalActions({
        unread: Boolean(unreadNotification),
        action: primary.action,
      })
        ? primary
        : null;
    const entryTask = entry.taskId
      ? (tasks.find((task) => task.id === entry.taskId) ?? null)
      : null;
    const taskIsArchived = isTaskArchived(entryTask ?? { archivedAt: null });
    const busy = pendingActionId === "mark-all" || isEntryActionPending(entry.id);
    const showArchivedPrompt =
      Boolean(archivedPrompt) &&
      entry.notifications.some((item) => item.id === archivedPrompt?.notificationId);
    const archivedTaskTitle = showArchivedPrompt
      ? (archivedPrompt?.taskTitle ?? entry.title ?? i18n.t("shell:topBarNotifications.thisTask"))
      : null;

    return (
      <InboxRow
        key={entry.id}
        entry={entry}
        triggerId={`notification-entry-${entry.id}`}
        triggerLabel={describeInboxEntryLabel(entry)}
        busy={busy}
        onActivate={() => void handleOpenEntry(entry)}
        supplement={
          taskIsArchived ? (
            <span className={sx(rowStyles.archivedChip)}>
              <Archive className={sx(rowStyles.chipIcon)} aria-hidden="true" />
              {i18n.t("shell:topBarNotifications.archived")}
            </span>
          ) : undefined
        }
        actions={
          entry.unread || approvalNotification ? (
            <>
              {/* The approval card's decision words, allow first. */}
              {approvalNotification ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    xstyle={rowStyles.rowAction}
                    disabled={busy}
                    onClick={() =>
                      void handleResolveApproval(entry, approvalNotification.id, true)
                    }
                  >
                    {i18n.t("shell:topBarNotifications.allowOnce")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    xstyle={rowStyles.rowAction}
                    disabled={busy}
                    onClick={() =>
                      void handleResolveApproval(entry, approvalNotification.id, false)
                    }
                  >
                    {i18n.t("shell:topBarNotifications.deny")}
                  </Button>
                </>
              ) : null}
              {entry.unread ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  xstyle={[rowStyles.rowAction, notificationsStyles.quietAction]}
                  disabled={busy}
                  onClick={() => handleMarkRead(entry)}
                >
                  <Check className={sx(rowStyles.rowActionIcon)} aria-hidden="true" />
                  {i18n.t("shell:topBarNotifications.markRead")}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      >
        {showArchivedPrompt ? (
          <div className={sx(rowStyles.rowPrompt)}>
            <p className={sx(rowStyles.promptTitle)}>
              {i18n.t("shell:topBarNotifications.thisTaskIsArchived")}
            </p>
            <p className={sx(rowStyles.promptBody)}>
              {i18n.t("shell:topBarNotifications.restoreTask", { title: archivedTaskTitle })}
            </p>
            <div className={sx(rowStyles.promptActions)}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setArchivedPrompt(null)}
              >
                {i18n.t("shell:topBarNotifications.cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void handleRestoreArchivedTask()}
              >
                {i18n.t("shell:topBarNotifications.restoreAndOpen")}
              </Button>
            </div>
          </div>
        ) : null}
      </InboxRow>
    );
  }

  const emptyCopy: Record<NotificationView, { title: string; body: string }> = {
    get all() {
      return {
        title: i18n.t("shell:topBarNotifications.nothingInTheInbox"),
        body: i18n.t("shell:topBarNotifications.taskCompletionsAndBlockedRequestsWillAppear"),
      };
    },
    get unread() {
      return {
        title: i18n.t("shell:topBarNotifications.noUnreadNotifications"),
        body: i18n.t("shell:topBarNotifications.markedItemsMoveIntoHistorySoThe"),
      };
    },
    get errors() {
      return {
        title: i18n.t("shell:topBarNotifications.noErrors"),
        body: i18n.t("shell:topBarNotifications.failedRunsAndChecksWillAppear"),
      };
    },
    get history() {
      return {
        title: i18n.t("shell:topBarNotifications.noReadNotificationsYet"),
        body: i18n.t("shell:topBarNotifications.readNotificationsWillCollectHereAfterYou"),
      };
    },
  };

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
        <Tooltip
          content={i18n.t("shell:topBarNotifications.notifications2")}
          side="bottom"
        >
          <span className={sx(notificationsStyles.triggerWrap)}>
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
          </span>
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
            <FleetAttentionBulkMenu
              items={attentionItems}
              busy={bulk.applying || pendingActionId !== null}
              onApply={(plan) => { void bulk.apply(plan); }}
            />
            {snoozedAttentionIds.length > 0 ? (
              <div className={sx(notificationsStyles.headerActions)}>
                <span className={sx(notificationsStyles.headerSubtitle)}>
                  {i18n.t("fleet:fleetAttentionInbox.snoozedCount", { count: snoozedAttentionIds.length })}
                </span>
                <Button size="sm" variant="ghost" disabled={bulk.applying || pendingActionId !== null}
                  aria-label={i18n.t("fleet:fleetAttentionInbox.restoreValueSnoozedItems", { snoozedCount: snoozedAttentionIds.length })}
                  onClick={() => { void restoreSnoozed(); }}>
                  {i18n.t("fleet:fleetAttentionInbox.restore")}
                </Button>
              </div>
            ) : null}
            <div className={sx(notificationsStyles.viewSwitch)}>
              {(["all", "unread", "errors", "history"] as const).map((option) => (
                <AdsButton
                  key={option}
                  layout="host"
                  type="button"
                  xstyle={[
                    notificationsStyles.viewTab,
                    view === option
                      ? notificationsStyles.viewTabActive
                      : notificationsStyles.viewTabIdle,
                  ]}
                  aria-pressed={view === option}
                  onClick={() => setView(option)}
                >
                  <span className={sx(notificationsStyles.viewTabLabel)}>
                    {i18n.t(VIEW_LABEL_KEY[option])}
                  </span>
                  {/* Always `outline`: a ring reads the same on the raised
                      active tab and on the track behind the idle ones. */}
                  <Badge className={sx(notificationsStyles.viewTabCount)} variant="outline">
                    {viewCount[option]}
                  </Badge>
                </AdsButton>
              ))}
            </div>
          </PopoverHeader>
          <div className={sx(notificationsStyles.scroller)}>
            <AsyncBoundary
              state={inboxState}
              onRetry={() => void hydrateNotifications()}
              isEmpty={(rows) => rows.length === 0 && !hasEntries}
              empty={
                <div className={sx(notificationsStyles.emptyState)}>
                  <p className={sx(notificationsStyles.emptyTitle)}>
                    {i18n.t("shell:topBarNotifications.noNotificationsYet")}
                  </p>
                  <p className={sx(notificationsStyles.emptyBody)}>
                    {i18n.t("shell:topBarNotifications.taskCompletionsAndBlockedRequestsWillAppear")}
                  </p>
                </div>
              }
            >
            {() => visibleEntries.length === 0 ? (
              <div className={sx(notificationsStyles.emptyState)}>
                <p className={sx(notificationsStyles.emptyTitle)}>
                  {emptyCopy[view].title}
                </p>
                <p className={sx(notificationsStyles.emptyBody)}>
                  {emptyCopy[view].body}
                </p>
                {view !== "history" && historyCount > 0 ? (
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
                <ul className={sx(notificationsStyles.list)} onKeyDown={moveInboxFocus}>
                  {visibleEntries.map(renderEntry)}
                </ul>
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
                    >{i18n.t("shell:topBarNotifications.loadMoreCount", { count: historyEntries.length - pagedHistoryEntries.length })}</Button>
                  </div>
                ) : null}
              </>
            )}
            </AsyncBoundary>
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
