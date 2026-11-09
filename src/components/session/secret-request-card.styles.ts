import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/aui/tokens/tokens.stylex";

/**
 * The same raised card the composer gives the task's own approvals — canvas
 * fill, a warning hairline — because it is the same kind of thing: the agent
 * is stopped until the user answers.
 */
export const secretRequestCardStyles = stylex.create({
  section: {
    backgroundColor: vars["--aui-color-canvas"],
    borderColor: vars["--aui-color-warning-border"],
    borderRadius: vars["--aui-radius-panel"],
    borderStyle: "solid",
    borderWidth: vars["--aui-border-width-hairline"],
    boxShadow: vars["--aui-elevation-raised"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-body"],
    gap: vars["--aui-space-8"],
    marginBottom: vars["--aui-space-12"],
    padding: "0.625rem",
  },
  header: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  icon: {
    color: vars["--aui-color-warning-text"],
    flexShrink: 0,
    height: vars["--aui-control-icon-size-md"],
    marginTop: vars["--aui-space-2"],
    width: vars["--aui-control-icon-size-md"],
  },
  headerBody: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: vars["--aui-space-2"],
    minWidth: 0,
  },
  titleRow: {
    alignItems: "baseline",
    display: "flex",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  title: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    margin: 0,
  },
  queued: {
    color: vars["--aui-color-text-muted"],
    flex: "0 0 auto",
    fontSize: vars["--aui-font-size-caption"],
    marginInlineStart: "auto",
    whiteSpace: "nowrap",
  },
  variableRow: {
    alignItems: "baseline",
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--aui-space-8"],
    minWidth: 0,
  },
  variable: {
    color: vars["--aui-color-text"],
    fontFamily: vars["--aui-font-mono"],
    fontSize: vars["--aui-font-size-caption"],
    overflowWrap: "anywhere",
  },
  label: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  reason: {
    color: vars["--aui-color-text-muted"],
    display: "-webkit-box",
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 4,
  },
  existing: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  existingName: {
    fontWeight: vars["--aui-font-weight-medium"],
  },
  existingPreview: {
    color: vars["--aui-color-text-muted"],
    fontFamily: vars["--aui-font-mono"],
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--aui-space-8"],
    margin: 0,
  },
  fieldLabel: {
    color: vars["--aui-color-text-muted"],
    display: "flex",
    flexDirection: "column",
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
  },
  field: {
    fontFamily: vars["--aui-font-mono"],
    width: "100%",
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.375rem",
  },
  action: {
    fontSize: vars["--aui-font-size-caption"],
    height: 28,
    paddingInline: "0.625rem",
  },
  note: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  status: {
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    margin: 0,
  },
  error: {
    color: vars["--aui-color-danger-text"],
  },
});
