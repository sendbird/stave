import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { DropdownMenuTrigger, Loader } from "@/components/ui";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import {
  describePrChecks,
  formatPrChecksCount,
  PR_STATUS_VISUAL,
  type GitHubPrPayload,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import { layoutShellStyles } from "./layout-shell.styles";
import { prToneBadgeStyles } from "./pr-status.styles";
import { topBarControlStyles } from "./top-bar.styles";
import { openPrStyles } from "./top-bar-open-pr.styles";

/**
 * The top bar's PR status chip: the status, then how many of the pull
 * request's checks passed ("3/5 checks") while it is open. The tooltip names
 * the failing and still-running checks. Renders inside the status menu's
 * `DropdownMenu`, which it opens.
 */
export function TopBarPrStatusTrigger(props: {
  pr: GitHubPrPayload | null | undefined;
  status: WorkspacePrStatus;
  /** Replaces the status label while a PR action runs. */
  busyLabel: string | null;
  disabled: boolean;
  /** Why the status needs a second look (branch protection, mergeability). */
  hint: string | null;
  /** The last refresh failure; the chip keeps the last known status. */
  error: string | null;
  noDragStyle: CSSProperties;
}) {
  useTranslation();
  const visual = PR_STATUS_VISUAL[props.status];
  const isOpen = props.pr?.state === "OPEN" && !props.pr.mergedAt;
  const checksCount = isOpen ? formatPrChecksCount(props.pr?.checks) : null;
  const checkLines = isOpen ? describePrChecks(props.pr?.checks) : [];
  const busy = props.busyLabel !== null;

  return (
    <Tooltip
      content={
        <span className={sx(styles.tooltipLines)}>
          <span>
            {i18n.t("sourceControl:topBarOpenPR.pR")}
            {props.pr?.number ?? "?"}: {visual.label}
            {props.hint ? ` — ${props.hint}` : ""}
            {props.error
              ? i18n.t("sourceControl:topBarOpenPR.statusMayBeStale", {
                  value1: props.error,
                })
              : ""}
          </span>
          {checkLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
      side="bottom"
    >
      <span {...stylex.props(layoutShellStyles.inlineFlex)}>
        <DropdownMenuTrigger
          render={
            <AdsButton
              layout="host"
              size="sm"
              type="button"
              xstyle={[
                topBarControlStyles.control,
                openPrStyles.trigger,
                // Draft is the neutral tone. A badge fill here is a
                // different chip from the branch switcher and Commit
                // graph beside it; those share `surface`. Colored
                // tones keep the status fill.
                visual.tone === "neutral"
                  ? topBarControlStyles.surface
                  : prToneBadgeStyles[visual.tone],
              ]}
              style={props.noDragStyle}
              disabled={props.disabled}
              aria-label={i18n.t("sourceControl:topBarOpenPR.statusMenu")}
            />
          }
        >
          {busy ? (
            <Loader
              aria-hidden
              className={sx(openPrStyles.flexNone)}
              size="xs"
              variant="scan"
            />
          ) : (
            <PrStatusIcon
              status={props.status}
              className={sx(openPrStyles.statusIcon)}
            />
          )}
          {props.busyLabel ?? visual.label}
          {checksCount && !busy ? (
            <span className={sx(styles.checksCount)}>{checksCount}</span>
          ) : null}
        </DropdownMenuTrigger>
      </span>
    </Tooltip>
  );
}

/**
 * The top bar content's narrowest step (`top-bar.styles.ts` holds the
 * others). StyleX resolves each file's queries on its own, so the string is
 * repeated rather than imported.
 */
const TOP_BAR_CHECKS_COUNT = "@container topBar (min-width: 48rem)";

const styles = stylex.create({
  // The count rides in the chip's own ink, set off from the status by a
  // hairline in that ink, so it reads on every tone fill.
  checksCount: {
    borderInlineStartColor: "color-mix(in srgb, currentColor 35%, transparent)",
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    // On a very narrow bar the count folds away first; the tooltip still
    // carries it.
    display: { default: "none", [TOP_BAR_CHECKS_COUNT]: "inline" },
    fontVariantNumeric: "tabular-nums",
    paddingInlineStart: vars["--ads-space-8"],
  },
  tooltipLines: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
  },
});
