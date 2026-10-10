import { describe, expect, test } from "bun:test";
import {
  isLensCaptureViewport,
  resolveLensViewportCrop,
  type LensCaptureViewport,
} from "../src/lib/lens/lens-screenshot-crop";

const VIEWPORT: LensCaptureViewport = {
  width: 700,
  height: 500,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

describe("resolveLensViewportCrop", () => {
  test("maps CSS pixels onto a 1x capture unchanged", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 10, y: 20, width: 100, height: 40 },
        viewport: VIEWPORT,
        image: { width: 700, height: 500 },
      }),
    ).toEqual({ x: 10, y: 20, width: 100, height: 40 });
  });

  test("scales to device pixels on a high-density display", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 10, y: 20, width: 100, height: 40 },
        viewport: VIEWPORT,
        image: { width: 1400, height: 1000 },
      }),
    ).toEqual({ x: 20, y: 40, width: 200, height: 80 });
  });

  test("derives density from the scrollbar-inclusive viewport", () => {
    // innerWidth includes a classic scrollbar; a 700px-wide 1x capture of a
    // page whose content box is 685px wide is still exactly 1 pixel per CSS px.
    expect(
      resolveLensViewportCrop({
        clip: { x: 600, y: 0, width: 80, height: 10 },
        viewport: { ...VIEWPORT, width: 700 },
        image: { width: 700, height: 500 },
      }),
    ).toEqual({ x: 600, y: 0, width: 80, height: 10 });
  });

  test("rounds fractional rectangles outward", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 10.4, y: 20.6, width: 100.2, height: 39.9 },
        viewport: VIEWPORT,
        image: { width: 700, height: 500 },
      }),
    ).toEqual({ x: 10, y: 20, width: 101, height: 41 });
  });

  test("keeps only the visible part of a rectangle that crosses the edge", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: -20, y: 450, width: 100, height: 200 },
        viewport: VIEWPORT,
        image: { width: 700, height: 500 },
      }),
    ).toEqual({ x: 0, y: 450, width: 80, height: 50 });
  });

  test("returns null for a rectangle entirely outside the viewport", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 0, y: 805, width: 50, height: 10 },
        viewport: VIEWPORT,
        image: { width: 700, height: 500 },
      }),
    ).toBeNull();
  });

  test("follows a pinch-zoomed visual viewport", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 110, y: 70, width: 50, height: 20 },
        viewport: { ...VIEWPORT, offsetX: 100, offsetY: 50, scale: 2 },
        image: { width: 700, height: 500 },
      }),
    ).toEqual({ x: 20, y: 40, width: 100, height: 40 });
  });

  test("returns null for an empty image", () => {
    expect(
      resolveLensViewportCrop({
        clip: { x: 0, y: 0, width: 10, height: 10 },
        viewport: VIEWPORT,
        image: { width: 0, height: 0 },
      }),
    ).toBeNull();
  });
});

describe("isLensCaptureViewport", () => {
  test("accepts a measured viewport", () => {
    expect(isLensCaptureViewport(VIEWPORT)).toBe(true);
  });

  test("rejects missing, zero and non-finite measurements", () => {
    expect(isLensCaptureViewport(null)).toBe(false);
    expect(isLensCaptureViewport({ ...VIEWPORT, width: 0 })).toBe(false);
    expect(isLensCaptureViewport({ ...VIEWPORT, scale: Number.NaN })).toBe(
      false,
    );
    expect(isLensCaptureViewport({ ...VIEWPORT, offsetX: "0" })).toBe(false);
  });
});
