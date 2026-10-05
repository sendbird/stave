import { useTranslation } from "@/i18n";
import { focusRing } from "../ads/recipes/focus-ring";
import { transition } from "../ads/recipes/transition";
import { Tabs } from "@base-ui/react/tabs";
import * as stylex from "@stylexjs/stylex";
import { Fragment, type ReactNode } from "react";
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
    /** What `count` counts, for the tab's name; defaults to "models". */
    noun?: "agents";
    /** Names the group of tabs that starts here. Hidden when the rail is narrow. */
    heading?: string;
    /** Sets this tab off from the ones above with a rule, for a group of one. */
    divider?: boolean;
  }[];
  value: string;
  onPreview?: (value: string) => void;
}) {
  const { t } = useTranslation(["ui"]);
  return (
    <Tabs.List aria-label={label} {...stylex.props(styles.rail)}>
      {items.map((item) => (
        <Fragment key={item.value}>
          {item.heading ? (
            <span aria-hidden="true" {...stylex.props(styles.heading)}>
              {item.heading}
            </span>
          ) : null}
          {item.divider ? <span aria-hidden="true" {...stylex.props(styles.divider)} /> : null}
          <Tabs.Tab
            value={item.value}
            aria-label={item.count === undefined ? item.label : item.noun ? t("ui:selectionRail.agents", { label: item.label, count: item.count }) : t("ui:selectionRail.models", { label: item.label, count: item.count })}
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
        </Fragment>
      ))}
    </Tabs.List>
  );
}

const styles = stylex.create({
  rail: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    alignSelf: "stretch",
    width: { default: 128, "@media (max-width: 479px)": 48 },
    padding: 4,
    gap: 4,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-canvas"],
  },
  heading: {
    display: { default: "block", "@media (max-width: 479px)": "none" },
    flexShrink: 0,
    paddingInline: 8,
    paddingBlockStart: 4,
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: 550,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: vars["--ads-color-text-muted"],
  },
  divider: {
    flexShrink: 0,
    height: vars["--ads-border-width-hairline"],
    marginInline: 8,
    marginBlock: 2,
    backgroundColor: vars["--ads-color-border"],
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
