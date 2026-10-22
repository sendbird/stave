import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { themeProps, themeSlotProps } from "../theming/theme-props";

export type WorkspaceLayoutProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  /** Primary reading and action region. */
  primary: React.ReactNode;
  /** Optional queue, tree, or navigation rail that precedes the primary region. */
  rail?: React.ReactNode;
  /** Optional evidence or property inspector that follows the primary region. */
  inspector?: React.ReactNode;
  /**
   * Fill a bounded parent instead of flowing: the layout takes the parent's
   * block size, the regions stretch to it, and each slot becomes a definite
   * `minmax(0, 1fr)` track its own content can scroll inside — a transcript, a
   * history list, an artifact. Without it the layout is top-aligned flow, which
   * is right for a page of sections and wrong for an application frame, where a
   * `Thread` given no definite height grows the whole layout past its frame and
   * pushes the composer out of view.
   *
   * Applies only while the regions sit side by side (three regions from 981px
   * of container width, two from 701px). Once they stack, a bounded height
   * would have to be split between regions the reader scrolls past anyway, so
   * the layout returns to flow and the page scrolls. The parent must have a
   * definite block size. @default false
   */
  fill?: boolean;
} & XstyleProp;

/**
 * Responsive product-work layout for queue → content → inspector flows.
 *
 * The component owns only geometry: shrink-safe tracks, quiet dividers, and
 * container-driven stacking. Each slot keeps its own landmark and scroll
 * semantics, so a queue can be an `aside`, the primary region a `main`, and an
 * inspector an `InspectorPanel` without nested or invented roles.
 *
 * This is the responsive, non-resizable sibling of `SplitPane` and
 * `PanelGroup`: use `SplitPane` for two controlled regions, `PanelGroup` for
 * three or more independently resized regions, and this layout when the same
 * regions must adapt automatically inside dashboards, routes, and embedded
 * product frames.
 */
export function WorkspaceLayout({
  className,
  fill = false,
  inspector,
  primary,
  rail,
  xstyle,
  ...props
}: WorkspaceLayoutProps) {
  const hasInspector = inspector != null;
  const hasRail = rail != null;
  // The width at which the regions stop sitting side by side, which is where
  // `fill` hands back to flow.
  const fillStyle = !fill
    ? null
    : hasRail && hasInspector
      ? styles.fillThree
      : hasRail || hasInspector
        ? styles.fillTwo
        : styles.fillOne;
  const regionFill = !fill
    ? null
    : hasRail && hasInspector
      ? styles.regionFillThree
      : hasRail || hasInspector
        ? styles.regionFillTwo
        : styles.regionFillOne;

  const theme = themeProps("workspace-layout");

  return (
    <div
      {...props}
      {...theme}
      className={cx(
        sx(styles.root, fill && styles.rootFill, xstyle),
        theme.className,
        className,
      )}
    >
      <div
        className={sx(
          styles.layout,
          fillStyle,
          hasRail && hasInspector && styles.threeRegions,
          hasRail && !hasInspector && styles.railAndPrimary,
          !hasRail && hasInspector && styles.primaryAndInspector,
          !hasRail && !hasInspector && styles.primaryOnly,
        )}
      >
        {hasRail ? (
          <div
            {...themeSlotProps("workspace-layout", "rail")}
            className={sx(styles.region, regionFill)}
          >
            {rail}
          </div>
        ) : null}
        <div
          {...themeSlotProps("workspace-layout", "primary")}
          className={sx(
            styles.region,
            regionFill,
            hasRail && styles.primaryAfterRail,
            hasInspector && styles.primaryBeforeInspector,
          )}
        >
          {primary}
        </div>
        {hasInspector ? (
          <div
            {...themeSlotProps("workspace-layout", "inspector")}
            className={sx(
              styles.region,
              regionFill,
              styles.inspector,
              hasRail && styles.inspectorWithRail,
            )}
          >
            {inspector}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    containerName: "ads-workspace-layout",
    containerType: "inline-size",
    inlineSize: "100%",
    minInlineSize: 0,
  },
  layout: {
    alignItems: "start",
    columnGap: vars["--ads-space-20"],
    display: "grid",
    inlineSize: "100%",
    minInlineSize: 0,
    rowGap: 0,
  },
  threeRegions: {
    gridTemplateColumns: {
      default: "minmax(220px, 280px) minmax(360px, 1fr) minmax(280px, 320px)",
      "@container ads-workspace-layout (min-width: 701px) and (max-width: 980px)":
        "minmax(220px, 280px) minmax(0, 1fr)",
      "@container ads-workspace-layout (max-width: 700px)": "minmax(0, 1fr)",
    },
  },
  railAndPrimary: {
    gridTemplateColumns: {
      default: "minmax(220px, 280px) minmax(360px, 1fr)",
      "@container ads-workspace-layout (max-width: 700px)": "minmax(0, 1fr)",
    },
  },
  primaryAndInspector: {
    gridTemplateColumns: {
      default: "minmax(360px, 1fr) minmax(280px, 320px)",
      "@container ads-workspace-layout (max-width: 700px)": "minmax(0, 1fr)",
    },
  },
  primaryOnly: { gridTemplateColumns: "minmax(0, 1fr)" },
  rootFill: {
    blockSize: "100%",
    minBlockSize: 0,
  },
  /*
    `fill`, per region count. Each keeps the bounded single row only while its
    regions are side by side; the query widths are the column rules above, so
    the two cannot disagree about when the layout has stacked.
  */
  fillThree: {
    alignItems: {
      default: "stretch",
      "@container ads-workspace-layout (max-width: 980px)": "start",
    },
    blockSize: {
      default: "100%",
      "@container ads-workspace-layout (max-width: 980px)": "auto",
    },
    gridTemplateRows: {
      default: "minmax(0, 1fr)",
      "@container ads-workspace-layout (max-width: 980px)": "none",
    },
  },
  fillTwo: {
    alignItems: {
      default: "stretch",
      "@container ads-workspace-layout (max-width: 700px)": "start",
    },
    blockSize: {
      default: "100%",
      "@container ads-workspace-layout (max-width: 700px)": "auto",
    },
    gridTemplateRows: {
      default: "minmax(0, 1fr)",
      "@container ads-workspace-layout (max-width: 700px)": "none",
    },
  },
  fillOne: {
    alignItems: "stretch",
    blockSize: "100%",
    gridTemplateRows: "minmax(0, 1fr)",
  },
  // A filled region is itself a one-track grid, so the slot's root stretches
  // to the region's height and can own its own scroll.
  regionFillThree: {
    display: {
      default: "grid",
      "@container ads-workspace-layout (max-width: 980px)": "block",
    },
    gridTemplateRows: "minmax(0, 1fr)",
  },
  regionFillTwo: {
    display: {
      default: "grid",
      "@container ads-workspace-layout (max-width: 700px)": "block",
    },
    gridTemplateRows: "minmax(0, 1fr)",
  },
  regionFillOne: {
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
  },
  region: {
    minBlockSize: 0,
    minInlineSize: 0,
  },
  primaryAfterRail: {
    borderInlineStartColor: vars["--ads-color-border-subtle"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    paddingInlineStart: vars["--ads-space-20"],
    "@container ads-workspace-layout (max-width: 700px)": {
      borderBlockStartColor: vars["--ads-color-border-subtle"],
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: vars["--ads-border-width-hairline"],
      borderInlineStartWidth: 0,
      paddingBlockStart: vars["--ads-space-20"],
      paddingInlineStart: 0,
    },
  },
  primaryBeforeInspector: {
    borderInlineEndColor: vars["--ads-color-border-subtle"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: vars["--ads-border-width-hairline"],
    paddingInlineEnd: vars["--ads-space-20"],
    "@container ads-workspace-layout (max-width: 980px)": {
      borderInlineEndWidth: 0,
      paddingInlineEnd: 0,
    },
  },
  inspector: {
    minInlineSize: 0,
    "@container ads-workspace-layout (max-width: 700px)": {
      borderBlockStartColor: vars["--ads-color-border-subtle"],
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: vars["--ads-border-width-hairline"],
      paddingBlockStart: vars["--ads-space-20"],
    },
  },
  inspectorWithRail: {
    minInlineSize: 0,
    "@container ads-workspace-layout (max-width: 980px)": {
      borderBlockStartColor: vars["--ads-color-border-subtle"],
      borderBlockStartStyle: "solid",
      borderBlockStartWidth: vars["--ads-border-width-hairline"],
      gridColumn: "1 / -1",
      paddingBlockStart: vars["--ads-space-20"],
    },
  },
});
