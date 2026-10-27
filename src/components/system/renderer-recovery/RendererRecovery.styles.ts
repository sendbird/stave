import * as stylex from "@stylexjs/stylex";
import { vars } from "../../ads/tokens/tokens.stylex";

/*
 * Colors come from Stave's role tokens in `globals.css`, which follow the
 * `.dark` class on <html> directly. ADS color variables are not used: they are
 * mapped onto the role tokens by `StaveDesignProvider`, which may be the part
 * that failed. The system-color fallbacks keep the screen legible if even the
 * role tokens are missing.
 */
export const recoveryStyles = stylex.create({
  // Fixed to the viewport with its own scroll so a short window can still
  // reach every control, whatever the body's overflow is.
  root: {
    position: "fixed",
    inset: 0,
    overflowY: "auto",
    backgroundColor: "var(--background, Canvas)",
    color: "var(--foreground, CanvasText)",
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  rootLight: {
    colorScheme: "light",
  },
  rootDark: {
    colorScheme: "dark",
  },
  frame: {
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
    padding: vars["--ads-space-24"],
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    width: "100%",
    maxWidth: "28rem",
  },
  title: {
    margin: 0,
    fontSize: vars["--ads-font-size-heading"],
    lineHeight: vars["--ads-line-height-heading"],
    fontWeight: vars["--ads-font-weight-semibold"],
    textWrap: "balance",
  },
  body: {
    margin: 0,
    color: "var(--muted-foreground, GrayText)",
    textWrap: "pretty",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    marginTop: vars["--ads-space-16"],
  },
  button: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: vars["--ads-control-height-sm"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    fontFamily: "inherit",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-control"],
    fontWeight: vars["--ads-font-weight-medium"],
    cursor: "pointer",
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineOffset: 2,
    outlineColor: "var(--ring, Highlight)",
  },
  primary: {
    borderColor: "transparent",
    backgroundColor: {
      default: "var(--primary, CanvasText)",
      ":hover": "color-mix(in oklab, var(--primary, CanvasText) 88%, var(--background, Canvas))",
    },
    color: "var(--primary-foreground, Canvas)",
  },
  secondary: {
    borderColor: "var(--border, ButtonBorder)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--muted, ButtonFace)",
    },
    color: "inherit",
  },
  status: {
    margin: 0,
    minHeight: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-caption"],
    color: "var(--muted-foreground, GrayText)",
  },
});
