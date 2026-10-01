import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDoneWhenLine, DoneWhenStatus } from "@/lib/missions/agent-run-view";
import { missionStyles as styles } from "./missions.styles";

const PRESENTATION = {
  "met-reported": { icon: CircleCheck, mark: styles.toneDone, label: styles.muted },
  unmet: { icon: CircleX, mark: styles.toneAttention, label: styles.toneAttention },
  unverified: { icon: CircleDashed, mark: styles.toneIdle, label: styles.toneIdle },
} as const satisfies Record<DoneWhenStatus, unknown>;

/**
 * The Done when lines of an agent run with the agent's status, then the checks
 * Stave itself saw succeed. The two stay apart: no criterion is linked to a check.
 */
export function AgentRunDoneWhen({ lines, staveChecks = [] }: {
  lines: readonly AgentRunDoneWhenLine[];
  staveChecks?: readonly string[];
}) {
  if (lines.length === 0 && staveChecks.length === 0) return null;
  return (
    <>
    <ul className={sx(styles.checkList)} aria-label="Done when">
      {lines.map((line) => {
        const presentation = PRESENTATION[line.status];
        const Icon = presentation.icon;
        return (
          <li key={line.text} className={sx(styles.check)}>
            <span className={sx(styles.checkMark)}>
              <Icon aria-hidden className={sx(styles.icon, presentation.mark)} />
            </span>
            <span className={sx(styles.checkText)}>{line.text}</span>
            <span className={sx(styles.checkState, presentation.label)}>{line.label}</span>
          </li>
        );
      })}
    </ul>
    {staveChecks.length > 0 ? (
      <p className={sx(styles.checkNote, styles.inline)} aria-label="Checked by Stave">
        <CircleCheck aria-hidden className={sx(styles.iconSm, styles.toneDone)} />
        Checked by Stave · {staveChecks.join(" · ")}
      </p>
    ) : null}
    </>
  );
}
