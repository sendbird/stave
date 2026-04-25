import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceShortcutChip } from "@/components/layout/WorkspaceShortcutChip";

describe("WorkspaceShortcutChip", () => {
  test("renders the modifier and label inside a single kbd chip", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceShortcutChip, {
      modifier: "⌘",
      label: "3",
    }));

    expect(html.match(/<kbd/g)?.length ?? 0).toBe(1);
    expect(html).toContain("⌘");
    expect(html).toContain("+");
    expect(html).toContain("3");
    expect(html).toContain("Keyboard shortcut ⌘+3");
  });

  test("merges caller className overrides", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceShortcutChip, {
      modifier: "Ctrl",
      label: "7",
      className: "opacity-60",
    }));

    expect(html).toContain("opacity-60");
    expect(html).toContain("Ctrl");
    expect(html).toContain("7");
  });
});
