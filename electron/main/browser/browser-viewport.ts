import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  LensGuestViewportResultSchema,
  type LensGuestViewportRequest,
  type LensViewport,
  type LensViewportWidth,
} from "../../../src/lib/lens/lens-viewport";
import { getMainWindow } from "../window";
import { assertLensAutomationAllowed } from "./browser-automation-control";
import { executeInLensAnnotationWorld } from "./browser-annotation-world";
import { lensCaptureLane } from "./browser-capture-lane";
import type { BrowserSessionState } from "./browser-manager";
import { rememberLensViewportWidth } from "./browser-viewport-state";

const RESIZE_TIMEOUT_MS = 2_000;
const pending = new Map<string, (expectedWidth: number | null) => void>();

export function resolveLensGuestViewport(payload: unknown): void {
  const parsed = LensGuestViewportResultSchema.safeParse(payload);
  if (parsed.success) {
    pending.get(parsed.data.requestId)?.(parsed.data.expectedWidth);
  }
}

export function setLensViewportWidth(
  session: BrowserSessionState,
  width: LensViewportWidth,
): Promise<LensViewport> {
  // A width change cannot interleave with native screenshot work for this guest.
  return lensCaptureLane.run(
    session.webContentsId,
    async (context) => {
      context.assertActive();
      assertLensAutomationAllowed();
      const expectedWidth = await requestLensGuestViewport(session, width);
      context.assertActive();
      return waitForLensViewport(session, width, expectedWidth);
    },
    { timeoutMs: 2 * RESIZE_TIMEOUT_MS + 1_000 },
  );
}

async function requestLensGuestViewport(
  session: BrowserSessionState,
  width: LensViewportWidth,
): Promise<number> {
  const renderer = getMainWindow()?.webContents;
  if (
    !renderer ||
    renderer.isDestroyed() ||
    session.closing ||
    session.webContents.isDestroyed()
  ) {
    throw new Error("No Lens host is available to resize this session.");
  }
  const { workspaceId, lensSessionId, webContentsId } = session;
  const requestId = randomUUID();
  const payload: LensGuestViewportRequest = {
    requestId, workspaceId, lensSessionId, webContentsId, width,
  };
  const expectedWidth = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Timed out waiting for the Lens host to resize the page."));
    }, RESIZE_TIMEOUT_MS);
    timer.unref();
    pending.set(requestId, (result) => {
      clearTimeout(timer);
      pending.delete(requestId);
      resolve(result);
    });
    try {
      renderer.send("lens:guest-viewport", payload);
      // IPC is ordered. Remember the latest sent width before awaiting replies,
      // so a concurrent change or a guest rebuild cannot restore an older one.
      rememberLensViewportWidth(workspaceId, lensSessionId, width);
    } catch (error) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(error);
    }
  });
  if (expectedWidth === null) throw new Error("The Lens guest changed before it could be resized.");
  return expectedWidth;
}

export function readLensViewport(webContents: Electron.WebContents): Promise<LensViewport> {
  return executeInLensAnnotationWorld<LensViewport>(
    webContents,
    "({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })",
  );
}

/** The host can acknowledge the style write before the guest receives its resize. */
async function waitForLensViewport(
  session: BrowserSessionState,
  width: LensViewportWidth,
  expectedWidth: number,
): Promise<LensViewport> {
  const timeout = new AbortController();
  const { webContents } = session;
  try {
    const deadline = delay(RESIZE_TIMEOUT_MS, undefined, {
      signal: timeout.signal,
      ref: false,
    }).then(() => {
      throw new Error("Timed out waiting for Lens to lay out at the requested width.");
    });
    // A suspended or unresponsive guest can leave an individual read pending.
    while (true) {
      if (session.closing || webContents.isDestroyed()) {
        throw new Error("The Lens guest closed while resizing.");
      }
      const viewport = await Promise.race([readLensViewport(webContents), deadline]);
      if (Math.abs(viewport.innerWidth - expectedWidth) <= (width === "fit" ? 1 : 0)) return viewport;
      await Promise.race([delay(25, undefined, { ref: false }), deadline]);
    }
  } finally {
    timeout.abort();
  }
}
