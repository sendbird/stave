import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import {
  estimateResponseLines,
  RESPONSE_CHARS_PER_LINE,
  RESPONSE_COLLAPSE_MIN_LINES,
  shouldCollapseResponse,
} from "@/components/ai-elements/collapsible-response.utils";
import {
  PANEL_MESSAGE_CODE_FONT_SIZE_MAX,
  PANEL_MESSAGE_FONT_SIZE_MAX,
  scaleMessageCodeFontSize,
  scaleMessageFontSize,
} from "@/components/ai-elements/message-text-scale";

describe("estimateResponseLines", () => {
  test("drops blank lines and wraps long prose", () => {
    const long = "x".repeat(RESPONSE_CHARS_PER_LINE * 2 + 1);
    expect(estimateResponseLines(`one\n\n\ntwo\n${long}`)).toBe(5);
  });

  test("counts fenced lines one each, however long, and keeps blank lines inside a fence", () => {
    const code = "y".repeat(RESPONSE_CHARS_PER_LINE * 3);
    expect(estimateResponseLines(`\`\`\`ts\n${code}\n\nz\n\`\`\``)).toBe(5);
  });
});

describe("shouldCollapseResponse", () => {
  const lines = (count: number) => Array.from({ length: count }, (_, index) => `- item ${index}`).join("\n");

  test("collapses only past the threshold", () => {
    expect(shouldCollapseResponse(lines(RESPONSE_COLLAPSE_MIN_LINES))).toBe(false);
    expect(shouldCollapseResponse(lines(RESPONSE_COLLAPSE_MIN_LINES + 1))).toBe(true);
  });

  test("a short answer with blank-line paragraphs stays open", () => {
    expect(shouldCollapseResponse("Done.\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nTypecheck passes.")).toBe(false);
  });
});

describe("panel text scale", () => {
  test("caps the conversation sizes at the panel steps and keeps smaller settings", () => {
    expect(scaleMessageFontSize("panel", 18)).toBe(PANEL_MESSAGE_FONT_SIZE_MAX);
    expect(scaleMessageFontSize("panel", 12)).toBe(12);
    expect(scaleMessageFontSize("conversation", 18)).toBe(18);
    expect(scaleMessageCodeFontSize("panel", 14)).toBe(PANEL_MESSAGE_CODE_FONT_SIZE_MAX);
    expect(scaleMessageCodeFontSize("conversation", 14)).toBe(14);
  });
});

describe("CollapsibleResponse", () => {
  test("renders Markdown with the conversation renderer at the panel size", () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleResponse, { text: "Done:\n\n- one\n- **two**" }),
    );
    expect(html).toContain("<ul");
    expect(html).toContain("<strong");
    expect(html).toContain(`font-size:${PANEL_MESSAGE_FONT_SIZE_MAX}px`);
    expect(html).not.toContain("Show all");
  });

  test("a long answer opens collapsed behind Show all", () => {
    const text = Array.from({ length: 30 }, (_, index) => `Line ${index}`).join("\n\n");
    const html = renderToStaticMarkup(createElement(CollapsibleResponse, { text, label: "the final answer" }));
    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain("Show all");
    expect(html).toContain('aria-label="Show all of the final answer"');
    expect(html).toContain('aria-expanded="false"');
  });
});
