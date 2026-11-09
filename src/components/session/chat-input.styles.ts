import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";
import { transcriptMeasure } from "@/components/ai-elements/transcript-measure.stylex";

export const chatInputStyles = stylex.create({
  root: {
    backgroundColor: vars["--aui-color-canvas"],
    paddingBlock: "0.625rem",
    paddingInline: {
      default: vars["--aui-space-12"],
      "@media (min-width: 640px)": vars["--aui-space-16"],
    },
  },
  rootEmpty: {
    paddingBottom: vars["--aui-space-24"],
  },
  // The transcript's column: the composer's card shares its width and centre
  // with the replies and user bubbles above it.
  measure: {
    marginInline: "auto",
    maxWidth: transcriptMeasure["--stave-transcript-column"],
  },
  // The framed composer adds its two wing tracks (3.125rem each,
  // `composer-frame.styles.ts`) beside the card, so the card still spans the
  // column and the wings sit in the gutters outside it.
  measureFramed: {
    maxWidth: `calc(${transcriptMeasure["--stave-transcript-column"]} + 2 * 3.125rem)`,
  },
  // Approval, notices and request rows above a framed card: inset by the
  // wing tracks so they line up with the card, not with the wings.
  attachedRowsFramed: {
    // 3.125rem: the wing track width in `composer-frame.styles.ts`.
    paddingInline: `calc(${vars["--aui-space-48"]} + ${vars["--aui-space-2"]})`,
  },
  menuLabelRow: {
    alignItems: "center",
    display: "flex",
    gap: vars["--aui-space-8"],
  },
  menuLabelRecent: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-8"],
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  menuItemStart: {
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  menuItemGap: {
    gap: vars["--aui-space-8"],
  },
  itemText: {
    flexGrow: 1,
    minWidth: 0,
  },
  itemTitle: {
    display: "block",
    fontSize: vars["--aui-font-size-body"],
  },
  itemTitleTruncate: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: "100%",
  },
  itemDescription: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
  },
  itemDescriptionCapitalize: {
    color: vars["--aui-color-text-muted"],
    display: "block",
    fontSize: vars["--aui-font-size-caption"],
    textTransform: "capitalize",
  },
  runDot: {
    backgroundColor: vars["--aui-color-accent"],
    borderRadius: vars["--aui-radius-full"],
    flexShrink: 0,
    height: 6,
    marginTop: vars["--aui-space-4"],
    width: 6,
  },
  // Geometry lives on the composer lane's group recipe
  // (`COMPOSER_CONTROL_GROUP`): it is the lane that knows whether this row is
  // full-width, and it is the marker that tells the two halves to stop each
  // claiming the whole row. Nothing product-specific is left here.
  compareControlMenuTrigger: {
    paddingInline: vars["--aui-space-4"],
  },
  tooltipContent: {
    maxWidth: 288,
  },
  menuContentWide: {
    width: 320,
  },
});
