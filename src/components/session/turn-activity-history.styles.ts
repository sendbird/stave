import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const turnActivityHistoryStyles = stylex.create({
  bar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    minWidth: 0,
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  label: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  picker: {
    flex: 1,
    minWidth: 0,
  },
  notice: {
    color: vars["--aui-color-text-muted"],
    flex: 1,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
    minWidth: 0,
  },
  /* List | Timeline on the left, the timeline's legend on the right; the
     legend wraps under the switch in a narrow rail. */
  viewBar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: vars["--aui-space-12"],
    rowGap: vars["--aui-space-4"],
    minWidth: 0,
    paddingBlockEnd: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  body: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
});
