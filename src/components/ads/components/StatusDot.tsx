import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type StatusDotStatus =
  | "queued"
  | "running"
  | "ready"
  | "error"
  | "canceled";

export type StatusDotTone =
  | "neutral"
  | "muted"
  | "accent"
  | "info"
  | "warning"
  | "success"
  | "danger";

export type StatusDotSize = "sm" | "md" | "lg";

export type StatusDotVariant = "solid" | "ring";

type StatusDotBaseProps = Omit<React.ComponentProps<"span">, "children"> & {
  /**
   * Visible state text next to the dot. Provide it when the dot stands alone;
   * omit it when adjacent copy already names the state (with `status` the dot
   * then carries an auto `aria-label`; with `tone` it is decorative unless an
   * explicit `aria-label` is passed).
   */
  label?: React.ReactNode;
  /** Dot diameter — `sm` 6px, `md` 8px (default), `lg` 12px. */
  size?: StatusDotSize;
  /**
   * `ring` adds a soft same-hue halo around the dot for the hottest reading
   * of a scale (e.g. a fatal severity). Default `solid`.
   */
  variant?: StatusDotVariant;
};

export type StatusDotProps = StatusDotBaseProps &
  (
    | {
        /** Lifecycle state the dot communicates. */
        status: StatusDotStatus;
        tone?: never;
      }
    | {
        /**
         * Semantic color tone for non-lifecycle dots (severity levels,
         * category/label colors). Mutually exclusive with `status`.
         */
        tone: StatusDotTone;
        status?: never;
      }
  ) &
  XstyleProp;

const statusText: Record<StatusDotStatus, string> = {
  canceled: "Canceled",
  error: "Error",
  queued: "Queued",
  ready: "Ready",
  running: "Running",
};

/**
 * Lifecycle status dot (lifecycle states: queued → running → ready /
 * error / canceled). Color rides on the small dot only — never a surface wash —
 * and maps to status tokens (info/success/danger/neutral), never chart tokens.
 *
 * The `running` state pulses (CSS opacity animation) so in-flight work is
 * distinguishable from terminal states at a glance; under
 * `prefers-reduced-motion` the dot is static. Color is never the only signal:
 * every state has distinct text via `label` or the auto `aria-label`.
 *
 * Beyond the lifecycle `status` axis, `tone` renders a plain semantic-color
 * dot (severity scales, team/label colors) without lifecycle semantics —
 * apps should reach for `tone` instead of hand-rolling token-variant maps.
 */
export function StatusDot({
  className,
  label,
  size = "md",
  status,
  tone,
  variant = "solid",
  xstyle,
  ...props
}: StatusDotProps) {
  const ringTone: StatusDotTone | undefined =
    variant === "ring"
      ? (tone ?? (status ? statusRingTone[status] : undefined))
      : undefined;

  const dot = (
    <span
      aria-hidden={label != null || undefined}
      className={sx(
        styles.dot,
        sizeStyles[size],
        status != null && dotToneStyles[status],
        tone != null && toneStyles[tone],
        status === "running" && styles.pulsing,
        ringTone != null && ringStyles[ringTone],
      )}
    />
  );

  // With `status` and no visible label the dot self-describes via an auto
  // aria-label. Tone-only dots are decorative unless the caller passes an
  // explicit aria-label (severity glyphs should).
  const explicitAriaLabel = props["aria-label"];
  const autoAriaLabel =
    label == null && explicitAriaLabel == null && status != null
      ? statusText[status]
      : undefined;
  const accessibleName = explicitAriaLabel ?? autoAriaLabel;

  return (
    <span
      {...props}
      aria-hidden={
        label == null && accessibleName == null ? true : props["aria-hidden"]
      }
      aria-label={accessibleName}
      className={cx(sx(styles.root, xstyle), className)}
      role={label == null && accessibleName != null ? "img" : props.role}
    >
      {dot}
      {label != null ? <span className={sx(styles.label)}>{label}</span> : null}
    </span>
  );
}

const statusRingTone: Record<StatusDotStatus, StatusDotTone> = {
  canceled: "muted",
  error: "danger",
  queued: "neutral",
  ready: "success",
  running: "info",
};

const pulse = stylex.keyframes({
  "0%": { opacity: 1 },
  "50%": { opacity: 0.35 },
  "100%": { opacity: 1 },
});

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "inline-flex",
    gap: vars.space8,
    lineHeight: vars.lineHeightTight,
    verticalAlign: "middle",
  },
  dot: {
    backgroundColor: "currentColor",
    borderRadius: vars.radiusFull,
    flexShrink: 0,
  },
  pulsing: {
    // Slow loop step: `running` is an ambient presence cue, so it breathes
    // with the other status halos rather than at a bespoke 1.6s (which sat
    // exactly between two steps of the loop family).
    animationDuration: vars.motionDurationLoopSlow,
    animationIterationCount: "infinite",
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: vars.motionEaseInOut,
  },
  label: {
    color: vars.colorText,
    fontSize: vars.fontSizeBody,
    minInlineSize: 0,
  },
  // Hollow ring, not a fill — distinguishes "waiting" from the filled
  // "canceled" dot without relying on motion or color alone.
  queued: {
    backgroundColor: "transparent",
    borderColor: "currentColor",
    borderStyle: "solid",
    borderWidth: 1.5,
    color: vars.colorTextSubtle,
  },
  running: {
    color: vars.colorInfo,
  },
  ready: {
    color: vars.colorSuccess,
  },
  error: {
    color: vars.colorDanger,
  },
  canceled: {
    color: vars.colorTextSubtle,
  },
});

const dotToneStyles = {
  canceled: styles.canceled,
  error: styles.error,
  queued: styles.queued,
  ready: styles.ready,
  running: styles.running,
} as const;

const sizeStyles = stylex.create({
  sm: { blockSize: 6, inlineSize: 6 },
  md: { blockSize: 8, inlineSize: 8 },
  lg: { blockSize: 12, inlineSize: 12 },
});

// Semantic tones for non-lifecycle dots. Color rides the dot only; each
// value maps to a status/text token, never a chart token.
const toneStyles = stylex.create({
  neutral: { color: vars.colorTextSubtle },
  muted: { color: vars.colorTextMuted },
  accent: { color: vars.colorAccent },
  info: { color: vars.colorInfo },
  warning: { color: vars.colorWarning },
  success: { color: vars.colorSuccess },
  danger: { color: vars.colorDanger },
});

// Soft same-hue halo for the `ring` variant (e.g. a fatal severity that must
// read hotter than plain danger). This is an emphasis halo, not a keyboard
// focus ring, so the width comes from `ringWidthMd` — seven hand-rolled `3px`
// literals here could drift from the selection halos in PresenceBadge /
// CallControlBar / Annotation independently.
const ringStyles = stylex.create({
  neutral: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorBorder}` },
  muted: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorBorder}` },
  accent: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorAccentSoft}` },
  info: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorInfoSoft}` },
  warning: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorWarningSoft}` },
  success: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorSuccessSoft}` },
  danger: { boxShadow: `0 0 0 ${vars.ringWidthMd} ${vars.colorDangerSoft}` },
});
