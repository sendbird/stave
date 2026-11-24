# Data Views In The Conversation

## Summary

An agent can show data as a table, chart, stat tiles, timeline, or heatmap
right in its reply. Instead of writing a page, it describes the view as data
and calls the `stave_show_view` tool, or writes the same description in a
`stave-view` code block. Stave draws the view with its own components, so it
follows your theme and needs no frame.

A view carries every value inline. Nothing in a view is fetched, queried, or
run: Stave only lays out the numbers and text the agent wrote.

## When To Use It

- Ask for data you would rather scan than read: "list the slowest test suites",
  "chart turns per day by provider", "show this week's numbers".
- Sort and search a table without asking the agent again.
- Keep the view with the reply in the conversation history.

Agents also show a view without being asked when a reply holds a table,
numbers across groups or over time, a few headline metrics, a schedule, or a
matrix. Short answers, code, and plain lists stay as text.

For a bespoke layout, a UI mockup, a diagram, or an interactive page, agents
use [Inline HTML pages](inline-renders.md) instead.

## Before You Start

- Views work in every provider that runs inside Stave: Claude, Codex, Cursor,
  and Kiro. The tool comes from Stave's built-in Local MCP server, so
  [Local MCP](local-mcp-user-guide.md) must be on (it is by default).
- The tool needs no approval, including in read-only modes. It saves nothing
  and touches no files; the view is kept with the turn's tool result.

## Quick Start

1. Ask for a data result, for example "Show the test suites by duration as a
   table."
2. The trace shows a **Show data view** step, and the view appears above the
   agent's reply, in the same place as inline HTML pages.
3. Sort, search, or page through a table, or hover a chart for values.

## The View Types

| Type | What you see | What you can do |
| --- | --- | --- |
| Table | Up to 500 rows and 40 columns, 10 rows per page | Select a column header to sort, type in **Filter rows** to keep rows containing every word, move between pages, and **Export CSV** for the rows on screen in their current order |
| Chart | A line, area, bar, series, pie, bar list, interval, or heatmap chart | Hover or use the arrow keys for values; some charts offer a table view |
| Stats | Up to 12 headline numbers, each with an optional change, trend line, and note | Read the change colored by its meaning: fewer incidents read as good news |
| Timeline | Bars on a date axis, grouped by row, with an optional "now" line | Hover a bar for its dates |
| Heatmap | A grid of rows and columns shaded by value | Hover a cell for its value |

A title and a short summary can sit above any view. Numbers, percentages,
durations and currencies use the formats your display language uses.

## A View Written In A Reply

An agent that cannot call the tool can write the same description as a code
block whose language is `stave-view`:

````markdown
```stave-view
{"type": "stats", "items": [{"label": "Open issues", "value": 128, "delta": "-6", "status": "success"}]}
```
````

While the reply is still being written, the block shows **Drawing the view…**
instead of growing JSON. A block that is not a valid view shows its source,
with a note saying what is wrong.

## Limits

- A view must stay under 256 KB. A table holds up to 500 rows and 40 columns,
  stats up to 12 tiles, a timeline up to 200 items, and a heatmap up to 2,000
  cells. Agents aggregate larger data first and summarize the rest in text.
- Views hold data only: no links, scripts, or styles of their own. They do not
  load live data or update after the reply.
- The agent reads back its own view in the tool result, so a large view costs
  its size in the agent's context once more.

## Troubleshooting

- **The agent wrote a table in Markdown instead.** Markdown tables of plain
  text still sort, and get a filter past 10 rows. Ask for a data view when you
  want paging, export, or a chart.
- **"This view could not be drawn, so its source is shown".** The block's JSON
  is not a valid view. The note names the field to fix; ask the agent to
  correct it.
- **Nothing appears and the trace step failed.** The tool rejected the view and
  told the agent why; the agent usually retries with a corrected view.
