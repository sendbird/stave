import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import { useEffect, useEffectEvent, type KeyboardEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui";
import { useTranslation } from "@/i18n";
import type { FleetInboxEntry } from "@/lib/fleet/inbox-model";
import { useAppStore } from "@/store/app.store";
import { classifyBellQuickAnswer, readBellRequest, type BellAnswer } from "@/store/bell-quick-answer";
import { ApprovalRowButtons, resolveApprovalRowKey } from "./FleetRowInlineAnswer";
import { InboxRow } from "./InboxRow";
import { inboxRowStyles } from "./inbox-row.styles";
import { notificationsStyles } from "./top-bar-notifications.styles";
import { BELL_ANSWER_FEEDBACK_MS, type BellAnswerStatus } from "./useBellAnswerFeedback";

const styles = stylex.create({
  option: {
    maxInlineSize: "100%",
  },
});

export function BellInboxRow(props: {
  entry: FleetInboxEntry;
  history: boolean;
  triggerLabel: string;
  feedback?: BellAnswerStatus;
  busy: boolean;
  onActivate: () => void;
  onAnswer: (answer: BellAnswer) => void;
  onMarkRead: () => void;
  onSettle: () => void;
  supplement?: ReactNode;
  children?: ReactNode;
}) {
  const { entry, feedback } = props;
  const { t } = useTranslation(["shell", "fleet"]);
  const interaction = !props.history && (entry.kind === "approval" || entry.kind === "user-input");
  const request = useAppStore(useShallow((state) => interaction ? readBellRequest(state, entry) : null));
  const inline = request?.status === "pending" && !feedback ? classifyBellQuickAnswer(request.part) : null;
  const failed = feedback === "failed";
  const stale = request?.status === "stale";
  const hasUnsettledNotification = entry.notifications.some((notification) => !notification.resolvedAt);
  const sending = feedback === "sending";
  const busy = props.busy || sending;
  const settle = useEffectEvent(props.onSettle);

  useEffect(() => {
    if (!stale || !hasUnsettledNotification || feedback || busy) return;
    const timer = window.setTimeout(() => settle(), BELL_ANSWER_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [stale, hasUnsettledNotification, feedback, busy]);

  function handleRowKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.defaultPrevented || busy || failed || inline?.kind !== "approval") return;
    // Allow needs the whole request on screen; Deny never does.
    const approved = resolveApprovalRowKey({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      repeat: event.repeat,
      isComposing: event.nativeEvent.isComposing,
      target: event.target,
    });
    if (approved === null || (approved && inline.summary === null)) return;
    event.preventDefault();
    props.onAnswer({ approved });
  }

  const approval = !failed && inline?.kind === "approval" ? inline : null;
  const canApprove = approval !== null;
  const canAllow = approval?.summary != null;
  const shortQuestion = !failed && inline?.kind === "short-question" ? inline : null;
  const showOpenTask = interaction && (failed || (!feedback && !stale && !canAllow && !shortQuestion));
  const note = sending ? t("fleet:inlineAnswer.sending")
    : feedback === "delivered" ? t("shell:topBarNotifications.answerSent")
    : feedback === "skipped" ? t("shell:topBarNotifications.requestUnavailable")
    : null;

  return (
    <InboxRow
      entry={shortQuestion
        ? { ...entry, detail: shortQuestion.question.question }
        : canAllow ? { ...entry, detail: approval.summary } : entry}
      triggerId={`notification-entry-${entry.id}`}
      triggerLabel={props.triggerLabel}
      triggerProps={canApprove ? { "aria-keyshortcuts": canAllow ? "A D" : "D" } : undefined}
      busy={busy}
      onActivate={props.onActivate}
      onKeyDown={handleRowKeyDown}
      supplement={props.supplement}
      wrapDetail={Boolean(shortQuestion) || canAllow}
      actions={interaction || entry.unread ? (
        <>
          {canApprove ? (
            <ApprovalRowButtons
              compact={false}
              allowLabel={t("shell:topBarNotifications.allowOnceFor", { title: entry.title })}
              denyLabel={t("shell:topBarNotifications.denyFor", { title: entry.title })}
              disabled={busy}
              canAllow={canAllow}
              onAllow={() => props.onAnswer({ approved: true })}
              onDeny={() => props.onAnswer({ approved: false })}
            />
          ) : null}
          {shortQuestion?.options.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="outline"
              xstyle={styles.option}
              title={[option.label, option.description].filter(Boolean).join("\n")}
              aria-description={option.description}
              disabled={busy}
              onClick={() => props.onAnswer({ value: option.value })}
            >
              {option.label}
            </Button>
          ))}
          {(stale && !feedback) || feedback === "settling" ? (
            <Button type="button" size="sm" variant="outline" disabled>
              {t("shell:topBarNotifications.requestUnavailable")}
            </Button>
          ) : null}
          {showOpenTask ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={props.onActivate}>
              {t("shell:topBarNotifications.openTask")}
            </Button>
          ) : null}
          {failed ? <p role="alert" className={sx(inboxRowStyles.rowError)}>{t("shell:topBarNotifications.answerFailed")}</p> : null}
          {note ? <p role="status" className={sx(inboxRowStyles.inlineNote)}>{note}</p> : null}
          {entry.unread && !feedback && !stale ? (
            <Button type="button" size="sm" variant="ghost" xstyle={notificationsStyles.quietAction} disabled={busy} onClick={props.onMarkRead}>
              <Check className={sx(inboxRowStyles.rowActionIcon)} aria-hidden="true" />
              {t("shell:topBarNotifications.markRead")}
            </Button>
          ) : null}
        </>
      ) : undefined}
    >
      {props.children}
    </InboxRow>
  );
}
