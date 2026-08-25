/**
 * Attach ordering for CLI PTY sessions that outlive their renderer.
 *
 * Extracted from `useCliSessionManager` so the ordering invariant can be
 * asserted without a DOM: the hook itself is closure-heavy and untestable, and
 * this sequence is the part that silently corrupts a restore when it drifts.
 */

export interface CliSessionAttachResult {
  ok: boolean;
  attachmentId?: string;
  backlog?: string;
  screenState?: string;
  snapshotSequence?: number;
  stderr?: string;
}

export interface AttachCliSessionArgs {
  sessionId: string;
  /** Geometry the renderer was just measured at, in cells. */
  cols: number;
  rows: number;
  deliveryMode: "poll" | "push";
  /**
   * False for a PTY this renderer just spawned at `cols`x`rows` — it is already
   * the right shape, so re-sizing it would only cost an extra SIGWINCH.
   */
  adoptsExistingSession: boolean;
  resizeSession:
    | ((args: {
        sessionId: string;
        cols: number;
        rows: number;
      }) => Promise<{ ok?: boolean } | undefined | void>)
    | undefined;
  attachSession: (args: {
    sessionId: string;
    deliveryMode: "poll" | "push";
  }) => Promise<CliSessionAttachResult>;
}

/**
 * The host serializes `screenState` off its headless mirror at the PTY's
 * *current* geometry, so the snapshot is only replayable at the width the PTY
 * is sitting at. A renderer that boots at a different width — reopening a
 * surface the previous renderer sized differently, say — would rewrap every
 * restored row against the new viewport.
 *
 * Resizing before the attach is what removes that mismatch: the headless mirror
 * reflows first, so the snapshot arrives already shaped for the viewport it is
 * about to be written into, and the CLI gets a SIGWINCH so its next frame
 * agrees too. Resizing *after* the attach — the obvious ordering — leaves the
 * already-serialized snapshot stale and the corruption visible until the CLI
 * happens to repaint.
 *
 * `adoptedRendererSize` reports whether the pre-attach resize landed, so the
 * caller can suppress the reconciling resize it would otherwise send next.
 */
export async function attachCliSessionAtRendererSize(
  args: AttachCliSessionArgs,
): Promise<{
  attached: CliSessionAttachResult;
  adoptedRendererSize: boolean;
}> {
  let adoptedRendererSize = false;

  if (args.adoptsExistingSession && args.resizeSession) {
    try {
      const resized = await args.resizeSession({
        sessionId: args.sessionId,
        cols: args.cols,
        rows: args.rows,
      });
      adoptedRendererSize = Boolean(resized?.ok);
    } catch (error) {
      // A failed pre-size is recoverable: the attach still succeeds and the
      // caller's reconciling resize runs because the flag stayed false.
      console.warn("[cli-session] failed to pre-size backend session", error);
    }
  }

  const attached = await args.attachSession({
    sessionId: args.sessionId,
    deliveryMode: args.deliveryMode,
  });

  return { attached, adoptedRendererSize };
}
