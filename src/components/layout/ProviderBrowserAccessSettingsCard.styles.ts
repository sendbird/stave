import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/** Provider browser-access status cards inside the Browser access settings card. */
export const providerBrowserAccessSettingsCardStyles = stylex.create({
  browseSetup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: vars["--aui-space-8"],
  },
  grid: {
    display: "grid",
    gap: vars["--aui-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  statusCard: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    padding: 14,
  },
  statusHead: {
    alignItems: "center",
    display: "flex",
    gap: 10,
  },
  statusMark: {
    alignItems: "center",
    backgroundColor: vars["--aui-color-surface"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  statusIcon: {
    height: vars["--aui-control-icon-size-md"],
    width: vars["--aui-control-icon-size-md"],
  },
  statusBody: {
    flex: 1,
    minWidth: 0,
  },
  statusName: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  statusMeta: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
  },
  statusDescription: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    marginBlockStart: vars["--aui-space-12"],
  },
  statusSetup: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    marginBlockStart: vars["--aui-space-8"],
  },
  emphasis: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  domainsField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  domainsLabel: {
    fontSize: vars["--aui-font-size-body"],
    fontWeight: vars["--aui-font-weight-medium"],
  },
  domainsHint: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
  },
  noteCard: {
    backgroundColor: vars["--aui-color-canvas-subtle"],
    borderColor: vars["--aui-color-border"],
    borderRadius: vars["--aui-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    paddingBlock: vars["--aui-space-12"],
    paddingInline: 14,
  },
  noteSpacer: {
    marginBlockStart: vars["--aui-space-4"],
  },
});
