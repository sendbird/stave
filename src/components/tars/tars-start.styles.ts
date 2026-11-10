import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The start screen's text follows the chat font size the conversation column
 * publishes (`--tars-text-size`): the greeting reads one step over a message,
 * and everything else one step under it (14px beside 16px messages), never
 * under the caption tier.
 */
const TEXT = `var(--tars-text-size, ${vars["--aui-font-size-lead"]})`;
const GREETING = `calc(${TEXT} * 1.25)`;
const SECONDARY = `max(${vars["--aui-font-size-caption"]}, calc(${TEXT} * 0.875))`;
/**
 * The start screen is its own container. Wide, it reads as a table: a name on
 * the start side, what belongs to it beside it. Narrow, a name sits over its
 * content, and the examples flow as one wrapping row without their group names.
 */
const WIDE = "@container (min-width: 36rem)";
const COLUMNS = "minmax(0, 11rem) minmax(0, 1fr)";

export const tarsStartStyles = stylex.create({
  root: {
    display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], minWidth: 0, containerType: "inline-size",
    paddingBlock: vars["--aui-space-8"], fontSize: SECONDARY, lineHeight: "1.5", color: vars["--aui-color-text"], textAlign: "start",
  },
  intro: { display: "flex", flexDirection: "column", gap: vars["--aui-space-4"], minWidth: 0 },
  greeting: { margin: 0, fontSize: GREETING, fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"], overflowWrap: "anywhere" },
  description: { margin: 0, color: vars["--aui-color-text-muted"] },
  /** A name and what belongs to it. */
  line: {
    display: "grid", gridTemplateColumns: { default: "minmax(0, 1fr)", [WIDE]: COLUMNS }, columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"],
    alignItems: "start", minWidth: 0,
  },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  heading: { margin: 0, fontSize: SECONDARY, fontWeight: vars["--aui-font-weight-medium"], lineHeight: "1.5" },
  /** Beside a row of controls, a name's line is as tall as a control, so it centres on the first row. */
  besideControls: { lineHeight: { default: "1.5", [WIDE]: vars["--aui-control-height-xs"] } },
  /** Controls in a wrapping row; each keeps to the column and cuts its own label. */
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0, margin: 0, padding: 0, listStyle: "none" },
  item: { maxWidth: "100%", minWidth: 0 },
  button: { maxWidth: "100%", minWidth: 0, fontSize: SECONDARY },
  buttonLabel: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  /** Wide, one group per line; narrow, every group's examples in one wrapping row. */
  groups: {
    display: "flex", flexDirection: { default: "row", [WIDE]: "column" }, flexWrap: { default: "wrap", [WIDE]: "nowrap" },
    gap: { default: vars["--aui-space-8"], [WIDE]: vars["--aui-space-4"] }, minWidth: 0,
  },
  group: {
    display: { default: "contents", [WIDE]: "grid" }, gridTemplateColumns: COLUMNS, columnGap: vars["--aui-space-12"], alignItems: "start", minWidth: 0,
  },
  /** Narrow, a group's name stays for assistive technology only. */
  groupName: {
    margin: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere", lineHeight: vars["--aui-control-height-xs"],
    position: { default: "absolute", [WIDE]: "static" }, width: { default: "1px", [WIDE]: "auto" }, height: { default: "1px", [WIDE]: "auto" },
    overflow: { default: "hidden", [WIDE]: "visible" }, clipPath: { default: "inset(50%)", [WIDE]: "none" }, whiteSpace: { default: "nowrap", [WIDE]: "normal" },
  },
  groupExamples: { display: { default: "contents", [WIDE]: "flex" } },
  /** Repository names read as a list of words, not as controls. */
  repositories: {
    display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"], minWidth: 0, margin: 0, padding: 0,
    listStyle: "none",
  },
  repository: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], minWidth: 0, maxWidth: "100%" },
  repositoryIcon: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"], flexShrink: 0, color: vars["--aui-color-text-muted"] },
  repositoryName: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  more: { color: vars["--aui-color-text-muted"] },
  note: { margin: 0, color: vars["--aui-color-text-muted"], overflowWrap: "anywhere" },
});
