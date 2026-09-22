import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

/**
 * The toolbar reflows against its OWN width, so it declares a named container
 * (`gitGraphToolbar`) and every responsive rule is a `@container` value
 * condition rather than a viewport media query. It rests on the Monaco editor
 * surface (`--editor`); every other color resolves to an ADS token.
 */
const CONTAINER_30 = "@container gitGraphToolbar (min-width: 30rem)";
const CONTAINER_48 = "@container gitGraphToolbar (min-width: 48rem)";
const CONTAINER_62 = "@container gitGraphToolbar (min-width: 62rem)";

export const gitGraphToolbarStyles = stylex.create({
  root: {
    containerType: "inline-size",
    containerName: "gitGraphToolbar",
    display: "grid",
    flexShrink: 0,
    gridTemplateColumns: {
      default: "minmax(0,1fr) auto",
      [CONTAINER_30]: "minmax(0,auto) minmax(7rem,1fr) auto",
    },
    alignItems: "center",
    columnGap: vars["--ads-space-8"],
    rowGap: 6,
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 75%, transparent)`,
    backgroundColor: "var(--editor)",
    paddingInline: 10,
    paddingBlock: 6,
  },
  leftGroup: {
    display: "flex",
    minWidth: 0,
    alignItems: "center",
    gap: vars["--ads-space-8"],
  },
  branchTrigger: {
    height: 32,
    width: {
      default: "100%",
      [CONTAINER_30]: "auto",
    },
    minWidth: 0,
    maxWidth: "14rem",
    justifyContent: "flex-start",
    gap: 6,
    paddingInline: 10,
    fontSize: vars["--ads-font-size-caption"],
  },
  branchIcon: {
    width: 14,
    height: 14,
    color: vars["--ads-color-accent"],
  },
  branchLabel: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  chevronMuted: {
    width: 12,
    height: 12,
    color: vars["--ads-color-text-muted"],
  },
  branchMenu: {
    width: "18rem",
  },
  limitLabel: {
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-regular"],
    color: vars["--ads-color-warning-text"],
  },
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  headBadge: {
    marginLeft: "auto",
    fontSize: vars["--ads-font-size-micro"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-accent"],
  },
  statusUnavailable: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-warning-text"],
  },
  statusIcon: {
    width: 14,
    height: 14,
  },
  statusUnavailableText: {
    display: {
      default: "none",
      [CONTAINER_62]: "inline",
    },
  },
  statusClean: {
    display: {
      default: "none",
      [CONTAINER_62]: "inline",
    },
    fontSize: vars["--ads-font-size-micro"],
    color: vars["--ads-color-text-muted"],
  },
  statusEntries: {
    display: {
      default: "none",
      [CONTAINER_62]: "flex",
    },
    alignItems: "center",
    gap: 6,
  },
  // One ink for bookkeeping counts; the danger tone is reserved for the
  // entry that needs a hand (conflicts).
  statusEntry: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
  },
  statusEntryConflicts: {
    color: vars["--ads-color-danger-text"],
  },
  searchWrap: {
    position: "relative",
    gridColumn: {
      default: "span 2",
      [CONTAINER_30]: "2",
    },
    gridRow: {
      default: 2,
      [CONTAINER_30]: 1,
    },
    minWidth: 0,
  },
  searchIcon: {
    pointerEvents: "none",
    position: "absolute",
    left: 10,
    top: "50%",
    width: 14,
    height: 14,
    transform: "translateY(-50%)",
    color: vars["--ads-color-text-muted"],
  },
  searchInput: {
    height: 32,
    borderRadius: vars["--ads-radius-control"],
    paddingLeft: vars["--ads-space-32"],
    fontSize: vars["--ads-font-size-caption"],
  },
  searchInputWithMatches: {
    paddingRight: "9rem",
  },
  searchInputNoMatches: {
    paddingRight: vars["--ads-space-64"],
  },
  searchControls: {
    position: "absolute",
    right: vars["--ads-space-4"],
    top: "50%",
    display: "flex",
    transform: "translateY(-50%)",
    alignItems: "center",
    gap: 2,
  },
  matchCount: {
    marginRight: 2,
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  iconButtonSm: {
    width: 24,
    height: 24,
  },
  iconGlyphSm: {
    width: 12,
    height: 12,
  },
  rightGroup: {
    gridColumn: {
      default: 2,
      [CONTAINER_30]: 3,
    },
    gridRow: 1,
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  commitCount: {
    marginRight: vars["--ads-space-4"],
    display: {
      default: "none",
      [CONTAINER_48]: "inline",
    },
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    color: vars["--ads-color-text-muted"],
  },
  iconButtonMd: {
    width: 32,
    height: 32,
  },
  iconGlyphMd: {
    width: 14,
    height: 14,
  },
  columnsMenu: {
    width: "12rem",
  },
  refreshSpin: {
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
});
