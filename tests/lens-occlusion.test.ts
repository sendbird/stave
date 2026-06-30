import { describe, expect, test } from "bun:test";
import {
  LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR,
  hasLensOccludingFloatingSurface,
} from "@/lib/lens/lens-occlusion";

function rect(args: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRectReadOnly {
  return {
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    right: args.left + args.width,
    bottom: args.top + args.height,
    x: args.left,
    y: args.top,
    toJSON: () => ({}),
  };
}

function elementWithRect(bounds: DOMRectReadOnly): Element {
  return {
    getBoundingClientRect: () => bounds,
  } as Element;
}

describe("Lens occlusion detection", () => {
  test("detects custom app dialog layers", () => {
    const queries: string[] = [];
    const root = {
      querySelector(selector: string) {
        queries.push(selector);
        return selector.includes(".z-\\[80\\].fixed.inset-0") ? {} : null;
      },
    };

    expect(hasLensOccludingFloatingSurface(root)).toBe(true);
    expect(queries).toEqual([LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR]);
  });

  test("detects a floating surface that intersects the Lens preview", () => {
    const queries: string[] = [];
    const root = {
      querySelector() {
        return null;
      },
      querySelectorAll(selector: string) {
        queries.push(selector);
        return [
          elementWithRect(rect({ left: 12, top: 12, width: 120, height: 36 })),
          elementWithRect(rect({ left: 320, top: 40, width: 160, height: 80 })),
        ];
      },
    };

    expect(
      hasLensOccludingFloatingSurface(
        root,
        rect({ left: 300, top: 24, width: 220, height: 260 }),
      ),
    ).toBe(true);
    expect(queries).toEqual([LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR]);
  });

  test("ignores floating surfaces outside the Lens preview", () => {
    const root = {
      querySelector() {
        return {};
      },
      querySelectorAll() {
        return [
          elementWithRect(rect({ left: 12, top: 12, width: 120, height: 36 })),
        ];
      },
    };

    expect(
      hasLensOccludingFloatingSurface(
        root,
        rect({ left: 300, top: 24, width: 220, height: 260 }),
      ),
    ).toBe(false);
  });

  test("returns false when the Lens preview rect is unavailable", () => {
    const root = {
      querySelector() {
        return {};
      },
      querySelectorAll() {
        return [
          elementWithRect(rect({ left: 12, top: 12, width: 120, height: 36 })),
        ];
      },
    };

    expect(hasLensOccludingFloatingSurface(root, null)).toBe(false);
  });

  test("returns false when no occluding surface exists", () => {
    const root = {
      querySelector() {
        return null;
      },
    };

    expect(hasLensOccludingFloatingSurface(root)).toBe(false);
  });
});
