import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Flat open-task list under a workspace row in the project sidebar. */
export const workspaceProgressTaskTreeStyles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    listStyleType: "none",
    marginBlock: 0,
    marginBlockStart: vars["--ads-space-2"],
    // A step in from the workspace row: the active workspace's two-tone fill
    // already says the tasks are its own, so the rows keep their width.
    marginInlineStart: vars["--ads-space-12"],
    minWidth: 0,
    paddingInline: 0,
  },
  loadingRow: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: vars["--ads-color-text-muted"],
    display: "flex",
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    minHeight: 32,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
  },
  /**
   * Mark, title and status on the first line; a running task's progress on a
   * second line that starts under the title and runs under the status too, so
   * the words get the row's full width after the mark.
   */
  row: {
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    color: { default: vars["--ads-color-text"], ":hover": vars["--ads-color-text"] },
    columnGap: vars["--ads-space-8"],
    display: "grid",
    fontSize: vars["--ads-font-size-body"],
    gridTemplateColumns: "16px minmax(0, 1fr) auto",
    minHeight: 32,
    minWidth: 0,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-8"],
    textAlign: "start",
    width: "100%",
  },
  progress: { gridColumn: "2 / -1" },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statusSlot: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
  },
  providerMark: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  accent: { color: vars["--ads-color-accent"] },
});

