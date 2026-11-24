import * as stylex from "@stylexjs/stylex";
import { TriangleAlert } from "lucide-react";
import type * as React from "react";

import { i18n, useTranslation } from "@/i18n";

import { vars } from "../tokens/tokens.stylex";
import { sx } from "../utils/stylex";
import { Button } from "./Button";

/**
 * The shared recovery contract for a data surface whose load failed —
 * `StatTile` and `DataTable`'s body. Named like the agent family's
 * `AgentRetryProps` so a surface that fails reads the same everywhere.
 */
export type DataErrorRetryProps = {
  /** Re-run the failed load. Without it the line states the failure only. */
  onRetry?: () => void;
  /** Label of the one recovery action. @default "Retry" */
  retryLabel?: React.ReactNode;
};

export type DataErrorLineProps = DataErrorRetryProps & {
  /**
   * Put `role="alert"` on the message. Off when an ancestor already is the
   * alert (DataTable's error well), so the failure is announced once.
   * @default true
   */
  announce?: boolean;
  /** What failed, in danger ink after a small danger glyph. */
  message: React.ReactNode;
  /**
   * Type step of the message: caption under a metric (start-aligned), body in
   * a table's centred well (a wrapped action centres too). @default "caption"
   */
  size?: "body" | "caption";
};

/**
 * One line that says a load failed and offers the one way back: a 12px danger
 * glyph, the message in danger text, and a quiet `Retry` link — the recipe
 * `DataTable`'s pagination footer already uses for a failed continuation, so
 * the three data-failure states read as one family. The colour stays on the
 * small elements (glyph and words); the surface around them does not change.
 *
 * The line keeps the 20px control line box whatever the action's touch target
 * is: the 24px link (44px on a coarse pointer) overhangs the line by negative
 * block margin instead of pushing the surface taller than its loaded self.
 */
export function DataErrorLine({
  announce = true,
  message,
  onRetry,
  retryLabel = i18n.t("ui:dataError.retry"),
  size = "caption",
}: DataErrorLineProps) {
  useTranslation();
  return (
    <span
      className={sx(
        styles.line,
        size === "body" ? styles.body : styles.caption,
      )}
    >
      <span
        className={sx(styles.message)}
        role={announce ? "alert" : undefined}
      >
        <TriangleAlert aria-hidden className={sx(styles.glyph)} size={12} />
        <span className={sx(styles.text)}>{message}</span>
      </span>
      {onRetry ? (
        <Button
          flushInline
          onClick={onRetry}
          size="2xs"
          variant="link"
          xstyle={styles.retry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </span>
  );
}

const styles = stylex.create({
  line: {
    alignItems: "center",
    columnGap: vars["--aui-space-8"],
    display: "inline-flex",
    flexWrap: "wrap",
    lineHeight: vars["--aui-line-height-control"],
    minInlineSize: 0,
    maxInlineSize: "100%",
    // Top, not baseline: an inline-flex box on the baseline of a paragraph
    // adds the strut's descent under it (2px on DataTable's well).
    verticalAlign: "top",
  },
  caption: {
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-control"],
  },
  // The body step sits in a centred empty-state well: a wrapped Retry
  // centres under the message instead of hanging at the line's start.
  body: {
    fontSize: vars["--aui-font-size-body"],
    justifyContent: "center",
    lineHeight: vars["--aui-line-height-control"],
  },
  message: {
    alignItems: "center",
    color: vars["--aui-color-danger-text"],
    display: "inline-flex",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  glyph: { color: vars["--aui-color-danger"], flexShrink: 0 },
  text: { minInlineSize: 0, overflowWrap: "anywhere" },
  // (line box − control height) / 2, per pointer: the link's box overhangs
  // the line evenly instead of growing it.
  retry: {
    marginBlock: {
      default: `calc((${vars["--aui-line-height-control"]} - ${vars["--aui-control-height-2xs"]}) / 2)`,
      "@media (pointer: coarse)": `calc((${vars["--aui-line-height-control"]} - ${vars["--aui-control-height-xl"]}) / 2)`,
    },
  },
});
