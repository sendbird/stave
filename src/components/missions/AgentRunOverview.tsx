import { useMemo } from "react";
import { Bot, Gauge, ListChecks, ListOrdered, ListTodo } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { StepRail } from "@/components/ads/components/StepRail";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { sx } from "@/components/ads/utils/stylex";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState, latestStageRecord } from "@/lib/missions/domain";
import { agentRunStoredPlan, describeAgentRunResult } from "@/lib/missions/agent-run-status";
import { projectMissionStages } from "@/lib/missions/mission-view";
import { AGENT_CHECK_IN_LABELS } from "@/lib/agents/schema";
import { AgentRunDoneWhen } from "./AgentRunDoneWhen";
import { AgentRunPlan, describePlanProgress } from "./AgentRunPlan";
import { AgentRunOutcome } from "./AgentRunResultCard";
import { MissionReportView } from "./MissionReportView";
import { MissionRunSummary } from "./MissionRunSummary";
import { StageCard } from "./StageCard";
import type { MissionReportActions } from "./useMissionReportActions";
import type { AgentRunActions } from "./useAgentRunActions";
import { agentRunResultStyles } from "./agent-run-result.styles";
import { missionStyles as styles } from "./missions.styles";

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * An agent run in the Task panel's Progress tab: the agent and its state, the
 * Done when lines, the stages and their reports when the agent has a
 * workflow, the result once it is ready, and what the run used. A one-stage
 * run shows the agent's own plan as its steps instead of a stage list. Stop, Take control and Retry stay with the run bar
 * while the run is active and with the transcript card once it ended, so the
 * tab says why without a third copy of them.
 */
export function AgentRunOverview(props: {
  detail: MissionDetail;
  now: number;
  reportActions?: MissionReportActions;
  actions?: AgentRunActions;
  failure?: string | null;
  /** Retry or skip the current stage of a run with a workflow. */
  onCommand?: (command: "retryStage" | "skipStage", identity: { missionId: string; stageId: string; attempt: number }) => unknown;
  /** Jumps from a stage's evidence to its tool call in the transcript. */
  onShowTool?: (toolCallId: string) => void;
}) {
  const { detail, now, actions = {}, onCommand } = props;
  const { mission } = detail;
  const result = describeAgentRunResult(detail, now);
  const { status } = result;
  const active = isActiveMissionState(mission.state);
  const met = result.doneWhen.filter((line) => line.status.startsWith("met")).length;
  // The badge names the state; the line beside it says why, or how long.
  const statusText = status.reason ?? (active ? `${result.duration} so far` : result.duration);
  const staged = mission.playbook.stages.length > 1;
  const rows = useMemo(() => (staged ? projectMissionStages(detail, new Date(now)) : null), [detail, now, staged]);
  const plan = useMemo(() => agentRunStoredPlan(detail), [detail]);
  // The run follows the agent's workflow: say which, so its stages are never a surprise.
  const workflowTitle = staged ? mission.playbook.stages.map((stage) => stage.title).join(" → ") : null;
  return (
    <section className={sx(styles.panel)} aria-label={`${status.agentName}: ${status.label}`} data-testid="agent-run-panel">
      <header className={sx(styles.head)}>
        <div className={sx(styles.headRow)}>
          <IconTile size="sm" tone={status.tone}>
            <Bot size={iconTileGlyphSizes.sm} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <p className={sx(styles.eyebrow)} title={workflowTitle ?? undefined}>
              {status.agentName}
              {workflowTitle ? ` · Workflow: ${workflowTitle}` : ""}
            </p>
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
        <AgentRunDoneWhen lines={result.doneWhen} staveChecks={result.staveChecks} />
      </section>

      {plan ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Plan">
          <div className={sx(styles.sectionHeader)}>
            <ListTodo aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>Plan</h3>
            <span className={sx(styles.sectionAside)} title="Updated when each turn ends">
              {describePlanProgress(plan.items)}
            </span>
          </div>
          <AgentRunPlan items={plan.items} />
        </section>
      ) : null}

      {rows ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Stages">
          <div className={sx(styles.sectionHeader)}>
            <ListOrdered aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>Stages</h3>
            <span className={sx(styles.sectionAside)}>Check in: {AGENT_CHECK_IN_LABELS[mission.consent.checkIns]}</span>
          </div>
          <StepRail density="compact" role="list">
            {rows.map((row) => {
              const record = row.current && active ? latestStageRecord(detail.stages, row.stage.id) : null;
              const identity = record ? { missionId: mission.id, stageId: record.stageId, attempt: record.attempt } : null;
              return (
                <StageCard
                  key={row.stage.id}
                  row={row}
                  last={row.index === rows.length - 1}
                  busy={actions.busy}
                  onShowTool={props.onShowTool}
                  {...(identity && onCommand
                    ? {
                        onRetry: () => void onCommand("retryStage", identity),
                        onSkip: () => void onCommand("skipStage", identity),
                      }
                    : {})}
                />
              );
            })}
          </StepRail>
        </section>
      ) : null}

      {status.state === "ready" ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Result">
          <div className={sx(agentRunResultStyles.group)}>
            <AgentRunOutcome result={result} actions={actions} />
          </div>
        </section>
      ) : null}

      {detail.report ? (
        <MissionReportView report={detail.report} actions={props.reportActions} context="panel" agentOrigin />
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
          agentOrigin
        />
      </section>
    </section>
  );
}
