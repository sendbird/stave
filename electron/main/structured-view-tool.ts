import {
  buildStructuredViewToolResult,
  parseStructuredViewSpec,
  STRUCTURED_VIEW_MAX_HEATMAP_CELLS,
  STRUCTURED_VIEW_MAX_SPEC_BYTES,
  STRUCTURED_VIEW_MAX_STATS,
  STRUCTURED_VIEW_MAX_TABLE_COLUMNS,
  STRUCTURED_VIEW_MAX_TABLE_ROWS,
  STRUCTURED_VIEW_MAX_TIMELINE_ITEMS,
} from "../../src/lib/structured-view/view-spec";

/** What `stave_show_view` tells the agent about itself. */
export const STRUCTURED_VIEW_TOOL_DESCRIPTION = [
  "Show data inline in this conversation, drawn by Stave's own table, chart, stat tile, timeline and heatmap components in the user's theme. Use it without being asked when your reply holds a table, numbers across groups or over time, a few headline metrics, a schedule, or a matrix; keep short answers, code, and plain lists as text. Call it before your final reply and refer to the view there instead of repeating its data.",
  "Pass one view as `view`, with an optional title and summary. Every value is inline: nothing in a view is fetched, queried or executed.",
  `table: columns [{key, label?, type? text|number|date|boolean, align? start|center|end, format?}] (up to ${STRUCTURED_VIEW_MAX_TABLE_COLUMNS}) and rows of {columnKey: string|number|boolean|null} (up to ${STRUCTURED_VIEW_MAX_TABLE_ROWS}), optional sort {key, direction asc|desc}. The reader can sort, search and page it.`,
  "chart: `chart` is a ChartSpec {type line|area|bar|series|pie|barlist|interval|heatmap, title?, description?, data [{label, value, time?}] (series: data rows with one key per series plus series [{key, label?, kind? bar|line|area}]), format?, options?}.",
  `stats: items [{label, value number|string, delta? ("+4.2%"), previous?, goodDirection? up|down|none, status? neutral|success|danger, trend? number[], note?, format?}] (up to ${STRUCTURED_VIEW_MAX_STATS}).`,
  `timeline: items [{label, start, end (ISO date or epoch ms), row?, group?, tone? neutral|info|success|warning|danger, progress? 0-1}] (up to ${STRUCTURED_VIEW_MAX_TIMELINE_ITEMS}), now? true or a date.`,
  `heatmap: cells [{row, column, value number|null}] (up to ${STRUCTURED_VIEW_MAX_HEATMAP_CELLS}), format?, options? {normalize? row|column, showValues?}.`,
  `format is compact, number, percent (12.5 means 12.5%), ratio (0.125 means 12.5%), duration (milliseconds) or currency:<ISO code>. The whole view must stay under ${STRUCTURED_VIEW_MAX_SPEC_BYTES / 1024} KB; aggregate larger data first.`,
  "For a bespoke layout, a mockup, a diagram or an interactive page, use stave_render_html instead.",
].join(" ");

export type StructuredViewToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

/**
 * Checks the view and returns it as the tool result, so the view is saved
 * with the turn's tool output and drawn from there. The JSON is compact: the
 * agent reads this result too, and it already knows the data it wrote.
 */
export function runStructuredViewTool(view: unknown): StructuredViewToolResponse {
  const parsed = parseStructuredViewSpec(view);
  if (!parsed.ok) {
    return { content: [{ type: "text", text: parsed.error }], isError: true };
  }
  const result = buildStructuredViewToolResult(parsed.spec);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
