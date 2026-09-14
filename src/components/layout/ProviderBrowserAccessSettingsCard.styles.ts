import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** Provider browser-access status cards inside the Browser access settings card. */
export const providerBrowserAccessSettingsCardStyles = stylex.create({
  grid: {
    display: "grid",
    gap: vars["--ads-space-12"],
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 640px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  statusCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    padding: 14,
  },
  statusHead: {
    alignItems: "center",
    display: "flex",
    gap: 10,
  },
  statusMark: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  statusIcon: {
    height: vars["--ads-control-icon-size-md"],
    width: vars["--ads-control-icon-size-md"],
  },
  statusBody: {
    flex: 1,
    minWidth: 0,
  },
  statusName: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  statusMeta: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
  },
  statusDescription: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-12"],
  },
  statusSetup: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    marginBlockStart: vars["--ads-space-8"],
  },
  emphasis: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  domainsField: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  domainsLabel: {
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  domainsHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  noteCard: {
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderColor: vars["--ads-color-border"],
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: 14,
  },
  noteSpacer: {
    marginBlockStart: vars["--ads-space-4"],
  },
});
