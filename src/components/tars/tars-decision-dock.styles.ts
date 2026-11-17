import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

export const tarsDockStyles = stylex.create({
  // The chat column owns available height. Reserve history space; an inline side view also needs its existing share.
  composer: { display: "flex", flexDirection: "column", minHeight: 0, flexShrink: 1, maxHeight: "70%" },
  composerWithSide: { maxHeight: "50%" },
  tray: { flexShrink: 0 },
  root: { display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flexShrink: 1, gap: vars["--aui-space-8"], marginBottom: vars["--aui-space-12"] },
  header: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0, gap: vars["--aui-space-8"] },
  label: { margin: 0, minWidth: 0, overflowWrap: "anywhere", color: vars["--aui-color-text-muted"],
    fontSize: chatType["--chat-type-secondary"], lineHeight: chatType["--chat-type-secondary-leading"] },
  navigation: { display: "flex", alignItems: "center", flexShrink: 0, gap: vars["--aui-space-4"] },
  // The conversation owns history scrolling. A long active form scrolls here and always leaves the composer reachable.
  body: { minWidth: 0, minHeight: 0, maxHeight: "40dvh", overflowY: "auto", overscrollBehavior: "contain", scrollbarGutter: "stable" },
});
