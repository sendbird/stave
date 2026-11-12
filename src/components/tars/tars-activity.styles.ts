import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/** The sheet owns scrolling; rows wrap at narrow widths without adding surfaces. */
export const tarsActivityStyles = stylex.create({
  list: { listStyle: "none", margin: 0, padding: 0, minWidth: 0 },
  row: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], paddingBlock: vars["--aui-space-12"], minWidth: 0 },
  description: { margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: chatType["--chat-type-secondary"], lineHeight: chatType["--chat-type-secondary-leading"], color: vars["--aui-color-text"] },
});
