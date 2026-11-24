import { useLayoutEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { runStructuredViewTool } from "../../../electron/main/structured-view-tool";
import type { ToolUsePart } from "@/types/chat";

const params = new URLSearchParams(window.location.search);

const SUITES = ["core", "renderer", "electron", "cli", "server", "docs", "site", "evals"];

const tableView = {
  type: "table",
  title: "Test suites by duration",
  summary: "Last CI run on main. Sort, search and export from the table.",
  columns: [
    { key: "suite", label: "Suite" },
    { key: "tests", label: "Tests", type: "number", format: "number" },
    { key: "coverage", label: "Coverage", type: "number", format: "ratio" },
    { key: "seconds", label: "Duration", type: "number", format: "duration" },
    { key: "flaky", label: "Flaky", type: "boolean", align: "center" },
    { key: "updated", label: "Updated", type: "date" },
  ],
  rows: Array.from({ length: 32 }, (_, index) => ({
    suite: `${SUITES[index % SUITES.length]}-${Math.floor(index / SUITES.length) + 1}`,
    tests: 40 + ((index * 137) % 1200),
    coverage: 0.52 + ((index * 7) % 45) / 100,
    seconds: (4 + ((index * 53) % 190)) * 1000,
    flaky: index % 5 === 0,
    updated: `2026-11-${String(1 + (index % 24)).padStart(2, "0")}`,
  })),
  sort: { key: "seconds", direction: "desc" },
};

const chartView = {
  type: "chart",
  title: "Turns per day",
  summary: "Claude and Codex turns over the last two weeks.",
  chart: {
    type: "series",
    data: Array.from({ length: 14 }, (_, index) => ({
      label: `11-${String(index + 10).padStart(2, "0")}`,
      claude: 40 + ((index * 17) % 35),
      codex: 18 + ((index * 11) % 28),
    })),
    series: [
      { key: "claude", label: "Claude", kind: "bar" },
      { key: "codex", label: "Codex", kind: "bar" },
    ],
    options: { stacked: true },
  },
};

const statsView = {
  type: "stats",
  title: "This week",
  items: [
    { label: "Merged PRs", value: 42, previous: 35, trend: [28, 31, 35, 33, 39, 42] },
    { label: "p95 turn latency", value: 8400, previous: 9600, goodDirection: "down", format: "duration" },
    { label: "Failed runs", value: 3, delta: "+2", status: "danger", note: "2 from one flaky suite" },
    { label: "Token spend", value: 1840, format: "currency:USD", previous: 2100, goodDirection: "down" },
  ],
};

const timelineView = {
  type: "timeline",
  title: "Release plan",
  items: [
    { label: "Spec", start: "2026-11-02", end: "2026-11-09", row: "Design", tone: "success", progress: 1 },
    { label: "Build", start: "2026-11-08", end: "2026-11-27", row: "Engineering", progress: 0.6 },
    { label: "Docs", start: "2026-11-20", end: "2026-11-30", row: "Docs", group: "Docs" },
    { label: "Release", start: "2026-12-01", end: "2026-12-03", row: "Release", tone: "warning" },
  ],
  now: "2026-11-24",
};

const heatmapView = {
  type: "heatmap",
  title: "Failures by weekday and hour",
  cells: ["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((row, rowIndex) =>
    ["09", "12", "15", "18"].map((column, columnIndex) => ({
      row,
      column,
      value: (rowIndex * 3 + columnIndex * 5) % 9,
    })),
  ),
  options: { showValues: true },
};

function viewPart(id: string, view: unknown): ToolUsePart {
  return {
    type: "tool_use",
    toolUseId: `preview-view-${id}`,
    toolName: "mcp__stave-local-mcp__stave_show_view",
    input: JSON.stringify({ view }),
    // The text block a Claude turn records.
    output: runStructuredViewTool(view).content[0]!.text,
    state: "output-available",
  };
}

const REPLY = `The views above summarise the run. The same view can also be written as a fence:

\`\`\`stave-view
{"type": "stats", "items": [{"label": "Open issues", "value": 128, "delta": "-6", "status": "success"}, {"label": "Median review time", "value": "3.2 h"}]}
\`\`\`

An invalid fence keeps its source:

\`\`\`stave-view
{"type": "graph", "nodes": []}
\`\`\`
`;

const parts = [
  viewPart("stats", statsView),
  viewPart("table", tableView),
  viewPart("chart", chartView),
  viewPart("timeline", timelineView),
  viewPart("heatmap", heatmapView),
  { type: "text" as const, text: REPLY },
];

/**
 * One finished reply with every structured view type, drawn from tool results
 * and fences. `theme=dark` switches theme; `only=<type>` keeps one view.
 */
export function StructuredViewPreview() {
  const [dark] = useState(() => params.get("theme") === "dark");
  const only = params.get("only");
  useLayoutEffect(() => {
    applyCustomTheme({ theme: null });
    applyThemeClass({ enabled: dark });
  }, [dark]);
  const shown = only
    ? parts.filter((part) => part.type === "tool_use" && part.toolUseId === `preview-view-${only}`)
    : parts;
  return (
    <div className={sx(styles.page)}>
      <div className={sx(styles.column)} data-preview-reply="">
        <AssistantMessageBody
          taskId="structured-view-preview"
          messageId="reply"
          streamingEnabled
          traceExpansionMode="manual"
          showInterimMessages
          message={{
            role: "assistant",
            content: REPLY,
            parts: shown,
            isStreaming: false,
          }}
        />
      </div>
    </div>
  );
}

const styles = stylex.create({
  page: {
    backgroundColor: vars["--aui-color-canvas"],
    color: vars["--aui-color-text"],
    minHeight: "100vh",
    padding: vars["--aui-space-24"],
  },
  column: { maxWidth: "48rem", marginInline: "auto", minWidth: 0 },
});
