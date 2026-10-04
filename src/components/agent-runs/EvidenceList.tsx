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
                aria-label={`Show "${item.label}" in the transcript`}
                onClick={() => onShowTool(item.toolCallId!)}
              >
                Show
              </Button>
            ) : null}
            </div>
            {item.command ? <code className={sx(styles.mono, styles.evidenceCommand)}>{item.command}</code> : null}
            <div className={sx(styles.evidenceMetadata)}>
              <Badge size="sm" tone={verified ? "success" : "neutral"} variant={verified ? "soft" : "outline"}>
                <Icon aria-hidden className={sx(styles.iconSm)} />
                {evidenceSourceLabel(item)}
                {item.outcome === "failed" ? " · Failed" : null}
              </Badge>
              {item.exitCode !== undefined ? <span>{item.exitCode === null ? "Exit unknown" : `Exit ${item.exitCode}`}</span> : null}
              {item.freshness === "stale" ? <span>Changed since this check</span> : item.freshness === "unknown" && item.kind === "check" ? <span>Current work unverified</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
