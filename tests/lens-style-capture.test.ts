import { describe, expect, it } from "bun:test";

import {
  getLensBoxModelScript,
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

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function runBoxModel(args: {
  styles: StyleMap;
  rect: BoxRect;
  tagName?: string;
  id?: string;
  classList?: string[];
}) {
  const el = {
    nodeType: 1,
    tagName: args.tagName ?? "DIV",
    id: args.id ?? "",
    classList: args.classList ?? [],
    parentElement: null,
    getBoundingClientRect: () => args.rect,
  };
  const compute = new Function(
    "window",
    "Node",
    "document",
    "el",
    `${getLensBoxModelScript()}; return staveBoxModelForElement(el);`,
  ) as (
    window: {
      getComputedStyle: () => { getPropertyValue: (property: string) => string };
    },
    node: { ELEMENT_NODE: number },
    document: unknown,
    element: unknown,
  ) => {
    selector: string;
    tagName: string;
    rect: BoxRect;
    content: { width: number; height: number };
    padding: { top: number; right: number; bottom: number; left: number };
    border: { top: number; right: number; bottom: number; left: number };
    margin: { top: number; right: number; bottom: number; left: number };
    boxSizing: string;
  };

  return compute(
    {
      getComputedStyle: () => ({
        getPropertyValue: (property: string) => args.styles[property] ?? "",
      }),
    },
    { ELEMENT_NODE: 1 },
    { documentElement: {} },
    el,
  );
}

function runMeasure(a: object, b: object) {
  const measure = new Function(
    "a",
    "b",
    `${getLensBoxModelScript()}; return staveMeasureRects(a, b);`,
  ) as (
    a: object,
    b: object,
  ) => {
    horizontal: number;
    vertical: number;
    overlapX: boolean;
    overlapY: boolean;
  };
  return measure(a, b);
}

describe("Lens box model capture", () => {
  it("breaks padding, border and margin into per-side values", () => {
    const model = runBoxModel({
      id: "box",
      rect: { x: 10, y: 20, width: 100, height: 50 },
      styles: {
        "padding-top": "8px",
        "padding-right": "8px",
        "padding-bottom": "8px",
        "padding-left": "8px",
        "border-top-width": "2px",
        "border-right-width": "2px",
        "border-bottom-width": "2px",
        "border-left-width": "2px",
        "margin-top": "4px",
        "margin-right": "6px",
        "margin-bottom": "4px",
        "margin-left": "6px",
        "box-sizing": "content-box",
      },
    });

    expect(model.selector).toBe("#box");
    expect(model.padding).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
    expect(model.border).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(model.margin).toEqual({ top: 4, right: 6, bottom: 4, left: 6 });
    // content = border-box minus border and padding on each axis.
    expect(model.content).toEqual({ width: 80, height: 30 });
    expect(model.boxSizing).toBe("content-box");
  });

  it("measures the gap between two non-overlapping elements", () => {
    const result = runMeasure(
      { left: 0, right: 100, top: 0, bottom: 50 },
      { left: 150, right: 250, top: 0, bottom: 50 },
    );

    expect(result.horizontal).toBe(50);
    expect(result.vertical).toBe(0);
    expect(result.overlapX).toBe(false);
    expect(result.overlapY).toBe(true);
  });
});
