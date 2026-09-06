import {
  parseLocalTrackerDueDate,
  startOfLocalDay,
} from "@/lib/tracker-tasks/group";
import type {
  TrackerPriorityLevel,
  TrackerStatusCategory,
} from "@/lib/tracker-tasks/types";

/**
 * Presentation mapping for the tracker list.
 *
 * Values only: no JSX and no icon components, so the row owns rendering and
 * this module stays cheap to import from a worker, a test, or a menu that only
 * needs the labels.
 */

/**
 * Status chip styling, expressed with the same semantic tokens the `Badge`
 * variants use so a custom theme repaints these along with everything else.
 * `in_review` borrows the warning tone because it is the state that is waiting
 * on a person; finished work is muted so it stops competing for attention.
 */
export const TRACKER_STATUS_PRESENTATION: Record<
  TrackerStatusCategory,
  { label: string; tone: "neutral" | "info" | "warning" }
> = {
  todo: {
    label: "To do",
    tone: "neutral",
  },
  in_progress: {
    label: "In progress",
    tone: "info",
  },
  in_review: {
    label: "In review",
    tone: "warning",
  },
  done: {
    label: "Done",
    tone: "neutral",
  },
  closed: {
    label: "Closed",
    tone: "neutral",
  },
};

/** Icon names the row resolves against its own icon import. */
export type TrackerPriorityIconName =
  "ChevronsUp" | "ChevronUp" | "Equal" | "ChevronDown" | "Minus";

/**
 * Priority glyph and tone.
 *
 * Only the top two levels get a colour: if every row is coloured, none of them
 * reads as urgent.
 */
export const TRACKER_PRIORITY_PRESENTATION: Record<
  TrackerPriorityLevel,
  {
    label: string;
    iconName: TrackerPriorityIconName;
    tone: "danger" | "warning" | "default" | "muted" | "subtle";
  }
> = {
  urgent: {
    label: "Urgent",
    iconName: "ChevronsUp",
    tone: "danger",
  },
  high: {
    label: "High",
    iconName: "ChevronUp",
    tone: "warning",
  },
  medium: {
    label: "Medium",
    iconName: "Equal",
    tone: "default",
  },
  low: {
    label: "Low",
    iconName: "ChevronDown",
    tone: "muted",
  },
  none: {
    label: "No priority",
    iconName: "Minus",
    tone: "subtle",
  },
};

export type TrackerDueTone = "overdue" | "today" | "soon" | "normal" | "none";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Fixed short date, rather than `toLocaleDateString`.
 *
 * The list is dense enough that a locale-dependent width would reflow the
 * column, and a stable format keeps these strings assertable in tests.
 */
function formatShortDate(date: Date, now: Date): string {
  const month = SHORT_MONTHS[date.getMonth()] ?? "";
  const day = date.getDate();
  return date.getFullYear() === now.getFullYear()
    ? `${month} ${day}`
    : `${month} ${day}, ${date.getFullYear()}`;
}

/**
 * Whole local days between two calendar dates.
 *
 * Both sides are already local midnights, so dividing by a fixed day length is
 * only wrong across a DST shift; rounding absorbs the one-hour drift that
 * shift introduces.
 */
function localDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Due-date label for a row.
 *
 * Returns `null` when there is no due date at all, because the row renders
 * nothing rather than an empty slot. A date the tracker sent in a shape this
 * build does not understand is shown verbatim with the `"none"` tone: guessing
 * at urgency from an unparsed string would be worse than showing it plainly.
 */
export function formatTrackerDue(
  dueDate: string | null,
  now: Date,
): { label: string; tone: TrackerDueTone } | null {
  if (dueDate === null) {
    return null;
  }
  const due = parseLocalTrackerDueDate(dueDate);
  if (!due) {
    return { label: dueDate, tone: "none" };
  }
  const days = localDaysBetween(startOfLocalDay(now), due);
  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      label: overdueBy === 1 ? "Yesterday" : `${overdueBy}d overdue`,
      tone: "overdue",
    };
  }
  if (days === 0) {
    return { label: "Today", tone: "today" };
  }
  if (days === 1) {
    return { label: "Tomorrow", tone: "soon" };
  }
  if (days < 7) {
    return { label: `In ${days}d`, tone: "soon" };
  }
  return { label: formatShortDate(due, now), tone: "normal" };
}

/**
 * "Last synced" copy for the source status row.
 *
 * Coarse on purpose: a second-accurate counter would re-render the header every
 * tick to tell the user something they cannot act on.
 */
export function formatTrackerSyncedAt(iso: string | null, now: Date): string {
  if (iso === null) {
    return "Never";
  }
  const stamp = Date.parse(iso);
  if (Number.isNaN(stamp)) {
    return "Never";
  }
  const elapsedMs = now.getTime() - stamp;
  // A clock that jumped backwards must not print "-3m ago".
  if (elapsedMs < 60_000) {
    return "just now";
  }
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }
  return formatShortDate(new Date(stamp), now);
}

/**
 * Whether the cached rows are old enough to warn about.
 *
 * Two intervals, not one: a single missed poll is normal (the machine slept,
 * the request was slow) and warning on it would leave the badge permanently
 * lit. A source that has never synced returns `false` — that is an empty state
 * with its own copy, not stale data.
 */
export function isTrackerSyncStale(
  status: { lastSyncedAt: string | null },
  refreshIntervalSeconds: number,
  now: Date,
): boolean {
  if (status.lastSyncedAt === null) {
    return false;
  }
  const stamp = Date.parse(status.lastSyncedAt);
  if (Number.isNaN(stamp)) {
    return false;
  }
  if (!Number.isFinite(refreshIntervalSeconds) || refreshIntervalSeconds <= 0) {
    return false;
  }
  return now.getTime() - stamp > refreshIntervalSeconds * 2 * 1000;
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/**
 * Split into user-perceived characters.
 *
 * Slicing by code unit would cut a flag emoji or a skin-tone sequence in half
 * and render a replacement character in the avatar, so the split has to be
 * grapheme-aware. `Intl.Segmenter` is looked up lazily and cached because
 * constructing one is expensive relative to an avatar render.
 */
function toGraphemes(value: string): string[] {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const segment of graphemeSegmenter.segment(value)) {
      out.push(segment.segment);
    }
    return out;
  }
  // Code points still beat code units: a surrogate pair survives, only
  // multi-code-point clusters degrade.
  return Array.from(value);
}

function takeGraphemes(value: string, count: number): string {
  const graphemes = toGraphemes(value);
  return graphemes.slice(0, count).join("");
}

/**
 * Avatar fallback for a display name.
 *
 * Two graphemes for a single-token name (which is what a Korean, Japanese or
 * Chinese name usually is, and where one character reads as an abbreviation of
 * nothing), first-plus-last for a multi-token one. Never longer than two
 * graphemes, and never a broken surrogate.
 */
export function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "";
  }
  if (words.length === 1) {
    return takeGraphemes(words[0] ?? "", 2).toUpperCase();
  }
  const first = takeGraphemes(words[0] ?? "", 1);
  const last = takeGraphemes(words[words.length - 1] ?? "", 1);
  return `${first}${last}`.toUpperCase();
}

/**
 * CSS colours a tracker label is allowed to supply.
 *
 * Kept deliberately tiny. Anything outside this list is dropped rather than
 * sanitised, because the value is written straight into an inline style and a
 * partial sanitiser is how a style attribute turns into a rendering primitive
 * an external service controls.
 */
const NAMED_COLORS: ReadonlySet<string> = new Set([
  "aqua",
  "black",
  "blue",
  "brown",
  "cyan",
  "fuchsia",
  "gray",
  "green",
  "grey",
  "lime",
  "magenta",
  "maroon",
  "navy",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "teal",
  "transparent",
  "white",
  "yellow",
]);

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * `rgb()/rgba()/hsl()/hsla()` with three or four plain numeric arguments,
 * comma- or space-separated. The modern `/ alpha` form is not accepted: a
 * slash is one character away from a CSS comment, and dropping an exotic
 * spelling costs a colour, while accepting one costs a review.
 */
const FUNCTIONAL_COLOR_PATTERN =
  /^(?:rgba?|hsla?)\(\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:%|deg)?(?:\s*[,\s]\s*[+-]?(?:\d+\.?\d*|\.\d+)%?){2,3}\s*\)$/i;

/**
 * Semantic label colours a tracker may name instead of supplying a CSS value.
 *
 * Crane stores label colour as one of these seven tokens, not as a hex or
 * `rgb()` string, so treating the field as CSS would silently drop every Crane
 * label colour. They map onto Stave's own theme tokens, which is strictly better
 * than a raw value: the dot repaints with a custom theme, and an external string
 * never reaches a style attribute at all.
 */
const SEMANTIC_LABEL_COLORS = [
  "neutral",
  "accent",
  "info",
  "warning",
  "warm",
  "success",
  "danger",
] as const;
export type TrackerLabelToken = (typeof SEMANTIC_LABEL_COLORS)[number];

/**
 * How a label's colour should be painted, or `null` when it cannot be.
 *
 * Two shapes because two kinds of tracker exist: one names a semantic slot and
 * one hands over a colour. The token branch is preferred and checked first, so a
 * tracker that happens to name a colour that is also a CSS keyword (`orange`)
 * still gets the themed treatment rather than the raw one.
 */
export type TrackerLabelColor =
  { kind: "token"; token: TrackerLabelToken } | { kind: "css"; value: string };

export function resolveTrackerLabelColor(
  color: string | undefined | null,
): TrackerLabelColor | null {
  if (typeof color !== "string") {
    return null;
  }
  const token = color.trim().toLowerCase() as TrackerLabelToken;
  if (SEMANTIC_LABEL_COLORS.includes(token)) {
    return { kind: "token", token };
  }
  return isSafeCssColor(color) ? { kind: "css", value: color.trim() } : null;
}

/**
 * Gate for an externally supplied label colour rendered as an inline style.
 *
 * This is a security boundary, not a formatting nicety: the string arrives from
 * a tracker workspace whose labels anyone on that workspace can edit. The
 * checks are ordered cheapest-first and every one of them is a rejection, so
 * the only way through is to match one of the three accepted shapes exactly.
 */
export function isSafeCssColor(
  value: string | undefined | null,
): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  // No legitimate colour is long. A length cap also bounds the regex work an
  // attacker-controlled string can cause.
  if (trimmed.length === 0 || trimmed.length > 64) {
    return false;
  }
  // Printable ASCII only: a non-ASCII lookalike cannot be reasoned about here,
  // and no accepted form needs one.
  if (!/^[\x20-\x7e]+$/.test(trimmed)) {
    return false;
  }
  // Explicit rejections ahead of the shape match. The anchored patterns below
  // already exclude these, but naming them keeps the intent readable and
  // survives a future loosening of those patterns.
  if (/[;\\{}<>"']/.test(trimmed)) {
    return false;
  }
  if (trimmed.includes("/*") || trimmed.includes("*/")) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("url(") || lower.includes("var(")) {
    return false;
  }
  if (NAMED_COLORS.has(lower)) {
    return true;
  }
  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return true;
  }
  return FUNCTIONAL_COLOR_PATTERN.test(trimmed);
}
