import { useEffect, useMemo } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Ellipsis,
  Gauge,
  ListChecks,
  ListOrdered,
  Pause,
  Play,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { StepRail } from "@/components/ads/components/StepRail";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { currentStageRecord, isActiveAgentRunState, latestStageRecord } from "@/lib/agent-runs/domain";
import { collectAcceptanceCriteria } from "@/lib/agent-runs/briefing";
import {
  describeCheckIns,
  describeAgentRunBadge,
  describeAgentRunStatusLine,
  formatAge,
  projectAgentRunStages,
} from "@/lib/agent-runs/agent-run-view";
import type { AcceptanceCriterion } from "@/lib/workflows/stage-prompt";
import { useAppStore } from "@/store/app.store";
import { agentRunStageKey, useAgentRunFailure, useAgentRunsStore } from "@/store/agent-runs-store";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { AgentRunOverview } from "./AgentRunOverview";
import { useAgentRunActions, type AgentRunActions } from "./useAgentRunActions";
import { AgentRunReportView } from "./AgentRunReportView";
import { useAgentRunReportActions, type AgentRunReportActions } from "./useAgentRunReportActions";
import { AgentRunSummary } from "./AgentRunSummary";
import { StageCard } from "./StageCard";
import { StageTrack } from "./StageTrack";
import { useNow, usePrefersReducedMotion } from "./useAgentRun";
import { agentRunStyles as styles } from "./agent-runs.styles";

const CRITERION_PRESENTATION = {
  met: { label: "Met", icon: CircleCheck, tone: styles.toneDone },
  unmet: { label: "Not met", icon: CircleX, tone: styles.toneAttention },
  unverified: { label: "Not verified", icon: CircleDashed, tone: styles.toneIdle },
} as const satisfies Record<AcceptanceCriterion["status"], unknown>;

const TILE_TONES = {
  accent: "accent",
  warning: "warning",
  danger: "danger",
  success: "success",
  neutral: "neutral",
} as const;

/** The latest acceptance criteria any stage reported, in workflow order. */
function latestCriteria(detail: AgentRunDetail): AcceptanceCriterion[] {
  return collectAcceptanceCriteria(detail, true);
}

function latestSignOffTime(detail: AgentRunDetail) {
  for (let index = detail.events.length - 1; index >= 0; index -= 1) {
    if (detail.events[index]!.kind === "sign-off") return detail.events[index]!.createdAt;
  }
  return null;
}

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

type AgentRunDetailViewProps = {
  detail: AgentRunDetail;
  now: number;
  onCommand: ReturnType<typeof useAgentRunsStore.getState>["runCommand"];
  onShowTool?: (toolCallId: string) => void;
  reportActions?: AgentRunReportActions;
  reducedMotion?: boolean;
  busy?: boolean;
  failure?: string | null;
  /** What an agent run's panel offers; a legacy run uses `onCommand`. */
  agentActions?: AgentRunActions;
};

/** The agent run in the Progress tab: the stage list for a workflow, the agent and its result for a run. */
export function AgentRunDetailView(props: AgentRunDetailViewProps) {
  return hasAgentOrigin(props.detail.agentRun) ? (
    <AgentRunOverview
      detail={props.detail}
      now={props.now}
      reportActions={props.reportActions}
      actions={props.agentActions}
      failure={props.failure}
      onCommand={props.onCommand}
      onShowTool={props.onShowTool}
    />
  ) : (
    <LegacyWorkflowRunDetailView {...props} />
  );
}

function LegacyWorkflowRunDetailView(props: AgentRunDetailViewProps) {
  const { detail, now, onCommand } = props;
  const { agentRun } = detail;
  const rows = useMemo(() => projectAgentRunStages(detail, new Date(now)), [detail, now]);
  const line = describeAgentRunStatusLine(detail);
  const badge = describeAgentRunBadge(detail);
  const active = isActiveAgentRunState(agentRun.state);
  const record = active ? currentStageRecord(detail) : null;
  const identity = record ? { agentRunId: agentRun.id, stageId: record.stageId, attempt: record.attempt } : null;
  const criteria = latestCriteria(detail);
  const signedOffAt = latestSignOffTime(detail);
  const userPause = agentRun.pauseReason === "paused-by-user" || agentRun.pauseReason === "taken-over";
  // The badge already names the state; the line beside it says where and why.
  const statusText = active
    ? [
        line.title === badge.label ? null : line.title,
        line.state === badge.label ? null : line.state,
        line.detail,
        formatAge(now - Date.parse(line.since)),
      ]
        .filter(Boolean)
        .join(" · ")
    : (agentRun.reasonDetail ?? `Ended at ${formatClock(agentRun.updatedAt)}`);
  return (
    <section className={sx(styles.panel)} aria-label={`Run: ${agentRun.workflow.name}`} data-testid="agent-run-panel">
      <header className={sx(styles.head)}>
        <div className={sx(styles.headRow)}>
          <IconTile size="sm" tone={TILE_TONES[badge.tone]}>
            <Target size={iconTileGlyphSizes.sm} />
          </IconTile>
          <div className={sx(styles.headText)}>
            <p className={sx(styles.eyebrow)}>Run · {agentRun.workflow.name}</p>
            <h2 className={sx(styles.title)} title={agentRun.assignment}>
              {agentRun.assignment}
            </h2>
          </div>
          {active ? (
            <div className={sx(styles.headActions)}>
              {agentRun.state === "running" ? (
                <Button
                  variant="quiet"
                  size="xs"
                  disabled={props.busy}
                  onClick={() => void onCommand("pause", { agentRunId: agentRun.id })}
                >
                  <Pause aria-hidden />
                  Pause
                </Button>
              ) : null}
              {agentRun.state === "paused" && userPause ? (
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={props.busy}
                  onClick={() => void onCommand("resume", { agentRunId: agentRun.id })}
                >
                  <Play aria-hidden />
                  Resume
                </Button>
              ) : null}
              <DropdownMenu
                placement="bottom-end"
                triggerAsChild
                trigger={
                  <Button variant="quiet" size="iconSm" iconOnly aria-label="More run actions">
                    <Ellipsis aria-hidden />
                  </Button>
                }
                groups={[
                  {
                    items: [
                      {
                        label: "Stop run",
                        tone: "danger",
                        disabled: props.busy,
                        onSelect: () => void onCommand("cancel", { agentRunId: agentRun.id }),
                      },
                    ],
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className={sx(styles.statusRow)}>
          <Badge size="sm" tone={badge.tone} dot xstyle={styles.badge}>
            {badge.label}
          </Badge>
          <span className={sx(styles.statusText)} title={statusText}>
            {statusText}
          </span>
        </div>
        {/* The track names the stage and the count; the Stages list below names them all. */}
        <StageTrack
          rows={rows}
          size="md"
          live={active && !props.reducedMotion && agentRun.state === "running"}
          paused={agentRun.state === "paused"}
          tone={agentRun.state === "stopped" ? "attention" : undefined}
        />
        {agentRun.pauseReason === "runtime-changed" ? (
          <div className={sx(styles.callout, styles.calloutNeutral)}>
            <span>{agentRun.reasonDetail ?? "The task's model changed since the run started."}</span>
            <div className={sx(styles.actions)}>
              <Button
                size="xs"
                variant="secondary"
                disabled={props.busy}
                onClick={() => void onCommand("acceptRuntime", { agentRunId: agentRun.id })}
              >
                Use it for the remaining stages
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}

      {criteria.length > 0 ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label="Done when">
          <div className={sx(styles.sectionHeader)}>
            <ListChecks aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>Done when</h3>
            <span className={sx(styles.sectionAside)}>
              {criteria.filter((criterion) => criterion.status === "met").length} of {criteria.length} met
            </span>
          </div>
          <ul className={sx(styles.checkList)}>
            {criteria.map((criterion) => {
              const presentation = CRITERION_PRESENTATION[criterion.status];
              const Icon = presentation.icon;
              return (
                <li key={criterion.text} className={sx(styles.check)}>
                  <span className={sx(styles.checkMark)}>
                    <Icon aria-hidden className={sx(styles.icon, presentation.tone)} />
                  </span>
                  <span className={sx(styles.checkText)}>{criterion.text}</span>
                  <span className={sx(styles.checkState, presentation.tone)}>{presentation.label}</span>
                </li>
              );
            })}
          </ul>
          {signedOffAt ? <p className={sx(styles.checkNote)}>Signed off by you at {formatClock(signedOffAt)}</p> : null}
        </section>
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Stages">
        <div className={sx(styles.sectionHeader)}>
          <ListOrdered aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Stages</h3>
          <span className={sx(styles.sectionAside)}>{describeCheckIns(agentRun)}</span>
        </div>
        <StepRail density="compact" role="list">
          {rows.map((row) => (
            <StageCard
              key={row.stage.id}
              row={row}
              last={row.index === rows.length - 1}
              busy={props.busy}
              onShowTool={props.onShowTool}
              {...(row.current && identity
                ? {
                    onRetry: () => void onCommand("retryStage", identity),
                    onSkip: () => void onCommand("skipStage", identity),
                  }
                : {})}
            />
          ))}
        </StepRail>
      </section>

      {detail.report ? (
        <AgentRunReportView report={detail.report} actions={props.reportActions} context="panel" />
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label="Run">
        <div className={sx(styles.sectionHeader)}>
          <Gauge aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>Run</h3>
        </div>
        <AgentRunSummary agentRun={agentRun} usage={detail.usage ?? null} active={active} now={now} formatClock={formatClock} />
      </section>
    </section>
  );
}

/**
 * The agent run in the Task panel's Progress tab, with the commands that steer
 * it. Shown only for a task that has an agent run; a task without one shows its
 * flow there instead; a run starts when work is assigned to an agent.
 */
export function AgentRunPanel(props: { taskId: string; detail: AgentRunDetail }) {
  const { detail } = props;
  const runCommand = useAgentRunsStore((state) => state.runCommand);
  const refreshAgentRun = useAgentRunsStore((state) => state.refreshAgentRun);
  const agentRunId = detail.agentRun.id;
  const busy = useAgentRunsStore((state) => Boolean(state.pendingByAgentRun[agentRunId]));
  const stage = detail.agentRun.workflow.stages[detail.agentRun.currentStageIndex];
  const record = stage ? latestStageRecord(detail.stages, stage.id) : null;
  const failure = useAgentRunFailure(agentRunId, record ? agentRunStageKey(record) : null);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const reportActions = useAgentRunReportActions(detail);
  const agentActions = useAgentRunActions(detail);
  const active = isActiveAgentRunState(detail.agentRun.state);
  const now = useNow(active);
  const reducedMotion = usePrefersReducedMotion();
  // A finished agent run's report is built on request; fetch it once.
  const needsReport = !active && !detail.report;
  useEffect(() => {
    if (needsReport) void refreshAgentRun(agentRunId);
  }, [needsReport, agentRunId, refreshAgentRun]);
  return (
    <AgentRunDetailView
      detail={detail}
      now={now}
      busy={busy}
      failure={failure}
      reducedMotion={reducedMotion}
      onCommand={runCommand}
      reportActions={reportActions}
      agentActions={agentActions}
      onShowTool={(toolUseId) => focusTranscriptTool({ taskId: props.taskId, toolUseId })}
    />
  );
}
