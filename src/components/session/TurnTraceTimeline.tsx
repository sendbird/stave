import { memo, useCallback, useId, useMemo } from "react";
import { i18n, useTranslation } from "@/i18n";
import { formatCost, formatTokenCount } from "@/i18n/format";
import {
  TraceWaterfall,
  type TraceSpan,
  type TraceSpanTone,
} from "@/components/aui/components/TraceWaterfall";
import { cx, sx } from "@/components/aui/utils/stylex";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useTurnClock } from "./TurnActivity";
import {
  buildTurnTrace,
  advanceTurnTrace,
  spanDurationMs,
  TURN_TRACE_ROOT_ID,
  type TurnTrace,
  type TurnTraceKind,
} from "./turn-trace.utils";
import { turnTraceTimelineStyles as styles } from "./turn-trace-timeline.styles";

/**
 * The Activity tab's Timeline view: one turn's spans on a shared time axis
 * (AUI `TraceWaterfall`), the steps whose time was not reported listed under
 * it rather than drawn, and the turn's own tokens and cost on the turn row —
 * the only level a provider reports them at.
 */

const TONE_BY_KIND: Record<TurnTraceKind, TraceSpanTone> = {
  turn: "neutral",
  model: "chart4",
  tool: "chart1",
  agent: "chart2",
};

export const TurnTraceTimeline = memo(function TurnTraceTimeline(props: {
  trace: TurnTrace;
  onSelectTool?: (toolUseId: string) => void;
  className?: string;
}) {
  useTranslation();
  const { trace, onSelectTool } = props;
  const headingId = useId();
  const spans = useMemo<TraceSpan[]>(
    () =>
      trace.spans.map((span) => {
        const isRoot = span.id === TURN_TRACE_ROOT_ID;
        const tokens = isRoot ? trace.usage.tokens : undefined;
        const cost = isRoot ? trace.usage.costUsd : undefined;
        return {
          id: span.id,
          parentId: span.parentId,
          name: span.label,
          meta:
            tokens !== undefined
              ? i18n.t("session:turnTrace.tokens", { value: formatTokenCount(tokens) })
              : span.detail,
          startMs: span.startMs,
          durationMs: spanDurationMs(span, trace.nowMs ?? span.endMs ?? span.startMs),
          status: span.status,
          tone: TONE_BY_KIND[span.kind],
          trailing:
            cost !== undefined ? (
              <span className={sx(styles.cost)}>{formatCost(cost)}</span>
            ) : span.id === trace.slowestId ? (
              <span className={sx(styles.slowest)} data-trace-slowest="true">
                {i18n.t("session:turnTrace.slowest")}
              </span>
            ) : undefined,
        };
      }),
    // Names, token words and the tag are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trace, i18n.language],
  );
  const toolUseIdBySpan = useMemo(
    () =>
      new Map(
        trace.spans.flatMap((span) =>
          span.toolUseId ? [[span.id, span.toolUseId] as const] : [],
        ),
      ),
    [trace.spans],
  );
  const handleSelect = useCallback(
    (id: string) => {
      const toolUseId = toolUseIdBySpan.get(id);
      if (toolUseId) onSelectTool?.(toolUseId);
    },
    [onSelectTool, toolUseIdBySpan],
  );
  const hasSteps = trace.spans.length > 1;

  return (
    <div
      className={cx(sx(styles.root), props.className)}
      data-testid="turn-trace-timeline"
    >
      {/* The turn row always draws: its length, tokens and cost are known
          even when none of its steps reported a time. */}
      <TraceWaterfall
        axisTicks
        label={i18n.t("session:turnTrace.label")}
        spans={spans}
        markerMs={trace.nowMs ?? undefined}
        onSelectSpan={onSelectTool ? handleSelect : undefined}
      />
      {!hasSteps && trace.unreported.length === 0 ? (
        <p className={sx(styles.empty)}>{i18n.t("session:turnTrace.empty")}</p>
      ) : null}
      <p className={sx(styles.note)}>{i18n.t("session:turnTrace.usageNote")}</p>
      {trace.unreported.length > 0 ? (
        <section
          aria-labelledby={headingId}
          className={sx(styles.unreported)}
          data-testid="turn-trace-unreported"
        >
          <h4 id={headingId} className={sx(styles.unreportedHeading)}>
            {i18n.t("session:turnTrace.notReported", { count: trace.unreported.length })}
          </h4>
          <p className={sx(styles.note)}>{i18n.t("session:turnTrace.notReportedDetail")}</p>
          <ul className={sx(styles.unreportedList)}>
            {trace.unreported.map((item) => (
              <li key={item.id} className={sx(styles.unreportedItem)}>
                <span className={sx(styles.unreportedLabel)}>{item.label}</span>
                {item.detail ? (
                  <span className={sx(styles.unreportedDetail)} title={item.detail}>
                    {item.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
});

const NO_MESSAGES: ChatMessage[] = [];

/**
 * The live or last-finished turn's timeline, read from the store. Mounted only
 * while the Timeline view is open: it follows the conversation as it streams,
 * which the list view does not pay for.
 */
export function LiveTurnTraceTimeline(props: { taskId: string }) {
  useTranslation();
  const { taskId } = props;
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const activity = useAppStore((state) => state.providerTurnActivityByTask[taskId] ?? null);
  const retained = useAppStore((state) => state.retainedTurnActivityByTask[taskId] ?? null);
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const now = useTurnClock(liveTurnId);
  const snapshot =
    liveTurnId && activity?.turnId === liveTurnId ? activity : (retained?.snapshot ?? null);
  const live = Boolean(snapshot && snapshot.turnId === liveTurnId && snapshot.completedAt == null);
  const turnId = snapshot?.turnId;
  const startedAt = snapshot?.startedAt;
  const completedAt = snapshot?.completedAt ?? null;
  const failed = !live && retained?.snapshot.turnId === turnId && retained?.outcome === "failed";
  const baseTrace = useMemo(
    () =>
      turnId && startedAt !== undefined
        ? buildTurnTrace({
            messages: messages.filter((message) => message.turnId === turnId),
            turnStartedAt: startedAt,
            turnCompletedAt: completedAt,
            live,
            now: startedAt,
            failed,
          })
        : null,
    // Span names are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, messages, turnId, startedAt, completedAt, failed, i18n.language],
  );
  const trace = useMemo(() => baseTrace ? advanceTurnTrace(baseTrace, now) : null, [baseTrace, now]);
  const onSelectTool = useCallback(
    (toolUseId: string) => focusTranscriptTool({ taskId, toolUseId }),
    [focusTranscriptTool, taskId],
  );
  if (!trace) {
    return <p className={sx(styles.empty)}>{i18n.t("session:turnTrace.noTurn")}</p>;
  }
  return <TurnTraceTimeline trace={trace} onSelectTool={onSelectTool} />;
}

/** What the bar colors mean, and the "now" line while the turn runs. */
export function TurnTraceLegend(props: { live: boolean }) {
  useTranslation();
  const entries: Array<{ kind: TurnTraceKind; label: string }> = [
    { kind: "turn", label: i18n.t("session:turnTrace.legendTurn") },
    { kind: "model", label: i18n.t("session:turnTrace.legendModel") },
    { kind: "tool", label: i18n.t("session:turnTrace.legendTool") },
    { kind: "agent", label: i18n.t("session:turnTrace.legendAgent") },
  ];
  return (
    <ul
      aria-label={i18n.t("session:turnTrace.legendLabel")}
      className={sx(styles.legend)}
      data-testid="turn-trace-legend"
    >
      {entries.map((entry) => (
        <li key={entry.kind} className={sx(styles.legendItem)}>
          <span aria-hidden="true" className={sx(styles.swatch, styles[entry.kind])} />
          {entry.label}
        </li>
      ))}
      {props.live ? (
        <li className={sx(styles.legendItem)}>
          <span aria-hidden="true" className={sx(styles.swatch, styles.swatchLine)} />
          {i18n.t("session:turnTrace.legendNow")}
        </li>
      ) : null}
    </ul>
  );
}
