import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { sx, type StyleXValue } from "../utils/stylex";
import { DataErrorLine, type DataErrorRetryProps } from "./data-error";

/**
 * The failure a `StatTile` shows, or `null` when it shows its value: `loading`
 * wins (a retry in flight is a skeleton), `false`/`null`/`undefined`/`""` are
 * no error, and `true` reads as `errorLabel`.
 */
export function resolveStatTileError(
  error: React.ReactNode | boolean | undefined,
  errorLabel: React.ReactNode,
  loading: boolean,
): React.ReactNode | null {
  if (loading || error == null || error === false || error === "") return null;
  return error === true ? errorLabel : error;
}

/**
 * The tile's failure line under the readout (or in a row's delta and trend
 * columns): the shared data-surface `DataErrorLine`, in the caption step the
 * delta tag's period words use, under the `error` theme slot.
 */
export function StatTileErrorLine({
  message,
  onRetry,
  retryLabel,
  row = false,
}: DataErrorRetryProps & { message: React.ReactNode; row?: boolean }) {
  return (
    <span
      {...themeSlotProps("stat-tile", "error")}
      className={sx(styles.slot, row && styles.row)}
      data-stat-error=""
    >
      <DataErrorLine
        message={message}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
    </span>
  );
}

const styles = stylex.create({
  // The delta tag's 24px box (a `md` Badge), so a failed tile's line is as
  // tall as the tag it replaces and a row keeps its loaded height.
  slot: {
    alignItems: "center",
    display: "flex",
    minBlockSize: vars["--aui-control-height-2xs"],
    minInlineSize: 0,
  },
  // A row's failure spans its delta and trend columns, so the label and the
  // dash keep their columns and the line stays one line.
  row: { gridColumn: "3 / -1" },
  /*
   * The value's own type with muted ink: the em dash stands in the readout's
   * line box at the headline's size, so a failed tile is as tall as a loaded
   * one and its neighbours' numbers stay on one baseline.
   */
  missing: { color: vars["--aui-color-text-muted"] },
});

/** The em dash a failed tile shows in its value slot. */
export function StatTileMissingValue({
  xstyle,
}: {
  xstyle: StyleXValue;
}) {
  return (
    <span
      {...themeSlotProps("stat-tile", "value")}
      aria-hidden
      className={sx(xstyle, styles.missing)}
      data-stat-missing=""
    >
      —
    </span>
  );
}
