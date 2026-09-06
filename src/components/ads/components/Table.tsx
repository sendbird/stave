import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { transition } from "../recipes/transition";
import { densityPad } from "../tokens/density.stylex";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { useDirection } from "./DirectionProvider";

export type TableDensity = "compact" | "regular";

export type TableProps = Omit<React.ComponentProps<"div">, "children"> & {
  children: React.ReactNode;
  density?: TableDensity;
};

export function Table({
  children,
  className,
  density = "regular",
  style,
  ...props
}: TableProps) {
  // §8: both arms come from the fixed `densityPad*` scale. On `space2`/`space3`
  // the compact theme collapsed them to one value, so `density="compact"` was a
  // complete no-op there — the one thing this prop controls is this padding.
  const densityStyle = {
    "--atelier-table-cell-padding-block":
      density === "compact" ? densityPad.sm : densityPad.md,
  } as React.CSSProperties;

  return (
    <div
      {...props}
      className={cx(sx(styles.frame), className)}
      style={{ ...densityStyle, ...style }}
    >
      <table className={sx(styles.table)}>{children}</table>
    </div>
  );
}

export type TableHeaderProps = React.ComponentProps<"thead"> & {
  sticky?: boolean;
};

export function TableHeader({
  className,
  sticky = false,
  ...props
}: TableHeaderProps) {
  return (
    <thead
      {...props}
      className={cx(
        sx(styles.header, sticky && styles.headerSticky),
        className,
      )}
    />
  );
}

export type TableBodyProps = React.ComponentProps<"tbody">;

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody {...props} className={cx(sx(styles.body), className)} />;
}

export type TableFooterProps = React.ComponentProps<"tfoot">;

export function TableFooter({ className, ...props }: TableFooterProps) {
  return <tfoot {...props} className={cx(sx(styles.footer), className)} />;
}

export type TableRowProps = React.ComponentProps<"tr"> & {
  /** Marks the one row currently represented by an inspector or detail view. */
  current?: boolean;
  /**
   * @deprecated Use `current`. This alias preserves the previous current-row
   * presentation; it does not model checkbox selection.
   */
  selected?: boolean;
};

export function TableRow({
  className,
  current = false,
  selected = false,
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
        ),
        className,
      )}
      data-current={isCurrent ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
    />
  );
}

export type TableHeadProps = Omit<React.ComponentProps<"th">, "align"> & {
  align?: "start" | "center" | "end";
};

export function TableHead({
  align = "start",
  className,
  ...props
}: TableHeadProps) {
  return (
    <th
      {...props}
      className={cx(sx(styles.headCell, alignStyles[align]), className)}
      scope={props.scope ?? "col"}
    />
  );
}

export type TableCellProps = Omit<React.ComponentProps<"td">, "align"> & {
  align?: "start" | "center" | "end";
};

export function TableCell({
  align = "start",
  className,
  ...props
}: TableCellProps) {
  return (
    <td
      {...props}
      className={cx(sx(styles.cell, alignStyles[align]), className)}
    />
  );
}

export type TableCaptionProps = React.ComponentProps<"caption">;

export function TableCaption({ className, ...props }: TableCaptionProps) {
  return <caption {...props} className={cx(sx(styles.caption), className)} />;
}

const styles = stylex.create({
  frame: {
    backgroundColor: vars.colorSurfaceRaised,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    // Flat by contract (§1.5 "Elevation is a lift, not a grouping cue"). The
    // shadow was here because "the bare hairline gave the frame no depth at all
    // on a dark canvas" — but in dark the surface step already does that work
    // (`colorSurfaceRaised` L 0.238 over `colorCanvas` L 0.147), and a shadow
    // under a full-width table frame is the single largest instance of using
    // elevation to group. The sticky header keeps its `elevation1`: that one IS
    // a surface leaving its plane.
    boxShadow: vars.elevationFlat,
    inlineSize: "100%",
    minInlineSize: 0,
    overflow: "auto",
  },
  table: {
    borderCollapse: "collapse",
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    inlineSize: "100%",
    minInlineSize: 560,
  },
  header: {
    backgroundColor: vars.colorSurfaceRaised,
  },
  headerSticky: {
    boxShadow: vars.elevationRaised,
    insetBlockStart: 0,
    position: "sticky",
    // Above rows, below in-surface panels (PeekPanel at zIndexPanel).
    zIndex: vars.zIndexSticky,
  },
  body: {
    backgroundColor: vars.colorSurfaceRaised,
  },
  footer: {
    backgroundColor: vars.colorCanvasSubtle,
  },
  row: {
    backgroundColor: {
      default: "transparent",
      ":active": vars.colorOverlayPressed,
      "@media (hover: hover) and (pointer: fine)": {
        default: "transparent",
        ":active": vars.colorOverlayPressed,
        ":hover": vars.colorOverlayHover,
      },
    },
    // §1.3: the row rule lives on the `<tr>` so the last row in a section can
    // drop it and the frame's solid bottom is the only line at the table's foot
    // (a last-child border reset). In a `<thead>` the `<th>`'s own
    // `colorBorder` underline wins the collapsed-border conflict — a cell
    // border outranks a row border at equal width — so the header seam is
    // unaffected.
    borderBlockEndColor: vars.colorBorderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: {
      default: vars.borderWidthHairline,
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
      default: vars.colorSelectionFill,
      ":active": vars.colorSelectionFill,
      "@media (hover: hover) and (pointer: fine)": {
        default: vars.colorSelectionFill,
        ":active": vars.colorSelectionFill,
        ":hover": vars.colorSelectionFill,
      },
    },
  },
  rowCurrentLtr: {
    boxShadow: `inset ${vars.ringWidthSm} 0 0 0 ${vars.colorBorderStrong}`,
  },
  rowCurrentRtl: {
    boxShadow: `inset calc(-1 * ${vars.ringWidthSm}) 0 0 0 ${vars.colorBorderStrong}`,
  },
  headCell: {
    // §1.3: an in-surface divider, so the alpha hairline — the same token the
    // row rules use, and the same hairline runs through head and body rows.
    // §1.5 puts the header's hierarchy in `text.muted` + weight, not in a
    // heavier line.
    borderBlockEndColor: vars.colorBorderSubtle,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: vars.borderWidthHairline,
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightTight,
    paddingBlock: "var(--atelier-table-cell-padding-block)",
    paddingInline: vars.space12,
    textAlign: "start",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  cell: {
    color: vars.colorText,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
    paddingBlock: "var(--atelier-table-cell-padding-block)",
    paddingInline: vars.space12,
    verticalAlign: "middle",
  },
  caption: {
    captionSide: "bottom",
    color: vars.colorTextMuted,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightNormal,
    paddingBlock: vars.space12,
    paddingInline: vars.space12,
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
