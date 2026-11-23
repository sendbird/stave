import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";

export const fileViewerStyles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    color: vars["--aui-color-text"],
    backgroundColor: vars["--aui-color-surface"],
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    flexShrink: 0,
    gap: vars["--aui-space-8"],
    paddingBlock: vars["--aui-space-4"],
    paddingInline: vars["--aui-space-12"],
    borderBottom: `solid ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-border"]}`,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    minWidth: 0,
  },
  search: {
    flex: "1 1 9rem",
    minWidth: 0,
  },
  caption: {
    fontSize: vars["--aui-font-size-caption"],
    color: vars["--aui-color-text-muted"],
  },
  status: {
    paddingInline: vars["--aui-space-12"],
    paddingBlock: vars["--aui-space-4"],
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
  },
  log: {
    margin: 0,
    padding: vars["--aui-space-12"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-caption"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  highlight: {
    backgroundColor: vars["--aui-color-warning-soft"],
    color: vars["--aui-color-warning-text"],
  },
  pdfViewport: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    scrollbarGutter: "stable",
  },
  pdfPages: {
    display: "grid",
    justifyItems: "center",
    width: "max-content",
    minWidth: "100%",
    boxSizing: "border-box",
    gap: vars["--aui-space-12"],
    padding: vars["--aui-space-12"],
  },
  pdfPage: {
    backgroundColor: vars["--aui-color-surface"],
    color: vars["--aui-color-text"],
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    width: "var(--stave-pdf-page-width)",
    height: "var(--stave-pdf-page-height)",
    boxShadow: `0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-border"]}`,
  },
  pdfCanvasFailed: { display: "none" },
  pdfCanvas: {
    display: "block",
    width: "100%",
    height: "100%",
  },
});
