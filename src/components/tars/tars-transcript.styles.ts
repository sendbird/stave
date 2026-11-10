import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { localStack } from "@/lib/ui-layers.stylex";

/** Times sit at 12px beside 16px messages, never under the micro tier (as `tars-message.styles`). */
const CAPTION = `max(${vars["--aui-font-size-micro"]}, calc(var(--tars-text-size, ${vars["--aui-font-size-lead"]}) * 0.75))`;
/** Whether the exchange is hovered or holds focus (`tarsMessageStyles.exchange`); 1 when no exchange publishes it. */
const REVEAL = "var(--tars-message-reveal, 1)";

/**
 * The transcript's day breaks and time options. The transcript's own gap is
 * 12px and an exchange pads 8px, so a label that belongs to the run after it
 * pulls toward that run and away from the one before.
 */
export const tarsTranscriptStyles = stylex.create({
  /** One local day's entries, so a sticky day pill releases where its day ends. */
  day: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0 },
  /** The centred day label in a hairline rule, with room above it so it reads as a break, not a line of the run above. */
  rule: { marginBlockStart: vars["--aui-space-8"] },
  ruleLabel: {
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"], whiteSpace: "nowrap",
  },
  /** The day pill: it stays at the top of the transcript while its day scrolls under it. */
  pill: {
    position: "sticky", insetBlockStart: vars["--aui-space-8"], zIndex: localStack["--stave-stack-raised"], alignSelf: "center",
    marginBlockStart: vars["--aui-space-8"], paddingBlock: vars["--aui-space-2"], paddingInline: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-full"], borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-raised"], boxShadow: vars["--aui-elevation-raised"],
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-caption"], fontWeight: vars["--aui-font-weight-medium"],
    lineHeight: vars["--aui-line-height-caption"], whiteSpace: "nowrap",
  },
  /** `grouped`: the run's time, centred above its first exchange and closer to it than to the run before. */
  groupTime: {
    alignSelf: "center", marginBlockStart: vars["--aui-space-8"], marginBlockEnd: `calc(-1 * ${vars["--aui-space-8"]})`,
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, lineHeight: vars["--aui-line-height-caption"],
  },
  /** `run`: the run's time under its last exchange, on the prose's leading edge, closer to it than to the run after. */
  runTime: {
    alignSelf: "flex-start", marginBlockStart: `calc(-1 * ${vars["--aui-space-12"]})`, marginBlockEnd: vars["--aui-space-8"],
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, lineHeight: vars["--aui-line-height-caption"],
  },
  /** `edge`: the time beside the user's bubble, on its last line, shown while the exchange is hovered or focused. */
  bubbleRow: { display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: vars["--aui-space-8"], minWidth: 0, inlineSize: "100%" },
  edgeTime: {
    flexShrink: 0, paddingBlockEnd: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"], fontSize: CAPTION, lineHeight: vars["--aui-line-height-caption"], whiteSpace: "nowrap",
    opacity: REVEAL,
    transitionProperty: { default: "opacity", "@media (prefers-reduced-motion: reduce)": "none" },
    transitionDuration: vars["--aui-motion-duration-quick"], transitionTimingFunction: vars["--aui-motion-ease-standard"],
  },
});
