import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { formatTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Bot, Gauge, ListChecks, ListOrdered, ListTodo } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { StepRail } from "@/components/ads/components/StepRail";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { sx } from "@/components/ads/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState, latestStageRecord } from "@/lib/agent-runs/domain";
import { describeAgentRunResult } from "@/lib/agent-runs/agent-run-status";
import { describeRunPlan } from "@/lib/agent-runs/progress";
import { useAgentRunProgress } from "./useAgentRunProgress";
import type { StagePlan } from "@/lib/agent-runs/domain";
import { useTaskSubagents } from "@/components/session/useTaskSubagents";
import { AgentRunSubagents } from "./AgentRunSubagents";
import { projectAgentRunStages } from "@/lib/agent-runs/agent-run-view";
import { AGENT_CHECK_IN_LABELS } from "@/lib/agents/schema";
import { AgentRunDoneWhen } from "./AgentRunDoneWhen";
import { AgentRunPlan, describePlanProgress } from "./AgentRunPlan";
import { AgentRunOutcome } from "./AgentRunResultCard";
import { AgentRunReportView } from "./AgentRunReportView";
import { AgentRunSummary } from "./AgentRunSummary";
import { StageCard } from "./StageCard";
import type { AgentRunReportActions } from "./useAgentRunReportActions";
import type { AgentRunActions } from "./useAgentRunActions";
import { agentRunResultStyles } from "./agent-run-result.styles";
import { agentRunStyles as styles } from "./agent-runs.styles";

const formatClock = (iso: string) =>
  formatTime(new Date(iso), { hour: "2-digit", minute: "2-digit" });

/**
 * An agent run in the Task panel's Progress tab: the agent and its state, the
 * Done when lines, the stages and their reports when the agent has a
 * workflow, the result once it is ready, and what the run used. A one-stage
 * run shows the agent's own plan as its steps instead of a stage list. Stop, Take control and Retry stay with the run bar
 * while the run is active and with the transcript card once it ended, so the
 * tab says why without a third copy of them.
 */
export function AgentRunOverview(props: {
  detail: AgentRunDetail;
  plan?: StagePlan | null;
  now: number;
  reportActions?: AgentRunReportActions;
  actions?: AgentRunActions;
  failure?: string | null;
  /** Retry or skip the current stage of a run with a workflow. */
  onCommand?: (command: "retryStage" | "skipStage", identity: { agentRunId: string; stageId: string; attempt: number }) => unknown;
  /** Jumps from a stage's evidence to its tool call in the transcript. */
  onShowTool?: (toolCallId: string) => void;
}) {
  useTranslation();
  const { detail, now, actions = {}, onCommand } = props;
  const { agentRun } = detail;
  const result = describeAgentRunResult(detail, now);
  const { status } = result;
  const active = isActiveAgentRunState(agentRun.state);
  const met = result.doneWhen.filter((line) => line.status.startsWith("met")).length;
  // The badge names the state; the line beside it says why, or how long.
  const statusText = status.reason ?? (active ? i18n.t("agentRuns:agentRunOverview.statusText", { value1: result.duration }) : result.duration);
  const staged = agentRun.workflow.stages.length > 1;
  const rows = useMemo(() => (staged ? projectAgentRunStages(detail, new Date(now)) : null), [detail, now, staged, i18n.language]);
  const observedPlan = useAgentRunProgress(detail);
  const plan = props.plan ?? observedPlan;
  const subagents = useTaskSubagents(agentRun.leadTaskId, detail);
  // The run follows the agent's workflow: say which, so its stages are never a surprise.
  const workflowTitle = staged ? agentRun.workflow.stages.map((stage) => getStageDisplayTitle(stage)).join(" → ") : null;
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
              {workflowTitle ? i18n.t("agentRuns:agentRunOverview.agentRunOverview", { value1: workflowTitle }) : ""}
            </p>
            <h2 className={sx(styles.title)} title={agentRun.assignment}>
              {agentRun.assignment}
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
        {!staged && (plan || active) ? <p className={sx(styles.notice, styles.statusText)} title={describeRunPlan(plan)}>{describeRunPlan(plan)}</p> : null}
      </header>

      {props.failure ? (
        <p className={sx(styles.error)} role="alert">
          {props.failure}
        </p>
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:agentRunOverview.ariaLabel")}>
        <div className={sx(styles.sectionHeader)}>
          <ListChecks aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:agentRunOverview.agentRunOverview2")}</h3>
          <span className={sx(styles.sectionAside)}>{i18n.t("agentRuns:agentRunOverview.sentence1", { value1: met, value2: result.doneWhen.length })}</span>
        </div>
        <AgentRunDoneWhen lines={result.doneWhen} staveChecks={result.staveChecks} />
      </section>

      {plan ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:agentRunOverview.ariaLabel2")}>
          <div className={sx(styles.sectionHeader)}>
            <ListTodo aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:agentRunOverview.agentRunOverview5")}</h3>
            <span className={sx(styles.sectionAside)} title={i18n.t("agentRuns:agentRunOverview.title")}>
              {describePlanProgress(plan.items)}
            </span>
          </div>
          <AgentRunPlan items={plan.items} />
        </section>
      ) : null}

      <AgentRunSubagents rows={subagents} />

      {rows ? (
        <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:agentRunOverview.ariaLabel3")}>
          <div className={sx(styles.sectionHeader)}>
            <ListOrdered aria-hidden className={sx(styles.sectionIcon)} />
            <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:agentRunOverview.agentRunOverview6")}</h3>
            <span className={sx(styles.sectionAside)}>{i18n.t("agentRuns:agentRunOverview.sentence2", { value1: AGENT_CHECK_IN_LABELS[agentRun.consent.checkIns] })}</span>
          </div>
          <StepRail density="compact" role="list">
            {rows.map((row) => {
              const record = row.current && active ? latestStageRecord(detail.stages, row.stage.id) : null;
              const identity = record ? { agentRunId: agentRun.id, stageId: record.stageId, attempt: record.attempt } : null;
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
        <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:agentRunOverview.ariaLabel4")}>
          <div className={sx(agentRunResultStyles.group)}>
            <AgentRunOutcome result={result} actions={actions} />
          </div>
        </section>
      ) : null}

      {detail.report ? (
        <AgentRunReportView report={detail.report} actions={props.reportActions} context="panel" agentOrigin />
      ) : null}

      <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:agentRunOverview.ariaLabel5")}>
        <div className={sx(styles.sectionHeader)}>
          <Gauge aria-hidden className={sx(styles.sectionIcon)} />
          <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:agentRunOverview.agentRunOverview8")}</h3>
        </div>
        <AgentRunSummary
          agentRun={agentRun}
          usage={detail.usage ?? null}
          active={active}
          now={now}
          formatClock={formatClock}
        />
      </section>
    </section>
  );
}
