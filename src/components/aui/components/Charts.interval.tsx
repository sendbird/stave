import * as stylex from "@stylexjs/stylex";

import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { vars } from "../tokens/tokens.stylex";
import { niceDomain, percentOf } from "../utils/chart-math";
import { sx } from "../utils/stylex";
import { ChartCard } from "./Charts.card";
import { useRowExplorer } from "./Charts.explore";
import { formatChartReadout, formatChartValue } from "./Charts.format";
import { rowChartStyles as rows } from "./Charts.rows.styles";
import type { ChartFrameProps } from "./Charts.states";
import { VisuallyHidden } from "./VisuallyHidden";

/** One measured effect: a best estimate and the interval it is known within. */
export type IntervalDatum = {
  /** Best estimate (a lift, a difference, a coefficient). */
  estimate: number;
  /** Upper end of the interval (e.g. the 95% confidence bound). */
  high: number;
  label: string;
  /** Lower end of the interval. */
  low: number;
  /** This row's good direction, when it differs from the chart's (a guardrail). */
  goodDirection?: "down" | "none" | "up";
};

import {
  intervalVerdict,
  type IntervalVerdict,
} from "../utils/chart-transform";

export { intervalVerdict, type IntervalVerdict };

export type IntervalChartProps = Omit<ChartFrameProps, "height"> & {
  /** Ink of a decided interval. @default chart1 */
  color?: string;
  data: IntervalDatum[];
  formatAxisValue?: (value: number) => string;
  formatValue?: (value: number) => string;
  /**
   * Which way an effect is good news, so a decided row reads "Better" or
   * "Worse" rather than "Above"/"Below". @default "up"
   */
  goodDirection?: "down" | "none" | "up";
  /** The no-effect line the intervals are judged against. @default 0 */
  reference?: number;
  /** Name of the reference line in the key. @default "No effect" */
  referenceLabel?: string;
  /** Words for the three verdicts. */
  verdictLabels?: Partial<Record<IntervalVerdict | "above" | "below", string>>;
};

const defaultWords = () => ({
  above: i18n.t("ui:interval.verdict.above"),
  below: i18n.t("ui:interval.verdict.below"),
  better: i18n.t("ui:interval.verdict.better"),
  unclear: i18n.t("ui:interval.verdict.unclear"),
  worse: i18n.t("ui:interval.verdict.worse"),
});

/**
 * Effects with their uncertainty — A/B test lifts, a model's score against a
 * baseline, a coefficient per segment. Each row is a best estimate (dot) and
 * the interval it is known within (bar) against a no-effect line; a row whose
 * interval crosses that line says "Not clear yet" in words, so a lift that is
 * still noise never reads as a win. The statistics are the product's: pass
 * the estimate and bounds you computed.
 */
export function IntervalChart({
  className,
  color = vars["--aui-chart-1"],
  data,
  description,
  empty,
  formatAxisValue = formatChartValue,
  formatValue = formatChartReadout,
  goodDirection = "up",
  icon,
  id,
  reference = 0,
  referenceLabel = i18n.t("ui:interval.noEffect"),
  style,
  title,
  verdictLabels,
  xstyle,
  ...state
}: IntervalChartProps) {
  useTranslation();
  const words = { ...defaultWords(), ...verdictLabels };
  const domain = niceDomain([
    reference,
    ...data.flatMap((d) => [d.low, d.high]),
  ]);
  const ticks = niceTicks(domain);
  const judged = data.map((d) => {
    const direction = d.goodDirection ?? goodDirection;
    const { side, verdict } = intervalVerdict(d, reference, direction);
    const word = direction === "none" && side ? words[side] : words[verdict];
    return { ...d, side, verdict, word };
  });
  const describeRow = (index: number) => {
    const d = judged[index]!;
    return i18n.t("ui:interval.describeRow", {
      estimate: formatValue(d.estimate),
      high: formatValue(d.high),
      label: d.label,
      low: formatValue(d.low),
      reference: referenceLabel,
      referenceValue: formatValue(reference),
      verdict: d.word,
    });
  };
  const explorer = useRowExplorer({
    count: judged.length,
    describe: describeRow,
    label: typeof title === "string" ? title : undefined,
  });
  const at = (value: number) => percentOf(value, domain);
  return (
    <ChartCard
      {...state}
      className={className}
      description={description}
      empty={empty ?? data.length === 0}
      icon={icon}
      id={id}
      style={style}
      table={{
        columns: [
          i18n.t("ui:interval.column.item"),
          i18n.t("ui:interval.column.estimate"),
          i18n.t("ui:interval.column.low"),
          i18n.t("ui:interval.column.high"),
          i18n.t("ui:interval.column.reading"),
          i18n.t("ui:interval.column.against"),
        ],
        rows: judged.map((d) => [
          d.label,
          d.estimate,
          d.low,
          d.high,
          d.word,
          `${referenceLabel} (${formatValue(reference)})`,
        ]),
      }}
      title={title}
      xstyle={xstyle}
    >
      <div className={sx(styles.body)}>
        <div
          className={sx(rows.explore, focusRing.ring)}
          {...explorer.containerProps}
        >
          <ul aria-hidden className={sx(rows.list)}>
            {judged.map((d, rowIndex) => {
              const decided = d.side != null;
              const ink = decided ? color : vars["--aui-color-text-subtle"];
              return (
                <li
                  className={sx(
                    rows.row,
                    styles.columns,
                    explorer.active === rowIndex && rows.rowActive,
                  )}
                  data-active={explorer.active === rowIndex ? "" : undefined}
                  data-interval-row={d.label}
                  data-verdict={d.verdict}
                  key={`${d.label}-${rowIndex}`}
                  title={describeRow(rowIndex)}
                >
                  <span className={sx(rows.label, styles.narrowLabel)}>
                    {d.label}
                  </span>
                  <span className={sx(rows.track)}>
                    {ticks.map((tick) => (
                      <span
                        className={sx(rows.gridLine)}
                        key={tick}
                        style={{ insetInlineStart: `${at(tick)}%` }}
                      />
                    ))}
                    <span
                      className={sx(styles.reference)}
                      style={{ insetInlineStart: `${at(reference)}%` }}
                    />
                    <span
                      className={sx(styles.interval)}
                      style={{
                        backgroundColor: ink,
                        inlineSize: `${Math.max(0.5, at(d.high) - at(d.low))}%`,
                        insetInlineStart: `${at(d.low)}%`,
                      }}
                    />
                    <span
                      className={sx(styles.dot)}
                      data-interval-estimate=""
                      style={{
                        backgroundColor: ink,
                        insetInlineStart: `${at(d.estimate)}%`,
                      }}
                    />
                  </span>
                  <span
                    className={sx(
                      rows.readout,
                      d.verdict === "better" && rows.up,
                      d.verdict === "worse" && rows.down,
                      d.verdict === "unclear" && rows.readoutMuted,
                    )}
                  >
                    {d.word}
                  </span>
                </li>
              );
            })}
          </ul>
          <VisuallyHidden aria-live="polite" data-chart-readout="">
            {explorer.readout}
          </VisuallyHidden>
        </div>
        <div aria-hidden className={sx(rows.ticks, styles.columns)}>
          <span className={sx(styles.narrowSpacer)} />
          <span className={sx(rows.tickTrack)}>
            {ticks.map((tick) => (
              <span
                className={sx(rows.tick)}
                key={tick}
                style={{ insetInlineStart: `${at(tick)}%` }}
              >
                {formatAxisValue(tick)}
              </span>
            ))}
          </span>
          <span />
        </div>
        <div aria-hidden className={sx(rows.key)}>
          <span className={sx(rows.keyItem)}>
            <span
              className={sx(styles.keyDot)}
              style={{ backgroundColor: color }}
            />
            {i18n.t("ui:interval.key.estimate")}
          </span>
          <span className={sx(rows.keyItem)}>
            <span
              className={sx(styles.keyBar)}
              style={{ backgroundColor: color }}
            />
            {i18n.t("ui:interval.key.interval")}
          </span>
          <span className={sx(rows.keyItem)}>
            <span className={sx(styles.keyRule)} />
            {referenceLabel}
          </span>
        </div>
      </div>
    </ChartCard>
  );
}

/**
 * Ticks on round steps (1, 2, 2.5, 5 × 10ⁿ) inside the domain, so a lift axis
 * reads −10% · −5% · 0 · +5% rather than −3.75% · +2.5%.
 */
function niceTicks([lo, hi]: readonly [number, number]): number[] {
  const raw = (hi - lo) / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(lo / step) * step;
    tick <= hi + step / 1e6;
    tick += step
  ) {
    ticks.push(Number(tick.toPrecision(12)));
  }
  return ticks;
}

const styles = stylex.create({
  // Fixed label and verdict columns: every row is its own grid, and an auto
  // column sized by "Not clear yet" vs "Better" would shift the shared scale.
  //
  // Narrow arm: 140px of label plus 104px of verdict left a phone-wide card a
  // 15px plot, its intervals invisible and its ticks printed on top of each
  // other ("-10%0%0%"). Below 420px the label takes its own line over the
  // row and the plot keeps everything but the verdict column.
  columns: {
    gridTemplateColumns: {
      default: "8.75rem minmax(0, 1fr) 6.5rem",
      "@container interval-chart (max-width: 420px)":
        "minmax(0, 1fr) 6.5rem",
    },
    rowGap: vars["--aui-space-4"],
  },
  narrowLabel: {
    gridColumn: {
      default: "auto",
      "@container interval-chart (max-width: 420px)": "1 / -1",
    },
  },
  narrowSpacer: {
    display: {
      default: "block",
      "@container interval-chart (max-width: 420px)": "none",
    },
  },
  body: {
    containerName: "interval-chart",
    containerType: "inline-size",
    display: "grid",
    gap: vars["--aui-space-12"],
    minInlineSize: 0,
  },
  interval: {
    blockSize: 4,
    borderRadius: 2,
    insetBlockStart: "calc(50% - 2px)",
    position: "absolute",
  },
  dot: {
    blockSize: 10,
    borderColor: vars["--aui-color-surface-raised"],
    borderRadius: vars["--aui-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--aui-ring-width-sm"],
    boxSizing: "border-box",
    inlineSize: 10,
    insetBlockStart: "calc(50% - 5px)",
    marginInlineStart: -5,
    position: "absolute",
  },
  // The no-effect line is the one rule the reading depends on: text ink,
  // full height, over the grid.
  reference: {
    backgroundColor: vars["--aui-color-text"],
    insetBlock: 0,
    inlineSize: 1.5,
    marginInlineStart: -0.75,
    position: "absolute",
  },
  keyDot: {
    blockSize: 10,
    borderRadius: vars["--aui-radius-full"],
    inlineSize: 10,
  },
  keyBar: { blockSize: 4, borderRadius: 2, inlineSize: 16 },
  keyRule: {
    backgroundColor: vars["--aui-color-text"],
    blockSize: 12,
    inlineSize: 1.5,
  },
});
