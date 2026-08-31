// ---------------------------------------------------------------------------
// CDP (Chrome DevTools Protocol) command wrappers
// Uses webContents.debugger for native Electron CDP access.
// ---------------------------------------------------------------------------

import { webContents } from "electron";
import type {
  BrowserScreenshotOptions,
  LensBoxModel,
  LensMeasurement,
  LensStyleEdit,
} from "../../../src/lib/lens/lens.types";
import { getSessionIdentityForWebContentsId } from "./browser-manager";
import {
  borrowLensGuestFocus,
  releaseLensGuestFocus,
} from "./browser-guest-broker";
import { assertCdpAllowed } from "./browser-security";
import { getLensBoxModelScript } from "./browser-style-capture";
import {
  detachCdpController,
  ensureCdpAttached,
  sendCdpCommand,
} from "./browser-cdp-controller";
import {
  assertLensScreenshotRect,
  withLensScreenshotTimeout,
} from "./browser-screenshot-guard";

export async function assertCdpAllowedForWebContentsId(
  webContentsId: number,
  reason: string,
): Promise<void> {
  const wc = webContents.fromId(webContentsId);
  if (!wc || wc.isDestroyed()) {
    throw new Error(`WebContents ${webContentsId} not found or destroyed`);
  }

  const identity = getSessionIdentityForWebContentsId(webContentsId);
  if (!identity) {
    throw new Error("No Lens browser session found for CDP access.");
  }
  const requestedUrl = wc.getURL();

  await assertCdpAllowed({
    workspaceId: identity.workspaceId,
    lensSessionId: identity.lensSessionId,
    url: requestedUrl,
    reason,
  });

  const currentWebContents = webContents.fromId(webContentsId);
  const currentIdentity = getSessionIdentityForWebContentsId(webContentsId);
  if (
    currentWebContents !== wc ||
    !currentWebContents ||
    currentWebContents.isDestroyed() ||
    !currentIdentity ||
    currentIdentity.workspaceId !== identity.workspaceId ||
    currentIdentity.lensSessionId !== identity.lensSessionId
  ) {
    throw new Error(
      "Lens browser session closed while CDP access was pending.",
    );
  }
  if (currentWebContents.getURL() !== requestedUrl) {
    throw new Error(
      "Lens page changed while CDP access was pending; retry the action.",
    );
  }
}

/** Ensure the debugger is attached, attaching lazily if needed. */
export function ensureDebuggerAttached(webContentsId: number): void {
  ensureCdpAttached(webContentsId);
}

/** Detach the debugger if attached. Safe to call multiple times. */
export function detachDebugger(webContentsId: number): void {
  try {
    detachCdpController(webContentsId);
  } catch {
    // Already destroyed – nothing to do
  }
}

async function sendCommand(
  webContentsId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  return sendCdpCommand(webContentsId, method, params);
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export async function captureScreenshot(
  webContentsId: number,
  options?: BrowserScreenshotOptions,
): Promise<string> {
  await assertCdpAllowedForWebContentsId(webContentsId, "capture screenshot");

  const params: Record<string, unknown> = { format: "png" };

  if (options?.fullPage) {
    // Get full-page metrics first
    const metrics = (await withLensScreenshotTimeout(
      sendCommand(webContentsId, "Page.getLayoutMetrics"),
    )) as {
      contentSize: { width: number; height: number };
    };
    assertLensScreenshotRect(
      { x: 0, y: 0, ...metrics.contentSize },
      "full-page",
    );
    params.clip = {
      x: 0,
      y: 0,
      width: metrics.contentSize.width,
      height: metrics.contentSize.height,
      scale: 1,
    };
    params.captureBeyondViewport = true;
  } else if (options?.clip) {
    assertLensScreenshotRect(options.clip, "selected-area");
    params.clip = { ...options.clip, scale: 1 };
  }

  const result = (await withLensScreenshotTimeout(
    sendCommand(webContentsId, "Page.captureScreenshot", params),
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
  await assertCdpAllowedForWebContentsId(webContentsId, "read page HTML");

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
  await assertCdpAllowedForWebContentsId(webContentsId, "read text content");

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
  await assertCdpAllowedForWebContentsId(webContentsId, "evaluate JavaScript");

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
// Box model inspection (Figma/DevTools-style padding / border / margin)
// ---------------------------------------------------------------------------

export async function getElementBoxModel(
  webContentsId: number,
  selector: string,
): Promise<LensBoxModel> {
  await assertCdpAllowedForWebContentsId(
    webContentsId,
    "read element box model",
  );

  const expression = `(() => {
    ${getLensBoxModelScript()}
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    return staveBoxModelForElement(el);
  })()`;

  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as RuntimeEvaluateResult;

  if (result.exceptionDetails) {
    throw new Error(
      `Box model error: ${JSON.stringify(result.exceptionDetails)}`,
    );
  }
  const value = result.result.value as LensBoxModel | null;
  if (!value) {
    throw new Error(`Element not found: ${selector}`);
  }
  return value;
}

export async function measureElements(
  webContentsId: number,
  selectorA: string,
  selectorB: string,
): Promise<{
  measurement: LensMeasurement;
  from: LensBoxModel;
  to: LensBoxModel;
}> {
  await assertCdpAllowedForWebContentsId(webContentsId, "measure elements");

  const expression = `(() => {
    ${getLensBoxModelScript()}
    const a = document.querySelector(${JSON.stringify(selectorA)});
    const b = document.querySelector(${JSON.stringify(selectorB)});
    if (!a || !b) {
      return { ok: false, missing: [a ? null : ${JSON.stringify(selectorA)}, b ? null : ${JSON.stringify(selectorB)}].filter(Boolean) };
    }
    return {
      ok: true,
      measurement: staveMeasureRects(a.getBoundingClientRect(), b.getBoundingClientRect()),
      from: staveBoxModelForElement(a),
      to: staveBoxModelForElement(b),
    };
  })()`;

  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as RuntimeEvaluateResult;

  if (result.exceptionDetails) {
    throw new Error(
      `Measure error: ${JSON.stringify(result.exceptionDetails)}`,
    );
  }
  const value = result.result.value as
    | {
        ok: true;
        measurement: LensMeasurement;
        from: LensBoxModel;
        to: LensBoxModel;
      }
    | { ok: false; missing: string[] }
    | null;
  if (!value?.ok) {
    const missing = value && "missing" in value ? value.missing.join(", ") : "";
    throw new Error(
      missing
        ? `Element(s) not found: ${missing}`
        : "Unable to measure elements.",
    );
  }
  return { measurement: value.measurement, from: value.from, to: value.to };
}

// ---------------------------------------------------------------------------
// Accessibility snapshot (compact page summary for AI)
// ---------------------------------------------------------------------------

export async function getAccessibilitySnapshot(
  webContentsId: number,
): Promise<unknown> {
  await assertCdpAllowedForWebContentsId(
    webContentsId,
    "read accessibility tree",
  );

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

/**
 * Make sure a guest holds native DOM focus before input is synthesized into it.
 *
 * `Input.dispatch*` is delivered to whatever currently has focus, not to the
 * target the CDP session is attached to — and when it lands somewhere else the
 * command still resolves successfully. That is the whole failure mode: an agent
 * click that silently typed into the app's own prompt box, reported as a
 * success. `webContents.focus()` cannot fix it either, because focusing a guest
 * is something only the embedding renderer can do.
 *
 * So this asks the renderer and refuses to continue if the answer is no. A
 * loud failure is the point; the alternative is input landing anywhere.
 *
 * The focus is borrowed, not taken: it is given back once the dispatch is
 * over, on every exit path, so a parked guest cannot keep the caret away from
 * whatever the user was typing in.
 */
async function withLensGuestFocus<T>(
  webContentsId: number,
  action: string,
  run: () => Promise<T>,
): Promise<T> {
  const identity = getSessionIdentityForWebContentsId(webContentsId);
  if (!identity) {
    throw new Error(
      `Cannot ${action}: webContents ${webContentsId} is not a Lens session`,
    );
  }

  const borrow = await borrowLensGuestFocus(identity);
  /*
   * Released from here on, including when the borrow was refused. A refusal is
   * usually a wait that expired, not a borrow that did not happen: the
   * renderer grants it late and the guest ends up holding the caret with
   * nothing scheduled to give it back. Releasing an ungranted borrow is a
   * no-op on the renderer side, so paying for it unconditionally is cheaper
   * than the focus leak.
   */
  try {
    if (!borrow.ok) {
      throw new Error(
        `Cannot ${action}: the Lens page could not be focused, so input would be delivered elsewhere. ${
          borrow.message ?? ""
        }`.trim(),
      );
    }
    return await run();
  } finally {
    await releaseLensGuestFocus(borrow.requestId);
  }
}

export async function clickElement(
  webContentsId: number,
  selector: string,
): Promise<void> {
  await assertCdpAllowedForWebContentsId(webContentsId, "click page element");
  await withLensGuestFocus(webContentsId, "click page element", async () => {
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
  });
}

export async function typeText(
  webContentsId: number,
  text: string,
  selector?: string,
): Promise<void> {
  await assertCdpAllowedForWebContentsId(webContentsId, "type into page");
  await withLensGuestFocus(webContentsId, "type into page", async () => {
    if (selector) {
      await sendCommand(webContentsId, "Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
      });
    }

    await sendCommand(webContentsId, "Input.insertText", { text });
  });
}

export async function setElementStyle(
  webContentsId: number,
  selector: string,
  patch: Record<string, string>,
): Promise<LensStyleEdit[]> {
  await assertCdpAllowedForWebContentsId(webContentsId, "edit element style");

  const allowedProperties = [
    "fontSize",
    "fontWeight",
    "color",
    "backgroundColor",
    "padding",
    "margin",
  ];
  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(
      ([property, value]) =>
        allowedProperties.includes(property) && typeof value === "string",
    ),
  );

  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) {
        return { ok: false, message: "Element not found: ${selector.replace(/"/g, '\\"')}" };
      }
      const patch = ${JSON.stringify(safePatch)};
      const edits = [];
      const computed = window.getComputedStyle(el);
      for (const [property, after] of Object.entries(patch)) {
        const cssProperty = property.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
        const before = computed.getPropertyValue(cssProperty);
        el.style[property] = String(after);
        edits.push({ property, before, after: String(after) });
      }
      return { ok: true, edits };
    })()`,
    returnByValue: true,
  })) as {
    result: {
      value:
        | { ok: true; edits: LensStyleEdit[] }
        | { ok: false; message: string }
        | undefined;
    };
  };

  const value = result.result.value;
  if (!value?.ok) {
    throw new Error(value?.message ?? "Unable to edit element style.");
  }

  return value.edits;
}
