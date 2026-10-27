import * as stylex from "@stylexjs/stylex";
import { vars } from "../../ads/tokens/tokens.stylex";

/*
 * Surface colors come from Stave's role tokens in `globals.css`, which follow
 * the `.dark` class on <html> directly; the screen's root also publishes the
 * ADS role mapping for its buttons. A production build links that stylesheet
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
  status: {
    margin: 0,
    minHeight: vars["--ads-space-20"],
    fontSize: vars["--ads-font-size-caption"],
    color: "var(--muted-foreground, GrayText)",
  },
});
