import { TarsShowViewSchema, type TarsActionReceipt, type TarsShowView } from "./conversation";
import { TARS_CONVERSATION_MIN_WIDTH, TARS_TRAY_PINNED_MIN_WIDTH, TARS_TRAY_WIDTH } from "./tray-model";

/**
 * What the side view shows about one responsibility: what it was handed (its
 * request: the user's message, Tars's instruction and the completion
 * criteria), its frozen result report, its execution workspace's changes, its
 * run timeline or its independent review. The request is opened by the user
 * only; a `show` action names one of the others.
 */
export type TarsSideViewKind = "brief" | TarsShowView;
export const TARS_SIDE_VIEW_KINDS: readonly TarsSideViewKind[] = ["brief", ...TarsShowViewSchema.options];

/**
 * Where the side view opens. `focus` scrolls to a part of the kind: the report's
 * unmet criteria (a blocked card), or one stage of the timeline (a flow node).
 */
export interface TarsSideViewTarget {
  responsibilityId: string;
  /** An artifact stays bound to its execution when the work continues. */
  agentRunId?: string;
  kind: TarsSideViewKind;
  focus?: { unmet: true } | { stageId: string };
}

/** Below the pinned width the side view opens between the conversation and the composer, at most this share of the view's height. */
export const TARS_SIDE_VIEW_NARROW_HEIGHT_SHARE = 0.4;

export type TarsSideViewPlacement =
  | { placement: "column"; width: number; conversationWidth: number }
  | { placement: "inline"; maxHeight: number };

/**
 * Wide: the side view takes the tray's column at the tray's own width (the
 * same StyleX column, `tarsTrayStyles.panel`), so switching between the tray
 * and a view never moves the conversation; it never leaves the conversation
 * under its 440px floor. Narrow: it sits inline, capped at 40% of the view's
 * height and scrolled.
 */
export function tarsSideViewPlacement(view: { width: number; height: number }): TarsSideViewPlacement {
  if (view.width >= TARS_TRAY_PINNED_MIN_WIDTH) {
    const width = Math.min(TARS_TRAY_WIDTH, view.width - TARS_CONVERSATION_MIN_WIDTH);
    return { placement: "column", width, conversationWidth: view.width - width };
  }
  return { placement: "inline", maxHeight: Math.floor(Math.max(0, view.height) * TARS_SIDE_VIEW_NARROW_HEIGHT_SHARE) };
}

/** A `show` receipt's identity: one opening per admitted action, however often the conversation is read. */
export function tarsShowReceiptKey(receipt: Pick<TarsActionReceipt, "messageId" | "actionIndex">) {
  return `${receipt.messageId}:${receipt.actionIndex}`;
}

/**
 * The `show` actions the host admitted since `seen` was taken, oldest first.
 * The first read of a conversation only records what is already there, so
 * reopening Tars never replays an old "show me the report".
 */
export function selectNewTarsShowRequests(receipts: readonly TarsActionReceipt[], seen: ReadonlySet<string> | null): {
  requests: TarsSideViewTarget[]; seen: Set<string>;
} {
  const shown = receipts.filter((receipt) => receipt.status === "applied" && receipt.action.kind === "show");
  const next = new Set(seen ?? []);
  const requests: TarsSideViewTarget[] = [];
  for (const receipt of [...shown].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    const key = tarsShowReceiptKey(receipt);
    if (next.has(key)) continue;
    next.add(key);
    if (seen && receipt.action.kind === "show" && receipt.responsibilityId)
      requests.push({ responsibilityId: receipt.responsibilityId, kind: receipt.action.view });
  }
  return { requests, seen: next };
}

/** How long an admitted `show` waits for its responsibility to reach this window's snapshot. */
export const TARS_SHOW_PENDING_MS = 10_000;

export interface TarsPendingShow {
  target: TarsSideViewTarget;
  /** Epoch milliseconds after which it is dropped. */
  until: number;
}

/**
 * Whether a `show` opens now. A request whose responsibility is not in the
 * snapshot yet (or no snapshot was read) waits, at most `TARS_SHOW_PENDING_MS`,
 * and is tried again with each snapshot; a newer request replaces it.
 */
export function settleTarsShowRequest(args: {
  pending: TarsPendingShow | null; incoming: TarsSideViewTarget | null; responsibilityIds: ReadonlySet<string> | null; now: number;
}): { open: TarsSideViewTarget | null; pending: TarsPendingShow | null } {
  const candidate = args.incoming ? { target: args.incoming, until: args.now + TARS_SHOW_PENDING_MS } : args.pending;
  if (!candidate || candidate.until < args.now) return { open: null, pending: null };
  if (args.responsibilityIds?.has(candidate.target.responsibilityId)) return { open: candidate.target, pending: null };
  return { open: null, pending: candidate };
}

/** Esc that belongs to the side view: not mid-composition (IME) and not already used by a nearer layer. */
export function isTarsSideViewEscape(event: { key: string; defaultPrevented: boolean; isComposing?: boolean; keyCode?: number }) {
  return event.key === "Escape" && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229;
}
