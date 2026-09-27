import { ArrowUpRight, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { EVIDENCE_SOURCE_LABELS, type ClassifiedEvidence } from "@/lib/missions/evidence";
import { missionStyles as styles } from "./missions.styles";

function isLink(ref: string | undefined): ref is string {
  return Boolean(ref && /^https?:\/\//.test(ref));
}

/**
 * Evidence with its origin, in a three-column row: the origin badge, what it
 * shows (and the command behind it), and a way to see it. "Verified by Stave"
 * means Stave saw the cited call succeed; "Agent reported" is the agent's
 * word. The caller orders Stave's first.
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
        const verified = item.source === "stave";
        const Icon = verified ? ShieldCheck : UserRound;
        return (
          <li key={`${item.label}:${index}`} className={sx(styles.evidence)}>
            <Badge
              size="sm"
              tone={verified ? "success" : "neutral"}
              variant={verified ? "soft" : "outline"}
              xstyle={styles.evidenceBadge}
            >
              <Icon aria-hidden className={sx(styles.iconSm)} />
              {EVIDENCE_SOURCE_LABELS[item.source]}
            </Badge>
            <span className={sx(styles.evidenceLabel)}>
              {isLink(item.ref) ? (
                <a className={sx(styles.link)} href={item.ref} target="_blank" rel="noreferrer">
                  {item.label}
                  <ArrowUpRight aria-hidden className={sx(styles.iconSm)} />
                </a>
              ) : (
                item.label
              )}
              {item.command ? (
                <code className={sx(styles.mono, styles.evidenceCommand)}>{item.command}</code>
              ) : null}
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
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}
