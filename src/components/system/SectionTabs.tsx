import { Tabs } from "../ads/components/Tabs";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { sx } from "../ads/utils/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export function SectionTabs({
  items,
  label,
  value,
  onValueChange,
  fillHeight = false,
  size,
  wrap = false,
}: {
  items: readonly {
    id: string;
    label: string;
    content: ReactNode;
    keepMounted?: boolean;
  }[];
  label: string;
  value: string;
  onValueChange: (id: string) => void;
  fillHeight?: boolean;
  /**
   * ADS control rung for the strip. Left unset it takes the ADS default
   * (`sm`); a rail panel around 300px wide should pass `xs`, which is the rung
   * that steps the label to Caption so counted labels stay on one line.
   */
  size?: "xs" | "sm" | "md";
  wrap?: boolean;
}) {
  return (
    // The ADS root is a grid (strip, then panels). `fillHeight` keeps that
    // grid and just pins the panel row to the leftover space, instead of
    // switching the root to flex through an inline `style` — an override that
    // also silently dropped the root's `gap`.
    <Tabs.Root
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      size={size}
      className={sx(fillHeight && styles.fillRoot)}
    >
      <Tabs.List aria-label={label} xstyle={[styles.list, wrap && styles.wrapList]}>
        {items.map((item) => (
          <Tabs.Tab
            key={item.id}
            value={item.id}
          >
            {item.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator />
      </Tabs.List>
      {items.map((item) => (
        <Tabs.Panel
          mount={item.keepMounted ? "eager" : undefined}
          key={item.id}
          value={item.id}
          xstyle={[styles.panel, fillHeight && styles.fillPanel]}
        >
          {item.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
const styles = stylex.create({
  fillRoot: {
    flexGrow: 1,
    gridTemplateRows: "auto minmax(0, 1fr)",
    minBlockSize: 0,
    overflow: "hidden",
  },
  list: { flexShrink: 0, overflowX: "auto" },
  /*
   * A wrapped strip keeps every tab at its natural width. `flexGrow: 1` on the
   * tabs used to stretch each row to fill the track, so a four-tab strip in a
   * 300px rail rendered three tabs on row one and the fourth as a full-width
   * bar centred on row two — it read as a section header, not as the last tab
   * in a set.
   */
  wrapList: { flexWrap: "wrap", overflowX: "visible", flexShrink: 0 },
  panel: { paddingBlockStart: vars.space16, minInlineSize: 0, outline: "none" },
  fillPanel: { minBlockSize: 0, overflowY: "auto", paddingBlockStart: 0 },
});
