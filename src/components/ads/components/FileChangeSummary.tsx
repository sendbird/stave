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
  type AgentRunState,
} from "./agent-state";

/** What happened to the file. Orthogonal to whether the change landed. */
export type FileChangeKind = "added" | "modified" | "removed" | "renamed";

export type FileChangeSummaryProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  /** Lines added. Omitted rather than `0` when the count is unknown. */
  added?: number;
  /** @default "modified" */
  kind?: FileChangeKind;
  /** Workspace-relative path. Rendered in the machine register. */
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
 * **The path truncates at the directory, never at the basename.** `.../
 * message/assistant-trace.tsx` answers the reader's question; `src/components/
 * session/mes…` does not. So the path is two cells — a shrinking directory and
 * a fixed basename — rather than one `text-overflow: ellipsis` span, which can
 * only cut the end.
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
export function FileChangeSummary({
  added,
  className,
  kind = "modified",
  path,
  removed,
  state,
  xstyle,
  ...props
}: FileChangeSummaryProps) {
  const Icon = kindIcon[kind];
  const separator = path.lastIndexOf("/");
  const directory = separator === -1 ? "" : path.slice(0, separator + 1);
  const basename = separator === -1 ? path : path.slice(separator + 1);

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
      {state ? (
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
