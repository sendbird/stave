import { i18n, useTranslation } from "@/i18n";
import { formatDuration, formatDateTime, formatTime } from "@/i18n/format";
import { ChevronDown, History, ListTodo, Scale } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { sx } from "@/components/aui/utils/stylex";
import {
  buildReturnSummary,
  hasReturnNews,
  resolveReturnContext,
} from "@/lib/task-context/return-summary";
import { visibleSteerMessageSegments } from "@/lib/session/steer-message-segments";
import { useAppStore } from "@/store/app.store";
import { TarsQuestionPreview } from "@/components/tars/TarsQuestionPreview";
import { openTarsAt } from "@/store/tars-notification-focus-store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useSideChatStore } from "@/store/side-chat-store";
import { taskHandoffKey, useTaskHandoffStore } from "@/store/task-handoff-store";
import { useTaskReturnStore } from "@/store/task-return-store";
import type { ChatMessage } from "@/types/chat";
import { openTaskInspection } from "../task-inspection-navigation";
import { describeReturnSummary, selectTaskNeed, type ReturnLinkTarget, type ReturnRow } from "./return-summary.utils";
import { returnSummaryStyles as styles } from "./return-summary.styles";

const NO_MESSAGES: ChatMessage[] = [];

/** Rows shown before "Show N more". */
export const RETURN_ROW_LIMIT = 4;

/** Go where a row's action points. */
export function followReturnLink(target: ReturnLinkTarget, workspaceId: string, taskId: string) {
  if (target.kind === "panel") {
    openTaskInspection(workspaceId, taskId);
  } else if (target.kind === "request") {
    void useAppStore.getState().focusTaskAttention({ taskId, workspaceId });
  } else if (target.kind === "tars-decision") {
    openTarsAt({ kind: "decision", responsibilityId: target.responsibilityId, decisionId: target.decisionId });
  } else if (target.kind === "decision") {
    useAppStore.getState().focusTranscriptDecision({ taskId, messageId: target.messageId, requestId: target.requestId });
  } else if (target.kind === "message") {
    useAppStore.getState().focusTranscriptMessage({ taskId, messageId: target.messageId });
  } else if (target.kind === "side-question") {
    useSideChatStore.getState().open(taskId);
  } else {
    useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 }));
  }
}

/** How long you were away, and since when: "Away 2h 14m · since 14:05". */
function describeAway(visit: { at: string; kind: "visit" | "message" }, arrivedAt: string) {
  const awayMs = Date.parse(arrivedAt) - Date.parse(visit.at);
  // Told in whole minutes; the clock time carries the date once it is not today.
  const duration = formatDuration(Math.floor(Math.max(0, awayMs) / 60_000) * 60_000);
  const sameDay = new Date(visit.at).toDateString() === new Date(arrivedAt).toDateString();
  const time = sameDay ? formatTime(visit.at) : formatDateTime(visit.at, { dateStyle: "medium", timeStyle: "short" });
  return visit.kind === "visit"
    ? i18n.t("session:returnSummary.awaySinceVisit", { duration, time })
    : i18n.t("session:returnSummary.awaySinceMessage", { duration, time });
}

function RowMark(props: { row: ReturnRow }) {
  if (props.row.state) return <StateMark state={props.row.state} size="md" xstyle={styles.rowMark} />;
  const Icon = props.row.id === "next" ? ListTodo : Scale;
  return (
    <span className={sx(styles.rowMark, styles.rowIcon)}>
      <Icon aria-hidden />
    </span>
  );
}

/**
 * What happened while you were away from the task, in its conversation right
 * after the last message you had seen: what waits on you, each turn that
 * finished, whether it still works, the next step and the last decision, one
 * row each with the one action for it. Got it (or Esc, or writing to the task)
 * folds it into a one-line divider at the same place; the divider opens it
 * again. It is there for each return with news, until the next return.
 */
export function ReturnSummaryCard(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const arrival = useTaskReturnStore((state) => state.arrivalByTask[taskId]);
  const choice = useTaskReturnStore((state) => state.collapsedByTask[taskId]);
  const storedMessages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  // What the transcript draws, so the card counts what its anchor counted.
  const allMessages = useMemo(() => visibleSteerMessageSegments(storedMessages), [storedMessages]);
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[taskId]));
  const need = useFleetAttention((snapshot) => selectTaskNeed(snapshot.items, workspaceId, taskId));
  const recordKey = taskHandoffKey(workspaceId, taskId);
  const record = useTaskHandoffStore((state) => state.records[recordKey]);
  const loadRecord = useTaskHandoffStore((state) => state.load);
  const titleId = useId();
  const rowsId = useId();
  const [showAll, setShowAll] = useState(false);
  const dividerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const pendingFocusRef = useRef<"divider" | "card" | null>(null);

  const context = useMemo(
    () => (arrival ? resolveReturnContext({ messages: allMessages, arrival }) : null),
    [allMessages, arrival],
  );
  useEffect(() => {
    if (context && !record && workspaceId && taskId) {
      loadRecord(workspaceId, taskId).catch(() => undefined);
    }
  }, [context, loadRecord, record, taskId, workspaceId]);

  const view = useMemo(() => {
    if (!arrival || !context) return null;
    // After you write, the summary keeps what happened up to then and stops
    // counting: the task's state is read as of your reply.
    const summary = buildReturnSummary({
      messages: context.messages,
      record: record ?? null,
      need: context.wroteSince ? null : need,
      running: context.wroteSince ? false : running,
      baseline: context.visit.baseline,
    });
    if (!hasReturnNews(summary)) return null;
    return {
      away: describeAway(context.visit, arrival.at),
      content: describeReturnSummary(summary, Date.now()),
    };
    // Lines are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, context, record, need, running, i18n.language]);

  const collapsed = choice && arrival && choice.at === arrival.at
    ? choice.collapsed
    : Boolean(context?.wroteSince);
  const lead = view?.content.rows[0]?.title ?? "";
  // The lead row as you first saw it; a change after that is announced.
  const [seenLead, setSeenLead] = useState<{ at: string; lead: string } | null>(null);
  if (arrival && view && seenLead?.at !== arrival.at) setSeenLead({ at: arrival.at, lead });
  const announcement = seenLead && seenLead.at === arrival?.at && seenLead.lead !== lead && !collapsed ? lead : "";

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    if (target === "divider") {
      dividerRef.current?.focus();
    } else {
      cardRef.current?.querySelector<HTMLElement>("[data-return-action]")?.focus();
    }
  }, [collapsed]);

  if (!view || !arrival) return null;
  const setCollapsed = (next: boolean) => {
    pendingFocusRef.current = next ? "divider" : "card";
    useTaskReturnStore.getState().setCollapsed(taskId, next);
  };
  const { rows, needsYou, turns } = view.content;

  if (collapsed) {
    const tally = needsYou
      ? i18n.t("session:returnSummary.tallyNeedsYou")
      : turns > 0
        ? i18n.t("session:returnSummary.changesTurns", { count: turns })
        : null;
    return (
      <div className={sx(styles.divider)} data-testid="return-summary" data-collapsed="true">
        <span aria-hidden className={sx(styles.dividerRule)} />
        <AuiButton
          ref={dividerRef}
          variant="quiet"
          size="sm"
          xstyle={styles.dividerButton}
          aria-expanded={false}
          data-return-divider
          onClick={() => setCollapsed(false)}
        >
          <History aria-hidden />
          <span className={sx(styles.dividerTitle)}>{i18n.t("session:returnSummary.title")}</span>
          <span className={sx(styles.dividerMeta)}>{[view.away, tally].filter(Boolean).join(" · ")}</span>
          <ChevronDown aria-hidden />
        </AuiButton>
        <span aria-hidden className={sx(styles.dividerRule)} />
      </div>
    );
  }

  const hidden = showAll ? 0 : Math.max(0, rows.length - RETURN_ROW_LIMIT);
  const shown = hidden > 0 ? rows.slice(0, RETURN_ROW_LIMIT) : rows;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    setCollapsed(true);
  };
  return (
    <section
      ref={cardRef}
      aria-labelledby={titleId}
      className={sx(styles.card)}
      data-testid="return-summary"
      data-collapsed="false"
      onKeyDown={onKeyDown}
    >
      <div className={sx(styles.header)}>
        <History aria-hidden className={sx(styles.headerIcon)} />
        <h2 id={titleId} className={sx(styles.title)}>{i18n.t("session:returnSummary.title")}</h2>
        <p className={sx(styles.since)} title={view.away}>{view.away}</p>
      </div>
      <ul id={rowsId} className={sx(styles.rows)}>
        {shown.map((row) => (
          <li key={row.id} className={sx(styles.row)} data-return-line={row.id} data-state={row.state ?? undefined}>
            <RowMark row={row} />
            <div className={sx(styles.rowText)}>
              <p className={sx(styles.rowTitle)} title={row.title}>{row.title}</p>
              {row.detail && !row.tarsQuestionPreview ? <p className={sx(styles.rowDetail)} title={row.detail}>{row.detail}</p> : null}
              {row.tarsQuestionPreview ? <TarsQuestionPreview question={row.tarsQuestionPreview} /> : null}
            </div>
            {row.action ? (
              <AuiButton
                variant={row.primary ? "primary" : "quiet"}
                size="sm"
                xstyle={styles.rowAction}
                title={row.action.label}
                data-return-action={row.action.target.kind}
                onClick={() => row.action && followReturnLink(row.action.target, workspaceId, taskId)}
              >
                {row.action.label}
              </AuiButton>
            ) : null}
          </li>
        ))}
      </ul>
      <div className={sx(styles.footer)}>
        {hidden > 0 || showAll ? (
          <AuiButton variant="quiet" size="sm" aria-controls={rowsId} onClick={() => setShowAll(!showAll)}>
            {showAll
              ? i18n.t("session:returnSummary.showLess")
              : i18n.t("session:returnSummary.showMore", { count: hidden })}
          </AuiButton>
        ) : null}
        <AuiButton
          variant="secondary"
          size="sm"
          xstyle={styles.gotIt}
          data-return-got-it
          onClick={() => setCollapsed(true)}
        >
          {i18n.t("session:returnSummary.gotIt")}
        </AuiButton>
      </div>
      <VisuallyHidden aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    </section>
  );
}
