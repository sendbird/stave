import * as stylex from "@stylexjs/stylex";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  type LucideIcon,
  PencilLine,
  XCircle,
} from "lucide-react";
import type * as React from "react";

import {
  statusChip,
  statusChipIconSizes,
  statusChipOutlineToneStyles,
  statusChipSizeStyles,
  statusChipSoftToneStyles,
  type StatusChipSize,
  type StatusChipVariant,
} from "../recipes/status-chip";
import { vars } from "../tokens/tokens.stylex";
import { themeProps, themeSlotProps } from "../theming/theme-props";
import {
  type PendingActionResult,
  usePendingAction,
} from "../utils/busy-action";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Button, type ButtonVariant } from "./Button";

export type ReviewStatusState =
  | "draft"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "rejected";

type ReviewToneKey = "neutral" | "accent" | "warning" | "success" | "danger";

// Host modification: the state's words come from the host (`children`), so
// the pill carries no English copy of its own.
const stateConfig: Record<
  ReviewStatusState,
  { Icon: LucideIcon; tone: ReviewToneKey }
> = {
  draft: { Icon: PencilLine, tone: "neutral" },
  "in-review": { Icon: Eye, tone: "accent" },
  "changes-requested": { Icon: AlertTriangle, tone: "warning" },
  approved: { Icon: CheckCircle2, tone: "success" },
  rejected: { Icon: XCircle, tone: "danger" },
};

export type ReviewStatusProps = React.ComponentProps<"span"> & {
  /** The state's label, in the host's words. */
  children: React.ReactNode;
  /** Status-chip scale. @default "md" */
  size?: StatusChipSize;
  state: ReviewStatusState;
  /** Visual weight. @default "soft" */
  variant?: StatusChipVariant;
} & XstyleProp;

/**
 * Review state pill (visual-review workflow): maps the review state
 * machine to a semantic tone + icon. Use in `ApprovalBar`, review lists, or
 * next to an artifact title.
 */
export function ReviewStatus({
  children,
  className,
  size = "md",
  state,
  variant = "soft",
  xstyle,
  ...props
}: ReviewStatusProps) {
  const { Icon, tone } = stateConfig[state];
  const theme = themeProps("review-status", { size, variant });
  return (
    <span
      {...props}
      {...theme}
      className={cx(
        sx(
          statusChip.root,
          statusChipSizeStyles[size],
          variant === "outline" && statusChip.outline,
          toneStyles[variant][tone],
          xstyle,
        ),
        theme.className,
        className,
      )}
      data-state={state}
    >
      <Icon aria-hidden size={statusChipIconSizes[size]} />
      {children}
    </span>
  );
}

/** The three review decisions `ApprovalBar` can start. */
export type ApprovalBarAction = "approve" | "reject" | "request-changes";

/**
 * A review decision handler. Return a promise and the bar stays busy until it
 * settles — the pressed action shows its spinner, the others are blocked, and a
 * second press is ignored — without the host having to track `busy` itself.
 */
export type ApprovalBarHandler = (
  event: React.MouseEvent<HTMLButtonElement>,
) => PendingActionResult;

export type ApprovalBarProps = Omit<React.ComponentProps<"div">, "children"> & {
  approveLabel: React.ReactNode;
  /**
   * A decision is being recorded. Blocks every action (the one just pressed
   * keeps focus and shows its spinner) so an async approval cannot be sent
   * twice. A handler that returns a promise does the same on its own; this is
   * for a host that tracks the request elsewhere.
   * @default false
   */
  busy?: boolean;
  onApprove?: ApprovalBarHandler;
  onReject?: ApprovalBarHandler;
  onRequestChanges?: ApprovalBarHandler;
  rejectLabel?: React.ReactNode;
  requestChangesLabel?: React.ReactNode;
  /** Reviewer avatars, e.g. an <AvatarGroup>. */
  reviewers?: React.ReactNode;
  state: ReviewStatusState;
  /** The state pill's label, in the host's words. */
  stateLabel: React.ReactNode;
  /** Short progress text, e.g. "2 of 3 approved". */
  summary?: React.ReactNode;
} & XstyleProp;

/**
 * Sticky-ready review decision bar: state pill + reviewers + a summary on the
 * left, approve / request-changes / reject actions on the right. Actions render
 * only when their handler is provided.
 *
 * Async decisions share `Approval`'s busy contract (`utils/busy-action`): while
 * one is in flight the pressed button is `loading` and its siblings are
 * disabled, and a second press — including one dispatched in the same task,
 * before React commits the disabled state — is ignored. The pressed button
 * keeps focus because `Button` stays focusable while loading, so unlike
 * `Approval`, whose buttons unmount on resolution, no focus reclaim is needed.
 */
export function ApprovalBar({
  approveLabel,
  busy: busyProp = false,
  className,
  onApprove,
  onReject,
  onRequestChanges,
  rejectLabel,
  requestChangesLabel,
  reviewers,
  state,
  stateLabel,
  summary,
  xstyle,
  ...props
}: ApprovalBarProps) {
  const theme = themeProps("approval-bar");
  const { action, busy, run } = usePendingAction<ApprovalBarAction>(busyProp);
  const decision = (
    name: ApprovalBarAction,
    handler: ApprovalBarHandler | undefined,
    label: React.ReactNode,
    variant: ButtonVariant,
  ) =>
    handler ? (
      <Button
        data-approval-action={name}
        disabled={busy && action !== name}
        loading={busy && action === name}
        onClick={(event) => {
          run(name, () => handler(event));
        }}
        size="sm"
        type="button"
        variant={variant}
      >
        {label}
      </Button>
    ) : null;

  return (
    <div
      {...props}
      {...theme}
      aria-busy={busy || undefined}
      className={cx(sx(styles.bar, xstyle), theme.className, className)}
    >
      <div className={sx(styles.barMain)}>
        <ReviewStatus state={state}>{stateLabel}</ReviewStatus>
        {reviewers ? (
          <div className={sx(styles.reviewers)}>{reviewers}</div>
        ) : null}
        {summary ? (
          <span
            className={sx(styles.summary)}
            {...themeSlotProps("approval-bar", "summary")}
          >
            {summary}
          </span>
        ) : null}
      </div>
      <div className={sx(styles.actions)}>
        {decision("reject", onReject, rejectLabel, "quiet")}
        {decision(
          "request-changes",
          onRequestChanges,
          requestChangesLabel,
          "outline",
        )}
        {decision("approve", onApprove, approveLabel, "primary")}
      </div>
    </div>
  );
}

const styles = stylex.create({
  bar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-raised"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-12"],
    inlineSize: "100%",
    justifyContent: "space-between",
    minInlineSize: 0,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  barMain: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  reviewers: {
    alignItems: "center",
    display: "inline-flex",
  },
  summary: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-tight"],
  },
  actions: {
    alignItems: "center",
    display: "inline-flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
});

const toneStyles = {
  outline: statusChipOutlineToneStyles,
  soft: statusChipSoftToneStyles,
} as const;
