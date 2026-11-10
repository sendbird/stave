import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarsDecisionDock, TarsWaitingRecord, tarsDockIndex } from "../src/components/tars/TarsDecisionDock";

describe("Tars waiting queue", () => {
  test("keeps a selected identity on refresh and advances from its slot when settled or stale", () => {
    expect(tarsDockIndex(["a", "b", "c"], null)).toBe(0);
    expect(tarsDockIndex(["a", "b", "c"], { id: "b", index: 1 })).toBe(1);
    expect(tarsDockIndex(["b", "c"], { id: "b", index: 1 })).toBe(0);
    expect(tarsDockIndex(["a", "c"], { id: "b", index: 1 })).toBe(1);
    expect(tarsDockIndex(["a"], { id: "c", index: 1 })).toBe(0);
    expect(tarsDockIndex([], { id: "a", index: 0 })).toBe(-1);
  });

  test("history is readable and has only a review entry, without a duplicate form", () => {
    const html = renderToStaticMarkup(createElement(TarsWaitingRecord, { id: "ask:1:0", subject: "Which repository?", onOpen() {} }));
    expect(html).toContain("Which repository?");
    expect(html).toContain("Review above message box");
    expect(html).not.toContain("radiogroup");
    expect(html).not.toContain("data-tars-decision-submit");
  });

  test("an empty queue takes no composer space", () => {
    expect(renderToStaticMarkup(createElement(TarsDecisionDock, { items: [], busy: false, onEmptyFocus() {}, onDismiss() {} }))).toBe("");
  });
});
