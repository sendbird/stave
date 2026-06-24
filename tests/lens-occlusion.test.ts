import { describe, expect, test } from "bun:test";
import {
  LENS_OCCLUDING_FLOATING_SURFACE_SELECTOR,
  hasLensOccludingFloatingSurface,
} from "@/lib/lens/lens-occlusion";

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

  test("returns false when no occluding surface exists", () => {
    const root = {
      querySelector() {
        return null;
      },
    };

    expect(hasLensOccludingFloatingSurface(root)).toBe(false);
  });
});
