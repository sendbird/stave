import { sx } from "@/components/ads/utils/stylex";
import type { DelegationStage } from "@/lib/delegation/exchange";
import { formatExchangeDuration } from "@/lib/delegation/format";
import { delegationStyles as styles } from "./delegation.styles";

/** `+12s  Label — detail`, one line per stage, offsets from `startedAt`. */
export function StageTimeline(props: {
  stages: readonly DelegationStage[];
  startedAt: number;
}) {
  if (props.stages.length === 0) {
    return null;
  }
  return (
    <ol className={sx(styles.timeline)}>
      {props.stages.map((stage, index) => (
        <li
          key={`${stage.label}:${stage.at}:${index}`}
          className={sx(styles.timelineItem)}
        >
          <span className={sx(styles.timelineAt)}>
            +{formatExchangeDuration(stage.at - props.startedAt)}
          </span>
          <span className={sx(styles.timelineLabel)}>
            {stage.label}
            {stage.detail ? (
              <span className={sx(styles.timelineDetail)}> — {stage.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
