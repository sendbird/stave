import { describe, expect, test } from "bun:test";
import {
  focusDismissibleLayer,
  shouldDismissLayerFromDocumentKeydown,
  shouldDismissLayerFromEscape,
} from "../src/lib/dismissible-layer";

describe("shouldDismissLayerFromEscape", () => {
  test("matches plain Escape presses", () => {
    expect(shouldDismissLayerFromEscape({
      key: "Escape",
      defaultPrevented: false,
    })).toBe(true);
  });

  test("ignores non-Escape keys", () => {
    expect(shouldDismissLayerFromEscape({
      key: "Enter",
      defaultPrevented: false,
    })).toBe(false);
  });

  test("respects previously prevented events", () => {
    expect(shouldDismissLayerFromEscape({
      key: "Escape",
      defaultPrevented: true,
    })).toBe(false);
  });
});

describe("focusDismissibleLayer", () => {
  test("focuses the layer when focus is outside it", () => {
    let focused = false;
    const activeElement = { id: "outside" };
    const container = {
      contains: (target: unknown) => target === container,
      focus: () => {
        focused = true;
      },
      ownerDocument: {
        get activeElement() {
          return activeElement;
        },
      },
    };

    expect(focusDismissibleLayer({ container })).toBe(true);
    expect(focused).toBe(true);
  });

  test("does not steal focus when the layer already contains it", () => {
    let focused = false;
    const activeElement = { id: "inside" };
    const container = {
      contains: (target: unknown) => target === activeElement,
      focus: () => {
        focused = true;
      },
      ownerDocument: {
        get activeElement() {
          return activeElement;
        },
      },
    };

    expect(focusDismissibleLayer({ container })).toBe(false);
    expect(focused).toBe(false);
  });

  test("returns false when the layer cannot be focused", () => {
    expect(focusDismissibleLayer({ container: {} })).toBe(false);
  });
});

describe("shouldDismissLayerFromDocumentKeydown", () => {
  test("dismisses when Escape bubbles from outside the layer", () => {
    const target = { id: "outside" };
    const container = {
      contains: (candidate: unknown) => candidate === container,
    };

    expect(shouldDismissLayerFromDocumentKeydown({
      key: "Escape",
      defaultPrevented: false,
      target,
      container,
    })).toBe(true);
  });

  test("does not dismiss when Escape originated inside the layer", () => {
    const target = { id: "inside" };
    const container = {
      contains: (candidate: unknown) => candidate === target,
    };

    expect(shouldDismissLayerFromDocumentKeydown({
      key: "Escape",
      defaultPrevented: false,
      target,
      container,
    })).toBe(false);
  });

  test("respects prior default prevention from nested overlays", () => {
    expect(shouldDismissLayerFromDocumentKeydown({
      key: "Escape",
      defaultPrevented: true,
      target: { id: "outside" },
      container: null,
    })).toBe(false);
  });
});
