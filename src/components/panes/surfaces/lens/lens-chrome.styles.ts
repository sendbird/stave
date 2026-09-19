import * as stylex from "@stylexjs/stylex";
import { vars } from "../../../ads/tokens/tokens.stylex";

export const chromeStyles = stylex.create({
  toolbar: {
    display: "flex",
    flexShrink: 0,
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
    paddingInline: vars["--ads-space-12"],
    paddingBlock: vars["--ads-space-8"],
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 },
  addressForm: { minWidth: 120, flex: 1 },
  address: {
    height: 36,
    overflow: "hidden",
    backgroundColor: {
      default: `color-mix(in oklch, ${vars["--ads-color-canvas"]} 80%, transparent)`,
      ":focus-within": vars["--ads-color-canvas"],
    },
  },
  addressStart: {
    gap: 6,
    paddingLeft: 10,
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
  },
  addressInput: {
    backgroundColor: "transparent",
    fontSize: vars["--ads-font-size-body"],
  },
  addressEnd: { paddingRight: vars["--ads-space-4"] },
  compactIcon: { width: 14, height: 14 },
  modes: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border-subtle"],
    backgroundColor: vars["--ads-color-canvas"],
    padding: vars["--ads-space-2"],
  },
  tab: { position: "relative" },
  help: { maxWidth: "16rem", textWrap: "pretty" },
  downloadsMenu: { width: "18rem" },
  downloadRow: { minWidth: 0 },
  downloadName: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  downloadSize: {
    marginLeft: vars["--ads-space-8"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  toolActive: {
    borderColor: vars["--ads-color-accent"],
    backgroundColor: {
      default: vars["--ads-color-accent-soft"],
      ":hover": vars["--ads-color-accent-soft"],
    },
    color: vars["--ads-color-accent"],
    boxShadow: vars["--ads-elevation-raised"],
  },
  toolInactive: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
  },
  toolIcon: { width: vars["--ads-space-16"], height: vars["--ads-space-16"] },
});
