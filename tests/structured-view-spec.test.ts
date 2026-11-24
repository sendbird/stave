import { describe, expect, test } from "bun:test";
import {
  buildStructuredViewToolResult,
  chartViewSpec,
  heatmapChartSpec,
  isStructuredViewFenceLanguage,
  isStructuredViewToolName,
  parseStructuredViewFence,
  parseStructuredViewSpec,
  parseStructuredViewToolOutput,
  STRUCTURED_VIEW_MAX_SPEC_BYTES,
  STRUCTURED_VIEW_MAX_STATS,
  STRUCTURED_VIEW_MAX_TABLE_COLUMNS,
  STRUCTURED_VIEW_MAX_TABLE_ROWS,
  summarizeStructuredView,
  type StructuredViewSpec,
} from "@/lib/structured-view/view-spec";

const table = {
  type: "table",
  title: "Build times",
  summary: "Median minutes per job, last 30 days.",
  columns: [
    { key: "job", label: "Job" },
    { key: "minutes", label: "Minutes", type: "number", align: "end", format: "number" },
    { key: "green", label: "Green", type: "boolean" },
  ],
  rows: [
    { job: "lint", minutes: 2.4, green: true },
    { job: "test", minutes: 11.2, green: false },
    { job: "build", minutes: 6, green: null },
  ],
  sort: { key: "minutes", direction: "desc" },
} as const;

const chart = {
  type: "chart",
  title: "Weekly deploys",
  chart: {
    type: "bar",
    data: [
      { label: "W1", value: 4 },
      { label: "W2", value: 9 },
    ],
  },
} as const;

const stats = {
  type: "stats",
  items: [
    { label: "Open PRs", value: 14, previous: 11, goodDirection: "down" },
    { label: "p95 latency", value: "412 ms", delta: "-8%", status: "success", trend: [480, 450, 412] },
  ],
} as const;

const timeline = {
  type: "timeline",
  title: "Release plan",
  items: [
    { label: "Design", start: "2026-11-01", end: "2026-11-10", row: "Platform" },
    { label: "Build", start: "2026-11-08", end: "2026-11-24", tone: "info", progress: 0.4 },
  ],
  now: true,
} as const;

const heatmap = {
  type: "heatmap",
  title: "Failures by day and hour",
  cells: [
    { row: "Mon", column: "09", value: 3 },
    { row: "Mon", column: "10", value: null },
    { row: "Tue", column: "09", value: 1 },
    { row: "Tue", column: "10", value: 0 },
  ],
  options: { showValues: true },
} as const;

function expectError(value: unknown, fragment: string) {
  const result = parseStructuredViewSpec(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

describe("structured view spec", () => {
  test("accepts every view type", () => {
    for (const view of [table, chart, stats, timeline, heatmap]) {
      const result = parseStructuredViewSpec(view);
      expect(result.ok).toBe(true);
    }
  });

  test("rejects unknown types and non-objects with the allowed types", () => {
    expectError({ type: "graph", nodes: [] }, "use one of table, chart, stats, timeline, heatmap");
    expectError([table], "JSON object");
    expectError(null, "JSON object");
  });

  test("rejects properties the type does not take", () => {
    expectError({ ...table, script: "alert(1)" }, "script");
    expectError({ ...stats, items: [{ label: "A", value: 1, source: "sql" }] }, "source");
  });

  test("checks the table's column references", () => {
    expectError({ ...table, sort: { key: "missing", direction: "asc" } }, 'Sort key "missing"');
    expectError(
      { ...table, columns: [...table.columns, { key: "job" }] },
      'Duplicate column key "job"',
    );
    expectError({ ...table, rows: [{ job: "x", extra: 1 }] }, '"extra" is not a column key');
  });

  test("enforces the row, column and stat limits", () => {
    const rows = Array.from({ length: STRUCTURED_VIEW_MAX_TABLE_ROWS + 1 }, (_, index) => ({ job: `j${index}` }));
    expectError({ ...table, sort: undefined, rows }, "rows");
    const columns = Array.from({ length: STRUCTURED_VIEW_MAX_TABLE_COLUMNS + 1 }, (_, index) => ({ key: `c${index}` }));
    expectError({ ...table, sort: undefined, columns, rows: [] }, "columns");
    const items = Array.from({ length: STRUCTURED_VIEW_MAX_STATS + 1 }, (_, index) => ({ label: `s${index}`, value: index }));
    expectError({ type: "stats", items }, "items");
  });

  test("caps the serialized size before validating the shape", () => {
    const longCell = "x".repeat(1_900);
    const rows = Array.from({ length: 150 }, () => ({ job: longCell }));
    const result = parseStructuredViewSpec({ ...table, sort: undefined, rows });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(`the limit is ${STRUCTURED_VIEW_MAX_SPEC_BYTES / 1024} KB`);
    }
  });

  test("validates a chart with the design system's chart validator", () => {
    expectError({ type: "chart", chart: { type: "sankey", data: [] } }, "chart.type");
    expectError({ type: "chart", chart: { type: "bar" } }, "chart");
  });

  test("validates timeline dates and order", () => {
    expectError(
      { type: "timeline", items: [{ label: "A", start: "not a date", end: "2026-01-01" }] },
      "ISO date",
    );
    expectError(
      { type: "timeline", items: [{ label: "A", start: "2026-02-01", end: "2026-01-01" }] },
      "end must not be before start",
    );
  });

  test("fills the chart's title and description from the view", () => {
    const parsed = parseStructuredViewSpec({ ...chart, summary: "Deploys per week." });
    if (!parsed.ok || parsed.spec.type !== "chart") throw new Error("expected a chart view");
    expect(chartViewSpec(parsed.spec)).toMatchObject({
      type: "bar",
      title: "Weekly deploys",
      description: "Deploys per week.",
    });
    expect(heatmapChartSpec(heatmap)).toMatchObject({ type: "heatmap", title: heatmap.title });
  });
});

describe("structured view fence", () => {
  test("parses a JSON fence", () => {
    const result = parseStructuredViewFence(JSON.stringify(stats));
    expect(result.ok).toBe(true);
  });

  test("reports invalid JSON and invalid specs", () => {
    const broken = parseStructuredViewFence("{ type: table");
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toContain("not valid JSON");
    const invalid = parseStructuredViewFence(JSON.stringify({ type: "stats", items: [] }));
    expect(invalid.ok).toBe(false);
  });

  test("matches the fence language", () => {
    expect(isStructuredViewFenceLanguage("stave-view")).toBe(true);
    expect(isStructuredViewFenceLanguage(" Stave-View ")).toBe(true);
    expect(isStructuredViewFenceLanguage("json")).toBe(false);
    expect(isStructuredViewFenceLanguage(undefined)).toBe(false);
  });
});

describe("structured view tool result", () => {
  const parsed = parseStructuredViewSpec(table);
  if (!parsed.ok) throw new Error(parsed.error);
  const spec: StructuredViewSpec = parsed.spec;
  const result = buildStructuredViewToolResult(spec);

  test("carries the versioned view and a summary for the agent", () => {
    expect(result.staveStructuredView).toEqual({ version: 1, spec });
    expect(result.message).toContain("3 rows x 3 columns");
    expect(result.message).toContain('"job":"lint"');
    expect(summarizeStructuredView(spec)).toContain("sorted by minutes desc");
  });

  test("reads the text block a Claude turn records", () => {
    expect(parseStructuredViewToolOutput(JSON.stringify(result))).toEqual(spec);
  });

  test("reads the serialised MCP result a Codex turn records", () => {
    const codexOutput = JSON.stringify({
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    });
    expect(parseStructuredViewToolOutput(codexOutput)).toEqual(spec);
    const textOnly = JSON.stringify({ content: [{ type: "text", text: JSON.stringify(result) }] });
    expect(parseStructuredViewToolOutput(textOnly)).toEqual(spec);
  });

  test("ignores outputs without a valid view", () => {
    expect(parseStructuredViewToolOutput(null)).toBeNull();
    expect(parseStructuredViewToolOutput("plain text")).toBeNull();
    expect(
      parseStructuredViewToolOutput(JSON.stringify({ staveStructuredView: { version: 2, spec } })),
    ).toBeNull();
    expect(
      parseStructuredViewToolOutput(
        JSON.stringify({ staveStructuredView: { version: 1, spec: { type: "graph" } } }),
      ),
    ).toBeNull();
  });

  test("recognises decorated tool names", () => {
    expect(isStructuredViewToolName("mcp__stave-local-mcp__stave_show_view")).toBe(true);
    expect(isStructuredViewToolName("stave-local-mcp.stave_show_view")).toBe(true);
    expect(isStructuredViewToolName("stave_show_view_extra")).toBe(false);
  });
});
