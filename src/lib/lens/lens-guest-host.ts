import { UI_LAYER_VALUE } from "@/lib/ui-layers";
import {
  EMPTY_LENS_GUEST_FOCUS_BORROW,
  beginLensGuestFocusBorrow,
  finishLensGuestFocusBorrow,
  type LensFocusableHost,
  type LensGuestFocusBorrowState,
} from "./lens-guest-focus-borrow";
import {
  createLensGuestPointerPassthroughTracker,
  createLensGuestPresenterRegistry,
  shouldParkLensGuestForWorkspace,
} from "./lens-guest-interaction";
import {
  areLensGuestRectsEqual,
  isLensGuestVisuallyPresented,
  resolveLensGuestStyle,
  type LensGuestPlacement,
} from "./lens-guest-placement";
import type { LensBounds } from "./lens.types";

/**
 * The renderer's registry of Lens guest pages.
 *
 * Deliberately not a React component. Two properties depend on it:
 *
 * 1. **A guest dies with its DOM parent.** Removing a `<webview>` from the
 *    document destroys its `WebContents`, page state and all. Dockview
 *    reparents panes freely and React re-runs effects (twice, in StrictMode),
 *    so a guest reconciled by React would be destroyed and rebuilt by layout
 *    changes that have nothing to do with the session. Here every guest lives
 *    in one flat container that is created once and never moves, and only an
 *    explicit release removes one.
 * 2. **Geometry is a style write, not a render.** Mirroring a pane's rectangle
 *    is a per-frame operation during a sash drag. Routing it through React
 *    state would re-render the panel tree at drag rate to move one element.
 *
 * Panels address guests through `LensSurfaceHostHandle`; nothing outside this
 * module holds an element reference.
 */

/** Structural slice of Electron's `<webview>` element that Lens actually uses. */
type LensGuestElement = HTMLElement & {
  /** Valid only after `did-attach`; throws before the guest exists. */
  getWebContentsId(): number;
};

export type LensGuestIdentity = {
  workspaceId: string;
  lensSessionId: string;
};

export type LensGuestDescriptor = LensGuestIdentity & {
  partition: string;
};

export const LENS_SURFACE_ROOT_ID = "lens-surface-root";

export function lensGuestKey(identity: LensGuestIdentity): string {
  return `${identity.workspaceId}\u0000${identity.lensSessionId}`;
}

type GuestRecord = {
  descriptor: LensGuestDescriptor;
  element: LensGuestElement;
  /**
   * Pane chrome that has to paint *over* the page.
   *
   * It cannot live in the panel. A Lens panel is rendered through Dockview's
   * `renderer: "always"` path into `.dv-render-overlay`, which is a stacking
   * context three times over (`isolation: isolate`, `contain: layout paint`,
   * `transform: translate3d(0,0,0)`) with its own `z-index: 1`. Any z-index the
   * panel gives its own chrome is scoped inside that context and can never
   * exceed the guest plane's, so a loading badge or a load-error strip drawn in
   * the pane is painted *behind* an opaque page and is simply never seen.
   *
   * Here it is a sibling of the guest in the same flat root, carrying the same
   * rectangle, so ordinary stacking applies and the chrome wins.
   */
  chromeLayer: HTMLDivElement;
  /** Resolves with the guest's WebContents id once it has attached. */
  attached: Promise<number>;
  placement: LensGuestPlacement;
  /** Last style object written, so unchanged layout writes nothing. */
  appliedStyle: ReturnType<typeof resolveLensGuestStyle> | null;
};

const guests = new Map<string, GuestRecord>();

/**
 * Sessions that currently have a mounted panel. A guest is revealed only while
 * its key is claimed here; see `claimLensGuestPresenter`.
 */
const presenters = createLensGuestPresenterRegistry();

let surfaceRoot: HTMLDivElement | null = null;
let focusBorrow: LensGuestFocusBorrowState = EMPTY_LENS_GUEST_FOCUS_BORROW;
let isGuestPointerPassthroughActive = false;

const guestPointerPassthrough = createLensGuestPointerPassthroughTracker(
  (active) => {
    isGuestPointerPassthroughActive = active;
    for (const key of guests.keys()) {
      applyPlacement(key);
    }
  },
);

function findGuestRecordByElement(
  element: LensFocusableHost | null,
): GuestRecord | null {
  if (!element) {
    return null;
  }
  for (const record of guests.values()) {
    if (record.element === element) {
      return record;
    }
  }
  return null;
}

function isLensGuestElement(element: LensFocusableHost | null): boolean {
  return findGuestRecordByElement(element) !== null;
}

function isParkedLensGuestElement(element: LensFocusableHost): boolean {
  const record = findGuestRecordByElement(element);
  return record !== null && !isLensGuestVisuallyPresented(record.placement);
}

function asFocusable(element: Element | null): LensFocusableHost | null {
  return element instanceof HTMLElement ? element : null;
}

/**
 * The one container every guest lives in.
 *
 * `position: fixed; inset: 0` makes it the containing block for its children,
 * so a rectangle measured with `getBoundingClientRect()` can be written to a
 * child's `left`/`top` unchanged — no scroll offset, no zoom factor, no
 * device-pixel conversion.
 *
 * The product shell owns this root inside its main stacking context. That
 * placement is load-bearing: a body-level root at the same z-index as the
 * opaque app surface paints behind the app and makes a live guest invisible.
 * Isolated harnesses without the shell use the body-level fallback below.
 */
function ensureSurfaceRoot(): HTMLDivElement {
  if (surfaceRoot?.isConnected) {
    return surfaceRoot;
  }

  const existing = document.getElementById(LENS_SURFACE_ROOT_ID);
  if (existing instanceof HTMLDivElement) {
    surfaceRoot = existing;
    return existing;
  }

  // Isolated renderer harnesses do not mount AppShell, so retain a complete
  // fallback rather than making the guest host product-DOM-only.
  const root = document.createElement("div");
  root.id = LENS_SURFACE_ROOT_ID;
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.top = "0";
  root.style.right = "0";
  root.style.bottom = "0";
  root.style.zIndex = String(UI_LAYER_VALUE.lensSurface);
  // The container spans the viewport but owns none of it. Only a presented
  // guest takes pointer events, and it takes them for its own rectangle.
  root.style.pointerEvents = "none";
  document.body.insertBefore(root, document.body.firstChild);
  surfaceRoot = root;
  return root;
}

function createGuestElement(descriptor: LensGuestDescriptor): LensGuestElement {
  const element = document.createElement("webview") as LensGuestElement;

  /*
   * `partition` is the only preference the tag carries, and it is not trusted
   * on its own: main's `will-attach-webview` clamp refuses any partition that
   * is not a Lens one and force-sets every web preference for the ones it
   * allows. Nothing is passed through `webpreferences`, whose attribute parser
   * splits on `,` without trimming and treats any non-empty string as true.
   */
  element.setAttribute("partition", descriptor.partition);
  element.setAttribute("src", "about:blank");
  /*
   * Popups reach `setWindowOpenHandler` in main, which denies every one of them
   * and opens auth flows in a Stave-owned window instead. Without this
   * attribute Chromium blocks `window.open` before main is consulted, and OAuth
   * sign-in inside a Lens page stops working.
   */
  element.setAttribute("allowpopups", "");

  element.style.position = "absolute";
  // Keep Electron's required `display: flex`. A block webview sizes its outer
  // box correctly but can leave the internal guest frame at content height.
  element.style.margin = "0";
  element.style.border = "0";
  element.style.boxSizing = "border-box";
  element.style.minWidth = "0";
  element.style.minHeight = "0";
  /*
   * Guests start parked: nothing has measured a rectangle for one yet, and a
   * session opened by an agent may never be shown at all. Parking is
   * `opacity: 0` rather than `visibility: hidden` because a guest Chromium
   * does not composite cannot answer a screenshot — see `resolveLensGuestStyle`.
   */
  element.style.opacity = "0";
  element.style.pointerEvents = "none";

  element.dataset.lensWorkspaceId = descriptor.workspaceId;
  element.dataset.lensSessionId = descriptor.lensSessionId;
  // Explicit, so the chrome layer below can state a higher one rather than
  // relying on document order to settle a paint against an OOPIF.
  element.style.zIndex = "0";

  return element;
}

/**
 * The pane-chrome plane for one guest.
 *
 * `pointer-events: none` by default: this rectangle covers the whole page, and
 * chrome that wants clicks opts in per element. `overflow: hidden` keeps it
 * clipped to the pane, which the pane's own ancestors would otherwise have done.
 */
function createChromeLayer(descriptor: LensGuestDescriptor): HTMLDivElement {
  const layer = document.createElement("div");
  layer.dataset.lensGuestChrome = "";
  layer.dataset.lensWorkspaceId = descriptor.workspaceId;
  layer.dataset.lensSessionId = descriptor.lensSessionId;
  layer.style.position = "absolute";
  layer.style.margin = "0";
  layer.style.border = "0";
  layer.style.overflow = "hidden";
  layer.style.pointerEvents = "none";
  layer.style.opacity = "0";
  layer.style.zIndex = "1";
  return layer;
}

/**
 * Wait for a guest's WebContents id.
 *
 * Two events, because one is not enough. `did-attach` is usually the moment the
 * id becomes readable and is the fast path, but `getWebContentsId` states its
 * own precondition in the error it throws — attached to the DOM *and*
 * `dom-ready` emitted — and the old code waited for only the first half of it.
 *
 * Not theoretical: reopening a session immediately after closing it failed with
 * exactly that error, once, and a hard failure there is a session an agent
 * cannot get back. It did not reproduce in six further runs, so the frequency is
 * unknown and the fix is written to cost nothing when the fast path holds: the
 * id is read on whichever event first offers one, and only a `dom-ready` that
 * still cannot produce one is a failure. A guest that reaches neither is caught
 * by main's mount timeout, as it was before.
 */
function waitForAttach(element: LensGuestElement): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tryResolve = (): boolean => {
      let webContentsId: number;
      try {
        webContentsId = element.getWebContentsId();
      } catch {
        return false;
      }
      cleanup();
      resolve(webContentsId);
      return true;
    };
    const onAttach = () => {
      tryResolve();
    };
    const onDomReady = () => {
      if (tryResolve()) {
        return;
      }
      cleanup();
      reject(new Error("Lens guest attached without a WebContents id"));
    };
    const onDestroyed = () => {
      cleanup();
      reject(new Error("Lens guest was destroyed before it attached"));
    };
    const cleanup = () => {
      element.removeEventListener("did-attach", onAttach);
      element.removeEventListener("dom-ready", onDomReady);
      element.removeEventListener("destroyed", onDestroyed);
    };

    element.addEventListener("did-attach", onAttach);
    element.addEventListener("dom-ready", onDomReady);
    element.addEventListener("destroyed", onDestroyed);
  });
}

/**
 * Mount a fresh guest page for a session, and hand back its WebContents id.
 *
 * Main sends the request that lands here only when it has no live guest for the
 * session — a first open, or a rebuild after the previous page died. So any
 * element still lingering for this key is stale by definition and is torn down
 * first: reusing it would hand main a WebContents id whose page main has
 * already forgotten, or one detached from the document, which `getWebContentsId`
 * refuses outright.
 */
export function ensureLensGuest(
  descriptor: LensGuestDescriptor,
): Promise<number> {
  const key = lensGuestKey(descriptor);
  releaseLensGuest(descriptor);

  const element = createGuestElement(descriptor);
  const chromeLayer = createChromeLayer(descriptor);
  const attached = waitForAttach(element);
  guests.set(key, {
    descriptor,
    element,
    chromeLayer,
    attached,
    placement: { rect: null, presented: false },
    appliedStyle: null,
  });

  applyPlacement(key);
  ensureSurfaceRoot().append(element, chromeLayer);

  return attached.catch((error: unknown) => {
    // A guest that never attached is not a guest. Drop it so the next attempt
    // is a fresh mount rather than an await on a permanently rejected promise.
    if (guests.get(key)?.element === element) {
      releaseLensGuest(descriptor);
    }
    throw error;
  });
}

/**
 * Destroy a session's guest page.
 *
 * Removing the element from the document is what destroys the `WebContents`;
 * there is nothing else to call and nothing to wait for.
 */
export function releaseLensGuest(identity: LensGuestIdentity): void {
  const key = lensGuestKey(identity);
  const record = guests.get(key);
  if (!record) {
    return;
  }
  guests.delete(key);
  record.element.remove();
  record.chromeLayer.remove();
}

/**
 * The element a panel portals its over-the-page chrome into.
 *
 * `null` until a guest exists, which is also the only time such chrome has
 * anything to sit over.
 */
export function getLensGuestChromeLayer(
  identity: LensGuestIdentity,
): HTMLDivElement | null {
  return guests.get(lensGuestKey(identity))?.chromeLayer ?? null;
}

function applyPlacement(key: string): void {
  const record = guests.get(key);
  if (!record) {
    return;
  }

  const style = resolveLensGuestStyle(record.placement);
  const pointerEvents = isGuestPointerPassthroughActive
    ? "none"
    : style.pointerEvents;
  const previous = record.appliedStyle;
  if (
    previous &&
    previous.left === style.left &&
    previous.top === style.top &&
    previous.width === style.width &&
    previous.height === style.height &&
    previous.opacity === style.opacity &&
    previous.pointerEvents === pointerEvents
  ) {
    return;
  }

  record.appliedStyle = { ...style, pointerEvents };
  const target = record.element.style;
  target.left = style.left;
  target.top = style.top;
  target.width = style.width;
  target.height = style.height;
  target.opacity = style.opacity;
  target.pointerEvents = pointerEvents;

  // The chrome plane shares the guest's rectangle and its visibility, but never
  // its hit-testing: it is a sheet over the page, and only the elements a panel
  // puts inside it opt back into pointer events.
  const chrome = record.chromeLayer.style;
  chrome.left = style.left;
  chrome.top = style.top;
  chrome.width = style.width;
  chrome.height = style.height;
  chrome.opacity = style.opacity;
}

/**
 * Move or show a session's guest.
 *
 * `rect` is a rectangle in host-document coordinates, normally the one a panel
 * measured for its placeholder. Passing `null` keeps whatever the guest already
 * had, which is what a panel unmounting wants: hidden at its old size, ready to
 * re-show without a relayout.
 */
export function setLensGuestPlacement(
  identity: LensGuestIdentity,
  placement: { rect?: LensBounds | null; presented: boolean },
): void {
  const key = lensGuestKey(identity);
  const record = guests.get(key);
  if (!record) {
    return;
  }

  const nextRect =
    placement.rect === undefined ? record.placement.rect : placement.rect;
  // Revealing is a panel's privilege. A `presented: true` from anything that
  // has not claimed the guest — a panel mid-teardown, or one that addressed a
  // same-id session in another workspace for a frame — is a park.
  const presented = placement.presented && presenters.has(key);
  if (
    record.placement.presented === presented &&
    areLensGuestRectsEqual(record.placement.rect, nextRect)
  ) {
    return;
  }

  record.placement = { rect: nextRect, presented };
  applyPlacement(key);
}

/**
 * Register the panel that presents a session, for as long as it is mounted.
 *
 * Until this is called, `setLensGuestPlacement` refuses to reveal the guest.
 * The returned release parks the guest — unless a newer claim for the same
 * session has since taken over, in which case it leaves that panel's page
 * alone. Calling it is what makes "unmounted means hidden" hold on every
 * teardown path, including the ones that never got as far as attaching.
 */
export function claimLensGuestPresenter(
  identity: LensGuestIdentity,
): () => void {
  const release = presenters.claim(lensGuestKey(identity));
  return () => {
    if (release()) {
      setLensGuestPlacement(identity, { presented: false });
    }
  };
}

/**
 * Hide every guest that does not belong to the active workspace, and every
 * guest no panel claims.
 *
 * Must run on the workspace change itself. Waiting for the old panel to unmount
 * leaves the previous page painted over the incoming workspace for a frame —
 * or longer, when Dockview keep-alive holds the panel.
 */
export function parkLensGuestsOutsideWorkspace(
  workspaceId: string | null,
): void {
  for (const [key, record] of guests) {
    if (
      !shouldParkLensGuestForWorkspace({
        guestWorkspaceId: record.descriptor.workspaceId,
        activeWorkspaceId: workspaceId,
        presented: record.placement.presented,
        hasPresenter: presenters.has(key),
      })
    ) {
      continue;
    }
    setLensGuestPlacement(record.descriptor, { presented: false });
  }
}

/**
 * Make every guest ignore pointers for the duration of a host drag.
 *
 * A `<webview>` swallows hits at the native layer. A sash or sidebar drag that
 * crosses the page therefore never delivers `pointerup` to Dockview or the
 * host, and the pane stays in resize mode until something else resets it.
 */
export function acquireLensGuestPointerPassthrough(pointerId: number): void {
  guestPointerPassthrough.acquire(pointerId);
}

/** Release one host pointer without disturbing any other active drag. */
export function releaseLensGuestPointerPassthrough(pointerId: number): void {
  guestPointerPassthrough.release(pointerId);
}

/** Clear every pointer acquisition after a host lifecycle boundary. */
export function resetLensGuestPointerPassthrough(): void {
  guestPointerPassthrough.reset();
}

/**
 * Give a session's guest native DOM focus.
 *
 * The reason main cannot do this itself: `webContents.focus()` is a no-op for a
 * guest, so only the embedding renderer can hand it focus — and CDP input
 * dispatched to an unfocused guest is delivered to whatever *is* focused while
 * still reporting success.
 *
 * This is a borrow, not a transfer. Call `restoreLensGuestFocus` after the
 * dispatch so a parked guest in another workspace cannot keep the caret.
 */
export function focusLensGuest(
  identity: LensGuestIdentity,
  borrowId: string,
): boolean {
  const record = guests.get(lensGuestKey(identity));
  if (!record || !record.element.isConnected) {
    return false;
  }
  focusBorrow = beginLensGuestFocusBorrow({
    borrowId,
    guest: record.element,
    activeElement: asFocusable(document.activeElement),
    state: focusBorrow,
  });
  record.element.focus();
  return true;
}

/**
 * Settle the borrow `borrowId` names and return native focus to the host.
 *
 * Focus goes back to the control that held it before the borrow. When there is
 * no such control left, a still-focused *parked* guest is blurred rather than
 * left holding an invisible caret. No-op for a borrow this renderer never
 * granted, or while an inner borrow is still outstanding.
 */
export function restoreLensGuestFocus(borrowId: string): void {
  const { state, restoreTarget, blurTarget } = finishLensGuestFocusBorrow({
    borrowId,
    state: focusBorrow,
    activeElement: asFocusable(document.activeElement),
    isGuestElement: isLensGuestElement,
    isParkedGuestElement: isParkedLensGuestElement,
    isReturnTargetLive: (target) =>
      target instanceof HTMLElement && target.isConnected,
  });
  focusBorrow = state;
  restoreTarget?.focus({ preventScroll: true });
  blurTarget?.blur();
}
