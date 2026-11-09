import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import type { ButtonTone, ButtonVariant } from "./Button.types";

type SemanticButtonTone = Exclude<ButtonTone, "neutral">;

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
    "--aui-button-tone-border": vars["--aui-color-danger-border"],
    "--aui-button-tone-fill": vars["--aui-color-danger"],
    "--aui-button-tone-hover": vars["--aui-color-danger-hover"],
    "--aui-button-tone-ink": vars["--aui-color-danger-text"],
    "--aui-button-tone-soft": vars["--aui-color-danger-soft"],
  } as React.CSSProperties,
  success: {
    "--aui-button-tone-border": vars["--aui-color-success-border"],
    "--aui-button-tone-fill": vars["--aui-color-success"],
    "--aui-button-tone-hover": `color-mix(in oklab, ${vars["--aui-color-text"]} 8%, ${vars["--aui-color-success"]})`,
    "--aui-button-tone-ink": vars["--aui-color-success-text"],
    "--aui-button-tone-soft": vars["--aui-color-success-soft"],
  } as React.CSSProperties,
  warning: {
    "--aui-button-tone-border": vars["--aui-color-warning-border"],
    "--aui-button-tone-fill": vars["--aui-color-warning"],
    "--aui-button-tone-hover": `color-mix(in oklab, ${vars["--aui-color-text"]} 8%, ${vars["--aui-color-warning"]})`,
    "--aui-button-tone-ink": vars["--aui-color-warning-text"],
    "--aui-button-tone-soft": vars["--aui-color-warning-soft"],
  } as React.CSSProperties,
} as const satisfies Record<SemanticButtonTone, React.CSSProperties>;

const toneSoftPress = `color-mix(in oklab, ${vars["--aui-color-text"]} 5%, var(--aui-button-tone-soft))`;
const toneWashHover = `color-mix(in oklab, ${vars["--aui-color-text"]} 8%, var(--aui-button-tone-soft))`;
const toneWashPress = `color-mix(in oklab, ${vars["--aui-color-text"]} 12%, var(--aui-button-tone-soft))`;
const tonePrimaryPress = `color-mix(in oklab, ${vars["--aui-color-text"]} 5%, var(--aui-button-tone-hover))`;

const toneVariantStyles = stylex.create({
  dashed: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--aui-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: {
      default: "var(--aui-button-tone-border)",
      ":hover": "var(--aui-button-tone-fill)",
    },
    color: "var(--aui-button-tone-ink)",
  },
  ink: {
    color: "var(--aui-button-tone-ink)",
  },
  outlined: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--aui-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "var(--aui-button-tone-border)",
    color: "var(--aui-button-tone-ink)",
  },
  primary: {
    backgroundColor: {
      default: "var(--aui-button-tone-fill)",
      ":hover": "var(--aui-button-tone-hover)",
      ":active": tonePrimaryPress,
    },
    borderColor: {
      default: "var(--aui-button-tone-fill)",
      ":hover": "var(--aui-button-tone-hover)",
      ":active": tonePrimaryPress,
    },
    color: vars["--aui-color-text-inverted"],
  },
  quiet: {
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--aui-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "transparent",
    color: {
      default: "var(--aui-button-tone-ink)",
      ":hover": "var(--aui-button-tone-ink)",
      ":active": "var(--aui-button-tone-ink)",
    },
  },
  secondary: {
    backgroundColor: {
      default: vars["--aui-color-surface-raised"],
      ":hover": "var(--aui-button-tone-soft)",
      ":active": toneSoftPress,
    },
    borderColor: "var(--aui-button-tone-border)",
    color: "var(--aui-button-tone-ink)",
  },
  soft: {
    backgroundColor: {
      default: "var(--aui-button-tone-soft)",
      ":hover": toneWashHover,
      ":active": toneWashPress,
    },
    borderColor: "transparent",
    color: "var(--aui-button-tone-ink)",
  },
});

export const buttonToneVariantStyles = {
  dashed: toneVariantStyles.dashed,
  floating: toneVariantStyles.ink,
  link: toneVariantStyles.ink,
  outlined: toneVariantStyles.outlined,
  primary: toneVariantStyles.primary,
  quiet: toneVariantStyles.quiet,
  secondary: toneVariantStyles.secondary,
  soft: toneVariantStyles.soft,
} as const satisfies Record<ButtonVariant, unknown>;
