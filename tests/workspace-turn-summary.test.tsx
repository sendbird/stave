import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceTurnSummary } from "@/components/layout/WorkspaceTurnSummary";

describe("WorkspaceTurnSummary", () => {
  test("prioritizes the outcome and keeps supporting detail collapsed", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceTurnSummary, {
        summary: {
          turnId: "turn-1",
          taskId: "task-1",
          taskTitle: "Modernize information",
          generatedAt: "2026-07-25T00:00:00.000Z",
          model: "gpt-5.6-sol",
          requestSummary: "Make the Information panel easier to scan.",
          workSummary: "Reorganized the panel around the latest outcome.",
        },
      }),
    );

    expect(html).toContain("Reorganized the panel around the latest outcome.");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Details");
    expect(html.indexOf("Reorganized")).toBeLessThan(
      html.indexOf("Original request"),
    );
  });
});
