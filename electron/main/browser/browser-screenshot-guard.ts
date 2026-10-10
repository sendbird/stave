export interface LensScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_LENS_SCREENSHOT_PIXELS = 32_000_000;
export const LENS_SCREENSHOT_COMMAND_TIMEOUT_MS = 15_000;

/** Bound decoded pixels before allocating a native bitmap for a crop. */
export function assertLensScreenshotPng(buffer: Buffer): void {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, 8).equals(signature) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Lens screenshot returned an invalid PNG.");
  }
  assertLensScreenshotRect(
    {
      x: 0,
      y: 0,
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    },
    "image",
  );
}

export function assertLensScreenshotRect(
  rect: LensScreenshotRect,
  label: string,
): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new Error(`Lens ${label} screenshot bounds are invalid.`);
  }
  if (rect.width * rect.height > MAX_LENS_SCREENSHOT_PIXELS) {
    throw new Error(
      `Lens ${label} screenshot exceeds the ${MAX_LENS_SCREENSHOT_PIXELS.toLocaleString()} pixel safety limit. Capture a smaller element or the viewport instead.`,
    );
  }
}
