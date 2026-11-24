import { describe, expect, test } from "bun:test";
import {
  runStructuredViewTool,
  STRUCTURED_VIEW_TOOL_DESCRIPTION,
} from "../electron/main/structured-view-tool";
import { isAlwaysAllowedStaveLocalMcpTool } from "../electron/providers/stave-local-mcp-approval";
import { READ_ONLY_DELEGATION_STAVE_TOOLS } from "@/lib/runs/read-only-delegation";
import { parseStructuredViewToolOutput } from "@/lib/structured-view/view-spec";
import { toToolDisplayName } from "@/lib/tool-display-name";

const view = {
  type: "stats",
  title: "This week",
  items: [
    { label: "Deploys", value: 12, previous: 9 },
    { label: "Incidents", value: 1, previous: 3, goodDirection: "down" },
  ],
};

describe("stave_show_view handler", () => {
  test("returns the view in the text block and the structured content", () => {
    const response = runStructuredViewTool(view);
    expect(response.isError).toBeUndefined();
    expect(response.content).toHaveLength(1);
    const text = response.content[0]!.text;
    // Compact JSON: the agent reads this result too.
    expect(text).not.toContain("\n");
    const body = JSON.parse(text);
    expect(body.staveStructuredView).toEqual({ version: 1, spec: view });
    expect(body.message).toContain("Stats \"This week\": Deploys 12, Incidents 1.");
    expect(response.structuredContent).toEqual(body);
    // Claude records the text block, Codex the whole serialised result.
    expect(parseStructuredViewToolOutput(text)).toEqual(view);
    expect(parseStructuredViewToolOutput(JSON.stringify(response))).toEqual(view);
  });

  test("answers an invalid view with an error the agent can act on", () => {
    const response = runStructuredViewTool({ type: "stats", items: [{ label: "A" }] });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toBeUndefined();
    expect(response.content[0]!.text).toContain("items.0.value");
  });

  test("runs without approval, under read-only turns, with a readable name", () => {
    expect(isAlwaysAllowedStaveLocalMcpTool("mcp__stave-local-mcp__stave_show_view")).toBe(true);
    expect(READ_ONLY_DELEGATION_STAVE_TOOLS).toContain("stave_show_view");
    expect(toToolDisplayName("mcp__stave-local-mcp__stave_show_view")).toBe("Show data view");
  });

  test("the description routes bespoke pages to stave_render_html", () => {
    expect(STRUCTURED_VIEW_TOOL_DESCRIPTION).toContain("stave_render_html");
    expect(STRUCTURED_VIEW_TOOL_DESCRIPTION).toContain("nothing in a view is fetched, queried or executed");
  });
});
