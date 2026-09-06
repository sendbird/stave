import {
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Equal,
  Minus,
  type LucideIcon,
} from "lucide-react";

import { copyTextToClipboard } from "@/lib/clipboard";
import { TRACKER_SOURCE_LABELS } from "@/lib/tracker-tasks/context";
import type { TrackerPriorityIconName } from "@/lib/tracker-tasks/presentation";
import type {
  TrackerTaskLinkState,
  TrackerTaskStaveLink,
} from "@/lib/tracker-tasks/types";
import { toast } from "@/components/ui";

export { TRACKER_SOURCE_LABELS };

/**
 * Icon-name to component resolution for the priority glyph.
 *
 * `presentation.ts` deliberately returns names rather than components so it
 * stays importable without React; this map is the single place those names are
 * bound, so a row and a detail pane cannot disagree about what "high" looks
 * like.
 */
export const TRACKER_PRIORITY_ICONS: Record<
  TrackerPriorityIconName,
  LucideIcon
> = {
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown,
  Minus,
};

/**
 * How a Stave run reads on a tracker row.
 *
 * `staged` is styled as neutral rather than positive: a staged prompt has not
 * run, and badging it like a success is how a user ends up believing work
 * happened that never started.
 */
export const TRACKER_LINK_STATE_PRESENTATION: Record<
  TrackerTaskLinkState,
  {
    label: string;
    tone: "neutral" | "info" | "warning" | "success" | "danger";
    live: boolean;
  }
> = {
  staged: {
    label: "Staged",
    tone: "neutral",
    live: false,
  },
  running: {
    label: "Running",
    tone: "info",
    live: true,
  },
  needs_input: {
    label: "Needs you",
    tone: "warning",
    live: true,
  },
  completed: {
    label: "Run finished",
    tone: "success",
    live: false,
  },
  failed: {
    label: "Failed",
    tone: "danger",
    live: false,
  },
  cancelled: {
    label: "Cancelled",
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
const LINK_STATE_PRIORITY: readonly TrackerTaskLinkState[] = [
  "needs_input",
  "running",
  "staged",
  "failed",
  "completed",
  "cancelled",
];

/** The one run a row should show, or `null` when the ticket has none. */
export function resolvePrimaryTrackerTaskLink(
  links: readonly TrackerTaskStaveLink[],
): TrackerTaskStaveLink | null {
  let best: TrackerTaskStaveLink | null = null;
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
export function openTrackerTaskInBrowser(url: string) {
  const openExternal = window.api?.shell?.openExternal;
  if (!openExternal) {
    toast.error("Opening links is unavailable.");
    return;
  }
  void openExternal({ url }).catch(() => {
    toast.error("Could not open the ticket.");
  });
}

export function copyTrackerTaskValue(args: { value: string; label: string }) {
  void copyTextToClipboard(args.value)
    .then(() => {
      toast.success(`Copied ${args.label}`);
    })
    .catch(() => {
      toast.error(`Could not copy the ${args.label}.`);
    });
}
