import { resolveTrackerTaskPrimaryKey } from "./context";
import type { TrackerTask } from "./types";

/**
 * The branch name proposed (not imposed) when a tracker ticket is kicked off.
 *
 * The value lands in an editable field, so it optimises for being recognisable
 * in `git branch` a week later — key first, then enough of the title to tell two
 * tickets apart — and for surviving `git check-ref-format`, since a tracker
 * title is arbitrary remote text and a rejected ref would surface as a workspace
 * creation failure long after the user approved it.
 */

/** `CraneDispatchWorkspaceChoiceSchema` branch cap. */
const BRANCH_LIMIT = 160;
const TITLE_SLUG_LIMIT = 40;
const DEFAULT_PREFIX = "feat";
const FALLBACK_KEY = "ticket";

/**
 * A leading token followed by `/`, anchored to a word boundary so a URL inside
 * the rule text ("see https://example.com/naming") cannot contribute its host or
 * path as a prefix.
 */
const RULE_PREFIX_PATTERN =
  /(?:^|[\s"'`([])([A-Za-z][A-Za-z0-9._-]{0,38})\/(?![/*])/;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The per-project naming rule is free text written for a human, and this is a
 * pure function with no model to interpret it: the only thing it can honour
 * mechanically is an explicitly written prefix such as `feature/` or `bugfix/`.
 * Everything else in the rule (ticket-number placement, casing, suffixes) is
 * handled where the full rule text reaches the agent; here it only steers the
 * default the user sees pre-filled.
 */
function detectRulePrefix(namingRule?: string | null): string | null {
  const rule = namingRule?.trim();
  if (!rule) {
    return null;
  }
  const token = RULE_PREFIX_PATTERN.exec(rule)?.[1];
  return token ? slugify(token) || null : null;
}

function cleanSegment(segment: string) {
  let cleaned = segment.replace(/\.{2,}/g, ".").replace(/^[.\-]+|[.\-]+$/g, "");
  // A ref component may not end in `.lock`; stripping once can expose another.
  while (cleaned.toLowerCase().endsWith(".lock")) {
    cleaned = cleaned.slice(0, -".lock".length).replace(/[.\-]+$/g, "");
  }
  return cleaned;
}

function joinSegments(value: string) {
  return value.split("/").map(cleanSegment).filter(Boolean).join("/");
}

/**
 * Last line of defence against `git check-ref-format`. Everything upstream is
 * already slugified, but a hostile ticket title must not be able to reach git
 * through a future caller that skips the slug step.
 */
function sanitizeBranchName(value: string) {
  const normalized = joinSegments(value.replace(/[^A-Za-z0-9._/-]+/g, "-"));
  const capped =
    normalized.length <= BRANCH_LIMIT
      ? normalized
      : joinSegments(normalized.slice(0, BRANCH_LIMIT));
  return capped || `${DEFAULT_PREFIX}/${FALLBACK_KEY}`;
}

export function proposeTrackerTaskBranchName(args: {
  task: TrackerTask;
  namingRule?: string | null;
}): string {
  const prefix = detectRulePrefix(args.namingRule) ?? DEFAULT_PREFIX;
  const key = slugify(resolveTrackerTaskPrimaryKey(args.task)) || FALLBACK_KEY;
  const title = slugify(args.task.title)
    .slice(0, TITLE_SLUG_LIMIT)
    .replace(/-+$/g, "");
  return sanitizeBranchName(
    title ? `${prefix}/${key}-${title}` : `${prefix}/${key}`,
  );
}
