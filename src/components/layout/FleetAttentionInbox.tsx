import { useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  BellOff,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
} from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import {
  describeFleetRowKeys,
  FleetRowInlineAnswer,
  resolveFleetRowKey,
} from "@/components/layout/FleetRowInlineAnswer";
import { useFleetRowInteraction } from "@/components/layout/useFleetRowInteraction";
import { FleetQuietDuration } from "@/components/layout/FleetTaskActivityLine";
import { InboxRow, moveInboxFocus } from "@/components/layout/InboxRow";
import type { FleetInteractionResponse } from "@/lib/fleet/interaction-respond";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import {
  countFleetBulkPlan,
  pickFleetBulkEffect,
  planFleetReviewClear,
  summarizeFleetBulkPlan,
  type FleetBulkEffect,
  type FleetBulkPlan,
} from "@/lib/fleet/attention-bulk";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { attentionStyles as styles } from "./fleet-attention-inbox.styles";
import { inboxRowStyles as rowStyles } from "./inbox-row.styles";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
} from "@/lib/fleet/attention-projection";
import {
  describeFleetAttentionPrimaryAction,
  FLEET_ATTENTION_KIND_LABEL,
  FLEET_TIER_LABEL,
} from "@/lib/fleet/fleet-vocabulary";
import { FLEET_ATTENTION_SNOOZE_DURATIONS } from "@/lib/fleet/attention-snooze";
import { describeSignOffAction } from "@/lib/agent-runs/agent-run-view";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { agentRunStageKey, useAgentRunFailure, useAgentRunsStore } from "@/store/agent-runs-store";

/** The sign-off button on a Fleet row and, when the sign-off failed, why. */
export function AgentRunSignOffControl(props: {
  label: string;
  disabled: boolean;
  failure: string | null;
  onSignOff: () => void;
}) {
  return (
    <>
      <Button type="button" size="sm" xstyle={rowStyles.rowAction} disabled={props.disabled} onClick={props.onSignOff}>
        {props.label}
      </Button>
      {props.failure ? (
        <span className={sx(rowStyles.rowError)} role="alert">
          {props.failure}
        </span>
      ) : null}
    </>
  );
}

/**
 * Signs off from Fleet with the same command and stale-card check as the
 * task's own card, naming what it starts.
 */
function AgentRunSignOffAction(args: {
  item: FleetAttentionItem;
  agentRunStage: NonNullable<FleetAttentionItem["agentRunStage"]>;
  disabled: boolean;
}) {
  const detail = useFleetAgentRunsStore((state) => state.details[args.agentRunStage.agentRunId]);
  const runCommand = useAgentRunsStore((state) => state.runCommand);
  const pending = useAgentRunsStore((state) => Boolean(state.pendingByAgentRun[args.agentRunStage.agentRunId]));
  // Scoped to this stage: a failure from an earlier stage never shows here.
  const failure = useAgentRunFailure(args.agentRunStage.agentRunId, agentRunStageKey(args.agentRunStage));
  const stage = detail?.agentRun.workflow.stages.find((candidate) => candidate.id === args.agentRunStage.stageId);
  if (!stage) return null;
  return (
    <AgentRunSignOffControl
      label={describeSignOffAction(stage)}
      disabled={args.disabled || pending}
      failure={failure}
      onSignOff={() => void runCommand("signOff", args.agentRunStage)}
    />
  );
}

function FleetNeedRow(args: {
  item: FleetAttentionItem;
  /** The item with the notifications that speak for it. */
  entry: FleetInboxEntry;
  selected: boolean;
  busy: boolean;
  onOpen: (item: FleetAttentionItem) => void;
  /** Open what the entry names, as the bell would. */
  onOpenEntry: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onSnooze: (item: FleetAttentionItem, durationMs: number) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
  /** After an answer leaves this row, so triage can continue on the next. */
  onAnswered: (item: FleetAttentionItem) => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const { item, entry, selected, busy } = args;
  const interaction = useFleetRowInteraction(item);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { onAnswered } = args;
  const answer = useCallback(
    (response: FleetInteractionResponse) => {
      if (interaction.respond(response).ok) {
        onAnswered(item);
      }
    },
    [interaction, item, onAnswered],
  );
  // A focused row answers with A / D / 1–9 while its inline answer shows. The
  // open control panel and any text field keep their own keys, and the key is
  // consumed so Fleet's window shortcuts skip it.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (
      event.defaultPrevented ||
      selected ||
      (event.target instanceof Node && panelRef.current?.contains(event.target))
    ) {
      return;
    }
    const response = resolveFleetRowKey(
      {
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        isComposing: event.nativeEvent.isComposing,
        target: event.target,
      },
      interaction,
    );
    if (!response) {
      return;
    }
    event.preventDefault();
    answer(response);
  };
  const title = entry.title;
  const canMarkRead =
    Boolean(item.notificationId || item.resultReview) &&
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
        repositoryPath: item.repositoryPath,
        workspaceId: item.workspaceId,
        taskId: item.taskId,
        taskTitle: item.taskTitle,
        turnId: item.turnId,
      }
    : null;

  return (
    <InboxRow
      entry={entry}
      rowStyle={styles.gridRow}
      triggerId={triggerId}
      triggerLabel={tI18n("fleet:fleetAttentionInbox.rowLabel", { action: describeFleetAttentionPrimaryAction(item.kind), title, workspace: item.workspaceName })}
      selected={selected}
      busy={busy}
      onActivate={() => {
        interaction.ensureLoaded();
        args.onOpen(item);
      }}
      triggerProps={{
        "aria-expanded": controlTarget ? selected : undefined,
        "aria-controls":
          controlTarget && selected
            ? `fleet-attention-controls-${item.id}`
            : undefined,
        "aria-keyshortcuts": selected ? undefined : describeFleetRowKeys(interaction),
      }}
      // The inline approval card already names the tool and its request.
      hideDetail={!selected && interaction.inline.kind === "approval"}
      supplement={
        item.kind === "turn-stalled" && item.waitingSince ? (
          <FleetQuietDuration since={item.waitingSince} />
        ) : undefined
      }
      body={
        selected ? null : (
          <FleetRowInlineAnswer interaction={interaction} onAnswer={answer} />
        )
      }
      onFocus={interaction.ensureLoaded}
      onKeyDown={handleRowKeyDown}
      actions={
        <>
          {controlTarget ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={rowStyles.rowAction}
              disabled={busy}
              aria-label={tI18n("fleet:inlineAnswer.openLabel", { title, workspace: item.workspaceName })}
              onClick={() => args.onOpenEntry(item)}
            >
              {tI18n("fleet:inlineAnswer.open")}</Button>
          ) : null}
          {item.kind === "agent-run-sign-off" && item.agentRunStage ? (
            <AgentRunSignOffAction item={item} agentRunStage={item.agentRunStage} disabled={busy} />
          ) : null}
          {canMarkRead ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={rowStyles.rowAction}
              disabled={busy}
              onClick={() => args.onMarkRead(item)}
            >
              {item.resultReview ? tI18n("fleet:fleetAttentionInbox.markReviewed") : tI18n("fleet:fleetAttentionInbox.markRead")}
            </Button>
          ) : null}
          {canDismiss ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={rowStyles.rowAction}
              disabled={busy}
              aria-label={
                item.kind === "approval"
                  ? tI18n("fleet:fleetAttentionInbox.dismissApproval", { title, workspace: item.workspaceName })
                  : tI18n("fleet:fleetAttentionInbox.dismissQuestion", { title, workspace: item.workspaceName })
              }
              onClick={() => args.onDismiss(item)}
            >
              {tI18n("fleet:fleetAttentionInbox.dismiss")}</Button>
          ) : null}
          {item.prUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={rowStyles.rowAction}
              disabled={busy}
              onClick={() => args.onOpenPr(item)}
            >
              {tI18n("fleet:fleetAttentionInbox.openPr")}</Button>
          ) : null}
          {/*
            Snooze is offered on every kind, including blocking ones. It is the
            only way to set aside a row whose underlying state Fleet does not
            own — a pull request status, a request nobody can settle yet — and it
            is time-bounded, so unlike Dismiss it cannot lose the item. The
            snoozed count in the footer keeps what is hidden accountable.
          */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={rowStyles.rowAction}
                  disabled={busy}
                  aria-label={tI18n("fleet:fleetAttentionInbox.snoozeValueForValueInValue", { value1: FLEET_ATTENTION_KIND_LABEL[item.kind].toLowerCase(), title: title, value2: item.workspaceName })}
                />
              }
            >
              <Clock className={sx(rowStyles.rowActionIcon)} aria-hidden="true" />
              {tI18n("fleet:fleetAttentionInbox.snooze")}</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{tI18n("fleet:fleetAttentionInbox.hideUntil")}</DropdownMenuLabel>
              {FLEET_ATTENTION_SNOOZE_DURATIONS.map((duration) => (
                <DropdownMenuItem
                  key={duration.id}
                  onSelect={() => args.onSnooze(item, duration.ms)}
                >
                  {duration.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {selected && controlTarget ? (
        <div
          ref={panelRef}
          id={`fleet-attention-controls-${item.id}`}
          className={sx(rowStyles.rowControls)}
        >
          <FleetTaskControlPanel
            target={controlTarget}
            expectedInteraction={
              (item.kind === "approval" || item.kind === "user-input") &&
              item.requestId
                ? {
                    kind: item.kind,
                    requestId: item.requestId,
                    messageId: item.messageId ?? null,
                  }
                : undefined
            }
            returnFocusElementId={triggerId}
            onOpenTask={args.onOpenTask}
            onClose={() => args.onOpen(item)}
          />
        </div>
      ) : null}
    </InboxRow>
  );
}

const BULK_EFFECT_LABEL_KEY = {
  "review-results": "fleet:bulk.reviewResults",
  "read-notifications": "fleet:bulk.readNotifications",
  "hide-for-a-day": "fleet:bulk.hideForADay",
} as const satisfies Record<FleetBulkEffect, string>;

/**
 * `Clear all` for the `In review` group, as a menu that says what it will do
 * before it does it: each effect with its count (mark results reviewed, mark
 * notifications read, hide pull requests for a day), any one of them alone,
 * or all of them. Bulk clear is scoped to this group on purpose: nothing here
 * is stalled, so acknowledging it in one gesture is safe; doing the same to
 * the blocking rail would answer requests an agent is still waiting on.
 */
function FleetReviewClearMenu(props: {
  items: readonly FleetAttentionItem[];
  busy: boolean;
  onApply: (plan: FleetBulkPlan) => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const plan = planFleetReviewClear(props.items);
  const total = countFleetBulkPlan(plan);
  const effects = summarizeFleetBulkPlan(plan);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            xstyle={rowStyles.rowAction}
            disabled={props.busy || total === 0}
            aria-label={
              props.items.length === 1
                ? tI18n("fleet:fleetAttentionInbox.clearOneInReview")
                : tI18n("fleet:fleetAttentionInbox.clearAllInReview", { reviewCount: props.items.length })
            }
          />
        }
      >
        {tI18n("fleet:fleetAttentionInbox.clearAll")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{tI18n("fleet:bulk.menuLabel")}</DropdownMenuLabel>
        {effects.map((summary) => (
          <DropdownMenuItem
            key={summary.effect}
            onSelect={() => props.onApply(pickFleetBulkEffect(plan, summary.effect))}
          >
            {tI18n(BULK_EFFECT_LABEL_KEY[summary.effect], { count: summary.count })}
          </DropdownMenuItem>
        ))}
        {effects.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => props.onApply(plan)}>
              {tI18n("fleet:bulk.applyAll", { count: total })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An item the inbox has not linked yet (the snapshot is a beat behind). */
function fallbackEntry(item: FleetAttentionItem): FleetInboxEntry {
  return {
    id: item.id,
    item,
    notifications: [],
    kind: item.kind,
    tier: getFleetAttentionTier(item.kind),
    title: item.taskTitle?.trim() || item.workspaceName,
    detail: item.detail ?? null,
    repositoryPath: item.repositoryPath,
    repositoryName: item.repositoryName,
    workspaceId: item.workspaceId,
    workspaceName: item.workspaceName,
    taskId: item.taskId ?? null,
    at: item.waitingSince ?? item.createdAt,
    unread: false,
    error: false,
  };
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
  /** How many rows an unexpired snooze is currently hiding. */
  snoozedCount?: number;
  clearingReview?: boolean;
  onOpen: (item: FleetAttentionItem) => void;
  /** Open what an entry names; defaults to the item's task. */
  onOpenEntry?: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onSnooze: (item: FleetAttentionItem, durationMs: number) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
  /** Applies a bulk clear plan for the `In review` group (or part of it). */
  onClearReview: (plan: FleetBulkPlan) => void;
  onRestoreSnoozed: () => void;
  onClearSelection: () => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const [showReview, setShowReview] = useState(false);
  const snoozedCount = args.snoozedCount ?? 0;

  const blocking = args.items.filter(
    (item) => getFleetAttentionTier(item.kind) === "blocking",
  );
  // Nothing is stalled on these, so they stay folded until asked for. That is
  // the difference between "an agent is waiting on you" and "in review".
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

  // Rows in the order they are drawn, so an answer can hand focus onward.
  const visibleRowIds = [
    ...blocking.map((item) => item.id),
    ...(showReviewGroup ? review.map((item) => item.id) : []),
  ];
  const visibleRowKey = visibleRowIds.join("\u0000");
  const focusNextRow = useCallback(
    (answered: FleetAttentionItem) => {
      const ids = visibleRowKey.split("\u0000");
      const index = ids.indexOf(answered.id);
      const nextId = index >= 0 ? (ids[index + 1] ?? ids[index - 1]) : undefined;
      if (!nextId) {
        return;
      }
      window.requestAnimationFrame(() => {
        document.getElementById(`fleet-attention-trigger-${nextId}`)?.focus();
      });
    },
    [visibleRowKey],
  );

  const entryByItemId = useFleetAttention((snapshot) => snapshot.inbox.entryByItemId);
  const { onOpenTask } = args;
  const openItemTask = useCallback(
    (item: FleetAttentionItem) => {
      if (item.taskId) {
        onOpenTask({
          repositoryPath: item.repositoryPath,
          workspaceId: item.workspaceId,
          taskId: item.taskId,
          taskTitle: item.taskTitle,
          turnId: item.turnId,
        });
      }
    },
    [onOpenTask],
  );
  const renderRow = (item: FleetAttentionItem) => (
    <FleetNeedRow
      key={item.id}
      item={item}
      entry={entryByItemId.get(item.id) ?? fallbackEntry(item)}
      selected={args.selectedAttentionId === item.id}
      busy={args.busyAttentionId === item.id}
      onOpen={args.onOpen}
      onOpenEntry={args.onOpenEntry ?? openItemTask}
      onOpenTask={args.onOpenTask}
      onMarkRead={args.onMarkRead}
      onDismiss={args.onDismiss}
      onSnooze={args.onSnooze}
      onOpenPr={args.onOpenPr}
      onAnswered={focusNextRow}
    />
  );

  return (
    <section
      className={sx(styles.root)}
      aria-labelledby="fleet-attention-heading"
    >
      <div className={sx(styles.header)}>
        <h2 id="fleet-attention-heading" className={sx(styles.groupHeading)}>
          {FLEET_TIER_LABEL.blocking}</h2>
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

      <div className={sx(styles.scroller)} onKeyDown={moveInboxFocus}>
        {blocking.length === 0 ? (
          <div className={sx(styles.empty)}>
            <Inbox className={sx(styles.emptyIcon)} aria-hidden="true" />
            <p className={sx(styles.emptyTitle)}>{tI18n("fleet:fleetAttentionInbox.noActionRequired")}</p>
            <p className={sx(styles.emptyHint)}>
              {tI18n("fleet:fleetAttentionInbox.noAgentIsWaitingOnYou")}</p>
          </div>
        ) : (
          <ul className={sx(styles.list)}>{blocking.map(renderRow)}</ul>
        )}

        {review.length > 0 ? (
          <div className={sx(styles.reviewGroup)}>
            <div className={sx(styles.reviewHeader)}>
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
                <span className={sx(styles.groupHeading)}>{FLEET_TIER_LABEL.review}</span>
                <span className={sx(styles.reviewCount)}>{review.length}</span>
              </AdsButton>
              {/*
                Bulk clear is scoped to this group on purpose. Nothing here is
                stalled, so acknowledging it in one gesture is safe; doing the
                same to the blocking rail would answer requests an agent is
                still waiting on.
              */}
              <FleetReviewClearMenu
                busy={Boolean(args.clearingReview)}
                items={review}
                onApply={args.onClearReview}
              />
            </div>
            {showReviewGroup ? (
              <ul className={sx(styles.list)}>{review.map(renderRow)}</ul>
            ) : null}
          </div>
        ) : null}

        {snoozedCount > 0 ? (
          <div className={sx(styles.snoozedFooter)}>
            <BellOff className={sx(styles.reviewIcon)} aria-hidden="true" />
            <span className={sx(styles.snoozedLabel)}>
          {tI18n("fleet:fleetAttentionInbox.snoozedCount", { count: snoozedCount })}
        </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={rowStyles.rowAction}
              aria-label={tI18n("fleet:fleetAttentionInbox.restoreValueSnoozedItems", { snoozedCount: snoozedCount })}
              onClick={args.onRestoreSnoozed}
            >
              {tI18n("fleet:fleetAttentionInbox.restore")}</Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
