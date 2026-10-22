import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSeparator,
  type ToolbarButtonProps,
  type ToolbarRootProps,
} from "../headless/toolbar";
import { focusRing } from "../recipes/focus-ring";
import { themeSlotProps, themeTargetClassName } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { transition } from "../recipes/transition";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type ToolbarProps = Omit<ToolbarRootProps, "className"> & {
  className?: string;
} & XstyleProp;

export function Toolbar({
  className,
  orientation = "horizontal",
  xstyle,
  ...props
}: ToolbarProps) {
  return (
    <ToolbarRoot
      {...props}
      className={cx(
        sx(styles.root, orientationStyles[orientation], xstyle),
        themeTargetClassName("toolbar"),
        className,
      )}
      orientation={orientation}
    />
  );
}

export type ToolbarIconButtonProps = Omit<ToolbarButtonProps, "className"> & {
  active?: boolean;
  className?: string;
} & XstyleProp;

export function ToolbarIconButton({
  active = false,
  className,
  xstyle,
  ...props
}: ToolbarIconButtonProps) {
  return (
    <ToolbarButton
      {...props}
      data-ads-control="toolbar-button"
      className={(state) =>
        cx(
          sx(
            styles.button,
            transition.colors,
            focusRing.ring,
            active && styles.buttonActive,
            state.disabled && styles.disabled,
            xstyle,
          ),
          themeTargetClassName("toolbar-button"),
          className,
        )
      }
    />
  );
}

export function ToolbarButtonGroup({
  children,
  orientation = "horizontal",
  xstyle,
}: {
  children: React.ReactNode;
  orientation?: "horizontal" | "vertical";
} & XstyleProp) {
  return (
    <ToolbarGroup
      {...themeSlotProps("toolbar", "group")}
      className={sx(styles.group, groupOrientationStyles[orientation], xstyle)}
    >
      {children}
    </ToolbarGroup>
  );
}

export function ToolbarDivider({
  orientation = "horizontal",
  xstyle,
}: {
  orientation?: "horizontal" | "vertical";
} & XstyleProp) {
  return (
    <ToolbarSeparator
      {...themeSlotProps("toolbar", "separator")}
      className={sx(styles.separator, separatorStyles[orientation], xstyle)}
    />
  );
}

const styles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    // `elevationRaised` — docked in-flow chrome (§1.5), same band as `Button`. The
    // floating counterpart (`FloatingToolbar`) is the detached `elevationOverlay`
    // surface; both are the same object, just anchored differently, and must
    // read as one family.
    boxShadow: vars["--ads-elevation-raised"],
    gap: vars["--ads-space-4"],
    minBlockSize: vars["--ads-control-height"],
    padding: vars["--ads-space-4"],
  },
  rootHorizontal: {
    alignItems: "center",
    display: "inline-flex",
  },
  rootVertical: {
    alignItems: "stretch",
    display: "inline-grid",
  },
  group: {
    gap: vars["--ads-space-4"],
  },
  groupHorizontal: {
    alignItems: "center",
    display: "inline-flex",
  },
  groupVertical: {
    alignItems: "stretch",
    display: "inline-grid",
  },
  button: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":active": vars["--ads-color-overlay-pressed"],
      "@media (hover: hover)": {
        default: "transparent",
        ":hover": vars["--ads-color-overlay-hover"],
        ":active": vars["--ads-color-overlay-pressed"],
      },
    },
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    minBlockSize: vars["--ads-control-height-sm"],
    // Min-size, not a fixed inline-size: icon-only buttons stay a
    // controlHeightSm square, while labeled triggers (e.g. the floating
    // toolbar's block-style dropdown) grow with their content instead of
    // painting a hover/active background narrower than the overflowing label.
    minInlineSize: vars["--ads-control-height-sm"],
  },
  buttonActive: {
    backgroundColor: vars["--ads-color-selection-fill"],
    color: vars["--ads-color-accent"],
  },
  disabled: {
    cursor: "not-allowed",
    opacity: vars["--ads-opacity-disabled"],
  },
  separator: {
    backgroundColor: vars["--ads-color-border"],
    marginInline: vars["--ads-space-4"],
  },
  separatorHorizontal: {
    blockSize: 24,
    inlineSize: 1,
  },
  separatorVertical: {
    blockSize: 1,
    inlineSize: "auto",
    marginBlock: vars["--ads-space-4"],
    marginInline: 0,
  },
});

const orientationStyles = {
  horizontal: styles.rootHorizontal,
  vertical: styles.rootVertical,
} as const;

const groupOrientationStyles = {
  horizontal: styles.groupHorizontal,
  vertical: styles.groupVertical,
} as const;

const separatorStyles = {
  horizontal: styles.separatorHorizontal,
  vertical: styles.separatorVertical,
} as const;
