import { useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitMerge,
  Inbox,
} from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import {
  describeFleetRowKeys,
  FleetRowInlineAnswer,
  resolveFleetRowKey,
} from "@/components/layout/FleetRowInlineAnswer";
import { useFleetRowInteraction } from "@/components/layout/useFleetRowInteraction";
import type { FleetInteractionResponse } from "@/lib/fleet/interaction-respond";
import { StateMark } from "@/components/ads/components/StateMark";
import { FLEET_ATTENTION_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui";
import { attentionStyles as styles } from "./fleet-attention-inbox.styles";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
  type FleetAttentionKind,
} from "@/lib/fleet/attention-projection";
import {
  describeFleetAttentionPrimaryAction,
  FLEET_ATTENTION_KIND_LABEL,
  FLEET_TIER_LABEL,
} from "@/lib/fleet/fleet-vocabulary";
import { FLEET_ATTENTION_SNOOZE_DURATIONS } from "@/lib/fleet/attention-snooze";
import { PR_STATUS_VISUAL } from "@/lib/pr-status";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { describeSignOffAction } from "@/lib/agent-runs/agent-run-view";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { agentRunStageKey, useAgentRunFailure, useAgentRunsStore } from "@/store/agent-runs-store";

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
  "agent-run-sign-off": "warning",
  "agent-run-blocked": "danger",
  "agent-run-stuck": "danger",
};

function getFleetNeedIcon(item: FleetAttentionItem): ReactNode {
  switch (item.kind) {
    // Needs of the agent work are work states, drawn as every surface draws them.
    case "user-input":
    case "approval":
    case "run-failed":
    case "agent-run-sign-off":
    case "agent-run-blocked":
    case "agent-run-stuck":
      return <StateMark state={FLEET_ATTENTION_WORK_STATE[item.kind]!} />;
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

function getFleetNeedDetail(item: FleetAttentionItem) {
  if (item.prStatus) {
    return PR_STATUS_VISUAL[item.prStatus].label;
  }
  return item.detail;
}

/** The sign-off button on a Fleet row and, when the sign-off failed, why. */
export function AgentRunSignOffControl(props: {
  label: string;
  disabled: boolean;
  failure: string | null;
  onSignOff: () => void;
}) {
  return (
    <>
      <Button type="button" size="sm" xstyle={styles.rowAction} disabled={props.disabled} onClick={props.onSignOff}>
        {props.label}
      </Button>
      {props.failure ? (
        <span className={sx(styles.rowError)} role="alert">
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
  selected: boolean;
  busy: boolean;
  onOpen: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onSnooze: (item: FleetAttentionItem, durationMs: number) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
  /** After an answer leaves this row, so triage can continue on the next. */
  onAnswered: (item: FleetAttentionItem) => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const { item, selected, busy } = args;
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
  const detail = getFleetNeedDetail(item);
  const title = getFleetNeedTitle(item);
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
    <li
      className={sx(styles.row, selected && styles.rowSelected)}
      data-fleet-attention-row={item.id}
      onFocus={interaction.ensureLoaded}
      onKeyDown={handleRowKeyDown}
    >
      <AdsButton
        layout="host"
        id={triggerId}
        type="button"
        xstyle={[styles.rowTrigger, focusRing.ringInset]}
        aria-label={tI18n("fleet:fleetAttentionInbox.rowLabel", { action: describeFleetAttentionPrimaryAction(item.kind), title, workspace: item.workspaceName })}
        aria-expanded={controlTarget ? selected : undefined}
        aria-controls={
          controlTarget && selected
            ? `fleet-attention-controls-${item.id}`
            : undefined
        }
        aria-keyshortcuts={selected ? undefined : describeFleetRowKeys(interaction)}
        disabled={busy}
        onClick={() => {
          interaction.ensureLoaded();
          args.onOpen(item);
        }}
      >
        <span className={sx(styles.rowTop)}>
          <Badge
            variant="outline"
            tone={FLEET_NEED_TONE[item.kind]}
            xstyle={styles.needBadge}
          >
            {getFleetNeedIcon(item)}
            {FLEET_ATTENTION_KIND_LABEL[item.kind]}
          </Badge>
          <span className={sx(styles.rowTime)}>
            {formatTaskUpdatedAt({ value: item.createdAt })}
          </span>
        </span>
        <span className={sx(styles.rowTitle)}>{title}</span>
        <span className={sx(styles.rowMeta)}>
          <span className={sx(styles.rowMetaPart)}>{item.workspaceName}</span>
          <span aria-hidden="true">·</span>
          <span className={sx(styles.rowMetaPart)}>{item.repositoryName}</span>
        </span>
        {/* The inline approval card already names the tool and its request. */}
        {detail && (selected || interaction.inline.kind !== "approval") ? (
          <span className={sx(styles.rowDetail)}>{detail}</span>
        ) : null}
      </AdsButton>
      {selected ? null : (
        <FleetRowInlineAnswer interaction={interaction} onAnswer={answer} />
      )}
      <div className={sx(styles.rowActions)}>
          {controlTarget ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              xstyle={styles.rowAction}
              disabled={busy}
              aria-label={tI18n("fleet:inlineAnswer.openLabel", { title, workspace: item.workspaceName })}
              onClick={() => args.onOpenTask(controlTarget)}
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
              xstyle={styles.rowAction}
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
              xstyle={styles.rowAction}
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
              xstyle={styles.rowAction}
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
                  xstyle={styles.rowAction}
                  disabled={busy}
                  aria-label={tI18n("fleet:fleetAttentionInbox.snoozeValueForValueInValue", { value1: FLEET_ATTENTION_KIND_LABEL[item.kind].toLowerCase(), title: title, value2: item.workspaceName })}
                />
              }
            >
              <Clock className={sx(styles.rowActionIcon)} aria-hidden="true" />
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
        </div>
      {selected && controlTarget ? (
        <div
          ref={panelRef}
          id={`fleet-attention-controls-${item.id}`}
          className={sx(styles.rowControls)}
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
  /** How many rows an unexpired snooze is currently hiding. */
  snoozedCount?: number;
  clearingReview?: boolean;
  onOpen: (item: FleetAttentionItem) => void;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onMarkRead: (item: FleetAttentionItem) => void;
  onDismiss: (item: FleetAttentionItem) => void;
  onSnooze: (item: FleetAttentionItem, durationMs: number) => void;
  onOpenPr: (item: FleetAttentionItem) => void;
  onClearReview: () => void;
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

      <div className={sx(styles.scroller)}>
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.rowAction}
                disabled={args.clearingReview}
                aria-label={
                  review.length === 1
                    ? tI18n("fleet:fleetAttentionInbox.clearOneInReview")
                    : tI18n("fleet:fleetAttentionInbox.clearAllInReview", { reviewCount: review.length })
                }
                onClick={args.onClearReview}
              >
                {tI18n("fleet:fleetAttentionInbox.clearAll")}</Button>
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
              xstyle={styles.rowAction}
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
