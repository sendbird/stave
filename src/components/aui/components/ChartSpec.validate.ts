import { toEpoch } from "../utils/chart-transform";

/*
 * `validateChartSpec`, split from `ChartSpec.tsx` so it stays pure (no React,
 * no styles): an agent tool or a server can import it without the charts.
 */

/** Every `ChartSpec` type (kept here so validation needs no chart import). */
export type ChartSpecType =
  | "area"
  | "bar"
  | "barlist"
  | "heatmap"
  | "interval"
  | "line"
  | "pie"
  | "series";

export const CHART_SPEC_TYPES: readonly ChartSpecType[] = [
  "area",
  "bar",
  "barlist",
  "heatmap",
  "interval",
  "line",
  "pie",
  "series",
];

export type ChartSpecIssue = {
  /** `error` stops the chart from drawing; `warning` draws it with a caveat. */
  level: "error" | "warning";
  message: string;
  /** Where in the spec ("data[3].value"). */
  path: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

type Check = (value: unknown) => boolean;
const isBool: Check = (v) => typeof v === "boolean";
const isString: Check = (v) => typeof v === "string";
const isRef: Check = (v) => typeof v === "string" || isFiniteNumber(v);
const isCount: Check = (v) =>
  isFiniteNumber(v) && v >= 1 && Math.floor(v) === v;
const isBoolOrString: Check = (v) => isBool(v) || isString(v);
const oneOf =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const arrayOf =
  (item: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(item);
const hasDataArray: Check = (v) => isRecord(v) && Array.isArray(v.data);
const validZone = (zone: unknown) => {
  if (zone == null) return true;
  if (typeof zone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
const validLocale = (locale: unknown) => {
  if (locale == null) return true;
  if (typeof locale !== "string") return false;
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length >= 0;
  } catch {
    return false;
  }
};
const isTimeAxis: Check = (v) =>
  isBool(v) ||
  (isRecord(v) &&
    validZone(v.timeZone) &&
    validLocale(v.locale) &&
    v.format === undefined);
const shared: Record<string, Check> = {
  summaryLine: isBoolOrString,
  tableToggle: isBool,
  timeAxis: isTimeAxis,
  valueScale: oneOf("linear", "log"),
};

/**
 * Options each spec type accepts, with the shape each must have. `ChartFromSpec`
 * passes only these to the chart, so a stray key never reaches a component.
 */
export const CHART_SPEC_OPTIONS: Record<
  ChartSpecType,
  Record<string, Check>
> = {
  area: cartesianOptions(),
  bar: cartesianOptions(),
  barlist: { highlightLabels: arrayOf(isString), maxItems: isCount },
  heatmap: {
    highlightDiagonal: isBool,
    normalize: oneOf("column", "row"),
    showValues: isBool,
  },
  interval: {
    goodDirection: oneOf("down", "none", "up"),
    reference: isFiniteNumber,
    referenceLabel: isString,
  },
  line: cartesianOptions(),
  pie: { donut: isBool, maxSlices: isCount },
  series: {
    ...shared,
    diverging: (v) =>
      isRecord(v) &&
      arrayOf(isString)(v.negative) &&
      (v.neutral === undefined || isString(v.neutral)),
    focusSeries: isString,
    layout: oneOf("columns", "rows"),
    stacked: (v) => isBool(v) || v === "percent",
  },
};

function cartesianOptions(): Record<string, Check> {
  return {
    ...shared,
    annotations: arrayOf(
      (a) => isRecord(a) && isRef(a.at) && isString(a.label),
    ),
    bands: arrayOf(
      (b) => isRecord(b) && isFiniteNumber(b.from) && isFiniteNumber(b.to),
    ),
    comparison: hasDataArray,
    curve: oneOf("linear", "monotone", "step"),
    dots: (v) => isBool(v) || v === "last",
    downloadCsv: isBoolOrString,
    downloadImage: isBoolOrString,
    maxItems: isCount,
    maxPoints: isCount,
    movingAverage: (v) => isCount(v) || (isRecord(v) && isCount(v.window)),
    partialFrom: isRef,
    projectedFrom: isRef,
    range: hasDataArray,
    referenceLines: arrayOf((l) => isRecord(l) && isFiniteNumber(l.value)),
    spans: arrayOf((s) => isRecord(s) && isRef(s.from) && isRef(s.to)),
    valueDomain: (v) =>
      Array.isArray(v) &&
      v.length === 2 &&
      v.every((end) => end === "auto" || isFiniteNumber(end)),
  };
}

/** The spec's options limited to the keys its type accepts. */
export function specOptions(
  type: ChartSpecType,
  options: unknown,
): Record<string, unknown> {
  if (!isRecord(options)) return {};
  const allowed = CHART_SPEC_OPTIONS[type];
  return Object.fromEntries(
    Object.entries(options).filter(([key]) => key in allowed),
  );
}

/** Most heatmap cells a spec may carry; a larger grid is not readable as cells. */
const MAX_SPEC_CELLS = 20_000;

/**
 * Checks a spec before it is drawn, and says what is wrong in words an agent
 * can act on. Errors block drawing (a missing field, a bound below its
 * estimate); warnings name a choice AUI will correct or a reader will miss
 * (a pie past three slices folds into "Other"; a log scale cannot draw zero).
 */
export function validateChartSpec(spec: unknown): {
  issues: ChartSpecIssue[];
  valid: boolean;
} {
  const issues: ChartSpecIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ level: "error", message, path });
  const warn = (path: string, message: string) =>
    issues.push({ level: "warning", message, path });
  if (!isRecord(spec)) {
    error("", "A chart spec is an object with a `type` and its data.");
    return { issues, valid: false };
  }
  const type = spec.type as ChartSpecType;
  if (!CHART_SPEC_TYPES.includes(type)) {
    error(
      "type",
      `Unknown chart type ${JSON.stringify(spec.type)}; use one of ${CHART_SPEC_TYPES.join(", ")}.`,
    );
    return { issues, valid: false };
  }
  if (typeof spec.title !== "string" || !spec.title.trim()) {
    warn(
      "title",
      "Give the chart a title: it names the chart for keyboard and screen-reader users.",
    );
  }
  if (spec.format != null) {
    const format = spec.format;
    const known =
      typeof format === "string" &&
      /^(compact|duration|number|percent|ratio|currency:[A-Z]{3})$/.test(
        format,
      );
    if (!known) {
      error(
        "format",
        `Unknown format ${JSON.stringify(format)}; use compact, number, percent, ratio, duration or currency:<ISO code>.`,
      );
    } else if (format.startsWith("currency:")) {
      try {
        new Intl.NumberFormat("en-US", {
          currency: format.slice(9),
          style: "currency",
        });
      } catch {
        error("format", `${format.slice(9)} is not a currency code.`);
      }
    }
  }
  if (!validLocale(spec.locale))
    error(
      "locale",
      `${JSON.stringify(spec.locale)} is not a BCP 47 locale ("en-US", "ko-KR").`,
    );
  if (spec.options != null && !isRecord(spec.options))
    error("options", "`options` must be an object.");
  const options = isRecord(spec.options) ? spec.options : {};
  const accepted = CHART_SPEC_OPTIONS[type];
  for (const [key, value] of Object.entries(options)) {
    const check = accepted[key];
    if (!check)
      warn(
        `options.${key}`,
        `A ${type} spec does not take \`${key}\`; it is ignored.`,
      );
    else if (value !== undefined && !check(value))
      error(
        `options.${key}`,
        `\`${key}\` has the wrong shape for a ${type} chart.`,
      );
  }
  if (type === "heatmap") {
    if (!Array.isArray(spec.cells))
      error("cells", "A heatmap needs `cells`: { row, column, value }[].");
    else {
      if (spec.cells.length > MAX_SPEC_CELLS) {
        error(
          "cells",
          `${spec.cells.length} cells is more than a heatmap can show (${MAX_SPEC_CELLS}); aggregate first.`,
        );
      }
      spec.cells.forEach((cell, index) => {
        if (
          !isRecord(cell) ||
          typeof cell.row !== "string" ||
          typeof cell.column !== "string"
        ) {
          error(
            `cells[${index}]`,
            "Each cell needs a string `row` and `column`.",
          );
        } else if (cell.value !== null && !isFiniteNumber(cell.value)) {
          error(
            `cells[${index}].value`,
            "A cell value is a number, or null for no reading.",
          );
        }
      });
    }
    return { issues, valid: !issues.some((issue) => issue.level === "error") };
  }
  if (!Array.isArray(spec.data)) {
    error("data", "`data` must be an array.");
    return { issues, valid: false };
  }
  const data = spec.data as unknown[];
  if (data.length === 0)
    warn("data", "No rows: the chart will show its empty state.");
  const bad: string[] = [];
  data.forEach((row, index) => {
    if (bad.length >= 3) return;
    if (!isRecord(row) || typeof row.label !== "string") {
      bad.push(`data[${index}]`);
      error(`data[${index}].label`, "Each row needs a string `label`.");
      return;
    }
    if (type === "interval") {
      const { estimate, high, low } = row;
      if (![estimate, high, low].every(isFiniteNumber)) {
        bad.push(`data[${index}]`);
        error(
          `data[${index}]`,
          "An interval row needs numeric `estimate`, `low` and `high`.",
        );
      } else if (
        !(
          (low as number) <= (estimate as number) &&
          (estimate as number) <= (high as number)
        )
      ) {
        bad.push(`data[${index}]`);
        error(`data[${index}]`, "`low` ≤ `estimate` ≤ `high` must hold.");
      }
    } else if (type !== "series" && !isFiniteNumber(row.value)) {
      bad.push(`data[${index}]`);
      error(`data[${index}].value`, "Each row needs a numeric `value`.");
    }
  });
  if (type === "pie") {
    if (
      data.some(
        (row) => isRecord(row) && isFiniteNumber(row.value) && row.value < 0,
      )
    ) {
      error("data", "A pie cannot draw a negative share.");
    }
    const colored = data.every(
      (row) => isRecord(row) && typeof row.color === "string",
    );
    if (data.length > 3 && !colored) {
      warn(
        "data",
        "More than three slices: the tail folds into “Other”. A bar list compares many parts better.",
      );
    }
  }
  if (type === "series") {
    const series = spec.series;
    if (!Array.isArray(series) || series.length === 0) {
      error(
        "series",
        "A series chart needs `series`: { key, label?, kind? }[].",
      );
    } else {
      if (
        series.length > 6 &&
        series.some((entry) => !isRecord(entry) || entry.color == null)
      ) {
        error(
          "series",
          "More than six series exhaust the palette; split them into small multiples.",
        );
      }
      series.forEach((entry, index) => {
        if (!isRecord(entry) || typeof entry.key !== "string") {
          error(`series[${index}].key`, "Each series needs a string `key`.");
        } else if (
          !data.some((row) => isRecord(row) && (entry.key as string) in row)
        ) {
          warn(
            `series[${index}].key`,
            `No row has the key ${JSON.stringify(entry.key)}; the series draws nothing.`,
          );
        }
      });
    }
  }
  if (options.valueScale === "log") {
    const nonPositive = data.some(
      (row) => isRecord(row) && isFiniteNumber(row.value) && row.value <= 0,
    );
    if (nonPositive)
      warn(
        "options.valueScale",
        "A log scale cannot draw zero or negative values; they become gaps.",
      );
  }
  if (options.timeAxis) {
    const untimed = data.filter(
      (row) => !isRecord(row) || toEpoch(row.time) == null,
    ).length;
    if (untimed)
      warn(
        "options.timeAxis",
        `${untimed} row(s) have no parseable \`time\` and are dropped from the time axis.`,
      );
  }
  return { issues, valid: !issues.some((issue) => issue.level === "error") };
}
