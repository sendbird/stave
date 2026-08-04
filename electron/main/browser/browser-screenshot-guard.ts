export interface LensScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_LENS_SCREENSHOT_PIXELS = 32_000_000;
export const LENS_SCREENSHOT_COMMAND_TIMEOUT_MS = 15_000;

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

export async function withLensScreenshotTimeout<T>(
  operation: Promise<T>,
  timeoutMs = LENS_SCREENSHOT_COMMAND_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutLabel =
            timeoutMs < 1_000
              ? `${timeoutMs} ms`
              : `${Math.round(timeoutMs / 1_000)} seconds`;
          reject(new Error(`Lens screenshot timed out after ${timeoutLabel}.`));
        }, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
