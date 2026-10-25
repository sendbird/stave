import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";

export const handoffStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    minWidth: 0,
  },
  intro: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
  },
  sections: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    margin: 0,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minWidth: 0,
  },
  sectionTitle: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "0.025em",
    lineHeight: "1rem",
    margin: 0,
  },
  sectionText: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    margin: 0,
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
  },
  sectionEmpty: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
  sectionMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: "1rem",
    margin: 0,
  },
  textarea: {
    fontSize: vars["--ads-font-size-caption"],
    minBlockSize: 72,
    resize: "vertical",
  },
  footer: {
    display: "flex",
    gap: vars["--ads-space-8"],
    justifyContent: "flex-end",
  },
});
