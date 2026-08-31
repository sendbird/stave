import { randomUUID } from "node:crypto";
import { getMainWindow } from "../window";
import {
  getBrowserSession,
  normalizeLensSessionId,
  resolveBrowserSessionReservation,
  type BrowserSessionState,
} from "./browser-manager";
import { restoreLensSessionUrl } from "./browser-session-recovery";
import type {
  LensGuestFocusRequestPayload,
  LensGuestFocusRestoreRequestPayload,
  LensGuestFocusRestoreResultPayload,
  LensGuestFocusResultPayload,
  LensGuestRequiredPayload,
  LensSessionProfileArgs,
} from "../../../src/lib/lens/lens.types";

/**
 * The two things main can only get from the renderer once Lens guests are
 * `<webview>` elements: a guest page, and focus on one.
 *
 * Both are request/response over one-way IPC, which needs an explicit
 * correlation id and an explicit timeout — a renderer that never answers must
 * fail an agent call loudly rather than leave it pending forever.
 */

/**
 * How long main waits for the renderer to mount a guest and bind it.
 *
 * Generous, because this covers spawning a renderer process for the guest and
 * attaching it. It is not a latency budget; it is the point past which the
 * renderer is presumed unable to answer.
 */
const GUEST_MOUNT_TIMEOUT_MS = 15_000;

/**
 * How long main waits for the renderer to hand a guest native focus.
 *
 * Deliberately short. This sits in front of every agent input dispatch, and the
 * failure it guards against — input silently landing on whatever else holds
 * focus, with the CDP call still reporting success — is worse than a slow
 * refusal.
 */
const GUEST_FOCUS_TIMEOUT_MS = 250;

type PendingGuest = {
  resolve: (session: BrowserSessionState) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type PendingFocus = {
  resolve: (result: LensGuestFocusResultPayload) => void;
  timer: NodeJS.Timeout;
};

type PendingFocusRestore = {
  resolve: () => void;
  timer: NodeJS.Timeout;
};

function guestKey(workspaceId: string, lensSessionId: string): string {
  // Normalize both ends: the request path keys through a resolved reservation
  // (already normalized), but the refusal and mount-failure paths receive the
  // raw renderer-supplied id. Keying them differently would make a fast-fail
  // miss its pending entry and leave the caller waiting out the mount timeout.
  return `${workspaceId}\u0000${normalizeLensSessionId(lensSessionId)}`;
}

const pendingGuests = new Map<string, PendingGuest>();
const pendingFocus = new Map<string, PendingFocus>();
const pendingFocusRestore = new Map<string, PendingFocusRestore>();

/**
 * Ask the renderer to mount a guest for a session main is opening on its own.
 *
 * Resolves with the wired session once the renderer has bound it. Rejects if no
 * renderer is available or it does not answer, which is the correct outcome:
 * without a host window there is nowhere for a Lens page to exist, and an agent
 * tool that pretends otherwise would fail later and less legibly.
 */
export function requestLensGuest(
  payload: LensGuestRequiredPayload,
): Promise<BrowserSessionState> {
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return Promise.reject(
      new Error("Lens needs an open Stave window to host a page"),
    );
  }

  const key = guestKey(payload.workspaceId, payload.lensSessionId);
  const existing = pendingGuests.get(key);
  if (existing) {
    return new Promise<BrowserSessionState>((resolve, reject) => {
      // Chain onto the in-flight request rather than asking for a second guest
      // for the same session; the renderer would refuse to mount one anyway.
      const previousResolve = existing.resolve;
      const previousReject = existing.reject;
      existing.resolve = (session) => {
        previousResolve(session);
        resolve(session);
      };
      existing.reject = (error) => {
        previousReject(error);
        reject(error);
      };
    });
  }

  return new Promise<BrowserSessionState>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Reject through the map entry, not this closure's `reject`: a later
      // caller for the same key chains onto this entry by wrapping its
      // `resolve`/`reject`, so the raw local settles only the first caller and
      // would strand every chained one. Everything that settles a pending guest
      // — bind, failure, abort — goes through `pending.reject` for this reason.
      const pending = pendingGuests.get(key);
      if (!pending) {
        return;
      }
      pendingGuests.delete(key);
      pending.reject(
        new Error(
          `Timed out after ${
            GUEST_MOUNT_TIMEOUT_MS / 1000
          }s waiting for the Stave window to open a Lens page`,
        ),
      );
    }, GUEST_MOUNT_TIMEOUT_MS);
    // Node keeps the process alive for pending timers; this one must not.
    timer.unref?.();

    pendingGuests.set(key, { resolve, reject, timer });
    renderer.send("lens:guest-required", payload);
  });
}

/** Resolve any main-initiated request waiting on this session's guest. */
export function notifyLensGuestBound(session: BrowserSessionState): void {
  const key = guestKey(session.workspaceId, session.lensSessionId);
  const pending = pendingGuests.get(key);
  if (!pending) {
    return;
  }
  pendingGuests.delete(key);
  clearTimeout(pending.timer);
  pending.resolve(session);
}

/** Fail any main-initiated request for a guest the renderer could not mount. */
export function notifyLensGuestFailed(
  workspaceId: string,
  lensSessionId: string,
  message: string,
): void {
  const key = guestKey(workspaceId, lensSessionId);
  const pending = pendingGuests.get(key);
  if (!pending) {
    return;
  }
  pendingGuests.delete(key);
  clearTimeout(pending.timer);
  pending.reject(new Error(message));
}

/**
 * Borrow native DOM focus for a session's guest, and report whether it worked.
 *
 * Callers must treat a false result as a refusal to dispatch input. Continuing
 * anyway is the failure this exists to prevent: Chromium would route the
 * synthesized events to whatever holds focus instead, and the CDP command would
 * still return success.
 */
export function borrowLensGuestFocus(args: {
  workspaceId: string;
  lensSessionId: string;
}): Promise<LensGuestFocusResultPayload> {
  const requestId = randomUUID();
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return Promise.resolve({
      requestId,
      ok: false,
      message: "No Stave window is available to focus the Lens page",
    });
  }

  return new Promise<LensGuestFocusResultPayload>((resolve) => {
    const timer = setTimeout(() => {
      pendingFocus.delete(requestId);
      resolve({
        requestId,
        ok: false,
        message: `The Stave window did not confirm Lens focus within ${GUEST_FOCUS_TIMEOUT_MS}ms`,
      });
    }, GUEST_FOCUS_TIMEOUT_MS);
    timer.unref?.();

    pendingFocus.set(requestId, { resolve, timer });
    renderer.send("lens:focus-guest", {
      requestId,
      workspaceId: args.workspaceId,
      lensSessionId: args.lensSessionId,
    } satisfies LensGuestFocusRequestPayload);
  });
}

/** Settle a focus borrow with the renderer's answer. */
export function resolveLensGuestFocus(
  payload: LensGuestFocusResultPayload,
): void {
  const pending = pendingFocus.get(payload.requestId);
  if (!pending) {
    return;
  }
  pendingFocus.delete(payload.requestId);
  clearTimeout(pending.timer);
  pending.resolve(payload);
}

/**
 * Give back the host focus the borrow `borrowRequestId` took for CDP input.
 *
 * Must be sent for every borrow *attempted*, not only for every borrow that
 * was confirmed. A borrow whose confirmation missed the short wait below was
 * still granted by the renderer a moment later, and without a release for it
 * the guest keeps the caret — the exact failure the borrow/release pair
 * exists to prevent. The renderer keys releases by borrow id, so releasing a
 * borrow that was never granted is a no-op rather than a release of somebody
 * else's outstanding borrow.
 *
 * Best-effort: a restore that times out must not fail the click or type that
 * already landed. The renderer is expected to answer in the same budget as
 * the borrow so the MCP tool does not return while PromptInput is still
 * unfocused.
 */
export function releaseLensGuestFocus(borrowRequestId: string): Promise<void> {
  const requestId = randomUUID();
  const renderer = getMainWindow()?.webContents;
  if (!renderer || renderer.isDestroyed()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pendingFocusRestore.delete(requestId);
      resolve();
    }, GUEST_FOCUS_TIMEOUT_MS);
    timer.unref?.();

    pendingFocusRestore.set(requestId, { resolve, timer });
    renderer.send("lens:restore-guest-focus", {
      requestId,
      borrowRequestId,
    } satisfies LensGuestFocusRestoreRequestPayload);
  });
}

/** Settle a focus restore with the renderer's answer. */
export function resolveLensGuestFocusRestore(
  payload: LensGuestFocusRestoreResultPayload,
): void {
  const pending = pendingFocusRestore.get(payload.requestId);
  if (!pending) {
    return;
  }
  pendingFocusRestore.delete(payload.requestId);
  clearTimeout(pending.timer);
  pending.resolve();
}

/**
 * Get a live Lens session, asking the renderer for a guest page if there is not
 * one already.
 *
 * The single path onto the surface. Both the panel opening a tab and an agent
 * calling `stave_lens_*` land here, so there is one answer to "what does an open
 * session mean" and one place where a guest comes into existence.
 *
 * A session whose guest has died — a crashed page, a reloaded renderer — counts
 * as absent. Returning it would hand the caller a session that answers nothing.
 * A replacement guest is sent back to the page the dead one was on, so the
 * death is recoverable rather than merely survivable; `restorePreviousUrl`
 * turns that off for the one caller that is about to navigate somewhere else
 * anyway, whose own load would otherwise abort the restore and log the abort as
 * a page error.
 */
export async function ensureBrowserSessionGuest(
  workspaceId: string,
  options?: Omit<LensSessionProfileArgs, "workspaceId"> & {
    lensSessionId?: string;
    restorePreviousUrl?: boolean;
  },
): Promise<{ session: BrowserSessionState; created: boolean }> {
  const { lensSessionId, sessionProfile } = resolveBrowserSessionReservation(
    workspaceId,
    options,
  );

  const existing = getBrowserSession(workspaceId, lensSessionId);
  if (existing && !existing.webContents.isDestroyed()) {
    return { session: existing, created: false };
  }

  const session = await requestLensGuest({
    workspaceId,
    lensSessionId,
    partition: sessionProfile.partition,
    sessionScope: sessionProfile.scope,
    projectKey: options?.projectKey ?? null,
  });

  if (options?.restorePreviousUrl !== false) {
    restoreLensSessionUrl({
      workspaceId,
      lensSessionId,
      webContents: session.webContents,
    });
  }

  return { session, created: true };
}

/** Fail every outstanding request. Used when the host window goes away. */
export function abortPendingLensGuestRequests(reason: string): void {
  for (const [key, pending] of [...pendingGuests]) {
    pendingGuests.delete(key);
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }
  for (const [requestId, pending] of [...pendingFocus]) {
    pendingFocus.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve({ requestId, ok: false, message: reason });
  }
}
