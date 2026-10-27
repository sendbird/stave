import * as stylex from "@stylexjs/stylex";
import { vars } from "../../ads/tokens/tokens.stylex";

/*
 * Surface colors come from Stave's role tokens in `globals.css`, which follow
 * the `.dark` class on <html> directly; the screen's root also publishes the
 * ADS role mapping for the focus ring. A production build links that stylesheet
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
  // Geometry of the ADS medium control; colors from the role tokens.
  action: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: vars["--ads-control-height-md"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-control"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    fontFamily: "inherit",
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-control"],
    fontWeight: vars["--ads-font-weight-medium"],
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
    minHeight: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-caption"],
    color: "var(--muted-foreground, GrayText)",
  },
});
