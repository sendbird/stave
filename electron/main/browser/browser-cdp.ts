// ---------------------------------------------------------------------------
// CDP (Chrome DevTools Protocol) command wrappers
// Uses webContents.debugger for native Electron CDP access.
// ---------------------------------------------------------------------------

import { webContents } from "electron";
import type { BrowserScreenshotOptions } from "../../../src/lib/lens/lens.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDebugger(webContentsId: number): Electron.Debugger {
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error(`WebContents ${webContentsId} not found or destroyed`);
  }
  return wc.debugger;
}

/** Ensure the debugger is attached, attaching lazily if needed. */
export function ensureDebuggerAttached(webContentsId: number): void {
  const dbg = getDebugger(webContentsId);
  if (!dbg.isAttached()) {
    dbg.attach("1.3");
  }
}

/** Detach the debugger if attached. Safe to call multiple times. */
export function detachDebugger(webContentsId: number): void {
  try {
    const dbg = getDebugger(webContentsId);
    if (dbg.isAttached()) {
      dbg.detach();
    }
  } catch {
    // Already destroyed – nothing to do
  }
}

async function sendCommand(
  webContentsId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  ensureDebuggerAttached(webContentsId);
  const dbg = getDebugger(webContentsId);
  return dbg.sendCommand(method, params);
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export async function captureScreenshot(
  webContentsId: number,
  options?: BrowserScreenshotOptions,
): Promise<string> {
  const params: Record<string, unknown> = { format: "png" };

  if (options?.fullPage) {
    // Get full-page metrics first
    const metrics = (await sendCommand(
      webContentsId,
      "Page.getLayoutMetrics",
    )) as {
      contentSize: { width: number; height: number };
    };
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.contentSize.width,
      height: metrics.contentSize.height,
      scale: 1,
    };
    params.captureBeyondViewport = true;
  } else if (options?.clip) {
    params.clip = { ...options.clip, scale: 1 };
  }

  const result = (await sendCommand(
    webContentsId,
    "Page.captureScreenshot",
    params,
  )) as { data: string };

  return `data:image/png;base64,${result.data}`;
}

// ---------------------------------------------------------------------------
// DOM queries (via Runtime.evaluate – avoids enabling the heavy DOM domain)
// ---------------------------------------------------------------------------

export async function getDocumentHTML(
  webContentsId: number,
  selector?: string,
): Promise<string> {
  const expression = selector
    ? `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.outerHTML : null; })()`
    : `document.documentElement.outerHTML`;

  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as { result: { value: unknown } };

  return (result.result.value as string) ?? "";
}

export async function getTextContent(
  webContentsId: number,
  selector: string,
): Promise<string> {
  const expression = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent : null; })()`;
  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as { result: { value: unknown } };

  return (result.result.value as string) ?? "";
}

interface RuntimeEvaluateResult {
  result: { value: unknown };
  exceptionDetails?: unknown;
}

export async function evaluateExpression(
  webContentsId: number,
  expression: string,
): Promise<unknown> {
  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as RuntimeEvaluateResult;

  if (result.exceptionDetails) {
    throw new Error(
      `Evaluation error: ${JSON.stringify(result.exceptionDetails)}`,
    );
  }
  return result.result.value;
}

// ---------------------------------------------------------------------------
// Accessibility snapshot (compact page summary for AI)
// ---------------------------------------------------------------------------

export async function getAccessibilitySnapshot(
  webContentsId: number,
): Promise<unknown> {
  // Accessibility.getFullAXTree may not be available in all Electron/Chromium
  // builds. Fall back gracefully so stave_lens_snapshot never hard-errors.
  try {
    return await sendCommand(webContentsId, "Accessibility.getFullAXTree", {
      depth: 4,
    });
  } catch (err) {
    return {
      error: `Accessibility snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Try stave_lens_get_html or stave_lens_evaluate instead.",
    };
  }
}

// ---------------------------------------------------------------------------
// Click / Type helpers (via CDP Input domain)
// ---------------------------------------------------------------------------

export async function clickElement(
  webContentsId: number,
  selector: string,
): Promise<void> {
  // Scroll the element into view first so getBoundingClientRect returns
  // non-negative viewport-relative coordinates, then get the center point.
  await sendCommand(webContentsId, "Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "center", inline: "center" })`,
    returnByValue: true,
  });

  const coords = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`,
    returnByValue: true,
  })) as { result: { value: { x: number; y: number } | null } };

  const pt = coords.result.value;
  if (!pt) throw new Error(`Element not found: ${selector}`);

  await sendCommand(webContentsId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: pt.x,
    y: pt.y,
    button: "left",
    clickCount: 1,
  });
  await sendCommand(webContentsId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: pt.x,
    y: pt.y,
    button: "left",
    clickCount: 1,
  });
}

export async function typeText(
  webContentsId: number,
  text: string,
  selector?: string,
): Promise<void> {
  // Focus element first if selector provided
  if (selector) {
    await sendCommand(webContentsId, "Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
    });
  }

  await sendCommand(webContentsId, "Input.insertText", { text });
}
