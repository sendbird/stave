import { Tabs } from "../ads/components/Tabs";
import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export function SectionTabs({
  items,
  label,
  value,
  onValueChange,
  fillHeight = false,
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
  wrap?: boolean;
}) {
  return (
    <Tabs.Root value={value} onValueChange={(v) => onValueChange(String(v))} style={fillHeight ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" } : undefined}>
      <Tabs.List aria-label={label} {...stylex.props(styles.list, wrap && styles.wrapList)}>
        {items.map((item) => (
          <Tabs.Tab
            key={item.id}
            value={item.id}
            {...stylex.props(wrap && styles.wrapTab)}
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
          style={fillHeight ? { flex: 1, minHeight: 0, overflowY: "auto", paddingTop: 0 } : undefined}
          {...stylex.props(styles.panel)}
        >
          {item.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
const styles = stylex.create({
  list: { flexShrink: 0, overflowX: "auto" },
  wrapList: { flexWrap: "wrap", overflowX: "visible", flexShrink: 0 },
  wrapTab: { flexGrow: 1 },
  panel: { paddingTop: vars.space16, minWidth: 0, outline: "none" },
});
