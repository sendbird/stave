import { i18n } from "@/i18n";
import { copyTextToClipboard } from "@/lib/clipboard";
import { TRACKER_SOURCE_LABELS } from "@/lib/tracker-issues/context";
import type {
  TrackerIssueLinkState,
  TrackerIssueStaveLink,
} from "@/lib/tracker-issues/types";
import { toast } from "@/components/ui";

export { TRACKER_SOURCE_LABELS };

/**
 * How a Stave run reads on a tracker row.
 *
 * `staged` is styled as neutral rather than positive: a staged prompt has not
 * run, and badging it like a success is how a user ends up believing work
 * happened that never started.
 */
export const TRACKER_LINK_STATE_PRESENTATION: Record<
  TrackerIssueLinkState,
  {
    label: string;
    tone: "neutral" | "info" | "warning" | "success" | "danger";
    live: boolean;
  }
> = {
  staged: {
    get label() { return i18n.t("issues:trackerIssueUi.staged"); },
    tone: "neutral",
    live: false,
  },
  running: {
    get label() { return i18n.t("issues:trackerIssueUi.running"); },
    tone: "info",
    live: true,
  },
  needs_input: {
    get label() { return i18n.t("issues:trackerIssueUi.needsYou"); },
    tone: "warning",
    live: true,
  },
  completed: {
    get label() { return i18n.t("issues:trackerIssueUi.runFinished"); },
    tone: "success",
    live: false,
  },
  failed: {
    get label() { return i18n.t("issues:trackerIssueUi.failed"); },
    tone: "danger",
    live: false,
  },
  cancelled: {
    get label() { return i18n.t("issues:trackerIssueUi.cancelled"); },
    tone: "neutral",
    live: false,
  },
};

/**
 * Order the row badge picks from when a ticket has been kicked off more than
 * once.
 *
 * A live run always wins over a finished one, because that is the row the user
 * can act on; a failure outranks a completion so a retry that failed is not
 * hidden behind an older success.
 */
const LINK_STATE_PRIORITY: readonly TrackerIssueLinkState[] = [
  "needs_input",
  "running",
  "staged",
  "failed",
  "completed",
  "cancelled",
];

/** The one run a row should show, or `null` when the ticket has none. */
export function resolvePrimaryTrackerIssueLink(
  links: readonly TrackerIssueStaveLink[],
): TrackerIssueStaveLink | null {
  let best: TrackerIssueStaveLink | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const link of links) {
    const rank = LINK_STATE_PRIORITY.indexOf(link.state);
    const resolved = rank === -1 ? LINK_STATE_PRIORITY.length : rank;
    if (
      resolved < bestRank ||
      // Same state: the most recently touched run is the interesting one.
      (resolved === bestRank &&
        best !== null &&
        link.updatedAt > best.updatedAt)
    ) {
      best = link;
      bestRank = resolved;
    }
  }
  return best;
}

/**
 * Hand a ticket URL to the OS browser.
 *
 * Routed through the main process rather than `window.open`: the renderer must
 * not be able to navigate itself to a tracker-supplied address, and the shell
 * bridge is where the URL scheme is already validated.
 */
export function openTrackerIssueInBrowser(url: string) {
  const openExternal = window.api?.shell?.openExternal;
  if (!openExternal) {
    toast.error(i18n.t("issues:trackerIssueUi.openingLinksIsUnavailable"));
    return;
  }
  void openExternal({ url }).catch(() => {
    toast.error(i18n.t("issues:trackerIssueUi.couldNotOpenTheTicket"));
  });
}

export function copyTrackerIssueValue(args: { value: string; label: string }) {
  void copyTextToClipboard(args.value)
    .then(() => {
      toast.success(i18n.t("issues:trackerIssueUi.copiedValue", { value1: args.label }));
    })
    .catch(() => {
      toast.error(i18n.t("issues:trackerIssueUi.couldNotCopyTheValue", { value1: args.label }));
    });
}
