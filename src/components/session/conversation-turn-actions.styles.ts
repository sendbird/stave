import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

export const conversationTurnActionsStyles = stylex.create({
  groupPreview: {
    display: "grid",
    gap: 6,
    gridTemplateColumns: "1fr 1fr",
    width: "100%",
  },
  fileChoices: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  fullRow: {
    gridColumn: "1 / -1",
    minWidth: 0,
  },
  // A turn without a file action leaves no empty cell or extra gap behind.
  fileSlot: {
    display: {
      default: "block",
      ":empty": "none",
    },
    minWidth: 0,
  },
  // Explains a missing file snapshot in the same caption scale as the actions.
  // The rail preview card lets it wrap by words across the full card width.
  noSnapshot: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // In an inline action row the caption takes only the space the actions
  // leave and truncates. `width: 0` keeps its text out of the row's intrinsic
  // width, so a long reason never pushes the actions onto a new line;
  // `flexGrow` then hands it the remaining space.
  noSnapshotInline: {
    flexGrow: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    width: 0,
  },
  // Fills the rest of the message action row and packs the actions at its
  // end, so a no-snapshot caption can take the free space between them. The
  // actions wrap only when they cannot fit side by side at all.
  groupInline: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    flexWrap: "wrap",
    gap: vars["--aui-space-2"],
    justifyContent: "flex-end",
  },
  // Preview actions are full bordered cards on a translucent surface; the
  // inline variant is a compact text action with no border.
  actionPreview: {
    backgroundColor: `color-mix(in oklch, ${vars["--aui-color-canvas"]} 55%, transparent)`,
    borderColor: `color-mix(in oklch, ${vars["--aui-color-border"]} 70%, transparent)`,
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    fontSize: vars["--aui-font-size-caption"],
    gap: 6,
    height: 32,
    justifyContent: "flex-start",
    paddingInline: vars["--aui-space-8"],
  },
  // `flexShrink: 0` keeps labels whole: the Button root clips its overflow,
  // so a shrinking row would otherwise cut "Fork here" or "Rollback here".
  actionInline: {
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    height: 28,
    paddingInline: 6,
  },
  // Rollback carries the danger tone only in the roomy preview variant, where
  // its hover fill has room to read as a warning rather than as noise.
  rollbackPreview: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars["--aui-color-danger-soft"],
    },
    color: {
      default: vars["--aui-color-danger-text"],
      ":hover": vars["--aui-color-danger-text"],
    },
  },
  // A disabled action stays legible but inert: no hover recolor, no pointer.
  actionDisabled: {
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
    },
    color: {
      default: vars["--aui-color-text-muted"],
      ":hover": vars["--aui-color-text-muted"],
    },
    cursor: "not-allowed",
    opacity: {
      default: 0.7,
      ":hover": 1,
      ":focus-visible": 1,
    },
  },
  dialogContent: {
    maxWidth: "24rem",
  },
  iconSm: {
    height: 14,
    width: 14,
  },
  iconMd: {
    height: 16,
    width: 16,
  },
});
