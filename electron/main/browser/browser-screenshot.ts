import { captureFullPage } from "./browser-full-page-capture";
import { acquireLensCapturePaint } from "./browser-capture-paint";
import { webContents, type NativeImage } from "electron";
import { captureLensSurface } from "./browser-surface-capture";
import type { BrowserScreenshotOptions } from "../../../src/lib/lens/lens.types";
import {
  isLensCaptureViewport,
  resolveLensViewportCrop,
} from "../../../src/lib/lens/lens-screenshot-crop";
import {
  getBrowserSession,
  getSessionIdentityForWebContentsId,
} from "./browser-manager";
import { assertCdpAllowedForWebContentsId } from "./browser-cdp-access";
import {
  sendCdpCommand,
  sendCdpCommandIfAttached,
} from "./browser-cdp-controller";
import {
  lensCaptureLane,
} from "./browser-capture-lane";
import {
  assertLensScreenshotRect,
  LENS_SCREENSHOT_COMMAND_TIMEOUT_MS,
} from "./browser-screenshot-guard";

const lane = lensCaptureLane;
const pendingHeals = new Map<number, Promise<void>>();
type CaptureOptions = BrowserScreenshotOptions & { selector?: string };
type CaptureLifecycle = {
  prepare?: () => Promise<unknown>;
  restore?: () => Promise<unknown>;
};
type Rect = NonNullable<BrowserScreenshotOptions["clip"]>;
type Geometry = {
  viewport: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    scale: number;
  };
  scrollX: number;
  scrollY: number;
  rect?: Rect | null;
};

function captureDocument(id: number) {
  const wc = webContents.fromId(id);
  const identity = getSessionIdentityForWebContentsId(id);
  const session =
    identity && getBrowserSession(identity.workspaceId, identity.lensSessionId);
  if (!wc || wc.isDestroyed() || !session)
    throw new Error("No Lens browser session found for capture.");
  const documentId = session.documentId;
  const url = wc.getURL();
  const assertDocument = () => {
    if (
      webContents.fromId(id) !== wc ||
      wc.isDestroyed() ||
      getBrowserSession(session.workspaceId, session.lensSessionId) !==
        session ||
      session.documentId !== documentId ||
      wc.getURL() !== url
    ) {
      throw new Error(
        "The Lens page changed during capture; retry the screenshot.",
      );
    }
  };
  return { wc, assertDocument };
}

/** A caller deadline never releases an unfinished native screenshot. */
export async function captureScreenshot(
  id: number,
  options: CaptureOptions = {},
  lifecycle: CaptureLifecycle = {},
): Promise<string> {
  if (options.fullPage && (options.clip || options.selector)) {
    throw new Error(
      "Full-page and selected-area screenshots cannot be combined.",
    );
  }
  if (options.clip) assertLensScreenshotRect(options.clip, "selected-area");
  const { wc, assertDocument } = captureDocument(id);
  return lane.run(
    id,
    async (context) => {
      const assertCurrent = () => {
        context.assertActive();
        assertDocument();
      };
      const command = async (
        method: string,
        params?: Record<string, unknown>,
      ) => {
        assertCurrent();
        const result = await sendCdpCommand(id, method, params, assertCurrent);
        assertCurrent();
        return result;
      };
      const waitForFrame = () => waitForCaptureFrame(command, context.signal);
      const captureFrame = async () => {
        assertCurrent();
        const image = await captureLensSurface(wc);
        assertCurrent();
        assertLensScreenshotRect({ x: 0, y: 0, ...image.getSize() }, "image");
        return image;
      };
      assertCurrent();
      await assertCdpAllowedForWebContentsId(id, "capture screenshot");
      assertCurrent();
      let releasePaint: (() => void) | undefined;
      try {
        releasePaint = await acquireLensCapturePaint(id, context.signal);
        assertCurrent();
        await command("Page.enable");
        await waitForFrame();
        await lifecycle.prepare?.();
        assertCurrent();
        if (options.fullPage) {
          const metrics = (await command("Page.getLayoutMetrics")) as {
            cssContentSize: { width: number; height: number };
          };
          const clip = { x: 0, y: 0, ...metrics.cssContentSize };
          assertLensScreenshotRect(clip, "full-page");
          await assertCdpAllowedForWebContentsId(id, "capture screenshot");
          assertCurrent();
          return await captureFullPage(
            id,
            command,
            assertDocument,
            waitForFrame,
            captureFrame,
          );
        }
        return await captureViewport(
          id,
          options,
          command,
          assertCurrent,
          captureFrame,
        );
      } finally {
        try {
          assertDocument();
          await lifecycle.restore?.();
        } catch {
          // The overlay belongs to the captured document, never its replacement.
        } finally {
          releasePaint?.();
        }
      }
    },
    { timeoutMs: LENS_SCREENSHOT_COMMAND_TIMEOUT_MS },
  );
}

type Command = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

async function waitForCaptureFrame(command: Command, signal: AbortSignal): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort!: () => void;
  const unavailable = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    timeout = setTimeout(() => {
      reject(new Error("Lens page did not draw a frame. Show its Lens tab and retry."));
    }, 1_000);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // This probe only waits for frames. It can be abandoned independently
    // of the lane because it never starts a native screenshot or changes the page.
    const result = (await Promise.race([
      unavailable,
      command("Runtime.evaluate", {
        expression: `new Promise(resolve => {
          const deadline = setTimeout(() => resolve(false), 750);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            clearTimeout(deadline);
            resolve(true);
          }));
        })`,
        awaitPromise: true,
        returnByValue: true,
      }),
    ])) as { result?: { value?: boolean } };
    if (result.result?.value !== true) {
      throw new Error("Lens page did not draw a frame. Show its Lens tab and retry.");
    }
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", onAbort);
  }
}

async function measure(command: Command, selector?: string): Promise<Geometry> {
  const result = (await command("Runtime.evaluate", {
    expression: `(() => {
      const vv = window.visualViewport;
      const selector = ${JSON.stringify(selector ?? null)};
      const element = selector === null ? null : document.querySelector(selector);
      const r = element?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight, offsetX: vv?.offsetLeft ?? 0, offsetY: vv?.offsetTop ?? 0, scale: vv?.scale ?? 1 },
        scrollX, scrollY,
        rect: selector === null ? undefined : r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
      };
    })()`,
    returnByValue: true,
  })) as { result?: { value?: Geometry }; exceptionDetails?: unknown };
  const geometry = result.result?.value;
  if (
    result.exceptionDetails ||
    !geometry ||
    !isLensCaptureViewport(geometry.viewport)
  ) {
    throw new Error("Lens could not measure the page viewport to capture.");
  }
  if (selector !== undefined && !geometry.rect)
    throw new Error(
      "The screenshot target was not found; select the element again.",
    );
  return geometry;
}

async function captureViewport(
  id: number,
  options: CaptureOptions,
  command: Command,
  assertCurrent: () => void,
  captureFrame: () => Promise<NativeImage>,
): Promise<string> {
  const region = options.clip || options.selector !== undefined;
  // Target lookup belongs inside the lane: an earlier capture can temporarily
  // change page geometry, and a queued caller's scroll position may change.
  const before = region ? await measure(command, options.selector) : null;
  const clip = options.clip ?? before?.rect;
  if (clip) assertLensScreenshotRect(clip, "selected-area");
  await assertCdpAllowedForWebContentsId(id, "capture screenshot");
  assertCurrent();
  const image = await captureFrame();
  if (!before || !clip) return `data:image/png;base64,${image.toPNG().toString("base64")}`;
  const after = await measure(command, options.selector);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      "The screenshot target or viewport moved during capture; retry the screenshot.",
    );
  }
  const crop = resolveLensViewportCrop({
    clip,
    viewport: before.viewport,
    image: image.getSize(),
  });
  if (!crop)
    throw new Error(
      "The requested area is outside the visible part of the Lens page. Scroll it into view, or capture the full page.",
    );
  return `data:image/png;base64,${image.crop(crop).toPNG().toString("base64")}`;
}

/** A show/reload repair is retained even when a capture currently owns the lane. */
export function healLensViewportEmulation(id: number): Promise<void> {
  const pending = pendingHeals.get(id);
  if (pending) return pending;
  const operation = lane.after(id, () => clearOverride(id));
  pendingHeals.set(id, operation);
  void operation.finally(() => {
    if (pendingHeals.get(id) === operation) pendingHeals.delete(id);
  });
  return operation;
}

async function clearOverride(id: number): Promise<void> {
  try {
    await sendCdpCommandIfAttached(id, "Emulation.clearDeviceMetricsOverride");
  } catch {
    // Cleanup never reattaches a destroyed or closing guest.
  }
}
