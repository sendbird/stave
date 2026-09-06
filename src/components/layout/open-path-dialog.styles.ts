import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

export const openPathDialogStyles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: vars.space16,
    backgroundColor: vars.colorOverlay,
  },
  panel: {
    width: "100%",
    maxWidth: "28rem",
    padding: vars.space16,
  },
  title: {
    margin: 0,
    fontSize: vars.fontSizeLead,
    fontWeight: vars.fontWeightSemibold,
    color: vars.colorText,
  },
  description: {
    marginBlock: 0,
    marginBlockStart: vars.space4,
    fontSize: vars.fontSizeBody,
    color: vars.colorTextMuted,
  },
  pathRow: {
    display: "flex",
    alignItems: "center",
    gap: vars.space8,
    marginBlockStart: vars.space12,
  },
  pathInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "0%",
  },
  browseButton: {
    flexShrink: 0,
    gap: 6,
  },
  browseIcon: {
    width: 16,
    height: 16,
  },
  error: {
    marginBlock: 0,
    marginBlockStart: vars.space8,
    fontSize: vars.fontSizeBody,
    color: vars.colorDangerText,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: vars.space8,
    marginBlockStart: vars.space16,
  },
});
