import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { AGENT_RUN_STATE_TONES, agentRunDuration, describeAgentRunStatus } from "@/lib/missions/agent-run-view";
import { StageStatusIcon } from "./StageStatusIcon";
import type { AgentRunActions } from "./useAgentRunActions";
import { missionBarStyles as styles } from "./mission-bar.styles";
import { missionStyles } from "./missions.styles";

export const TAKE_CONTROL_HINT = "Ends the run and keeps this task in Chat, on the model the agent was using.";

/**
 * The status line over the composer while an agent run is active:
 * `Working · 4m`, or `Needs you` with what the run waits on, with Stop and
 * Take control. A run has one implicit stage, so it shows no stage track.
 */
export function AgentRunBarView(props: {
  detail: MissionDetail;
  nowPhrase: string | null;
  now: number;
  reducedMotion: boolean;
  /** `docked` is a shelf over the composer; `panel` a flat header in the Activity panel. */
  variant?: "docked" | "panel";
  /** Docked inside the composer frame, which owns the final tuck. */
  framed?: boolean;
  actions?: AgentRunActions;
  onOpenPanel?: () => void;
}) {
  const { detail, actions = {}, variant = "docked" } = props;
  const status = describeAgentRunStatus(detail);
  const showNow = status.state === "working" && props.nowPhrase !== null;
  const detailText = status.state === "needs-you" ? status.reason : showNow ? props.nowPhrase : null;
  const elapsed = agentRunDuration(detail, props.now);
  return (
    <section
      className={cx(
        variant === "docked" ? "turn-activity-surface" : undefined,
        sx(
          variant === "docked" ? styles.tray : styles.flat,
          variant === "docked" && (props.framed ? styles.trayFramed : styles.trayStandalone),
        ),
      )}
      aria-label={`${status.agentName}: ${status.label}`}
      title={`${status.agentName} · ${detail.mission.assignment.split("\n")[0]}`}
      data-testid="agent-run-bar"
    >
      <div className={sx(styles.sizer)}>
        <div className={sx(styles.header)}>
          <span className={sx(styles.mark)}>
            <StageStatusIcon tone={AGENT_RUN_STATE_TONES[status.state]} xstyle={styles.markIcon} />
          </span>
          <p className={sx(styles.headline)}>
            <span
              className={sx(
                styles.headlineTitle,
                status.state === "needs-you" && styles.headlineWaiting,
              )}
            >
              {status.label}
            </span>
            {/* The elapsed time comes first: a narrow bar truncates the end. */}
            <span className={sx(styles.headlineDetail)}>{` · ${elapsed}`}</span>
            {detailText ? (
              <span className={sx(styles.headlineDetail)}>
                {" · "}
                {showNow ? <TextShimmer active={!props.reducedMotion}>{detailText}</TextShimmer> : detailText}
              </span>
            ) : null}
          </p>
          <span className={sx(styles.actions)}>
            {actions.onStop ? (
              <Button variant="quiet" size="xs" disabled={actions.busy} onClick={actions.onStop} xstyle={styles.quietButton}>
                Stop
              </Button>
            ) : null}
            {actions.onTakeControl ? (
              <Tooltip content={TAKE_CONTROL_HINT}>
                <Button
                  variant="quiet"
                  size="xs"
                  disabled={actions.busy}
                  onClick={actions.onTakeControl}
                  xstyle={styles.quietButton}
                >
                  Take control
                </Button>
              </Tooltip>
            ) : null}
            {props.onOpenPanel ? (
              <Tooltip content="Open Progress in the Task panel">
                <Button
                  variant="quiet"
                  size="iconSm"
                  iconOnly
                  aria-label="Open Progress in the Task panel"
                  onClick={props.onOpenPanel}
                  xstyle={styles.quietButton}
                >
                  <PanelRightOpen aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
          </span>
        </div>
      </div>
      <p className={sx(missionStyles.visuallyHidden)} aria-live="polite">
        {`${status.agentName}: ${status.label}`}
      </p>
    </section>
  );
}
