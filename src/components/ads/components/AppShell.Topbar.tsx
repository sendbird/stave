import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type TopbarProps = React.ComponentProps<"header"> & {
  actions?: React.ReactNode;
  /**
   * Leading navigation — a `NavigationMenu` bar of top-level destinations,
   * beside (or instead of) the title.
   *
   * It is its own slot rather than something to put in `title` because the
   * title track is a single-line ellipsizing text cell: nav rows dropped into
   * it inherit the semibold title weight, get clipped instead of wrapped, and
   * take the `1fr` share the title needs. Here they keep their own metrics and
   * size to content.
   */
  nav?: React.ReactNode;
  title?: React.ReactNode;
};

export function Topbar({
  actions,
  children,
  className,
  nav,
  title,
  ...props
}: TopbarProps) {
  const lead = title ?? children;

  return (
    <header {...props} className={cx(sx(styles.topbar), className)}>
      {/*
        Rendered only when there is something to lead with. It used to render
        unconditionally, so a bar carrying nothing but `actions` still paid a
        `flex: 1 1 180px` empty cell to push them right — which quietly became
        the mechanism holding the layout together. `topbarActions` now claims
        the trailing edge itself (`margin-inline-start: auto`), so the bar is
        correct with a title, with nav, with both, or with neither.
      */}
      {lead ? <div className={sx(styles.topbarTitle)}>{lead}</div> : null}
      {nav ? <div className={sx(styles.topbarNav)}>{nav}</div> : null}
      {actions ? (
        <div className={sx(styles.topbarActions)}>{actions}</div>
      ) : null}
    </header>
  );
}

const styles = stylex.create({
  topbar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-raised"],
    borderBlockEndColor: vars["--ads-color-border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    justifyContent: "space-between",
    minBlockSize: vars["--ads-chrome-row-height"],
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  topbarTitle: {
    color: vars["--ads-color-text"],
    flex: "1 1 180px",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    minInlineSize: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topbarNav: {
    alignItems: "center",
    display: "inline-flex",
    flex: "0 1 auto",
    minInlineSize: 0,
  },
  topbarActions: {
    alignItems: "center",
    display: "inline-flex",
    flex: "0 1 auto",
    // Owns the trailing edge on its own, so the bar does not depend on a
    // sibling existing to push it there.
    marginInlineStart: "auto",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
    maxInlineSize: "100%",
    minInlineSize: 0,
  },
});
