import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";

export const runTurnDialogStyles = stylex.create({
  // A reading measure, not a form width: the conversation column at most,
  // the viewport minus its gutter on a narrow window.
  popup: {
    inlineSize: `min(48rem, calc(100dvw - ${vars["--ads-space-32"]}))`,
  },
  transcript: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-24"],
    minWidth: 0,
    margin: 0,
    padding: 0,
    paddingBlock: vars["--ads-space-8"],
    listStyleType: "none",
  },
  row: { display: "flex", flexDirection: "column", minWidth: 0 },
  assistant: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: vars["--ads-space-8"],
    width: "100%",
    minWidth: 0,
  },
  user: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    maxWidth: "88%",
    width: "fit-content",
  },
  note: {
    margin: 0,
    paddingBlock: vars["--ads-space-12"],
    color: vars["--ads-color-text-muted"],
  },
  error: {
    margin: 0,
    paddingBlock: vars["--ads-space-12"],
    color: vars["--ads-color-danger-text"],
  },
  alert: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
});
