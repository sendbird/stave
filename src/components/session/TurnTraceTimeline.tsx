import { memo, useCallback, useId, useMemo } from "react";
import { i18n, useTranslation } from "@/i18n";
import { formatCost, formatTokenCount } from "@/i18n/format";
import {
  TraceWaterfall,
  type TraceSpan,
  type TraceSpanTone,
} from "@/components/aui/components/TraceWaterfall";
import { cx, sx } from "@/components/aui/utils/stylex";
import {
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
  scope?: "agent" | "turn";
  selectedSpan?: string | null;
  onSelectSpan?: (id: string) => void;
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
  const agent = props.scope === "agent";
  const hasSteps = trace.spans.some((span) => span.kind !== "turn");

  return (
    <div
      className={cx(sx(styles.root), props.className)}
      data-testid="turn-trace-timeline"
    >
      {spans.length > 0 ? <TraceWaterfall
        axisTicks
        label={i18n.t(agent ? "session:agentProgress.panel.timeline" : "session:turnTrace.label")}
        spans={spans}
        markerMs={trace.nowMs ?? undefined}
        selected={props.selectedSpan}
        onSelectSpan={props.onSelectSpan ?? (onSelectTool ? handleSelect : undefined)}
      /> : null}
      {!hasSteps && trace.unreported.length === 0 ? (
        <p className={sx(styles.empty)}>{i18n.t("session:turnTrace.empty")}</p>
      ) : null}
      {!agent ? <p className={sx(styles.note)}>{i18n.t("session:turnTrace.usageNote")}</p> : null}
      {trace.unreported.length > 0 ? (
        <section
          aria-labelledby={headingId}
          className={sx(styles.unreported)}
          data-testid="turn-trace-unreported"
        >
          <h4 id={headingId} className={sx(styles.unreportedHeading)}>
            {i18n.t("session:turnTrace.notReported", { count: trace.unreported.length })}
          </h4>
          <p className={sx(styles.note)}>{i18n.t(agent ? "session:agentProgress.panel.timingMissing" : "session:turnTrace.notReportedDetail")}</p>
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
