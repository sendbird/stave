import { i18n, useTranslation } from "@/i18n";
import { ArrowUpRight, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { evidenceSourceLabel, isVerifiedEvidence, type ClassifiedEvidence } from "@/lib/agent-runs/evidence";
import { agentRunStyles as styles } from "./agent-runs.styles";

function isLink(ref: string | undefined): ref is string {
  return Boolean(ref && /^https?:\/\//.test(ref));
}

/**
 * Evidence starts with its title and transcript link, followed by the command
 * and wrapping provenance and process status. "Verified by Stave"
 * distinguishes host actions from provider results and agent claims. Check
 * outcome and workspace freshness are shown separately.
 */
export function EvidenceList({
  evidence,
  onShowTool,
}: {
  evidence: readonly ClassifiedEvidence[];
  /** Scrolls the transcript to a cited tool call. */
  onShowTool?: (toolCallId: string) => void;
}) {
  useTranslation();
  if (evidence.length === 0) return null;
  return (
    <ul className={sx(styles.list)}>
      {evidence.map((item, index) => {
        const verified = isVerifiedEvidence(item);
        const Icon = verified ? ShieldCheck : UserRound;
        return (
          <li key={`${item.label}:${index}`} className={sx(styles.evidence)}>
            <div className={sx(styles.evidenceHeading)}>
              <span className={sx(styles.evidenceLabel)}>
              {isLink(item.ref) ? (
                <a className={sx(styles.link)} href={item.ref} target="_blank" rel="noreferrer">
                  {item.label}
                  <ArrowUpRight aria-hidden className={sx(styles.iconSm)} />
                </a>
              ) : (
                item.label
              )}
              </span>
            {item.toolCallId && onShowTool ? (
              <Button
                variant="link"
                size="xs"
                aria-label={i18n.t("agentRuns:evidenceList.ariaLabel", { value1: item.label })}
                onClick={() => onShowTool(item.toolCallId!)}
              >
                {i18n.t("agentRuns:evidenceList.copy")}</Button>
            ) : null}
            </div>
            {item.command ? <code className={sx(styles.mono, styles.evidenceCommand)}>{item.command}</code> : null}
            <div className={sx(styles.evidenceMetadata)}>
              <Badge size="sm" tone={verified ? "success" : "neutral"} variant={verified ? "soft" : "outline"}>
                <Icon aria-hidden className={sx(styles.iconSm)} />
                {evidenceSourceLabel(item)}
                {item.outcome === "failed" ? i18n.t("agentRuns:evidenceList.copy2") : null}
              </Badge>
              {item.exitCode !== undefined ? <span>{item.exitCode === null ? i18n.t("agentRuns:evidenceList.copy3") : i18n.t("agentRuns:evidenceList.copy4", { value1: item.exitCode })}</span> : null}
              {item.freshness === "stale" ? <span>{i18n.t("agentRuns:evidenceList.copy5")}</span> : item.freshness === "unknown" && item.kind === "check" ? <span>{i18n.t("agentRuns:evidenceList.copy6")}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
