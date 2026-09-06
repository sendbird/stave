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
import {
  describeLensRef,
  resolveLensRefToObjectId,
} from "./browser-lens-snapshot";
import { resolveLensTarget } from "../../../src/lib/lens/lens-snapshot";
import { assertCdpAllowed } from "./browser-security";
import { getLensBoxModelScript } from "./browser-style-capture";
import {
  detachCdpController,
  ensureCdpAttached,
  sendCdpCommand,
  sendCdpCommandIfAttached,
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

/**
 * Release only the transient remote object a Lens action resolved.
 *
 * The snapshot registry keeps backend-node ids, not remote objects, and every
 * action resolves a fresh wrapper. Releasing that wrapper is therefore local
 * to this action. Cleanup must never revive a debugger while a guest is
 * closing, so it deliberately uses the controller's already-attached path.
 */
async function releaseLensTargetObject(
  webContentsId: number,
  objectId: string | null | undefined,
): Promise<void> {
  if (!objectId) return;
  try {
    await sendCdpCommandIfAttached(webContentsId, "Runtime.releaseObject", {
      objectId,
    });
  } catch {
    // The guest may have closed between the action and its best-effort cleanup.
  }
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
  target: string,
): Promise<string> {
  await assertCdpAllowedForWebContentsId(webContentsId, "read text content");

  const value = await callOnLensTarget<string | null>(
    webContentsId,
    target,
    `function () { return this.textContent; }`,
  );
  return value ?? "";
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
// Target resolution: ref or selector
// ---------------------------------------------------------------------------

/**
 * Run a function with `this` bound to the element a target names.
 *
 * The two addressing modes converge here rather than in each caller, and they
 * are not equally trustworthy. A **ref** was minted by a snapshot and is keyed
 * to node identity, so resolving it either returns the element the agent saw or
 * fails loudly. A **selector** is re-run against the live document, so it
 * returns whatever matches *now* — which may be a different element than the
 * one the agent meant, with nothing anywhere able to tell. Selectors stay as a
 * permanent escape hatch for what a snapshot cannot name; refs are the
 * documented default precisely because they can be invalidated.
 *
 * Returns `null` when a selector matched nothing. A ref that cannot be resolved
 * throws instead: "not found" is ambiguous for a selector and unambiguous for a
 * ref, and the error should say which one happened.
 */
export async function callOnLensTarget<T>(
  webContentsId: number,
  target: string,
  functionDeclaration: string,
): Promise<T | null> {
  const resolved = resolveLensTarget(target);

  if (resolved.kind === "ref") {
    const objectId = await resolveLensRefToObjectId(
      webContentsId,
      resolved.ref,
    );
    try {
      const result = (await sendCommand(
        webContentsId,
        "Runtime.callFunctionOn",
        {
          objectId,
          functionDeclaration,
          returnByValue: true,
        },
      )) as RuntimeEvaluateResult;
      if (result.exceptionDetails) {
        throw new Error(
          `Action on ${resolved.ref} failed: ${JSON.stringify(result.exceptionDetails)}`,
        );
      }
      return (result.result.value as T) ?? null;
    } finally {
      await releaseLensTargetObject(webContentsId, objectId);
    }
  }

  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(resolved.selector)});
      if (!el) return null;
      return (${functionDeclaration}).call(el);
    })()`,
    returnByValue: true,
  })) as RuntimeEvaluateResult;
  if (result.exceptionDetails) {
    throw new Error(
      `Action on "${resolved.selector}" failed: ${JSON.stringify(result.exceptionDetails)}`,
    );
  }
  return (result.result.value as T) ?? null;
}

/**
 * Resolve a target to a live CDP object handle.
 *
 * Needed where one call has to hold two elements at once — measuring a gap —
 * because two separate `querySelector` evaluations against a page that
 * re-rendered in between measure two elements that were never on screen
 * together. Refs get the staleness check for free; a selector that matches
 * nothing returns null.
 */
export async function resolveLensTargetObjectId(
  webContentsId: number,
  target: string,
): Promise<string | null> {
  const resolved = resolveLensTarget(target);
  if (resolved.kind === "ref") {
    return resolveLensRefToObjectId(webContentsId, resolved.ref);
  }
  const result = (await sendCommand(webContentsId, "Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(resolved.selector)})`,
    returnByValue: false,
  })) as { result?: { objectId?: string; subtype?: string } };
  return result.result?.subtype === "null"
    ? null
    : (result.result?.objectId ?? null);
}

/** How to name a target in an error, without leaking which mode resolved it. */
export function describeLensTarget(
  webContentsId: number,
  target: string,
): string {
  const resolved = resolveLensTarget(target);
  if (resolved.kind === "selector") {
    return `"${resolved.selector}"`;
  }
  const described = describeLensRef(webContentsId, resolved.ref);
  return described ? `${resolved.ref} (${described})` : resolved.ref;
}

// ---------------------------------------------------------------------------
// Box model inspection (Figma/DevTools-style padding / border / margin)
// ---------------------------------------------------------------------------

export async function getElementBoxModel(
  webContentsId: number,
  target: string,
): Promise<LensBoxModel> {
  await assertCdpAllowedForWebContentsId(
    webContentsId,
    "read element box model",
  );

  const value = await callOnLensTarget<LensBoxModel | null>(
    webContentsId,
    target,
    `function () {
      ${getLensBoxModelScript()}
      return staveBoxModelForElement(this);
    }`,
  );

  if (!value) {
    throw new Error(
      `Cannot inspect ${describeLensTarget(webContentsId, target)}: no element matched.`,
    );
  }
  return value;
}

export async function measureElements(
  webContentsId: number,
  targetA: string,
  targetB: string,
): Promise<{
  measurement: LensMeasurement;
  from: LensBoxModel;
  to: LensBoxModel;
}> {
  await assertCdpAllowedForWebContentsId(webContentsId, "measure elements");

  let objectA: string | null = null;
  let objectB: string | null = null;
  try {
    objectA = await resolveLensTargetObjectId(webContentsId, targetA);
    objectB = await resolveLensTargetObjectId(webContentsId, targetB);

    const missing = [
      objectA ? null : describeLensTarget(webContentsId, targetA),
      objectB ? null : describeLensTarget(webContentsId, targetB),
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`Element(s) not found: ${missing.join(", ")}`);
    }

    // Both elements are held as handles across one call, so a page that
    // re-renders cannot leave the measurement describing a pair that was never
    // laid out together.
    const result = (await sendCommand(webContentsId, "Runtime.callFunctionOn", {
      objectId: objectA,
      functionDeclaration: `function (other) {
      ${getLensBoxModelScript()}
      return {
        measurement: staveMeasureRects(this.getBoundingClientRect(), other.getBoundingClientRect()),
        from: staveBoxModelForElement(this),
        to: staveBoxModelForElement(other),
      };
      }`,
      arguments: [{ objectId: objectB }],
      returnByValue: true,
    })) as RuntimeEvaluateResult;

    if (result.exceptionDetails) {
      throw new Error(
        `Measure error: ${JSON.stringify(result.exceptionDetails)}`,
      );
    }
    const value = result.result.value as {
      measurement: LensMeasurement;
      from: LensBoxModel;
      to: LensBoxModel;
    } | null;
    if (!value) {
      throw new Error("Unable to measure elements.");
    }
    return value;
  } finally {
    await Promise.all([
      releaseLensTargetObject(webContentsId, objectA),
      releaseLensTargetObject(webContentsId, objectB),
    ]);
  }
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
  target: string,
): Promise<void> {
  await assertCdpAllowedForWebContentsId(webContentsId, "click page element");
  await withLensGuestFocus(webContentsId, "click page element", async () => {
    /*
     * Resolve once, then scroll and measure that same object.
     *
     * Splitting them was a real hazard: the old code resolved the selector
     * twice, so a page that re-rendered between the two evaluations scrolled
     * one element into view and clicked the coordinates of another. One object
     * resolution also means a ref is checked for staleness once, at the moment
     * it is used.
     */
    const objectId = await resolveLensTargetObjectId(webContentsId, target);
    if (!objectId) {
      throw new Error(
        `Cannot click ${describeLensTarget(webContentsId, target)}: no element matched.`,
      );
    }

    try {
      await sendCommand(webContentsId, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration:
          "function () { this.scrollIntoView({ block: 'center', inline: 'center' }); }",
      });

      /*
       * `getBoundingClientRect()` is relative to the element's own document. For
       * a ref from `includeFrames`, that is the child frame, while CDP Input
       * coordinates belong to the top-level guest. `DOM.getBoxModel` returns
       * page-space quads, including every embedding frame's offset, so it keeps
       * a frame ref aimed at the frame that minted it.
       */
      const box = (await sendCommand(webContentsId, "DOM.getBoxModel", {
        objectId,
      })) as { model?: { border?: number[] } };
      const border = box.model?.border;
      if (!border || border.length < 8) {
        throw new Error(
          `Cannot click ${describeLensTarget(webContentsId, target)}: it has no layout box.`,
        );
      }
      const [x0, y0, x1, y1, x2, y2, x3, y3] = border;
      if (
        x0 === undefined ||
        y0 === undefined ||
        x1 === undefined ||
        y1 === undefined ||
        x2 === undefined ||
        y2 === undefined ||
        x3 === undefined ||
        y3 === undefined
      ) {
        throw new Error(
          `Cannot click ${describeLensTarget(webContentsId, target)}: it has no layout box.`,
        );
      }
      const pt = {
        x: (x0 + x1 + x2 + x3) / 4,
        y: (y0 + y1 + y2 + y3) / 4,
      };
      if (
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y) ||
        (Math.max(x0, x1, x2, x3) === Math.min(x0, x1, x2, x3) &&
          Math.max(y0, y1, y2, y3) === Math.min(y0, y1, y2, y3))
      ) {
        throw new Error(
          `Cannot click ${describeLensTarget(webContentsId, target)}: it has no usable layout box.`,
        );
      }

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
    } finally {
      await releaseLensTargetObject(webContentsId, objectId);
    }
  });
}

export async function typeText(
  webContentsId: number,
  text: string,
  target?: string,
): Promise<void> {
  await assertCdpAllowedForWebContentsId(webContentsId, "type into page");
  await withLensGuestFocus(webContentsId, "type into page", async () => {
    if (target) {
      /*
       * Focus is checked, not assumed. The old version fired `?.focus()` and
       * dropped the result, so typing into a target that matched nothing — or a
       * ref whose element had been removed — inserted the text wherever the
       * caret happened to be. For an agent filling a form that is a silent
       * write into the wrong field.
       *
       * This is the *page's* focus, inside a guest whose native focus
       * `withLensGuestFocus` has already borrowed. Both are needed: the borrow
       * decides which WebContents Chromium delivers to, this decides which
       * element inside it receives.
       */
      const focused = await callOnLensTarget<boolean>(
        webContentsId,
        target,
        `function () {
          this.focus();
          return document.activeElement === this;
        }`,
      );
      if (focused !== true) {
        throw new Error(
          `Cannot type into ${describeLensTarget(webContentsId, target)}: it could not take focus, so the text would land elsewhere.`,
        );
      }
    }

    await sendCommand(webContentsId, "Input.insertText", { text });
  });
}

export async function setElementStyle(
  webContentsId: number,
  target: string,
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

  const edits = await callOnLensTarget<LensStyleEdit[]>(
    webContentsId,
    target,
    `function () {
      const patch = ${JSON.stringify(safePatch)};
      const edits = [];
      const computed = window.getComputedStyle(this);
      for (const [property, after] of Object.entries(patch)) {
        const cssProperty = property.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
        const before = computed.getPropertyValue(cssProperty);
        this.style[property] = String(after);
        edits.push({ property, before, after: String(after) });
      }
      return edits;
    }`,
  );

  if (!edits) {
    throw new Error(
      `Cannot restyle ${describeLensTarget(webContentsId, target)}: no element matched.`,
    );
  }

  return edits;
}
