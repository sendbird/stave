import { describe, expect, it } from "bun:test";
import { scaleLensBoundsWithinContainer } from "@/lib/lens/lens-bounds";

describe("scaleLensBoundsWithinContainer", () => {
  it("preserves an integer-aligned bounds rectangle", () => {
    expect(
      scaleLensBoundsWithinContainer({
        bounds: { x: 320, y: 144, width: 640, height: 480 },
        zoomFactor: 1,
      }),
    ).toEqual({ x: 320, y: 144, width: 640, height: 480 });
  });

  it("rounds fractional edges inward instead of expanding into a sash", () => {
    const bounds = { x: 320.6, y: 144.2, width: 640.6, height: 480.4 };
    const result = scaleLensBoundsWithinContainer({ bounds, zoomFactor: 1 });

    expect(result).toEqual({ x: 321, y: 145, width: 640, height: 479 });
    expect(Math.round(bounds.x) + Math.round(bounds.width)).toBeGreaterThan(
      bounds.x + bounds.width,
    );
    expect(result.x).toBeGreaterThanOrEqual(bounds.x);
    expect(result.y).toBeGreaterThanOrEqual(bounds.y);
    expect(result.x + result.width).toBeLessThanOrEqual(
      bounds.x + bounds.width,
    );
    expect(result.y + result.height).toBeLessThanOrEqual(
      bounds.y + bounds.height,
    );
  });

  it("contains the scaled rectangle at a non-default zoom factor", () => {
    const bounds = { x: 320.6, y: 144.2, width: 640.6, height: 480.4 };
    const zoomFactor = 1.1;
    const result = scaleLensBoundsWithinContainer({ bounds, zoomFactor });

    expect(result).toEqual({ x: 353, y: 159, width: 704, height: 528 });
    expect(result.x).toBeGreaterThanOrEqual(bounds.x * zoomFactor);
    expect(result.y).toBeGreaterThanOrEqual(bounds.y * zoomFactor);
    expect(result.x + result.width).toBeLessThanOrEqual(
      (bounds.x + bounds.width) * zoomFactor,
    );
    expect(result.y + result.height).toBeLessThanOrEqual(
      (bounds.y + bounds.height) * zoomFactor,
    );
  });
});
