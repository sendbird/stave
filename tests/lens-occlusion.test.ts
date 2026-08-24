import { describe, expect, test } from "bun:test";
import {
  LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR,
  hasLensOccludingFloatingSurface,
} from "@/lib/lens/lens-occlusion";
import {
  UI_LAYER_CLASS,
  UI_LAYER_FLOATING_MIN_VALUE,
  UI_LAYER_VALUE,
  uiLayerClassSelector,
  uiLayerClassesAtOrAbove,
} from "@/lib/ui-layers";

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
        return selector.includes(uiLayerClassSelector(UI_LAYER_CLASS.dialog))
          ? {}
          : null;
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

  test("covers every floating z-plane in the shared layer scale", () => {
    for (const layerClass of uiLayerClassesAtOrAbove(
      UI_LAYER_FLOATING_MIN_VALUE,
    )) {
      expect(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR).toContain(
        uiLayerClassSelector(layerClass),
      );
    }
  });

  test("excludes layers that are pane content rather than floating chrome", () => {
    // `.z-10`/`.z-20`/`.z-30` are structural: the Lens surface plane itself and
    // the always-present resizers and pane chrome. Treating them as occluding
    // would blank the preview permanently.
    for (const layerName of ["lensSurface", "resizer", "chrome"] as const) {
      expect(UI_LAYER_VALUE[layerName]).toBeLessThan(
        UI_LAYER_FLOATING_MIN_VALUE,
      );
      expect(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR).not.toContain(
        `${uiLayerClassSelector(UI_LAYER_CLASS[layerName])},`,
      );
    }
  });

  test("covers the surfaces that regressed under the hand-written allowlist", () => {
    // Tooltips over a Lens preview: the panel is explicitly a tooltip-heavy
    // surface, and `.t-tooltip` was missing from the original allowlist.
    expect(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR).toContain(".t-tooltip");
    // Zoom HUD, top-bar file search, prompt autocomplete, permission-mode
    // selector all render on the floatingChrome plane.
    expect(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR).toContain(
      uiLayerClassSelector(UI_LAYER_CLASS.floatingChrome),
    );
    // Dockview's drag landing zone paints inside the pane tree.
    expect(LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR).toContain(
      ".dv-drop-target-dropzone",
    );
  });

  test("suppresses the preview for a tooltip that overlaps it", () => {
    const root = {
      querySelector() {
        return null;
      },
      querySelectorAll(selector: string) {
        return selector.includes(".t-tooltip")
          ? [elementWithRect(rect({ left: 320, top: 40, width: 160, height: 28 }))]
          : [];
      },
    };

    expect(
      hasLensOccludingFloatingSurface(
        root,
        rect({ left: 300, top: 24, width: 220, height: 260 }),
      ),
    ).toBe(true);
  });
});
