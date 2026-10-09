import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/**
 * The same raised card the composer gives the task's own approvals — canvas
 * fill, a warning hairline — because it is the same kind of thing: the agent
 * is stopped until the user answers.
 */
export const secretRequestCardStyles = stylex.create({
  section: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-warning-border"],
    borderRadius: vars["--ads-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    boxShadow: vars["--ads-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    fontSize: "0.8125rem",
    gap: vars["--ads-space-8"],
    marginBottom: vars["--ads-space-12"],
    padding: "0.625rem",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  icon: {
    color: vars["--ads-color-warning-text"],
    flexShrink: 0,
    height: vars["--ads-control-icon-size-md"],
    marginTop: vars["--ads-space-2"],
    width: vars["--ads-control-icon-size-md"],
  },
  headerBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--ads-space-2"],
    minWidth: 0,
  },
  titleRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  title: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    margin: 0,
  },
  queued: {
    color: vars["--ads-color-text-subtle"],
    flex: "0 0 auto",
    fontSize: vars["--ads-font-size-micro"],
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  variableRow: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  variable: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-mono"],
    fontSize: vars["--ads-font-size-caption"],
    overflowWrap: "anywhere",
  },
  label: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  reason: {
    color: vars["--ads-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
  },
  existing: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    margin: 0,
  },
  existingName: {
    fontWeight: vars["--ads-font-weight-medium"],
  },
  existingPreview: {
    color: vars["--ads-color-text-muted"],
    fontFamily: vars["--ads-font-mono"],
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    margin: 0,
  },
  fieldLabel: {
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
  },
  field: {
    fontFamily: vars["--ads-font-mono"],
    width: "100%",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.375rem",
  },
  action: {
    fontSize: vars["--ads-font-size-caption"],
    height: 28,
    paddingInline: "0.625rem",
  },
  note: {
    color: vars["--ads-color-text-subtle"],
    fontSize: vars["--ads-font-size-micro"],
    margin: 0,
  },
  status: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    margin: 0,
  },
  error: {
    color: vars["--ads-color-danger-text"],
  },
});
