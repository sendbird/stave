import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

import { controlIconSizes } from "../recipes/control-metrics";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";

export type InlineDisclosureIconProps = {
  /** Object glyph shown while the disclosure trigger is at rest. */
  children: React.ReactNode;
  /** Disabled/static rows keep only the object glyph. @default true */
  disclosure?: boolean;
  open?: boolean;
};

/**
 * Shared leading slot for inline AI evidence disclosures.
 *
 * The object glyph identifies the row at rest. Pointer hover or keyboard focus
 * reveals the disclosure direction in the same fixed-size slot, so the row
 * does not move and `aria-expanded` remains the canonical state signal.
 */
export function InlineDisclosureIcon({
  children,
  disclosure = true,
  open = false,
}: InlineDisclosureIconProps) {
  return (
    <span
      aria-hidden
      className={sx(styles.slot)}
      data-ads-inline-disclosure-icon=""
      data-open={open ? "true" : "false"}
    >
      <span
        className={cx(
          sx(styles.layer, styles.glyph),
          "atelier-inline-disclosure-glyph",
        )}
        data-ads-inline-disclosure-glyph=""
      >
        {children}
      </span>
      {disclosure ? (
        <ChevronRight
          className={cx(
            sx(styles.layer, styles.chevron),
            "atelier-inline-disclosure-chevron",
          )}
          data-ads-inline-disclosure-chevron=""
          size={controlIconSizes.md}
        />
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  slot: {
    blockSize: vars.controlIconSizeMd,
    color: vars.colorTextSubtle,
    display: "grid",
    flexShrink: 0,
    inlineSize: vars.controlIconSizeMd,
    placeItems: "center",
  },
  layer: {
    alignItems: "center",
    display: "inline-flex",
    gridArea: "1 / 1",
    justifyContent: "center",
  },
  glyph: {
    opacity: 1,
    transform: "scale(1)",
  },
  chevron: {
    opacity: 0,
    transform: "scale(0.75)",
  },
});
