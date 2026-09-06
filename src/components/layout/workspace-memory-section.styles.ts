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
  row: {
    backgroundColor: vars.colorSurface,
    borderColor: vars.colorBorder,
    borderRadius: vars.radiusPanel,
    borderStyle: "solid",
    borderWidth: vars.borderWidthHairline,
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    minWidth: 0,
    padding: vars.space12,
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
  meta: {
    alignItems: "center",
    color: vars.colorTextMuted,
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars.fontSizeCaption,
    gap: vars.space8,
    justifyContent: "space-between",
  },
  content: {
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightRelaxed,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
});
