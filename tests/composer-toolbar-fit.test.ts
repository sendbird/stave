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
  // The side question: an icon button the width of Attach.
  { id: COMPOSER_SIDE_QUESTION_SLOT, width: 32 },
];

describe("fitComposerToolbar", () => {
  test("keeps every control when the row has room", () => {
    expect(fitComposerToolbar({ ...narrow, availableWidth: 1200, items })).toEqual({ collapsed: [] });
  });

  test("folds the lowest-priority controls first until the row fits on one line", () => {
    const { collapsed } = fitComposerToolbar({ ...narrow, items });
    expect(collapsed).toEqual(["compare", "macro", "secrets", "runtime", "providerMode"]);
    // The side question is a direct action: it never leaves the row.
    expect(collapsed).not.toContain(COMPOSER_SIDE_QUESTION_SLOT);
    // What is left fits beside the `⋯` that now holds the rest.
    const kept = items.filter((item) => !collapsed.includes(item.id));
    const width = narrow.fixedWidth + kept.reduce((sum, item) => sum + 8 + item.width, 0) + 8 + 36;
    expect(width).toBeLessThanOrEqual(narrow.availableWidth);
    expect(kept.map((item) => item.id)).toEqual([COMPOSER_SIDE_QUESTION_SLOT]);
  });

  test("a control holding a deliberate state leaves last", () => {
    const roomForRuntime = narrow.fixedWidth + 8 + 32 + 8 + 36 + 8 + 36;
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

  test("the side question stays on the row however little room there is", () => {
    const tight = fitComposerToolbar({ ...narrow, availableWidth: 0, items });
    expect(tight.collapsed).not.toContain(COMPOSER_SIDE_QUESTION_SLOT);
    expect(tight.collapsed).toEqual(["compare", "macro", "secrets", "runtime", "providerMode"]);
  });
});
