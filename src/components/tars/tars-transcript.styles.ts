import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/** The chat font size the conversation column publishes (`TARS_TEXT_SIZE` in `tars-message.styles`); 16px outside it. */
const TEXT = `var(--tars-text-size, ${vars["--aui-font-size-lead"]})`;
/** Times and day names sit at 12px beside 16px messages and grow with them, never under the micro tier (as `tars-message.styles`). */
const CAPTION = `max(${vars["--aui-font-size-micro"]}, calc(${TEXT} * 0.75))`;
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
    lineHeight: vars["--aui-line-height-caption"], whiteSpace: "nowrap",
  },
  /** The user's bubble with its time on the leading side, both on the bubble's last line. */
  bubbleRow: { display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: vars["--aui-space-8"], minWidth: 0, inlineSize: "100%" },
  /** The time beside the bubble, shown while the exchange is hovered or focused (always on a touch screen). */
  edgeTime: {
    flexShrink: 0, paddingBlockEnd: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, lineHeight: vars["--aui-line-height-caption"], whiteSpace: "nowrap",
    opacity: REVEAL,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"], transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
