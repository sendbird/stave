import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { vars } from "../ads/tokens/tokens.stylex";

export function NavigationItem(props: {
  label: string;
  description: string;
  icon: ReactNode;
  selected?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      {...stylex.props(
        styles.item,
        focusRing.ring, transition.control,
        props.selected && styles.selected,
        props.collapsed && styles.collapsed,
      )}
      aria-label={props.label}
      aria-current={props.selected ? "page" : undefined}
      title={`${props.label} — ${props.description}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span aria-hidden="true" {...stylex.props(styles.icon)}>
        {props.icon}
      </span>
      {!props.collapsed ? (
        <span {...stylex.props(styles.label)}>{props.label}</span>
      ) : null}
    </Button>
  );
}

const styles = stylex.create({
  item: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    width: "100%",
    minWidth: 0,
    minHeight: vars.controlHeightMd,
    paddingInline: 8,
    paddingBlock: 4,
    borderWidth: 0,
    borderInlineStartWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: vars.radiusControl,
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--sidebar-accent)",
    },
    color: "var(--sidebar-foreground)",
    fontSize: vars.fontSizeBody,
    fontWeight: 500,
    textAlign: "start",
    cursor: "pointer",
    opacity: { default: 1, ":disabled": 0.45 },
  },
  selected: {
    backgroundColor: "var(--sidebar-accent)",
    color: "var(--sidebar-accent-foreground)",
    borderInlineStartColor: vars.colorAccent,
    fontWeight: 650,
  },
  collapsed: {
    width: 40,
    minHeight: 40,
    paddingInline: 0,
    justifyContent: "center",
  },
  icon: { display: "inline-flex", flexShrink: 0, width: 16, height: 16 },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
