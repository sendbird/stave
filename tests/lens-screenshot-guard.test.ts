import { describe, expect, test } from "bun:test";
import {
  assertLensScreenshotRect,
  MAX_LENS_SCREENSHOT_PIXELS,
  withLensScreenshotTimeout,
} from "../electron/main/browser/browser-screenshot-guard";

describe("Lens screenshot resource guards", () => {
  test("accepts ordinary viewport and element capture bounds", () => {
    expect(() =>
      assertLensScreenshotRect(
        { x: 0, y: 0, width: 1_440, height: 900 },
        "viewport",
      ),
    ).not.toThrow();
  });

  test("rejects invalid and excessively large captures", () => {
    expect(() =>
      assertLensScreenshotRect(
        { x: 0, y: 0, width: 0, height: 100 },
        "selected-area",
      ),
    ).toThrow(/invalid/);
    expect(() =>
      assertLensScreenshotRect(
        { x: 0, y: 0, width: MAX_LENS_SCREENSHOT_PIXELS + 1, height: 1 },
        "full-page",
      ),
    ).toThrow(/safety limit/);
  });

  test("bounds a CDP screenshot command that never settles", async () => {
    const stalled = new Promise<never>(() => undefined);
    await expect(withLensScreenshotTimeout(stalled, 5)).rejects.toThrow(
      "Lens screenshot timed out after 5 ms.",
    );
  });
});
