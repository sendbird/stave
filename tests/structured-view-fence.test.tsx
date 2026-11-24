import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageResponse } from "@/components/ai-elements/message";
import { applyAppLocale } from "@/i18n";

applyAppLocale("en");

function renderResponse(content: string, isStreaming = false): string {
  return renderToStaticMarkup(createElement(MessageResponse, { isStreaming }, content));
}

const stats = JSON.stringify({
  type: "stats",
  title: "This week",
  items: [{ label: "Deploys", value: 12 }],
});

describe("stave-view fences", () => {
  test("a finished fence becomes a view, not code", () => {
    const html = renderResponse(`Here it is:\n\n\`\`\`stave-view\n${stats}\n\`\`\`\n`);
    expect(html).toContain('data-structured-view="stats"');
    // The renderer loads lazily; the placeholder holds the place meanwhile.
    expect(html).toContain("Drawing the view…");
    expect(html).not.toContain("&quot;Deploys&quot;");
  });

  test("a fence still being written shows the placeholder, not growing JSON", () => {
    const html = renderResponse(`Here it is:\n\n\`\`\`stave-view\n{"type": "stats", "items": [`, true);
    expect(html).toContain("data-structured-view-placeholder");
    expect(html).not.toContain("data-structured-view-error");
  });

  test("an invalid fence shows its source and the reason", () => {
    const html = renderResponse("```stave-view\n{\"type\": \"graph\"}\n```\n");
    expect(html).toContain("data-structured-view-error");
    expect(html).toContain("This view could not be drawn, so its source is shown");
    expect(html).toContain("Unknown view type");
    expect(html).not.toContain("data-structured-view=");
  });

  test("a fence that is not JSON shows its source and the reason", () => {
    const html = renderResponse("```stave-view\nnot json\n```\n");
    expect(html).toContain("not valid JSON");
  });
});
