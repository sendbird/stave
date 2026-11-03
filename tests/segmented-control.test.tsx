import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SegmentedControl } from "@/components/system/SegmentedControl";

/** `{ label, checked }` for every radio in server-rendered markup. */
export function radios(markup: string): Array<{ label: string; checked: boolean }> {
  return [...markup.matchAll(/<(?:span|button)[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(.*?)<\/(?:span|button)><input/g)].map((match) => ({
    label: match[2]!.replace(/<[^>]+>/g, "").trim(),
    checked: match[1] === "true",
  }));
}

describe("SegmentedControl", () => {
  const options = [
    { value: "list", label: "List" },
    { value: "board", label: "Board", count: 3 },
    { value: "table", label: "Table", disabled: true },
  ] as const;

  test("is a named radiogroup with exactly one checked radio", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<string>, {
        "aria-label": "Layout",
        value: "board",
        onValueChange: () => {},
        options: [...options],
      }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Layout"');
    expect(radios(html)).toEqual([
      { label: "List", checked: false },
      { label: "Board3", checked: true },
      { label: "Table", checked: false },
    ]);
    // A roving group: only the checked radio is in the Tab order.
    const tabbable = [...html.matchAll(/role="radio"[^>]*tabindex="0"/g)];
    expect(tabbable.length).toBeLessThanOrEqual(1);
    // A disabled option is announced as disabled, never as a pressed toggle.
    expect(html).not.toContain("aria-pressed");
    expect(html).toMatch(/role="radio"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*role="radio"/);
  });

  test("keeps the caller's value type, including an undefined default option", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<string | undefined>, {
        "aria-label": "Effort",
        value: undefined,
        onValueChange: () => {},
        options: [
          { value: undefined, label: "Default" },
          { value: "high", label: "High" },
        ],
      }),
    );
    expect(radios(html)).toEqual([
      { label: "Default", checked: true },
      { label: "High", checked: false },
    ]);
  });

  test("icon-only segments take their name from the label", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<string>, {
        "aria-label": "Diff layout",
        iconOnly: true,
        value: "split",
        onValueChange: () => {},
        options: [
          { value: "unified", label: "Unified diff", icon: createElement("svg") },
          { value: "split", label: "Split diff", icon: createElement("svg") },
        ],
      }),
    );
    expect(html).toContain('aria-label="Unified diff"');
    expect(html).toContain('aria-label="Split diff"');
  });
});
