import { Bot, Gauge, ListChecks } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import { describeAgentRunResult } from "@/lib/missions/agent-run-view";
import { AgentRunDoneWhen } from "./AgentRunDoneWhen";
import { AgentRunOutcome } from "./AgentRunResultCard";
import { TAKE_CONTROL_HINT } from "./AgentRunBar";
import { MissionReportView } from "./MissionReportView";
import { MissionRunSummary } from "./MissionRunSummary";
import type { MissionReportActions } from "./useMissionReportActions";
import type { AgentRunActions } from "./useAgentRunActions";
import { agentRunStyles } from "./agent-run.styles";
import { missionStyles as styles } from "./missions.styles";

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * An agent run in the Task panel's Progress tab: the agent and its state, the
 * Done when lines, the result once it is ready, and what the run used. A run
 * has one implicit stage, so there is no stage list, check-in setting or
 * start-at choice.
 */
export function AgentRunDetailView(props: {
  detail: MissionDetail;
  now: number;
  reportActions?: MissionReportActions;
  actions?: AgentRunActions;
  failure?: string | null;
}) {
  const { detail, now, actions = {} } = props;
  const { mission } = detail;
  const result = describeAgentRunResult(detail, now);
  const { status } = result;
  const active = isActiveMissionState(mission.state);
  const met = result.doneWhen.filter((line) => line.status.startsWith("met")).length;
  // The badge names the state; the line beside it says why, or how long.
  const statusText = status.reason ?? (active ? `${result.duration} so far` : result.duration);
  return (
    <section className={sx(styles.panel)} aria-label={`${status.agentName}: ${status.label}`} data-testid="agent-run-panel">
      <header className={sx(styles.head)}>
        <div className={sx(styles.headRow)}>
          <IconTile size="sm" tone={status.tone}>
            <Bot size={iconTileGlyphSizes.sm} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <p className={sx(styles.eyebrow)}>{status.agentName}</p>
            <h2 className={sx(styles.title)} title={mission.assignment}>
              {mission.assignment}
            </h2>
          </div>
        </div>
        <div className={sx(styles.statusRow)}>
          <Badge size="sm" tone={status.tone} dot xstyle={styles.badge}>
            {status.label}
          </Badge>
          <span className={sx(styles.statusText)} title={statusText}>
            {statusText}
          </span>
        </div>
        {active && (actions.onStop || actions.onTakeControl) ? (
          <div className={sx(styles.actions)}>
            {actions.onStop ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onStop}>
                Stop
              </Button>
            ) : null}
            {actions.onTakeControl ? (
              <Tooltip content={TAKE_CONTROL_HINT}>
                <Button variant="quiet" size="xs" disabled={actions.busy} onClick={actions.onTakeControl}>
                  Take control
                </Button>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
        {status.recovery ? (
          <div className={sx(styles.actions)}>
            {actions.onRetry ? (
              <Button variant="secondary" size="xs" disabled={actions.busy} onClick={actions.onRetry}>
                Retry
              </Button>
            ) : null}
            {!active && actions.onTakeControl ? (
              <Button variant="quiet" size="xs" disabled={actions.busy} onClick={actions.onTakeControl}>
                Take control
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Done when">
        <div className={sx(styles.sectionHeader)}>
          <ListChecks aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Done when</h3>
          <span className={sx(styles.sectionAside)}>
            {met} of {result.doneWhen.length} met
          </span>
        </div>
        <AgentRunDoneWhen lines={result.doneWhen} />
      </section>

      {status.state === "ready" ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Result">
          <div className={sx(agentRunStyles.group)}>
            <AgentRunOutcome result={result} actions={actions} />
          </div>
        </section>
      ) : null}

      {detail.report ? (
        <MissionReportView report={detail.report} actions={props.reportActions} context="panel" agentRun />
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Run">
        <div className={sx(styles.sectionHeader)}>
          <Gauge aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Run</h3>
        </div>
        <MissionRunSummary
          mission={mission}
          usage={detail.usage ?? null}
          active={active}
          now={now}
          formatClock={formatClock}
          agentRun
        />
      </section>
    </section>
  );
}
