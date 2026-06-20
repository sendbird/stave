import { describe, expect, it } from "bun:test";

import {
  getLensStyleCaptureScript,
  LENS_CAPTURED_STYLE_KEYS,
} from "../electron/main/browser/browser-style-capture";

type StyleMap = Record<string, string>;
type MockElement = {
  nodeType: number;
  parentElement: MockElement | null;
};

function runStyleCapture(args: {
  element: MockElement;
  styles: Map<MockElement, StyleMap>;
}): Record<string, string> {
  const capture = new Function(
    "window",
    "Node",
    "el",
    `${getLensStyleCaptureScript()}; return staveComputedStylesForElement(el);`,
  ) as (
    window: {
      getComputedStyle: (element: MockElement) => {
        getPropertyValue: (property: string) => string;
      };
    },
    node: { ELEMENT_NODE: number },
    element: MockElement,
  ) => Record<string, string>;

  return capture(
    {
      getComputedStyle: (element) => ({
        getPropertyValue: (property) =>
          args.styles.get(element)?.[property] ?? "",
      }),
    },
    { ELEMENT_NODE: 1 },
    args.element,
  );
}

describe("Lens style capture", () => {
  it("keeps background image in the captured style keys", () => {
    expect(LENS_CAPTURED_STYLE_KEYS).toContain("backgroundImage");
  });

  it("reports parent-backed visible background for transparent elements", () => {
    const parent: MockElement = { nodeType: 1, parentElement: null };
    const child: MockElement = { nodeType: 1, parentElement: parent };
    const result = runStyleCapture({
      element: child,
      styles: new Map([
        [child, { "background-color": "rgba(0, 0, 0, 0)" }],
        [parent, { "background-color": "rgb(247, 247, 247)" }],
      ]),
    });

    expect(result.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(result.visibleBackgroundColor).toBe("rgb(247, 247, 247)");
  });

  it("composites translucent element backgrounds over ancestors", () => {
    const parent: MockElement = { nodeType: 1, parentElement: null };
    const child: MockElement = { nodeType: 1, parentElement: parent };
    const result = runStyleCapture({
      element: child,
      styles: new Map([
        [child, { "background-color": "rgba(255, 0, 0, 0.5)" }],
        [parent, { "background-color": "rgb(0, 0, 255)" }],
      ]),
    });

    expect(result.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    expect(result.visibleBackgroundColor).toBe("rgb(128, 0, 128)");
  });

  it("does not guess visible background when a color cannot be parsed", () => {
    const element: MockElement = { nodeType: 1, parentElement: null };
    const result = runStyleCapture({
      element,
      styles: new Map([[element, { "background-color": "oklch(0.97 0 0)" }]]),
    });

    expect(result.backgroundColor).toBe("oklch(0.97 0 0)");
    expect(result.visibleBackgroundColor).toBeUndefined();
  });
});
