import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { chatType } from "@/components/ai-elements/chat-type.stylex";

/** Times and day names take the conversation scale's meta step (`chat-type.stylex.ts`): 12px beside 16px messages. */
const CAPTION = chatType["--chat-type-meta"];
const CAPTION_LEADING = chatType["--chat-type-meta-leading"];
/** Whether the exchange is hovered or holds focus (`tarsMessageStyles.exchange`); 1 when no exchange publishes it. */
const REVEAL = "var(--tars-message-reveal, 1)";

/**
 * The transcript's day rules and message times. The transcript's own gap is
 * 12px and an exchange pads 8px, so a day rule pulls toward the day after it
 * and away from the one before.
 */
export const tarsTranscriptStyles = stylex.create({
  /** The centred day label in a hairline rule, with room above it so it reads as a break, not a line of the run above. */
  rule: { marginBlockStart: vars["--aui-space-8"] },
  ruleLabel: {
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: CAPTION_LEADING, whiteSpace: "nowrap",
  },
  /** The user's bubble with its time on the leading side, both on the bubble's last line. */
  bubbleRow: { display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: vars["--aui-space-8"], minWidth: 0, inlineSize: "100%" },
  /** The time beside the bubble, shown while the exchange is hovered or focused (always on a touch screen). */
  edgeTime: {
    flexShrink: 0, paddingBlockEnd: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, lineHeight: CAPTION_LEADING, whiteSpace: "nowrap",
    opacity: REVEAL,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"], transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
  /**
   * The time's button keeps the line above (the AUI trigger's own is `normal`)
   * and gets a 24px hit area without a larger box: the area grows upward
   * beside the bubble, so it never covers the message or moves a line.
   */
  edgeTimeTrigger: {
    position: "relative",
    lineHeight: "inherit",
    "::before": {
      content: '""',
      position: "absolute",
      insetBlockStart: `min(0px, calc(100% - ${vars["--aui-control-height-2xs"]}))`,
      insetBlockEnd: 0,
      insetInline: `min(0px, calc((100% - ${vars["--aui-control-height-2xs"]}) / 2))`,
    },
  },
});
