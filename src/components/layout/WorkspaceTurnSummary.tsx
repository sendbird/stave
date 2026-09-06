import { Bot, ChevronDown, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import type { WorkspaceTurnSummary as WorkspaceTurnSummaryValue } from "@/lib/workspace-information";
import { workspaceTurnSummaryStyles as styles } from "./workspace-turn-summary.styles";

function SummaryEntry(props: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={sx(styles.entry)}>
      <div className={sx(styles.entryLabel)}>
        <span className={sx(styles.entryIcon)}>{props.icon}</span>
        <span>{props.label}</span>
      </div>
      <p className={sx(styles.entryBody)}>{props.children}</p>
    </div>
  );
}

export function WorkspaceTurnSummary(props: {
  summary: WorkspaceTurnSummaryValue;
}) {
  // `<details>` still owns open/closed; this mirrors it so the chevron can
  // rotate without an ancestor-scoped utility selector.
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className={sx(styles.root)}>
      <div className={sx(styles.head)}>
        {props.summary.taskTitle ? (
          <p className={sx(styles.taskTitle)}>{props.summary.taskTitle}</p>
        ) : null}
        <p className={sx(styles.workSummary)}>{props.summary.workSummary}</p>
      </div>
      <details
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary
          className={sx(styles.summary, transition.colors, focusRing.ring)}
        >
          <span>Details</span>
          <ChevronDown
            className={sx(
              styles.summaryChevron,
              detailsOpen && styles.summaryChevronOpen,
            )}
          />
        </summary>
        <div className={sx(styles.details)}>
          <SummaryEntry
            icon={<UserRound className={sx(styles.entryIconGlyph)} />}
            label="Original request"
          >
            {props.summary.requestSummary}
          </SummaryEntry>
          <div className={sx(styles.modelRow)}>
            <Bot className={sx(styles.entryIconGlyph)} />
            <span>
              Response by{" "}
              {toHumanModelName({
                model: props.summary.model,
              })}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
