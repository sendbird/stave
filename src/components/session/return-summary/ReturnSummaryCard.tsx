import { i18n, useTranslation } from "@/i18n";
import { formatTimeAgo } from "@/i18n/format";
import { History, X } from "lucide-react";
import { useEffect, useId, useMemo } from "react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { StateMark } from "@/components/ads/components/StateMark";
import { sx } from "@/components/ads/utils/stylex";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import {
  buildReturnSummary,
  hasReturnNews,
  isReturn,
  resolveLastVisit,
} from "@/lib/task-context/return-summary";
import { useAppStore } from "@/store/app.store";
import { useFleetAttention } from "@/store/fleet-attention-store";
import { useSideChatStore } from "@/store/side-chat-store";
import { taskHandoffKey, useTaskHandoffStore } from "@/store/task-handoff-store";
import { useTaskReturnStore } from "@/store/task-return-store";
import type { ChatMessage } from "@/types/chat";
import { openTaskInspection } from "../task-inspection-navigation";
import { describeReturnSummary, type ReturnLinkTarget } from "./return-summary.utils";
import { returnSummaryStyles as styles } from "./return-summary.styles";

const NO_MESSAGES: ChatMessage[] = [];

/** The task's most urgent attention item, from Fleet's shared snapshot. */
function selectTaskNeed(items: readonly FleetAttentionItem[], workspaceId: string, taskId: string) {
  let need: FleetAttentionItem | null = null;
  for (const item of items) {
    if (item.taskId !== taskId || item.workspaceId !== workspaceId) continue;
    if (!need || item.priority < need.priority) need = item;
  }
  return need;
}

/** Go where a summary line's link points. */
export function followReturnLink(target: ReturnLinkTarget, workspaceId: string, taskId: string) {
  if (target.kind === "tab") {
    openTaskInspection(workspaceId, taskId, target.tab);
  } else if (target.kind === "request") {
    void useAppStore.getState().focusTaskAttention({ taskId, workspaceId });
  } else if (target.kind === "decision") {
    // The card sits over the top of the conversation, where an early decision
    // lands: it closes so the decision it points at is not under it.
    useTaskReturnStore.getState().dismiss(taskId);
    useAppStore.getState().focusTranscriptDecision({ taskId, messageId: target.messageId, requestId: target.requestId });
  } else if (target.kind === "side-question") {
    useSideChatStore.getState().open(taskId);
  } else {
    useAppStore.setState((state) => ({ promptFocusNonce: state.promptFocusNonce + 1 }));
  }
}

/**
 * What changed while you were away from the task, at the top of its
 * conversation: where it stands with the one action that moves it on, then
 * what changed and the last decision, each with a link to where it comes from. It shows when you come back
 * after a while and goes when you dismiss it or write to the task.
 */
export function ReturnSummaryCard(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const arrival = useTaskReturnStore((state) => state.arrivalByTask[taskId]);
  const dismissedAt = useTaskReturnStore((state) => state.dismissedByTask[taskId]);
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[taskId]));
  const need = useFleetAttention((snapshot) => selectTaskNeed(snapshot.items, workspaceId, taskId));
  const recordKey = taskHandoffKey(workspaceId, taskId);
  const record = useTaskHandoffStore((state) => state.records[recordKey]);
  const loadRecord = useTaskHandoffStore((state) => state.load);
  const titleId = useId();
  const showing = Boolean(arrival && dismissedAt !== arrival.at);
  useEffect(() => {
    if (showing && !record && workspaceId && taskId) {
      loadRecord(workspaceId, taskId).catch(() => undefined);
    }
  }, [loadRecord, record, showing, taskId, workspaceId]);

  const view = useMemo(() => {
    if (!arrival || !showing) return null;
    const arrivedMs = Date.parse(arrival.at);
    // Writing to the task after coming back means you have caught up.
    const wroteSince = messages.some(
      (message) => message.role === "user" && Date.parse(message.startedAt ?? "") > arrivedMs,
    );
    if (wroteSince) return null;
    const visit = resolveLastVisit({
      messages: messages.filter((message) => Date.parse(message.startedAt ?? "") <= arrivedMs),
      leftAt: arrival.leftAt,
      baseline: arrival.baseline,
    });
    if (!visit || !isReturn({ lastVisitAt: visit.at, now: arrivedMs })) return null;
    const summary = buildReturnSummary({ messages, record: record ?? null, need, running, baseline: visit.baseline });
    if (!hasReturnNews(summary)) return null;
    return { visit, content: describeReturnSummary(summary, Date.now()) };
    // Lines are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, showing, messages, record, need, running, i18n.language]);

  if (!view) return null;
  const since = formatTimeAgo(view.visit.at);
  const { status, facts } = view.content;
  const sinceText = view.visit.kind === "visit"
    ? i18n.t("session:returnSummary.sinceVisit", { time: since })
    : i18n.t("session:returnSummary.sinceMessage", { time: since });
  return (
    <section
      aria-labelledby={titleId}
      className={sx(styles.card)}
      data-testid="return-summary"
    >
      <div className={sx(styles.header)}>
        <History aria-hidden className={sx(styles.headerIcon)} />
        <div className={sx(styles.headerText)}>
          <h2 id={titleId} className={sx(styles.title)}>{i18n.t("session:returnSummary.title")}</h2>
          <p className={sx(styles.since)} title={sinceText}>{sinceText}</p>
        </div>
        <AdsButton
          variant="quiet"
          size="xs"
          iconOnly
          aria-label={i18n.t("session:returnSummary.dismiss")}
          title={i18n.t("session:returnSummary.dismiss")}
          onClick={() => useTaskReturnStore.getState().dismiss(taskId)}
        >
          <X aria-hidden />
        </AdsButton>
      </div>
      <div className={sx(styles.status)} data-return-line="status" data-state={status.state}>
        <div className={sx(styles.statusContent)}>
          <StateMark state={status.state} size="md" xstyle={styles.statusMark} />
          <div className={sx(styles.statusText)}>
            <p className={sx(styles.statusTitle)}>{status.text}</p>
            {status.detail ? (
              <p className={sx(styles.statusDetail)} title={status.detail}>{status.detail}</p>
            ) : null}
            {status.next ? (
              <p className={sx(styles.statusDetail)} title={status.next}>
                {i18n.t("session:returnSummary.nextRemaining", { text: status.next })}
              </p>
            ) : null}
          </div>
        </div>
        <AdsButton
          variant={status.urgent ? "primary" : "secondary"}
          size="sm"
          xstyle={styles.statusAction}
          data-return-action={status.action.target.kind}
          onClick={() => followReturnLink(status.action.target, workspaceId, taskId)}
        >
          {status.action.label}
        </AdsButton>
      </div>
      {facts.length > 0 ? (
        <dl className={sx(styles.facts)}>
          {facts.map((line) => (
            <div key={line.id} className={sx(styles.fact)} data-return-line={line.id}>
              <dt className={sx(styles.label)}>{line.label}</dt>
              <dd className={sx(styles.value)} title={line.text}>
                {line.text}
              </dd>
              <dd className={sx(styles.action)}>
                {line.link ? (
                  <AdsButton
                    variant="quiet"
                    size="xs"
                    onClick={() => line.link && followReturnLink(line.link.target, workspaceId, taskId)}
                  >
                    {line.link.label}
                  </AdsButton>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
