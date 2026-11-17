import * as stylex from "@stylexjs/stylex";
import * as React from "react";

import {
  AlertRoot as HeadlessAlertRoot,
  type AlertRootProps as HeadlessAlertRootProps,
} from "../headless/alert";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { resolveToneRole, toneIcons } from "../utils/tone";
import { ButtonSizeContext } from "./Button.sizeContext";
import { FeedbackDismiss } from "./feedback-dismiss";

export type AlertTone = "info" | "success" | "warning" | "danger";

type AlertSharedProps = Omit<HeadlessAlertRootProps, "children"> & {
  children?: React.ReactNode;
  /** Accessible name for the dismiss control, in the host's words; required for it to show. */
  dismissLabel?: string;
  onDismiss?: () => void;
  tone?: AlertTone;
};

export type AlertRootProps = AlertSharedProps & XstyleProp;

export function AlertTitle({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"strong"> & XstyleProp) {
  return (
    <strong
      {...props}
      {...themeSlotProps("alert", "title")}
      className={cx(sx(styles.title, xstyle), className)}
    />
  );
}

export function AlertDescription({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & XstyleProp) {
  return (
    <div
      {...props}
      {...themeSlotProps("alert", "description")}
      className={cx(sx(styles.body, xstyle), className)}
    />
  );
}

export function AlertAction({
  className,
  xstyle,
  ...props
}: React.ComponentProps<"div"> & XstyleProp) {
  // In-surface actions sit on the 32px `sm` rung unless a Button says so —
  // the same height as the dismiss control on that row (F1, 2026-11-08).
  return (
    <ButtonSizeContext.Provider value="sm">
      <div
        {...props}
        {...themeSlotProps("alert", "action")}
        className={cx(sx(styles.action, xstyle), className)}
      />
    </ButtonSizeContext.Provider>
  );
}

/** Styled alert surface shared by the convenience and compound APIs. */
export function AlertRoot({
  children,
  className,
  dismissLabel,
  onDismiss,
  ref,
  role,
  tone = "info",
  xstyle,
  ...props
}: AlertRootProps) {
  const Icon = toneIcons[tone];
  const alertRole = resolveToneRole(tone, role);
  const items = React.Children.toArray(children);
  const action = items.find(
    (item) => React.isValidElement(item) && item.type === AlertAction,
  );
  const copy = items.filter((item) => item !== action);
  const theme = themeProps("alert", { tone });

  return (
    <HeadlessAlertRoot
      {...props}
      {...theme}
      className={cx(
        sx(styles.root, onDismiss ? styles.rootDismissible : null, xstyle),
        theme.className,
        className,
      )}
      ref={ref}
      role={alertRole}
    >
      <span
        {...themeSlotProps("alert", "media")}
        className={sx(styles.iconSlot, toneIconStyles[tone])}
      >
        <Icon aria-hidden size={16} />
      </span>
      <div className={sx(styles.copy)}>{copy}</div>
      {action}
      {onDismiss && dismissLabel ? (
        <div className={sx(styles.dismiss)}>
          <FeedbackDismiss label={dismissLabel} onDismiss={onDismiss} />
        </div>
      ) : null}
    </HeadlessAlertRoot>
  );
}

export type AlertProps = Omit<AlertSharedProps, "children"> & {
  action?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * Show a trailing dismiss control and call this when it is pressed. The alert
   * stays mounted — the owner decides what dismissal means (hide it, remember
   * it, acknowledge the condition), because an alert that removed itself would
   * also remove the state it was reporting.
   */
  title: React.ReactNode;
} & XstyleProp;

function AlertConvenience({
  action,
  children,
  className,
  dismissLabel,
  onDismiss,
  role,
  tone = "info",
  title,
  xstyle,
  ...props
}: AlertProps) {
  return (
    <AlertRoot
      {...props}
      className={className}
      xstyle={xstyle}
      dismissLabel={dismissLabel}
      onDismiss={onDismiss}
      role={role}
      tone={tone}
    >
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {action ? <AlertAction>{action}</AlertAction> : null}
    </AlertRoot>
  );
}

/** Concise props remain callable; named parts support richer action notices. */
export const Alert = Object.assign(AlertConvenience, {
  Action: AlertAction,
  Description: AlertDescription,
  Root: AlertRoot,
  Title: AlertTitle,
});

const styles = stylex.create({
  root: {
    alignItems: "start",
    // An in-context condition is not a detachable card. The tint groups the
    // title, body, and action; the icon carries semantic tone. The geometric
    // ring resolves only in high contrast, where the tint is not a sufficient
    // edge cue. `radiusPanel`, 12px inline padding, a 16px glyph track, a
    // body/500 title over a body-size muted description, `sm` actions.
    // Banner keeps the larger page-level spacing step.
    backgroundColor: vars["--aui-color-surface-tint"],
    borderRadius: vars["--aui-radius-panel"],
    boxShadow: `0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-media-edge"]}`,
    color: vars["--aui-color-text"],
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: `${vars["--aui-control-icon-size-md"]} minmax(0, 1fr) auto`,
      "@media (max-width: 560px)": `${vars["--aui-control-icon-size-md"]} minmax(0, 1fr)`,
    },
    lineHeight: vars["--aui-line-height-normal"],
    minInlineSize: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-12"],
  },
  /*
   * A fourth track for the dismiss control, so the action keeps its own `auto`
   * column instead of sharing one cluster with the ×. Below 560px the alert is
   * already two tracks with the action wrapping to a second row; the dismiss
   * takes the trailing `auto` there and stays on the title's row, which is where
   * a reader looks for a close control.
   */
  rootDismissible: {
    gridTemplateColumns: {
      default: `${vars["--aui-control-icon-size-md"]} minmax(0, 1fr) auto auto`,
      "@media (max-width: 560px)": `${vars["--aui-control-icon-size-md"]} minmax(0, 1fr) auto`,
    },
  },
  dismiss: {
    alignSelf: "start",
    display: "inline-flex",
    gridColumn: {
      default: "4",
      "@media (max-width: 560px)": "3",
    },
    gridRow: "1",
    // The 32px control against a 12px block padding would push the alert
    // taller than its copy needs; pulling it back by the difference keeps the
    // notice the same height it is without a dismiss control.
    marginBlock: `calc(${vars["--aui-space-4"]} * -1)`,
  },
  // The glyph's slot is the title's first line box, so the 16px icon centres
  // on that line by flex alignment rather than an optical nudge.
  iconSlot: {
    alignItems: "center",
    blockSize: `calc(${vars["--aui-font-size-body"]} * ${vars["--aui-line-height-tight"]})`,
    display: "inline-flex",
    justifyContent: "center",
  },
  // Tone now lives on the ICON only — the card stays a neutral surface with
  // readable neutral text, and the semantic color reads from the icon.
  iconInfo: { color: vars["--aui-color-info"] },
  iconSuccess: { color: vars["--aui-color-success"] },
  iconWarning: { color: vars["--aui-color-warning"] },
  iconDanger: { color: vars["--aui-color-danger"] },
  copy: {
    display: "grid",
    gap: vars["--aui-space-4"],
    minInlineSize: 0,
  },
  title: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-tight"],
  },
  body: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
    overflowWrap: "anywhere",
  },
  action: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    gridColumn: {
      default: "auto",
      "@media (max-width: 560px)": "2",
    },
    justifySelf: {
      default: "end",
      "@media (max-width: 560px)": "start",
    },
    // On the title's row the action takes the dismiss control's pull, so the
    // two 32px controls share one top and one centre line. Without it the
    // action sat at the 12px padding and the × 4px above it at 8px (centres
    // 28 vs 24px). Below 560px the action wraps under the copy and keeps its
    // place in the flow.
    marginBlock: {
      default: `calc(${vars["--aui-space-4"]} * -1)`,
      "@media (max-width: 560px)": 0,
    },
    minInlineSize: 0,
  },
});

const toneIconStyles = {
  danger: styles.iconDanger,
  info: styles.iconInfo,
  success: styles.iconSuccess,
  warning: styles.iconWarning,
} as const;
