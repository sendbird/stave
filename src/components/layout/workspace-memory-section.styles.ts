import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Project-memory list and per-memory editor inside the Information panel. */
export const workspaceMemorySectionStyles = stylex.create({
  empty: { color: vars.colorTextMuted, fontSize: vars.fontSizeBody },
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  controls: {
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusControl,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    padding: vars.space12,
  },
  controlsSummary: {
    cursor: "pointer",
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
  },
  controlsBody: { paddingBlockStart: vars.space16 },
  hint: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  error: { color: vars.colorDangerText, fontSize: vars.fontSizeBody },
  retry: { textDecorationLine: "underline" },
  /* Row shape, hover wash and action trail come from
     `information-row.styles.ts`, shared with the linked-pull-request and
     saved-plan lists. Only the recall mark's ink and the row's own action
     buttons are memory-specific. */
  markCore: { color: vars.colorAccent },
  markContextual: { color: vars.colorTextMuted },
  markCandidate: { color: vars.colorTextSubtle },
  rowAction: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorOverlayHover,
    },
    blockSize: vars.iconButtonSize,
    borderRadius: vars.radiusControl,
    color: {
      default: vars.colorTextSubtle,
      ":hover": vars.colorText,
    },
    display: "flex",
    flexShrink: 0,
    inlineSize: vars.iconButtonSize,
    justifyContent: "center",
  },
  rowActionDanger: {
    backgroundColor: {
      default: "transparent",
      ":hover": vars.colorDangerSoft,
    },
    color: {
      default: vars.colorTextSubtle,
      ":focus-visible": vars.colorDangerText,
      ":hover": vars.colorDangerText,
    },
  },
  rowActionIcon: {
    blockSize: vars.controlIconSizeMd,
    inlineSize: vars.controlIconSizeMd,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
  },
  fieldLabel: {
    display: "block",
    fontSize: vars.fontSizeCaption,
    fontWeight: vars.fontWeightMedium,
  },
  fieldTextarea: {
    fontSize: vars.fontSizeBody,
    marginBlockStart: vars.space4,
    minHeight: 112,
    resize: "vertical",
  },
  counter: { color: vars.colorTextMuted, fontSize: vars.fontSizeCaption },
  controlRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space8,
  },
  kindTrigger: { width: "8rem" },
  modeTrigger: { maxWidth: "100%", width: "13rem" },
  actionRow: { display: "flex", gap: vars.space8 },
  /* The memory sentence IS the row's title, so it takes the row-title step and
     clamps to two lines rather than ellipsizing at the first: a memory that
     reads "Use Bun for install, test and build" is useless truncated to "Use
     Bun for install,". The full text stays one click away in the editor. */
  content: {
    color: vars.colorText,
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightMedium,
    lineHeight: vars.lineHeightNormal,
    overflow: "hidden",
    overflowWrap: "anywhere",
  },
});
