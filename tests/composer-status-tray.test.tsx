import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shouldCollapseStatusTray } from "@/components/ai-elements/composer-status-tray";
import {
  MACRO_QUICK_PICK_LIMIT,
  MacroQuickPicks,
} from "@/components/session/MacroQuickPicks";
import type { Macro } from "@/lib/macros/types";

function macro(overrides: Partial<Macro> & { id: string; label: string }) {
  return {
    slug: overrides.id,
    body: "body",
    insertMode: "replace" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } satisfies Macro;
}

describe("shouldCollapseStatusTray", () => {
  test("keeps the row while the workspace line still fits beside it", () => {
    expect(
      shouldCollapseStatusTray({
        innerWidthPx: 960,
        leadingWidthPx: 300,
        rowWidthPx: 460,
        itemCount: 5,
      }),
    ).toBe(false);
  });

  test("folds once the row would crowd the workspace line", () => {
    expect(
      shouldCollapseStatusTray({
        innerWidthPx: 700,
        leadingWidthPx: 300,
        rowWidthPx: 460,
        itemCount: 5,
      }),
    ).toBe(true);
  });

  test("falls back to an estimate before the row has been measured", () => {
    // 5 * 96 + 12 + 300 = 792, so a 700px bar folds and a 900px one does not.
    expect(
      shouldCollapseStatusTray({
        innerWidthPx: 700,
        leadingWidthPx: 300,
        rowWidthPx: null,
        itemCount: 5,
      }),
    ).toBe(true);
    expect(
      shouldCollapseStatusTray({
        innerWidthPx: 900,
        leadingWidthPx: 300,
        rowWidthPx: null,
        itemCount: 5,
      }),
    ).toBe(false);
  });

  test("never folds an empty set", () => {
    expect(
      shouldCollapseStatusTray({
        innerWidthPx: 10,
        leadingWidthPx: 300,
        rowWidthPx: 460,
        itemCount: 0,
      }),
    ).toBe(false);
  });
});

describe("MacroQuickPicks", () => {
  test("shows the pinned model and effort in the entry's title", () => {
    const html = renderToStaticMarkup(
      createElement(MacroQuickPicks, {
        macros: [
          macro({
            id: "review",
            label: "Review diff",
            runtime: {
              providerId: "claude-code",
              model: "opus-5",
              effort: "high",
            },
          }),
        ],
        onSelect: () => {},
      }),
    );

    expect(html).toContain('data-macro-quick-pick="review"');
    expect(html).toContain('aria-label="Insert macro Review diff"');
    expect(html).toContain("Review diff · !review · opus-5 · high");
    // The rest state is a monogram; the label rides the wing reveal, which the
    // wing's density provider turns into a fading caption.
    expect(html).toContain(">R<");
    expect(html).toContain("Review diff</button>");
  });

  test("caps the wing at the quick-pick limit", () => {
    const html = renderToStaticMarkup(
      createElement(MacroQuickPicks, {
        macros: Array.from({ length: MACRO_QUICK_PICK_LIMIT + 3 }, (_, i) =>
          macro({ id: `m${i}`, label: `Macro ${i}` }),
        ),
        onSelect: () => {},
      }),
    );

    expect((html.match(/data-macro-quick-pick=/g) ?? []).length).toBe(
      MACRO_QUICK_PICK_LIMIT,
    );
  });

  test("renders nothing when there are no macros", () => {
    expect(
      renderToStaticMarkup(
        createElement(MacroQuickPicks, { macros: [], onSelect: () => {} }),
      ),
    ).toBe("");
  });
});
