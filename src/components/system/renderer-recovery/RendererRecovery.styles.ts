import * as stylex from "@stylexjs/stylex";
import { vars } from "../../aui/tokens/tokens.stylex";

/*
 * Surface colors come from Stave's role tokens in `globals.css`, which follow
 * the `.dark` class on <html> directly; the screen's root also publishes the
 * AUI role mapping for the focus ring. A production build links that stylesheet
 * from `index.html`, so it is present even when no script ran. The
 * system-color fallbacks keep the text legible if it is missing anyway.
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
    fontFamily: vars["--aui-font-sans"],
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-normal"],
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
    padding: vars["--aui-space-24"],
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    width: "100%",
    maxWidth: "28rem",
  },
  title: {
    margin: 0,
    fontSize: vars["--aui-font-size-heading"],
    lineHeight: vars["--aui-line-height-heading"],
    fontWeight: vars["--aui-font-weight-semibold"],
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
    gap: vars["--aui-space-8"],
    marginTop: vars["--aui-space-16"],
  },
  // Geometry of the AUI medium control; colors from the role tokens.
  action: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: vars["--aui-control-height-md"],
    paddingInline: vars["--aui-space-12"],
    borderRadius: vars["--aui-radius-control"],
    borderWidth: vars["--aui-border-width-hairline"],
    borderStyle: "solid",
    fontFamily: "inherit",
    fontSize: vars["--aui-font-size-body"],
    lineHeight: vars["--aui-line-height-control"],
    fontWeight: vars["--aui-font-weight-medium"],
    cursor: "pointer",
  },
  primary: {
    borderColor: "transparent",
    backgroundColor: {
      default: "var(--primary, CanvasText)",
      ":hover": "color-mix(in oklab, var(--primary, CanvasText) 88%, var(--background, Canvas))",
    },
    color: "var(--primary-foreground, Canvas)",
  },
  outline: {
    borderColor: "var(--border, ButtonBorder)",
    backgroundColor: {
      default: "transparent",
      ":hover": "var(--muted, ButtonFace)",
    },
    color: "inherit",
  },
  status: {
    margin: 0,
    minHeight: vars["--aui-space-20"],
    fontSize: vars["--aui-font-size-caption"],
    color: "var(--muted-foreground, GrayText)",
  },
});
