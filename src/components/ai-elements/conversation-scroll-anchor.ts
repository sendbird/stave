/**
 * Keeping a clicked disclosure where the reader clicked it.
 *
 * Opening a trace (or any row that expands in place) grows the transcript
 * below the trigger. When the conversation was following the latest message,
 * that growth was read as new output and the view was pinned to the new
 * bottom, so the trigger the reader had just pressed scrolled hundreds of
 * pixels off screen. The conversation now treats the toggle as the reader's
 * own action: it holds the trigger at the viewport position it had before the
 * click while the panel animates, and only resumes following the bottom when
 * the reader was at the bottom before the click and the toggle did not open
 * something for them to read.
 */

/** How long the trigger is held in place: the open/close motion plus layout settling. */
export const DISCLOSURE_ANCHOR_HOLD_MS = 360;

/**
 * The scroll position that puts the anchor back where it was, clamped to the
 * container's scroll range.
 */
export function correctAnchorScrollTop(args: {
  scrollTop: number;
  anchorTopBefore: number;
  anchorTopNow: number;
  maxScrollTop: number;
}): number {
  const drift = args.anchorTopNow - args.anchorTopBefore;
  if (Math.abs(drift) < 0.5) {
    return args.scrollTop;
  }
  return Math.min(Math.max(args.scrollTop + drift, 0), Math.max(args.maxScrollTop, 0));
}

/**
 * Whether the conversation follows the latest message once the toggle has
 * settled. Following resumes only for a reader who was already at the bottom,
 * and not when the toggle opened content that now extends below the view:
 * pulling them past what they just opened is the jump this prevents.
 */
export function shouldFollowAfterDisclosureToggle(args: {
  wasAtBottom: boolean;
  atBottomNow: boolean;
  expandedNow: boolean;
}): boolean {
  return args.wasAtBottom && (args.atBottomNow || !args.expandedNow);
}

/**
 * The in-place disclosure trigger a click landed on, if any. Menu, listbox and
 * dialog triggers also report `aria-expanded`, but they open a layer above
 * the transcript rather than growing it, so they declare `aria-haspopup` and
 * are left alone.
 */
export function findDisclosureTrigger(
  target: EventTarget | null,
  container: HTMLElement,
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const trigger = target.closest<HTMLElement>("[aria-expanded]");
  if (!trigger || !container.contains(trigger)) {
    return null;
  }
  const popup = trigger.getAttribute("aria-haspopup");
  if (popup && popup !== "false") {
    return null;
  }
  return trigger;
}
