import * as stylex from "@stylexjs/stylex";
import {
  FileDiff,
  FileMinus,
  FilePlus,
  FileSymlink,
  type LucideIcon,
} from "lucide-react";
import type * as React from "react";

import { agentSurface, agentStatusWord } from "../recipes/agent-surface";
import { controlIconSizes } from "../recipes/control-metrics";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import {
  agentStateLabel,
  agentStateTone,
  isQuietState,
  type AgentRunState,
} from "./agent-state";
import { VisuallyHidden } from "./VisuallyHidden";

/** What happened to the file. Orthogonal to whether the change landed. */
export type FileChangeKind = "added" | "modified" | "removed" | "renamed";

export type FileChangeSummaryProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  /** Lines added. Omitted rather than `0` when the count is unknown. */
  added?: number;
  /**
   * How many trailing directory segments stay visible before the rest collapses
   * to a leading `…/`. @default 2
   *
   * This is head truncation, done in JS, and it is the only kind that answers
   * the reader's question. CSS can only cut the END of a string, so an absolute
   * path — which is what a host hands over whenever the file sits outside the
   * root it resolved against — rendered as `<workspace>/packages/app…`:
   * thirty characters of machine identity and none of the file. Two segments is
   * the default because `…/message/assistant-trace.tsx` is enough to tell two
   * same-named files apart in one repository, which is the case that actually
   * happens. Pass `Infinity` for the whole path.
   */
  directoryDepth?: number;
  /** @default "modified" */
  kind?: FileChangeKind;
  /**
   * The path. Workspace-relative when the caller can resolve one, absolute when
   * it cannot. Rendered in the machine register, head-truncated per
   * `directoryDepth`, and always present in full on the element's `title`.
   */
  path: string;
  /** Lines removed. */
  removed?: number;
  /**
   * Whether the change landed. Renders the shared one-word status from
   * `agent-state`; omit it for a change that simply is (a diff in a review),
   * as opposed to one an agent proposed and something then did or did not do.
   */
  state?: AgentRunState;
} & XstyleProp;

const kindIcon: Record<FileChangeKind, LucideIcon> = {
  added: FilePlus,
  modified: FileDiff,
  removed: FileMinus,
  renamed: FileSymlink,
};

/**
 * The header line of a file change — `decisions/agent-surface-grammar.md` §7.B.
 *
 * **`DiffViewer` deliberately has no header, and this is it.** A diff is a
 * grid of lines; which file they belong to, how big the change is, and whether
 * it landed are facts *about* the diff, and putting them inside the diff's own
 * scroll box means they scroll away from the lines they describe. Every
 * consumer that renders more than one diff had therefore built the same row,
 * and the copies disagreed about the two things that matter: whether the path
 * truncates at the front (it must) and whether the counts use tabular figures
 * (they must).
 *
 * **The path truncates at the directory, never at the basename, and it
 * truncates from the FRONT.** `…/message/assistant-trace.tsx` answers the
 * reader's question; `src/components/session/mes…` does not. That takes two
 * mechanisms, because the first alone is not enough. Two cells — a shrinking
 * directory and a fixed basename — keep the filename off the chopping block,
 * and that is all CSS can do: `text-overflow` cuts the end of the string it is
 * given, so a directory cell holding `<workspace>/src/components/…`
 * spends its whole width on the part nobody reads. `directoryDepth` therefore
 * shortens the directory in JS first, to its last two segments behind a leading
 * `…/`, and the CSS ellipsis stays as the second line of defence for a single
 * pathological segment. The full path is on `title` either way.
 *
 * `directoryDepth` also absorbs the case a host cannot fix: a file outside the
 * root it resolved against has no relative form, so what arrives here IS the
 * absolute path, and rendering it whole is what made a file row wider than the
 * transcript.
 *
 * **`+N` / `−M` are rung 0.** §1.2 allows semantic color on a small element,
 * and the counts are the smallest element on the row; they take
 * `colorDiffAddedText` / `colorDiffRemovedText` ink in the machine register
 * and no fill, because a tinted pill per count is three perimeters for two
 * integers. Success/danger stay on status words; these counts are VCS
 * identity.
 *
 * It is a `span` and draws no surface of its own: a caller puts it in a
 * disclosure trigger, a `ToolRun` body, or a list row, and that owner already
 * owns the perimeter budget.
 */
/**
 * Split a path into the directory to render and the basename to protect.
 *
 * Exported for the host that has to line a path up with something else — and
 * tested directly, because the interesting cases are the ones a specimen does
 * not show: a bare filename with no directory at all, a path already shorter
 * than the depth, a trailing slash, and `Infinity`.
 */
export function splitFileChangePath(
  path: string,
  directoryDepth = DEFAULT_DIRECTORY_DEPTH,
): { basename: string; directory: string } {
  const separator = path.lastIndexOf("/");
  if (separator === -1) return { basename: path, directory: "" };

  const basename = path.slice(separator + 1);
  const full = path.slice(0, separator + 1);
  if (!Number.isFinite(directoryDepth) || directoryDepth < 0) {
    return { basename, directory: full };
  }

  // `filter(Boolean)` drops the empty leading segment of an absolute path and
  // any doubled slash, so `/a//b/` and `a/b/` produce the same two segments and
  // the depth means the same thing for a relative and an absolute path.
  const segments = full.split("/").filter(Boolean);
  const depth = Math.floor(directoryDepth);
  if (segments.length <= depth) return { basename, directory: full };
  if (depth === 0) return { basename, directory: "…/" };

  return { basename, directory: `…/${segments.slice(-depth).join("/")}/` };
}

const DEFAULT_DIRECTORY_DEPTH = 2;

export function FileChangeSummary({
  added,
  className,
  directoryDepth = DEFAULT_DIRECTORY_DEPTH,
  kind = "modified",
  path,
  removed,
  state,
  xstyle,
  ...props
}: FileChangeSummaryProps) {
  const Icon = kindIcon[kind];
  const { basename, directory } = splitFileChangePath(path, directoryDepth);

  return (
    <span {...props} className={cx(sx(styles.root, xstyle), className)}>
      <Icon
        aria-hidden
        className={sx(styles.glyph)}
        size={controlIconSizes.md}
      />
      <span className={sx(agentSurface.meta, styles.path)} title={path}>
        {directory ? (
          <span className={sx(styles.directory)}>{directory}</span>
        ) : null}
        <span className={sx(styles.basename)}>{basename}</span>
      </span>
      {added !== undefined || removed !== undefined ? (
        <span className={sx(agentSurface.meta, styles.counts)}>
          {added !== undefined ? (
            <span className={sx(styles.added)}>{`+${added}`}</span>
          ) : null}
          {removed !== undefined ? (
            <span className={sx(styles.removed)}>{`−${removed}`}</span>
          ) : null}
        </span>
      ) : null}
      {/*
        * The quiet-state rule, same as `ToolRun`'s: a file that was applied the
        * way it was meant to be applied says nothing by saying "Completed", and
        * a summary list is where that repeats hardest — one word per row, down
        * a column, in the one place a reader is scanning for the row that is
        * NOT fine. It stays in the accessibility tree. See `isQuietState`.
        */}
      {state && isQuietState(state) ? (
        <VisuallyHidden>{agentStateLabel[state]}</VisuallyHidden>
      ) : null}
      {state && !isQuietState(state) ? (
        <span
          className={sx(
            styles.state,
            agentStatusWord[agentStateTone[state]],
          )}
        >
          {agentStateLabel[state]}
        </span>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  glyph: {
    color: vars.colorTextSubtle,
    flexShrink: 0,
  },
  /**
   * The flexible cell, so the counts and the status word — the parts that
   * carry the size of the change — are never what gets cut. Same reasoning as
   * `agentSurface.metaRow`.
   */
  path: {
    color: vars.colorText,
    display: "flex",
    flex: "1 1 auto",
    minInlineSize: 0,
    whiteSpace: "nowrap",
  },
  directory: {
    color: vars.colorTextSubtle,
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  basename: {
    flexShrink: 0,
  },
  counts: {
    display: "flex",
    flexShrink: 0,
    gap: vars.space4,
  },
  added: {
    color: vars.colorDiffAddedText,
  },
  removed: {
    color: vars.colorDiffRemovedText,
  },
  state: {
    flexShrink: 0,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    whiteSpace: "nowrap",
  },
});
