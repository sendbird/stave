import { ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  EVIDENCE_SOURCE_LABELS,
  type ClassifiedEvidence,
} from "@/lib/missions/evidence";
import { missionStyles as styles } from "./missions.styles";

function isLink(ref: string | undefined): ref is string {
  return Boolean(ref && /^https?:\/\//.test(ref));
}

/**
 * Evidence with its origin: "Verified by Stave" when Stave saw the cited call
 * succeed, "Agent reported" otherwise. The caller orders Stave's first.
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
            <span className={sx(styles.evidenceSource, verified ? styles.toneDone : styles.toneIdle)}>
              <Icon aria-hidden className={sx(styles.icon)} />
              {EVIDENCE_SOURCE_LABELS[item.source]}
            </span>
            <span className={sx(styles.evidenceLabel)}>
              {isLink(item.ref) ? (
                <a href={item.ref} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ) : (
                item.label
              )}
              {item.command ? (
                <>
                  {" · "}
                  <code className={sx(styles.mono)}>{item.command}</code>
                </>
              ) : null}
              {item.toolCallId && onShowTool ? (
                <>
                  {" · "}
                  <Button variant="link" size="xs" onClick={() => onShowTool(item.toolCallId!)}>
                    Show in transcript
                  </Button>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
