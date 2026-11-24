import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import type { LucideIcon } from "lucide-react";

import { themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";

/**
 * The chart card's header content beyond title and description (F6,
 * 2026-11-07): trailing controls and the description placement. The headline
 * reading and its change are `headline`, rendered under this header.
 */
export type ChartHeaderProps = {
  /** Header controls beside the title, e.g. a period `ToggleGroup`. */
  actions?: React.ReactNode;
  /**
   * Where the description sits: under the title (default) or on the title row
   * as a quiet qualifier ("Agent lanes · Refund macro rollout"). @default "below"
   */
  descriptionPlacement?: "below" | "inline";
};

/**
 * The chart card's header — icon · title · description and the trailing
 * controls — shared by every chart form and by the public `ChartCard`, so the
 * anatomy has one source (F6 card chrome: a body/600 title, like `Card`'s, centred on its
 * controls; the `headline` figure follows it). Renders nothing without a
 * title, description or controls.
 */
export function ChartCardHeader({
  actions,
  description,
  descriptionPlacement = "below",
  headingId,
  icon: Icon,
  title,
}: ChartHeaderProps & {
  description?: React.ReactNode;
  headingId: string;
  icon?: LucideIcon;
  title?: React.ReactNode;
}) {
  const inline = descriptionPlacement === "inline";
  if (!title && !description && actions == null) return null;
  return (
    <div className={sx(styles.header)} {...themeSlotProps("chart", "header")}>
      <div
        className={sx(
          styles.titleRow,
          actions != null && styles.titleRowWithActions,
        )}
      >
        <div className={sx(styles.titleCell, inline && styles.titleCellInline)}>
          {Icon ? (
            <Icon aria-hidden className={sx(styles.icon)} size={14} />
          ) : null}
          {title ? (
            <h3
              className={sx(styles.title)}
              id={headingId}
              {...themeSlotProps("chart", "title")}
            >
              {title}
            </h3>
          ) : null}
          {inline && description ? (
            <p
              className={sx(styles.description, styles.descriptionInline)}
              {...themeSlotProps("chart", "description")}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions != null ? (
          <div className={sx(styles.actions)}>{actions}</div>
        ) : null}
      </div>
      {!inline && description ? (
        <p
          className={sx(styles.description)}
          {...themeSlotProps("chart", "description")}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  header: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  // Title and controls share one row and one centre line, so a 28px period
  // switch sits level with a body-size title instead of hanging from its top.
  titleRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
    justifyContent: "space-between",
    minInlineSize: 0,
  },
  titleRowWithActions: {
    minBlockSize: vars["--aui-control-height-xs"],
  },
  titleCell: {
    alignItems: "center",
    display: "flex",
    flex: "1 1 auto",
    gap: vars["--aui-space-8"],
    minInlineSize: 0,
  },
  titleCellInline: {
    alignItems: "baseline",
    flexWrap: "wrap",
    rowGap: 0,
  },
  icon: {
    alignSelf: "center",
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-semibold"],
    lineHeight: vars["--aui-line-height-control"],
    margin: 0,
    minInlineSize: 0,
  },
  description: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-body"],
    margin: 0,
  },
  descriptionInline: {
    lineHeight: vars["--aui-line-height-control"],
    minInlineSize: 0,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-4"],
  },
});
