import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx } from "../utils/stylex";
import { LoaderMark } from "./Loader.parts";
import type { LoaderSize, LoaderVariant } from "./Loader.types";

export type { LoaderSize, LoaderVariant } from "./Loader.types";

export type LoaderTone = "accent" | "inherit" | "neutral";

export type LoaderProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Status text; used as the accessible name when it is visually hidden. */
  label?: string;
  /** Render the label beside the indicator. @default false */
  showLabel?: boolean;
  /** Indicator footprint: 16 / 20 / 24 / 32px. @default "sm" */
  size?: LoaderSize;
  /** `inherit` works inside a Button or semantic status word. @default "inherit" */
  tone?: LoaderTone;
  /**
   * Activity cadence, selected by work shape rather than decoration:
   *
   * - `spinner`: ordinary indeterminate wait
   * - `dots`: conversational hand-off or queue
   * - `matrix`: generative inference
   * - `pulse`: continuous stream
   * - `steps`: staged tool execution
   * - `orbit`: synthesis around stable context
   * - `ripple`: retrieval or retry spreading outward
   * - `signal`: remote I/O or reconnection
   * - `scan`: inspection or indexing pass
   * - `parallel`: concurrent work lanes
   * - `cascade`: dependent pipeline stages
   * - `decode`: token or response resolution
   * - `compile`: build or bundle transformation
   * - `route`: orchestration path
   * - `handoff`: work transferred between agents
   * - `vision`: image or media processing
   * - `explore`: branching alternatives
   * - `sync`: bidirectional state reconciliation
   * - `verify`: validation across checkpoints
   * - `persist`: durable write or commit
   *
   * @default "spinner"
   */
  variant?: LoaderVariant;
};

/**
 * General-purpose indeterminate activity mark. Unlike `DelightSpinner`, this
 * component is product chrome rather than a branded moment. Its variants
 * share one size, color, accessibility and reduced-motion contract; agent
 * components compose them instead of creating an AI-only loader vocabulary.
 */
export function Loader({
  className,
  label = "Loading",
  showLabel = false,
  size = "sm",
  tone = "inherit",
  variant = "spinner",
  ...props
}: LoaderProps) {
  const hidden =
    props["aria-hidden"] === true || props["aria-hidden"] === "true";

  return (
    <span
      {...props}
      aria-label={
        hidden || showLabel
          ? props["aria-label"]
          : (props["aria-label"] ?? label)
      }
      aria-live={hidden ? undefined : (props["aria-live"] ?? "polite")}
      className={cx(
        sx(styles.root, toneStyles[tone], showLabel && styles.withLabel),
        className,
      )}
      data-ads-loader-variant={variant}
      role={hidden ? undefined : (props.role ?? "status")}
    >
      <LoaderMark size={size} variant={variant} />
      {showLabel ? <span className={sx(styles.label)}>{label}</span> : null}
    </span>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    lineHeight: vars.lineHeightNormal,
    minInlineSize: 0,
  },
  withLabel: { gap: vars.space8 },
  label: {
    color: "currentColor",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightTight,
    minInlineSize: 0,
  },
  accent: { color: vars.colorAccent },
  inherit: { color: "inherit" },
  neutral: { color: vars.colorTextMuted },
});

const toneStyles = {
  accent: styles.accent,
  inherit: styles.inherit,
  neutral: styles.neutral,
} as const;
