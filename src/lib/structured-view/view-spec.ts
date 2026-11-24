/**
 * Structured views: tables, charts, stat tiles, timelines and heatmaps an
 * agent describes as data with `stave_show_view` (or a `stave-view` fence in
 * its reply), drawn by Stave with its own components.
 *
 * A view carries its data inline. Nothing in a spec is executed, fetched or
 * read from disk: the renderer only lays out the values it was given, so a
 * view needs no sandbox and no approval.
 *
 * This module is the contract the main process (the tool handler) and the
 * renderer (the tool result and the fence) share: the schema, its limits, the
 * tool result shape and the parsers that find a view in either place. It is
 * pure so both processes and the tests import the same rules.
 */

import { z } from "zod";
import { validateChartSpec } from "../../components/aui/components/ChartSpec.validate";

export const STRUCTURED_VIEW_TOOL_NAME = "stave_show_view";
export const STRUCTURED_VIEW_RESULT_KEY = "staveStructuredView";
export const STRUCTURED_VIEW_FENCE_LANGUAGE = "stave-view";

/** The serialized spec, in UTF-8 bytes. */
export const STRUCTURED_VIEW_MAX_SPEC_BYTES = 256 * 1024;
export const STRUCTURED_VIEW_MAX_TABLE_ROWS = 500;
export const STRUCTURED_VIEW_MAX_TABLE_COLUMNS = 40;
export const STRUCTURED_VIEW_MAX_STATS = 12;
export const STRUCTURED_VIEW_MAX_TIMELINE_ITEMS = 200;
export const STRUCTURED_VIEW_MAX_HEATMAP_CELLS = 2_000;
export const STRUCTURED_VIEW_MAX_TITLE_CHARS = 120;
export const STRUCTURED_VIEW_MAX_SUMMARY_CHARS = 600;
export const STRUCTURED_VIEW_MAX_CELL_CHARS = 2_000;

export const STRUCTURED_VIEW_TYPES = ["table", "chart", "stats", "timeline", "heatmap"] as const;
export type StructuredViewType = (typeof STRUCTURED_VIEW_TYPES)[number];

/* ─── Schema ─────────────────────────────────────────────────────── */

/**
 * How a number reads: the chart family's named formats, so a table column, a
 * stat tile and a chart format the same value the same way.
 */
const FormatSchema = z.union([
  z.enum(["compact", "number", "percent", "ratio", "duration"]),
  z.string().regex(/^currency:[A-Z]{3}$/, "Use currency:<ISO 4217 code>, for example currency:USD."),
]);
export type StructuredViewFormat = z.infer<typeof FormatSchema>;

const common = {
  title: z.string().trim().min(1).max(STRUCTURED_VIEW_MAX_TITLE_CHARS).optional(),
  summary: z.string().trim().min(1).max(STRUCTURED_VIEW_MAX_SUMMARY_CHARS).optional(),
};

const CellValueSchema = z.union([
  z.string().max(STRUCTURED_VIEW_MAX_CELL_CHARS),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type StructuredViewCellValue = z.infer<typeof CellValueSchema>;

const TableColumnSchema = z.strictObject({
  key: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(STRUCTURED_VIEW_MAX_TITLE_CHARS).optional(),
  type: z.enum(["text", "number", "date", "boolean"]).optional(),
  align: z.enum(["start", "center", "end"]).optional(),
  format: FormatSchema.optional(),
});

const TableViewSchema = z
  .strictObject({
    type: z.literal("table"),
    ...common,
    columns: z.array(TableColumnSchema).min(1).max(STRUCTURED_VIEW_MAX_TABLE_COLUMNS),
    rows: z.array(z.record(z.string(), CellValueSchema)).max(STRUCTURED_VIEW_MAX_TABLE_ROWS),
    sort: z
      .strictObject({ key: z.string().min(1), direction: z.enum(["asc", "desc"]) })
      .optional(),
  })
  .superRefine((view, context) => {
    const keys = new Set<string>();
    view.columns.forEach((column, index) => {
      if (keys.has(column.key)) {
        context.addIssue({
          code: "custom",
          path: ["columns", index, "key"],
          // i18n-ignore: model-facing validation message
          message: `Duplicate column key "${column.key}"; every column needs its own key.`,
        });
      }
      keys.add(column.key);
    });
    if (view.sort && !keys.has(view.sort.key)) {
      context.addIssue({
        code: "custom",
        path: ["sort", "key"],
        // i18n-ignore: model-facing validation message
        message: `Sort key "${view.sort.key}" is not a column key.`,
      });
    }
    for (const [index, row] of view.rows.entries()) {
      const unknown = Object.keys(row).find((key) => !keys.has(key));
      if (unknown !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["rows", index, unknown],
          // i18n-ignore: model-facing validation message
          message: `"${unknown}" is not a column key; add it to columns or drop it from the row.`,
        });
        return;
      }
    }
  });

/**
 * A chart is the design system's `ChartSpec` as is (line, area, bar, series,
 * pie, barlist, interval or heatmap), checked by its own validator.
 */
const ChartViewSchema = z
  .strictObject({
    type: z.literal("chart"),
    ...common,
    chart: z.record(z.string(), z.unknown()),
  })
  .superRefine((view, context) => {
    reportChartIssues(view.chart, ["chart"], context);
  });

const StatItemSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  value: z.union([z.number().finite(), z.string().trim().min(1).max(40)]),
  /** Signed change printed as given ("+4.2%"). */
  delta: z.string().trim().min(1).max(40).optional(),
  /** The same measure in the compared period; the tile derives the delta. */
  previous: z.number().finite().optional(),
  goodDirection: z.enum(["up", "down", "none"]).optional(),
  /** What the delta means: success, danger or neutral. */
  status: z.enum(["neutral", "success", "danger"]).optional(),
  trend: z.array(z.number().finite()).min(2).max(120).optional(),
  note: z.string().trim().min(1).max(120).optional(),
  format: FormatSchema.optional(),
});

const StatsViewSchema = z.strictObject({
  type: z.literal("stats"),
  ...common,
  items: z.array(StatItemSchema).min(1).max(STRUCTURED_VIEW_MAX_STATS),
});

const DateInputSchema = z
  .union([z.string().trim().min(1).max(40), z.number().finite()])
  // i18n-ignore: model-facing validation message
  .refine((value) => Number.isFinite(toEpochMs(value)), "Use an ISO date or datetime, or epoch milliseconds.");

const TimelineItemSchema = z
  .strictObject({
    id: z.string().min(1).max(64).optional(),
    label: z.string().trim().min(1).max(STRUCTURED_VIEW_MAX_TITLE_CHARS),
    start: DateInputSchema,
    end: DateInputSchema,
    row: z.string().trim().min(1).max(80).optional(),
    group: z.string().trim().min(1).max(80).optional(),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    progress: z.number().min(0).max(1).optional(),
  })
  .refine((item) => toEpochMs(item.end) >= toEpochMs(item.start), {
    path: ["end"],
    // i18n-ignore: model-facing validation message
    message: "end must not be before start.",
  });

const TimelineViewSchema = z.strictObject({
  type: z.literal("timeline"),
  ...common,
  items: z.array(TimelineItemSchema).min(1).max(STRUCTURED_VIEW_MAX_TIMELINE_ITEMS),
  /** A "now" rule: true for the time the view is drawn, or a date. */
  now: z.union([z.boolean(), DateInputSchema]).optional(),
});

const HeatmapViewSchema = z
  .strictObject({
    type: z.literal("heatmap"),
    ...common,
    cells: z
      .array(
        z.strictObject({
          row: z.string().trim().min(1).max(80),
          column: z.string().trim().min(1).max(80),
          value: z.number().finite().nullable(),
        }),
      )
      .min(1)
      .max(STRUCTURED_VIEW_MAX_HEATMAP_CELLS),
    format: FormatSchema.optional(),
    options: z
      .strictObject({
        normalize: z.enum(["row", "column"]).optional(),
        showValues: z.boolean().optional(),
        highlightDiagonal: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((view, context) => {
    reportChartIssues(heatmapChartSpec(view), [], context);
  });

export const StructuredViewSpecSchema = z.discriminatedUnion("type", [
  TableViewSchema,
  ChartViewSchema,
  StatsViewSchema,
  TimelineViewSchema,
  HeatmapViewSchema,
]);

export type StructuredViewSpec = z.infer<typeof StructuredViewSpecSchema>;
export type StructuredTableView = z.infer<typeof TableViewSchema>;
export type StructuredTableColumn = z.infer<typeof TableColumnSchema>;
export type StructuredChartView = z.infer<typeof ChartViewSchema>;
export type StructuredStatsView = z.infer<typeof StatsViewSchema>;
export type StructuredStatItem = z.infer<typeof StatItemSchema>;
export type StructuredTimelineView = z.infer<typeof TimelineViewSchema>;
export type StructuredHeatmapView = z.infer<typeof HeatmapViewSchema>;

function reportChartIssues(
  chart: unknown,
  path: Array<string | number>,
  context: z.RefinementCtx,
) {
  for (const issue of validateChartSpec(chart).issues) {
    if (issue.level !== "error") continue;
    context.addIssue({
      code: "custom",
      path: [...path, ...(issue.path ? issue.path.split(".") : [])],
      message: issue.message,
    });
  }
}

/** The design system's heatmap spec for a heatmap view. */
export function heatmapChartSpec(view: Pick<StructuredHeatmapView, "title" | "summary" | "cells" | "format" | "options">) {
  return {
    type: "heatmap" as const,
    ...(view.title ? { title: view.title } : {}),
    ...(view.summary ? { description: view.summary } : {}),
    cells: view.cells,
    ...(view.format ? { format: view.format } : {}),
    ...(view.options ? { options: view.options } : {}),
  };
}

/**
 * The chart spec a chart view draws: the view's title and summary fill the
 * chart's own title and description when the chart names none, so the chart
 * card is the view's one heading.
 */
export function chartViewSpec(view: StructuredChartView): Record<string, unknown> {
  return {
    ...view.chart,
    ...(view.chart.title === undefined && view.title ? { title: view.title } : {}),
    ...(view.chart.description === undefined && view.summary ? { description: view.summary } : {}),
  };
}

export function toEpochMs(value: string | number): number {
  return typeof value === "number" ? value : Date.parse(value);
}

/* ─── Validation ─────────────────────────────────────────────────── */

export type StructuredViewParseResult =
  | { ok: true; spec: StructuredViewSpec }
  | { ok: false; error: string };

const MAX_REPORTED_ISSUES = 5;

export function structuredViewByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").length;
}

/**
 * Checks a view and says what is wrong in words an agent can act on: each
 * problem with its path, at most five, plus the shape that is expected.
 */
export function parseStructuredViewSpec(value: unknown): StructuredViewParseResult {
  const bytes = structuredViewByteLength(value);
  if (bytes > STRUCTURED_VIEW_MAX_SPEC_BYTES) {
    return {
      ok: false,
      // i18n-ignore: model-facing validation message
      error: `The view is ${Math.ceil(bytes / 1024)} KB; the limit is ${STRUCTURED_VIEW_MAX_SPEC_BYTES / 1024} KB. Show fewer rows (at most ${STRUCTURED_VIEW_MAX_TABLE_ROWS}), aggregate the data, or summarize the rest in text.`,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    // i18n-ignore: model-facing validation message
    return { ok: false, error: `A view is a JSON object whose "type" is one of ${STRUCTURED_VIEW_TYPES.join(", ")}.` };
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== "string" || !(STRUCTURED_VIEW_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      // i18n-ignore: model-facing validation message
      error: `Unknown view type ${JSON.stringify(type)}; use one of ${STRUCTURED_VIEW_TYPES.join(", ")}. Use stave_render_html for anything these types cannot show.`,
    };
  }
  const parsed = StructuredViewSpecSchema.safeParse(value);
  if (parsed.success) return { ok: true, spec: parsed.data };
  const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const more = parsed.error.issues.length - issues.length;
  return {
    ok: false,
    // i18n-ignore: model-facing validation message
    error: `Invalid ${type} view. ${issues.join("; ")}${more > 0 ? ` (and ${more} more)` : ""}.`,
  };
}

/** A `stave-view` fence: JSON text holding one view. */
export function parseStructuredViewFence(code: string): StructuredViewParseResult {
  let value: unknown;
  try {
    value = JSON.parse(code);
  } catch (error) {
    return {
      ok: false,
      // i18n-ignore: model-facing validation message
      error: `The fence is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return parseStructuredViewSpec(value);
}

export function isStructuredViewFenceLanguage(language: string | undefined): boolean {
  return language?.trim().toLowerCase() === STRUCTURED_VIEW_FENCE_LANGUAGE;
}

/* ─── Tool result ────────────────────────────────────────────────── */

const SUMMARY_SAMPLE_ROWS = 3;
const SUMMARY_SAMPLE_CHARS = 600;

/**
 * A short account of what the view shows, for the agent that drew it: the
 * kind, its size, and for a table its first rows, so the reply can refer to
 * the view instead of repeating it.
 */
export function summarizeStructuredView(spec: StructuredViewSpec): string {
  const title = spec.title ? ` "${spec.title}"` : "";
  switch (spec.type) {
    case "table": {
      const sample = JSON.stringify(spec.rows.slice(0, SUMMARY_SAMPLE_ROWS));
      const sorted = spec.sort ? `, sorted by ${spec.sort.key} ${spec.sort.direction}` : "";
      // i18n-ignore: model-facing tool result
      return `Table${title}: ${spec.rows.length} rows x ${spec.columns.length} columns${sorted}. First rows: ${truncate(sample, SUMMARY_SAMPLE_CHARS)}`;
    }
    case "chart": {
      const chartType = typeof spec.chart.type === "string" ? spec.chart.type : "chart";
      const data = Array.isArray(spec.chart.data)
        ? spec.chart.data.length
        : Array.isArray(spec.chart.cells)
          ? spec.chart.cells.length
          : 0;
      // i18n-ignore: model-facing tool result
      return `Chart${title}: ${chartType} with ${data} data points.`;
    }
    case "stats":
      // i18n-ignore: model-facing tool result
      return `Stats${title}: ${spec.items.map((item) => `${item.label} ${item.value}`).join(", ")}.`;
    case "timeline":
      // i18n-ignore: model-facing tool result
      return `Timeline${title}: ${spec.items.length} items.`;
    case "heatmap":
      // i18n-ignore: model-facing tool result
      return `Heatmap${title}: ${spec.cells.length} cells.`;
  }
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface StructuredViewPayload {
  version: 1;
  spec: StructuredViewSpec;
}

export function buildStructuredViewToolResult(spec: StructuredViewSpec) {
  return {
    [STRUCTURED_VIEW_RESULT_KEY]: { version: 1 as const, spec },
    // i18n-ignore: model-facing tool result, read by the agent, not the user
    message: `Shown inline in the conversation above your reply. ${summarizeStructuredView(spec)} Refer to it in your reply instead of repeating its data.`,
  };
}

/**
 * Whether a provider-decorated tool name is this tool: Claude reports
 * `mcp__stave-local-mcp__stave_show_view`, Codex a dotted or bare name.
 */
export function isStructuredViewToolName(toolName: string): boolean {
  return toolName
    .trim()
    .toLowerCase()
    .split(/__|[./:\s]+/)
    .includes(STRUCTURED_VIEW_TOOL_NAME);
}

const MAX_RESULT_SEARCH_DEPTH = 4;

/**
 * Finds the view in a tool's output text. Providers wrap MCP results
 * differently: Claude passes the text block, Codex serialises the whole
 * result with the text nested in `content[].text` and a copy in
 * `structuredContent`. The view is matched by its shape, not by tool name,
 * and checked again before it is drawn.
 */
export function parseStructuredViewToolOutput(
  output: string | null | undefined,
): StructuredViewSpec | null {
  if (!output || !output.includes(STRUCTURED_VIEW_RESULT_KEY)) return null;
  return findView(parseJson(output), 0);
}

function findView(value: unknown, depth: number): StructuredViewSpec | null {
  if (depth > MAX_RESULT_SEARCH_DEPTH || value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.includes(STRUCTURED_VIEW_RESULT_KEY) ? findView(parseJson(value), depth + 1) : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findView(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = readPayload(record[STRUCTURED_VIEW_RESULT_KEY]);
  if (direct) return direct;
  for (const key of ["structuredContent", "content", "text", "result"]) {
    if (key in record) {
      const found = findView(record[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function readPayload(value: unknown): StructuredViewSpec | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const parsed = parseStructuredViewSpec(record.spec);
  return parsed.ok ? parsed.spec : null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
