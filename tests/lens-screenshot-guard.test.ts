import { describe, expect, test } from "bun:test";
import {
  assertLensScreenshotRect,
  assertLensScreenshotPng,
  MAX_LENS_SCREENSHOT_PIXELS,
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
});

describe("Lens screenshot bitmap limits", () => {
  function header(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
    buffer.writeUInt32BE(13, 8);
    buffer.write("IHDR", 12, "ascii");
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
  }
  test("accepts an ordinary high-DPI capture", () => {
    expect(() => assertLensScreenshotPng(header(2560, 1600))).not.toThrow();
  });
  test("rejects oversized physical pixels even for a small requested crop", () => {
    expect(() => assertLensScreenshotPng(header(8000, 8000))).toThrow(
      "pixel safety limit",
    );
  });
  test("rejects missing PNG metadata and zero dimensions", () => {
    expect(() => assertLensScreenshotPng(Buffer.from("not a png"))).toThrow(
      "invalid PNG",
    );
    expect(() => assertLensScreenshotPng(header(0, 800))).toThrow(
      "bounds are invalid",
    );
  });
});
