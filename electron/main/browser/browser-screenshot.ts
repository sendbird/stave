import { captureFullPage } from "./browser-full-page-capture";
import { acquireLensCapturePaint } from "./browser-capture-paint";
import { nativeImage, webContents } from "electron";
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
  type LensCaptureContext,
} from "./browser-capture-lane";
import {
  assertLensScreenshotRect,
  assertLensScreenshotPng,
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
  return () => {
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
  const assertDocument = captureDocument(id);
  let startedFullPage = false;
  let timeoutCleanup: Promise<void> | undefined;
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
      assertCurrent();
      await assertCdpAllowedForWebContentsId(id, "capture screenshot");
      assertCurrent();
      let releasePaint: (() => void) | undefined;
      try {
        releasePaint = await acquireLensCapturePaint(id, context.signal);
        assertCurrent();
        await command("Page.enable");
        await command("Runtime.evaluate", {
          expression:
            "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
          awaitPromise: true,
          returnByValue: true,
        });
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
          startedFullPage = true;
          return await captureFullPage(id, command, assertDocument);
        }
        return await captureViewport(
          id,
          options,
          context,
          command,
          assertCurrent,
        );
      } finally {
        if (startedFullPage) {
          await timeoutCleanup;
          await clearOverride(id);
        }
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
    {
      timeoutMs: LENS_SCREENSHOT_COMMAND_TIMEOUT_MS,
      onTimeout: () => {
        // Repair emulation left by earlier versions without freeing the lane.
        // Native settlement and scroll restoration still precede the next capture.
        if (startedFullPage) timeoutCleanup = clearOverride(id);
      },
    },
  );
}

type Command = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

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
  context: LensCaptureContext,
  command: Command,
  assertCurrent: () => void,
): Promise<string> {
  const region = options.clip || options.selector !== undefined;
  // Target lookup belongs inside the lane: an earlier capture can temporarily
  // change page geometry, and a queued caller's scroll position may change.
  const before = region ? await measure(command, options.selector) : null;
  const clip = options.clip ?? before?.rect;
  if (clip) assertLensScreenshotRect(clip, "selected-area");
  await assertCdpAllowedForWebContentsId(id, "capture screenshot");
  assertCurrent();
  const result = (await command("Page.captureScreenshot", {
    format: "png",
  })) as { data: string };
  if (!before || !clip) return `data:image/png;base64,${result.data}`;
  const after = await measure(command, options.selector);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      "The screenshot target or viewport moved during capture; retry the screenshot.",
    );
  }
  context.assertActive();
  const buffer = Buffer.from(result.data, "base64");
  assertLensScreenshotPng(buffer);
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error("Lens screenshot returned no image.");
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
