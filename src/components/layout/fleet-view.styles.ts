import * as stylex from "@stylexjs/stylex";

import { vars } from "../ads/tokens/tokens.stylex";

/** The inbox becomes a real column here; below it is a compact top rail. */
const COLUMN = "@media (min-width: 40rem)";
/** Wide enough to give an open task-control surface room without crowding. */
const ROOMY = "@media (min-width: 64rem)";

export const fleetStyles = stylex.create({
  root: {
    backgroundColor: vars["--ads-color-canvas"],
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  },
  header: {
    alignItems: "center",
    // A single sheen across the chrome: the surface tint fading into the
    // canvas, so the header reads as raised without a second border.
    backgroundImage: `linear-gradient(110deg, color-mix(in oklch, ${vars["--ads-color-surface"]} 92%, ${vars["--ads-color-canvas"]}), ${vars["--ads-color-canvas"]})`,
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-16"],
    justifyContent: "space-between",
    minHeight: 56,
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  headerIdentity: {
    alignItems: "center",
    display: "flex",
    gap: vars["--ads-space-8"],
    minWidth: 0,
  },
  headerIcon: {
    /*
     * Muted, not accent. The accent is the app's one "this is current, or this
     * is the thing to act on" signal; a decorative glyph beside a panel title is
     * neither, and painting it accent put the loudest colour in the surface on
     * the one element in it that does nothing.
     */
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 16,
    width: 16,
  },
  headerTitle: {
    color: vars["--ads-color-text"],
    fontFamily: vars["--ads-font-sans"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    letterSpacing: "-0.01em",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerSummary: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: vars["--ads-space-8"],
  },
  headerAction: {
    height: 28,
  },
  headerIconAction: {
    height: 28,
    padding: 0,
    width: 28,
  },
  actionIcon: {
    height: 14,
    width: 14,
  },
  closeIcon: {
    height: 16,
    width: 16,
  },
  notice: {
    alignItems: "center",
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  noticeMuted: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  body: {
    display: "flex",
    flexBasis: 0,
    flexDirection: {
      default: "column",
      [COLUMN]: "row",
    },
    flexGrow: 1,
    minHeight: 0,
  },
  inbox: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: vars["--ads-border-width-hairline"],
      [COLUMN]: 0,
    },
    flexShrink: 0,
    height: {
      default: 160,
      [COLUMN]: "100%",
    },
    minHeight: 0,
    width: "100%",
  },
  inboxRested: {
    width: {
      default: "100%",
      [COLUMN]: 256,
      [ROOMY]: 320,
    },
  },
  inboxExpanded: {
    width: {
      default: "100%",
      [COLUMN]: 320,
      [ROOMY]: 448,
    },
  },
  board: {
    display: "flex",
    flexBasis: 0,
    flexDirection: "column",
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
  },
  toolbar: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas"],
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-16"],
  },
  filterGroup: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-canvas-subtle"],
    borderRadius: vars["--ads-radius-control"],
    display: "flex",
    flexWrap: "wrap",
    gap: vars["--ads-space-2"],
    padding: vars["--ads-space-2"],
  },
  filterChip: {
    fontSize: vars["--ads-font-size-caption"],
    height: 26,
    paddingInline: vars["--ads-space-8"],
  },
  filterChipActive: {
    backgroundColor: vars["--ads-color-canvas"],
    borderColor: vars["--ads-color-border"],
    boxShadow: vars["--ads-elevation-raised"],
  },
  searchField: {
    marginInlineStart: "auto",
    maxWidth: 320,
    minWidth: 192,
    position: "relative",
    width: {
      default: "100%",
      [COLUMN]: 256,
    },
  },
  searchIcon: {
    color: vars["--ads-color-text-muted"],
    height: 14,
    insetInlineStart: 10,
    pointerEvents: "none",
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 14,
  },
  /*
   * Chrome comes from the ADS field: raised fill, hairline at rest, border
   * strengthening on hover and taking the focus colour on `:focus-within`. This
   * key used to replace all of that with a flat `colorCanvasSubtle` box whose
   * border was transparent until hovered — a field that only looked like a
   * field once the pointer was already on it, and the one input in the app with
   * its own fill. What is left is the toolbar's geometry: the `sm` height its
   * neighbouring filter buttons carry, and the gutters the leading search glyph
   * and the trailing clear button need.
   */
  searchInput: {
    fontSize: vars["--ads-font-size-body"],
    height: vars["--ads-control-height-sm"],
    paddingInlineEnd: vars["--ads-space-32"],
    paddingInlineStart: vars["--ads-space-32"],
  },
  searchClear: {
    color: {
      default: vars["--ads-color-text-muted"],
      ":hover": vars["--ads-color-text"],
    },
    insetInlineEnd: vars["--ads-space-4"],
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
  },
  scroller: {
    flexBasis: 0,
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  boardEmpty: {
    paddingBlock: 48,
    paddingInline: vars["--ads-space-16"],
    textAlign: "center",
  },
  boardEmptyTitle: {
    color: vars["--ads-color-text"],
    // Empty-state titles sit at Lead across the app (the ADS `EmptyState`
    // title step), so the board's own empty state does not read as a row.
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: vars["--ads-line-height-lead"],
  },
  boardEmptyHint: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    marginTop: vars["--ads-space-4"],
  },
  boardEmptyAction: {
    borderRadius: vars["--ads-radius-mark"],
    marginTop: vars["--ads-space-12"],
  },
  projectSection: {
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: {
      default: vars["--ads-border-width-hairline"],
      ":last-child": 0,
    },
  },
  projectHeader: {
    alignItems: "center",
    backdropFilter: "blur(8px)",
    backgroundColor: vars["--ads-color-canvas"],
    borderBottomColor: vars["--ads-color-border"],
    borderBottomStyle: "solid",
    borderBottomWidth: vars["--ads-border-width-hairline"],
    display: "flex",
    gap: 6,
    minHeight: 36,
    paddingBlock: 6,
    paddingInline: vars["--ads-space-16"],
    position: "sticky",
    textAlign: "left",
    top: 0,
    width: "100%",
    zIndex: {
      default: vars["--ads-z-index-panel"],
      ":focus-visible": vars["--ads-z-index-app-chrome"],
    },
  },
  projectChevron: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  // Names the group of cards under it, so it is a section header rather than
  // a row label sharing the step of the counts beside it.
  projectName: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectCount: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    fontVariantNumeric: "tabular-nums",
  },
  /**
   * The chip itself is an ADS `Badge` (tone/radius/type all come from the
   * component); this only reserves it against the header's flex squeeze and
   * spaces it from the count.
   */
  projectCurrent: {
    flexShrink: 0,
    marginInlineStart: vars["--ads-space-4"],
  },
  cardGrid: {
    alignItems: "start",
    display: "grid",
    gap: 10,
    gridTemplateColumns:
      "repeat(auto-fill, minmax(min(100%, max(17rem, calc((100% - 2 * 0.625rem) / 3))), 1fr))",
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  footnote: {
    alignItems: "center",
    color: vars["--ads-color-text-muted"],
    display: "flex",
    flexWrap: "wrap",
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-8"],
    paddingBlock: vars["--ads-space-12"],
    paddingInline: vars["--ads-space-16"],
  },
  footnoteIcon: {
    height: 14,
    width: 14,
  },
  footnoteAction: {
    fontSize: vars["--ads-font-size-caption"],
    height: 24,
    paddingInline: vars["--ads-space-8"],
  },
});
