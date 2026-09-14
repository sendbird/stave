import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import type { ButtonTone, ButtonVariant } from "./Button.types";

type SemanticButtonTone = Exclude<ButtonTone, "default">;

/**
 * A semantic action is still a Button: tone substitutes hue while variant
 * keeps the control's weight, elevation, edge, and geometry. Private custom
 * properties make that substitution one implementation for success, warning,
 * and danger instead of three copies that can drift apart.
 *
 * The `primary` fill is the tone's BASE token (the 600-step solid every
 * reference system paints a semantic button with — Tailwind `bg-*-600`,
 * Primer `btn-primary`/`btn-danger`), not the darker `*Text` step; `*Text` is
 * the ink on `*Soft` and the outline/quiet label. `check:colors` gates
 * `colorTextInverted` at 4.5:1 on every base token in all three themes, which
 * is what lets the fill sit one rung lighter than it used to.
 */
export const buttonToneVariables = {
  danger: {
    "--ads-button-tone-border": vars["--ads-color-danger-border"],
    "--ads-button-tone-fill": vars["--ads-color-danger"],
    "--ads-button-tone-hover": vars["--ads-color-danger-hover"],
    "--ads-button-tone-ink": vars["--ads-color-danger-text"],
    "--ads-button-tone-soft": vars["--ads-color-danger-soft"],
  } as React.CSSProperties,
  success: {
    "--ads-button-tone-border": vars["--ads-color-success-border"],
    "--ads-button-tone-fill": vars["--ads-color-success"],
    "--ads-button-tone-hover": `color-mix(in oklab, ${vars["--ads-color-text"]} 8%, ${vars["--ads-color-success"]})`,
    "--ads-button-tone-ink": vars["--ads-color-success-text"],
    "--ads-button-tone-soft": vars["--ads-color-success-soft"],
  } as React.CSSProperties,
  warning: {
    "--ads-button-tone-border": vars["--ads-color-warning-border"],
    "--ads-button-tone-fill": vars["--ads-color-warning"],
    "--ads-button-tone-hover": `color-mix(in oklab, ${vars["--ads-color-text"]} 8%, ${vars["--ads-color-warning"]})`,
    "--ads-button-tone-ink": vars["--ads-color-warning-text"],
    "--ads-button-tone-soft": vars["--ads-color-warning-soft"],
  } as React.CSSProperties,
} as const satisfies Record<SemanticButtonTone, React.CSSProperties>;

const toneSoftPress = `color-mix(in oklab, ${vars["--ads-color-text"]} 5%, var(--ads-button-tone-soft))`;
const toneWashHover = `color-mix(in oklab, ${vars["--ads-color-text"]} 8%, var(--ads-button-tone-soft))`;
const toneWashPress = `color-mix(in oklab, ${vars["--ads-color-text"]} 12%, var(--ads-button-tone-soft))`;
const tonePrimaryPress = `color-mix(in oklab, ${vars["--ads-color-text"]} 5%, var(--ads-button-tone-hover))`;

const toneVariantStyles = stylex.create({
  dashed: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ads-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: {
      default: "var(--ads-button-tone-border)",
      ":hover": "var(--ads-button-tone-fill)",
    },
    color: "var(--ads-button-tone-ink)",
  },
  ink: {
    color: "var(--ads-button-tone-ink)",
  },
  outline: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ads-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "var(--ads-button-tone-border)",
    color: "var(--ads-button-tone-ink)",
  },
  primary: {
    backgroundColor: {
      default: "var(--ads-button-tone-fill)",
      ":hover": "var(--ads-button-tone-hover)",
      ":active": tonePrimaryPress,
    },
    borderColor: {
      default: "var(--ads-button-tone-fill)",
      ":hover": "var(--ads-button-tone-hover)",
      ":active": tonePrimaryPress,
    },
    color: vars["--ads-color-text-inverted"],
  },
  quiet: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--ads-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "transparent",
    color: {
      default: "var(--ads-button-tone-ink)",
      ":hover": "var(--ads-button-tone-ink)",
      ":active": "var(--ads-button-tone-ink)",
    },
  },
  secondary: {
    backgroundColor: {
      default: vars["--ads-color-surface-raised"],
      ":hover": "var(--ads-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "var(--ads-button-tone-border)",
    color: "var(--ads-button-tone-ink)",
  },
  soft: {
    backgroundColor: {
      default: "var(--ads-button-tone-soft)",
      ":hover": toneWashHover,
      ":active": toneWashPress,
    },
    borderColor: "transparent",
    color: "var(--ads-button-tone-ink)",
  },
});

export const buttonToneVariantStyles = {
  dashed: toneVariantStyles.dashed,
  floating: toneVariantStyles.ink,
  link: toneVariantStyles.ink,
  outline: toneVariantStyles.outline,
  primary: toneVariantStyles.primary,
  quiet: toneVariantStyles.quiet,
  secondary: toneVariantStyles.secondary,
  soft: toneVariantStyles.soft,
} as const satisfies Record<Exclude<ButtonVariant, "danger">, unknown>;
