import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { Tabs } from "@base-ui/react/tabs";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { vars } from "../ads/tokens/tokens.stylex";

/** Vertical category navigation inside an existing Base UI tabs root. */
export function SelectionRail({
  label,
  items,
  value,
  onPreview,
}: {
  label: string;
  items: readonly {
    value: string;
    label: string;
    icon: ReactNode;
    count?: number;
  }[];
  value: string;
  onPreview?: (value: string) => void;
}) {
  return (
    <Tabs.List aria-label={label} {...stylex.props(styles.rail)}>
      {items.map((item) => (
        <Tabs.Tab
          key={item.value}
          value={item.value}
          aria-label={`${item.label}${item.count === undefined ? "" : `, ${item.count} models`}`}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") onPreview?.(item.value);
          }}
          {...stylex.props(styles.tab, focusRing.ringInset, transition.control, value === item.value && styles.selected)}
        >
          {item.icon}
          <span {...stylex.props(styles.label)}>{item.label}</span>
          {item.count !== undefined ? (
            <span {...stylex.props(styles.count)}>{item.count}</span>
          ) : null}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );
}

const styles = stylex.create({
  rail: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    width: { default: 128, "@media (max-width: 479px)": 48 },
    padding: 4,
    gap: 4,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  tab: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    width: "100%",
    flexShrink: 0,
    paddingInline: 8,
    borderRadius: vars["--ads-radius-control"],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    color: vars["--ads-color-text-muted"],
    backgroundColor: { default: "transparent", ":hover": vars["--ads-color-surface-tint"] },
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: 550,
    cursor: "pointer",
  },
  selected: {
    color: vars["--ads-color-text"],
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface-tint"],
  },
  label: {
    display: { default: "block", "@media (max-width: 479px)": "none" },
    minWidth: 0,
    flexGrow: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "start",
  },
  count: {
    display: { default: "block", "@media (max-width: 479px)": "none" },
    color: vars["--ads-color-text-muted"],
    fontVariantNumeric: "tabular-nums",
  },
});
