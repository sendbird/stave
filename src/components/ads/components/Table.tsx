import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { transition } from "../recipes/transition";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";
import {
  themeProps,
  themeSlotProps,
  themeTargetClassName,
} from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { useDirection } from "./DirectionProvider";

export type TableDensity = "compact" | "regular";

export type TableProps = Omit<React.ComponentProps<"div">, "children"> & {
  children: React.ReactNode;
  density?: TableDensity;
} & XstyleProp;

export function Table({
  children,
  className,
  density = "regular",
  style,
  xstyle,
  ...props
}: TableProps) {
  // §8: both arms come from the fixed `densityPad*` scale. On `space2`/`space3`
  // the compact theme collapsed them to one value, so `density="compact"` was a
  // complete no-op there — the one thing this prop controls is this padding.
  const densityStyle = {
    "--atelier-table-cell-padding-block":
      density === "compact" ? densityPad.sm : densityPad.md,
  } as React.CSSProperties;

  const theme = themeProps("table", { density });

  return (
    <div
      {...props}
      {...theme}
      className={cx(sx(styles.frame, xstyle), theme.className, className)}
      style={{ ...densityStyle, ...style }}
    >
      <table className={sx(styles.table)}>{children}</table>
    </div>
  );
}

export type TableHeaderProps = React.ComponentProps<"thead"> & {
  sticky?: boolean;
} & XstyleProp;

export function TableHeader({
  className,
  sticky = false,
  xstyle,
  ...props
}: TableHeaderProps) {
  return (
    <thead
      {...props}
      {...themeSlotProps("table", "header")}
      className={cx(
        sx(styles.header, sticky && styles.headerSticky, xstyle),
        className,
      )}
    />
  );
}

export type TableBodyProps = React.ComponentProps<"tbody"> & XstyleProp;

export function TableBody({ className, xstyle, ...props }: TableBodyProps) {
  return (
    <tbody
      {...props}
      {...themeSlotProps("table", "body")}
      className={cx(sx(styles.body, xstyle), className)}
    />
  );
}

export type TableFooterProps = React.ComponentProps<"tfoot"> & XstyleProp;

export function TableFooter({ className, xstyle, ...props }: TableFooterProps) {
  return (
    <tfoot
      {...props}
      {...themeSlotProps("table", "footer")}
      className={cx(sx(styles.footer, xstyle), className)}
    />
  );
}

export type TableRowProps = React.ComponentProps<"tr"> & {
  /** Marks the one row currently represented by an inspector or detail view. */
  current?: boolean;
  /**
   * @deprecated Use `current`. This alias preserves the previous current-row
   * presentation; it does not model checkbox selection.
   */
  selected?: boolean;
} & XstyleProp;

export function TableRow({
  className,
  current = false,
  selected = false,
  xstyle,
  ...props
}: TableRowProps) {
  const direction = useDirection();
  const isCurrent = current || selected;

  return (
    <tr
      {...props}
      aria-current={props["aria-current"] ?? (isCurrent ? "true" : undefined)}
      className={cx(
        sx(
          styles.row,
          // The current row adds an inset location marker, so box-shadow is
          // part of the state transition.
          transition.ring,
          isCurrent && styles.rowCurrent,
          isCurrent &&
            (direction === "rtl" ? styles.rowCurrentRtl : styles.rowCurrentLtr),
          xstyle,
        ),
        themeTargetClassName("table-row"),
        className,
      )}
      data-current={isCurrent ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
    />
  );
}

export type TableHeadProps = Omit<React.ComponentProps<"th">, "align"> & {
  align?: "start" | "center" | "end";
} & XstyleProp;

export function TableHead({
  align = "start",
  className,
  xstyle,
  ...props
}: TableHeadProps) {
  return (
    <th
      {...props}
      {...themeSlotProps("table", "head")}
      className={cx(sx(styles.headCell, alignStyles[align], xstyle), className)}
      scope={props.scope ?? "col"}
    />
  );
}

export type TableCellProps = Omit<React.ComponentProps<"td">, "align"> & {
  align?: "start" | "center" | "end";
} & XstyleProp;

export function TableCell({
  align = "start",
  className,
  xstyle,
  ...props
}: TableCellProps) {
  return (
    <td
      {...props}
      {...themeSlotProps("table", "cell")}
      className={cx(sx(styles.cell, alignStyles[align], xstyle), className)}
    />
  );
}

export type TableCaptionProps = React.ComponentProps<"caption"> & XstyleProp;

export function TableCaption({
  className,
  xstyle,
  ...props
}: TableCaptionProps) {
  return (
    <caption
      {...props}
      {...themeSlotProps("table", "caption")}
      className={cx(sx(styles.caption, xstyle), className)}
    />
  );
}

const styles = stylex.create({
  frame: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"). The
    // shadow was here because "the bare hairline gave the frame no depth at all
    // on a dark canvas" — but in dark the surface step already does that work
    // (`colorSurfaceRaised` L 0.238 over `colorCanvas` L 0.147), and a shadow
    // under a full-width table frame is the single largest instance of using
    // elevation to group. The sticky header keeps its `elevation1`: that one IS
    // a surface leaving its plane.
    boxShadow: vars["--ads-elevation-flat"],
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "auto",
  },
  table: {
    borderCollapse: "collapse",
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    inlineSize: "100%",
    minInlineSize: 560,
  },
  header: {
    backgroundColor: vars["--ads-color-surface-raised"],
  },
  headerSticky: {
    boxShadow: vars["--ads-elevation-raised"],
    insetBlockStart: 0,
    position: "sticky",
    // Above rows, below in-surface panels (PeekPanel at zIndexPanel).
    zIndex: vars["--ads-z-index-sticky"],
  },
  body: {
    backgroundColor: vars["--ads-color-surface-raised"],
  },
  footer: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
  },
  row: {
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars["--ads-color-overlay-pressed"],
        ":hover": vars["--ads-color-overlay-hover"],
      },
    },
    // §1.3: the row rule lives on the `<tr>` so the last row in a section can
    // drop it and the frame's solid bottom is the only line at the table's foot
    // (a last-child border reset). In a `<thead>` the `<th>`'s own
    // `colorBorder` underline wins the collapsed-border conflict — a cell
    // border outranks a row border at equal width — so the header seam is
    // unaffected.
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      default: vars["--ads-border-width-hairline"],
      ":last-child": 0,
    },
  },
  // selection-companion: rowCurrentLtr
  rowCurrent: {
    // Currentness points from the row to a separate detail surface. The quiet
    // fill plus one neutral inline-start location marker keeps that state
    // distinct from checkbox selection without changing text metrics. It
    // mirrors in RTL.
    backgroundColor: {
      default: vars["--ads-color-selection-fill"],
      ":active": vars["--ads-color-selection-fill"],
      "@media (hover: hover) and (pointer: fine)": {
        default: vars["--ads-color-selection-fill"],
        ":active": vars["--ads-color-selection-fill"],
        ":hover": vars["--ads-color-selection-fill"],
      },
    },
  },
  rowCurrentLtr: {
    boxShadow: `inset ${vars["--ads-ring-width-sm"]} 0 0 0 ${vars["--ads-color-border-strong"]}`,
  },
  rowCurrentRtl: {
    boxShadow: `inset calc(-1 * ${vars["--ads-ring-width-sm"]}) 0 0 0 ${vars["--ads-color-border-strong"]}`,
  },
  headCell: {
    // §1.3: an in-surface divider, so the alpha hairline — the same token the
    // row rules use, and the same hairline runs through head and body rows.
    // §1.5 puts the header's hierarchy in `text.muted` + weight, not in a
    // heavier line.
    borderBlockEndColor: vars["--ads-color-border-subtle"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-tight"],
    paddingBlock: "var(--atelier-table-cell-padding-block)",
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  cell: {
    color: vars["--ads-color-text"],
    lineHeight: vars["--ads-line-height-normal"],
    minInlineSize: 0,
    paddingBlock: "var(--atelier-table-cell-padding-block)",
    paddingInline: vars["--ads-space-12"],
    verticalAlign: "middle",
  },
  caption: {
    captionSide: "bottom",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-12"],
    textAlign: "start",
  },
  alignStart: {
    textAlign: "start",
  },
  alignCenter: {
    textAlign: "center",
  },
  alignEnd: {
    textAlign: "end",
  },
});

const alignStyles = {
  center: styles.alignCenter,
  end: styles.alignEnd,
  start: styles.alignStart,
} as const;

export { styles as tableStyles };
