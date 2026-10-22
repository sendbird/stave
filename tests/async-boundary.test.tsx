import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AsyncBoundary, panelLoadState, type AsyncState } from "../src/components/system/AsyncBoundary";

function render(state: AsyncState<string[]>, onRetry?: () => void) {
  return renderToStaticMarkup(
    createElement(AsyncBoundary<string[]>, {
      state,
      onRetry,
      isEmpty: (rows) => rows.length === 0,
      empty: createElement("p", null, "Nothing here yet"),
      children: (rows) => createElement("ul", null, rows.map((row) => createElement("li", { key: row }, row))),
    }),
  );
}

describe("AsyncBoundary", () => {
  test("pending shows the loading surface in Stave's words", () => {
    const html = render({ status: "pending" });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading");
  });

  test("a failed first read is an error with Retry, never the empty state", () => {
    const html = render({ status: "error", error: new Error("EIO: i/o error") }, () => {});
    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t load this");
    expect(html).toContain("EIO: i/o error");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Nothing here yet");
  });

  test("a read that returned nothing is the empty state", () => {
    expect(render({ status: "ready", data: [] })).toContain("Nothing here yet");
  });

  test("a failed refresh keeps the last result under a notice", () => {
    const html = render({ status: "ready", data: ["plan.md"], stale: true, refreshError: new Error("locked") }, () => {});
    expect(html).toContain("plan.md");
    expect(html).toContain("Couldn&#x27;t refresh");
    expect(html).toContain("Showing the last result that loaded.");
    expect(html).toContain("locked");
  });
});

describe("panelLoadState", () => {
  test("reads a panel's own load flags as one boundary state", () => {
    expect(panelLoadState({ data: [], loaded: false, loading: true })).toEqual({ status: "pending" });
    expect(panelLoadState({ data: [], loaded: false, loading: false, error: "locked" })).toEqual({ status: "error", error: "locked" });
    // Retrying a failed first read shows the read running, not the old failure.
    expect(panelLoadState({ data: [], loaded: false, loading: true, error: "locked" })).toEqual({ status: "pending" });
    expect(panelLoadState({ data: ["a"], loaded: true, loading: true, error: "locked" })).toEqual({
      status: "ready", data: ["a"], stale: true, refreshError: "locked",
    });
    expect(panelLoadState({ data: ["a"], loaded: true, loading: true })).toEqual({ status: "ready", data: ["a"] });
    // Nothing to read from (no bridge): the panel shows what it has.
    expect(panelLoadState({ data: [], loaded: false, loading: false })).toEqual({ status: "ready", data: [] });
  });
});
