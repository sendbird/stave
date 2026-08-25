/**
 * Deciding whether a renderer-nominated `WebContents` may become the guest of
 * a Lens session.
 *
 * With a `<webview>` the renderer creates the page, so the id that arrives here
 * is chosen by the renderer and everything downstream — navigation policy, CDP
 * approval, console and network capture, the credential vault — is scoped by
 * whatever session it gets bound to. That makes this the boundary check: a
 * renderer must not be able to point a Lens session at a `WebContents` it does
 * not own, or at one belonging to a different partition than the profile
 * resolved for the session.
 *
 * Pure, so the rules can be tested without an Electron window. The IPC handler
 * does the reflection (`getType`, `hostWebContents`, `session`) and hands the
 * answers in.
 */

export type LensGuestBindCandidate = {
  /** `webContents.getType()`. Only a real `<webview>` guest is eligible. */
  type: string;
  /**
   * `webContents.hostWebContents?.id`. For a `<webview>` this is the embedder.
   * Null when the `WebContents` is not embedded at all.
   */
  hostWebContentsId: number | null;
  /**
   * Whether `webContents.session` is the very Session object
   * `session.fromPartition(<resolved partition>)` returns.
   *
   * Identity rather than a name comparison on purpose: `fromPartition` is
   * memoized per partition string, so identity answers "is this guest actually
   * running in the partition we resolved for this session" without trusting a
   * renderer-supplied label.
   */
  isExpectedPartition: boolean;
  isDestroyed: boolean;
};

/** The session's current guest, when it already has one. */
export type LensGuestBindIncumbent = {
  webContentsId: number;
  isDestroyed: boolean;
};

export type LensGuestBindDecision =
  | { ok: true; replacesIncumbent: boolean }
  | { ok: false; reason: string };

export function decideLensGuestBind(args: {
  candidate: LensGuestBindCandidate;
  candidateWebContentsId: number;
  /** WebContents id of the window allowed to embed Lens guests. */
  hostWebContentsId: number;
  incumbent: LensGuestBindIncumbent | null;
}): LensGuestBindDecision {
  const { candidate, candidateWebContentsId, hostWebContentsId, incumbent } =
    args;

  if (candidate.isDestroyed) {
    return { ok: false, reason: "the nominated guest is already destroyed" };
  }

  if (candidate.type !== "webview") {
    return {
      ok: false,
      reason: `webContents ${candidateWebContentsId} is a "${candidate.type}", not a webview guest`,
    };
  }

  if (candidate.hostWebContentsId !== hostWebContentsId) {
    return {
      ok: false,
      reason: `webContents ${candidateWebContentsId} is embedded by ${
        candidate.hostWebContentsId ?? "nothing"
      }, not by the Lens host window`,
    };
  }

  if (!candidate.isExpectedPartition) {
    return {
      ok: false,
      reason: `webContents ${candidateWebContentsId} does not run in the partition resolved for this session`,
    };
  }

  if (!incumbent) {
    return { ok: true, replacesIncumbent: false };
  }

  if (incumbent.webContentsId === candidateWebContentsId) {
    return { ok: true, replacesIncumbent: false };
  }

  // A live incumbent is authoritative. Rebinding is for the case where the
  // renderer lost its element — a reload, a crashed guest — and is restoring
  // the session, not for pointing a live session somewhere else mid-flight.
  if (!incumbent.isDestroyed) {
    return {
      ok: false,
      reason: `session already has a live guest (webContents ${incumbent.webContentsId})`,
    };
  }

  return { ok: true, replacesIncumbent: true };
}
