import * as stylex from "@stylexjs/stylex";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from "react";
import { transition } from "../ads/recipes/transition";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx, type StyleXValue } from "../ads/utils/stylex";
import { Button } from "./button";

/**
 * One inline chip for everything a prompt carries as context — another task,
 * another workspace's document, a workspace Information item. The chips differ
 * in what they say and which actions they offer; the box, the leading glyph and
 * the remove control are this one shape, so a new kind of context cannot drift
 * a pixel from its siblings.
 */
export function ContextChip({
  icon: Icon,
  compact,
  children,
  className,
  ...rest
}: ComponentPropsWithoutRef<"span"> & {
  icon: LucideIcon;
  /** Tighter padding and caption type for the minimal composer. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <span {...rest} className={cx(sx(styles.root, compact && styles.compact), className)}>
      <Icon aria-hidden className={sx(styles.icon)} />
      {children}
    </span>
  );
}

/**
 * The chip's remove control. It keeps the canonical xs square — so the hit area
 * is a real control's — and the negative block margin seats that square on the
 * chip's one text line without growing the chip.
 */
export function ContextChipRemoveButton({
  label,
  xstyle,
  ...rest
}: Omit<ComponentProps<typeof Button>, "aria-label" | "children" | "size" | "variant"> & {
  /** Accessible name; says what is removed. */
  label: string;
  xstyle?: StyleXValue;
}) {
  // Remaining props are spread first so a wrapping `Tooltip` trigger can add
  // its handlers and ref; the chip still owns the control's size and weight.
  return (
    <Button
      {...rest}
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      xstyle={[styles.remove, transition.colors, xstyle]}
    >
      <X aria-hidden className={sx(styles.removeIcon)} />
    </Button>
  );
}

/** Text slots the chips compose: the truncating label and its muted suffixes. */
export const contextChipStyles = stylex.create({
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** The label as a ghost button that opens the attached source. */
  openButton: {
    height: vars["--ads-line-height-control"],
    paddingInline: vars["--ads-space-2"],
    marginInline: `calc(-1 * ${vars["--ads-space-2"]})`,
    justifyContent: "flex-start",
    color: vars["--ads-color-text"],
    fontSize: "inherit",
    fontWeight: "inherit",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  prefix: { fontWeight: vars["--ads-font-weight-medium"] },
  muted: { color: vars["--ads-color-text-muted"], whiteSpace: "nowrap" },
});

const styles = stylex.create({
  root: {
    display: "inline-flex",
    maxWidth: "100%",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    borderRadius: vars["--ads-radius-mark"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-accent-soft"],
    paddingInline: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text"],
  },
  compact: {
    paddingInline: vars["--ads-space-4"],
    paddingBlock: vars["--ads-space-2"],
    fontSize: vars["--ads-font-size-caption"],
  },
  icon: {
    width: vars["--ads-control-icon-size-sm"],
    height: vars["--ads-control-icon-size-sm"],
    flexShrink: 0,
  },
  remove: {
    marginInlineEnd: `calc(-1 * ${vars["--ads-space-4"]})`,
    marginBlock: `calc((${vars["--ads-line-height-control"]} - ${vars["--ads-control-height-xs"]}) / 2)`,
    color: { default: vars["--ads-color-text-muted"], ":hover": vars["--ads-color-text"] },
  },
  // One step under the xs glyph: the mark reads as "dismiss", not as an action.
  removeIcon: { width: 12, height: 12 },
});
