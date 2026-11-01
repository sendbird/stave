import { describe, expect, test } from "bun:test";
import {
  COMPOSER_SIDE_QUESTION_SLOT,
  fitComposerToolbar,
} from "@/lib/composer-toolbar-fit";

// The 1024px window with the Information panel open: a 364px row holding the
// model picker (156), Attach and Send (72) and the toolbar controls.
const narrow = {
  availableWidth: 364,
  fixedWidth: 156 + 8 + 72,
  gap: 8,
  trayWidth: 36,
  trayAlwaysShown: false,
};
const items = [
  { id: "providerMode", width: 75 },
  { id: "secrets", width: 89 },
  { id: "macro", width: 88 },
  { id: "compare", width: 105 },
  { id: "runtime", width: 36 },
  { id: COMPOSER_SIDE_QUESTION_SLOT, width: 123, compactWidth: 40 },
];

describe("fitComposerToolbar", () => {
  test("keeps every control when the row has room", () => {
    expect(fitComposerToolbar({ ...narrow, availableWidth: 1200, items })).toEqual({ compacted: [], collapsed: [] });
  });

  test("folds the lowest-priority controls first until the row fits on one line", () => {
    const { collapsed } = fitComposerToolbar({ ...narrow, items });
    expect(collapsed).toEqual(["compare", "macro", "secrets", "runtime", "providerMode"]);
    // The side question is a direct action: it never leaves the row.
    expect(collapsed).not.toContain(COMPOSER_SIDE_QUESTION_SLOT);
    // What is left fits beside the `⋯` that now holds the rest.
    const kept = items.filter((item) => !collapsed.includes(item.id));
    const width = narrow.fixedWidth + kept.reduce((sum, item) => sum + 8 + (item.compactWidth ?? item.width), 0) + 8 + 36;
    expect(width).toBeLessThanOrEqual(narrow.availableWidth);
    expect(kept.map((item) => item.id)).toEqual([COMPOSER_SIDE_QUESTION_SLOT]);
  });

  test("a control holding a deliberate state leaves last", () => {
    const roomForRuntime = narrow.fixedWidth + 8 + 40 + 8 + 36 + 8 + 36;
    const { collapsed } = fitComposerToolbar({ ...narrow, availableWidth: roomForRuntime, items, activeIds: ["runtime"] });
    expect(collapsed).toEqual(["compare", "macro", "secrets", "providerMode"]);
    expect(collapsed).not.toContain("runtime");
  });

  test("counts the `⋯` the user's demoted controls already put on the row", () => {
    const roomForAll = narrow.fixedWidth + 8 + 75;
    const one = [{ id: "providerMode", width: 75 }];
    expect(fitComposerToolbar({ ...narrow, availableWidth: roomForAll, items: one }).collapsed).toEqual([]);
    expect(fitComposerToolbar({ ...narrow, availableWidth: roomForAll, items: one, trayAlwaysShown: true }).collapsed)
      .toEqual(["providerMode"]);
  });

  test("never folds the controls outside the drop order and tolerates sub-pixel rounding", () => {
    expect(fitComposerToolbar({ ...narrow, availableWidth: 10, items: [{ id: "model-extra", width: 50 }] }).collapsed).toEqual([]);
    const exact = narrow.fixedWidth + 8 + 75;
    expect(fitComposerToolbar({ ...narrow, availableWidth: exact - 0.4, items: [{ id: "providerMode", width: 75 }] }).collapsed)
      .toEqual([]);
  });

  test("the side question drops its label before any control leaves", () => {
    const withCompact = items;
    // Everything fits once the label goes: nothing folds.
    const roomy = narrow.fixedWidth + withCompact.reduce((sum, item) => sum + 8 + (item.compactWidth ?? item.width), 0);
    expect(fitComposerToolbar({ ...narrow, availableWidth: roomy, items: withCompact }))
      .toEqual({ compacted: [COMPOSER_SIDE_QUESTION_SLOT], collapsed: [] });
    // Tighter still, the other controls leave and the glyph stays.
    const tight = fitComposerToolbar({ ...narrow, items: withCompact });
    expect(tight.compacted).toEqual([COMPOSER_SIDE_QUESTION_SLOT]);
    expect(tight.collapsed).not.toContain(COMPOSER_SIDE_QUESTION_SLOT);
  });
});
