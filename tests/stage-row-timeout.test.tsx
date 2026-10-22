import { afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StageRow } from "@/components/workflows/StageRow";
import { applyAppLocale } from "@/i18n";
import { createActionStage } from "@/lib/workflows/library";

afterEach(() => {
  applyAppLocale("en");
});

const noop = () => {};

function renderWatchChecks() {
  return renderToStaticMarkup(createElement(StageRow, {
    stage: createActionStage("watch-checks", ["watch-checks"]),
    index: 1,
    count: 2,
    asksFirst: false,
    expanded: true,
    issues: new Map(),
    onToggleExpanded: noop,
    onChange: noop,
    onToggleSignOff: noop,
    onMove: noop,
    onDuplicate: noop,
    onRemove: noop,
    dragHandlers: { onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDrop: noop },
  }));
}

test("a watch-checks timeout reads in the shared duration words, in either language", () => {
  const english = renderWatchChecks();
  expect(english).toContain(">15m<");
  expect(english).toContain(">2h<");
  applyAppLocale("ko");
  const korean = renderWatchChecks();
  expect(korean).toContain(">15분<");
  expect(korean).toContain(">2시간<");
  expect(korean).not.toContain(">2h<");
});
