import { formatNumber, formatPercent, formatRelativeTime } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { StateIcon } from "@/components/ads/components/StateIcon";
import { WORK_STATE, type WorkState } from "@/components/ads/components/state-vocabulary";
import { sx } from "@/components/ads/utils/stylex";
import { RUN_END_REASON_LABELS, RUN_OUTCOMES, type AgentRunInsights, type ResultRun, type ResultsAgentRow, type ResultsSummary, type RunOutcome } from "@/lib/agent-runs/insights";
import { formatCostUsd } from "@/lib/agent-runs/usage";
import { formatRunDuration } from "@/lib/agent-runs/agent-run-status";
import { ResultsCard } from "./ResultsCard";
import { performanceMetrics } from "./results-metrics";
import { resultsBarToneStyles, resultsStyles as styles } from "./results.styles";

export const OUTCOME_STATE: Record<RunOutcome, WorkState> = {
  ready: "ready", rework: "needs-you", failed: "failed", stopped: "stopped",
};

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  get ready() { return i18n.t("compare:agentPerformance.completedWithoutChanges"); },
  get rework() { return i18n.t("compare:agentPerformance.completedAfterChanges"); },
  get failed() { return i18n.t("common:status.failed"); },
  get stopped() { return i18n.t("compare:agentPerformance.cancelled"); },
};

export function outcomeTone(outcome: RunOutcome) {
  return WORK_STATE[OUTCOME_STATE[outcome]].tone;
}

const cost = (value: number | null) => value === null ? "—" : formatCostUsd(value);

export function OutcomeStrip({ summary, days }: { summary: ResultsSummary; days: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const completed = summary.ready + summary.rework;
  return (
    <ResultsCard id="results-outcomes" title={t("compare:agentPerformance.completion")} subtitle={t("compare:agentPerformance.scope", { count: summary.ended, days })}>
      <p className={sx(styles.headline)}>
        <span className={sx(styles.headlineValue)}>{summary.ended ? formatPercent(completed / summary.ended) : "—"}</span>
        <span className={sx(styles.headlineLabel)}>{t("compare:agentPerformance.completedCount", { completed: formatNumber(completed), total: formatNumber(summary.ended) })}</span>
      </p>
      <ul className={sx(styles.bar)} aria-hidden>
        {RUN_OUTCOMES.filter((outcome) => summary[outcome] > 0).map((outcome) => (
          <li key={outcome} className={sx(styles.barSegment, resultsBarToneStyles[outcomeTone(outcome)])} style={{ flexGrow: summary[outcome] }} />
        ))}
      </ul>
      <ul className={sx(styles.legend)}>
        {RUN_OUTCOMES.map((outcome) => (
          <li key={outcome} className={sx(styles.legendRow)}>
            <StateIcon state={OUTCOME_STATE[outcome]} />
            <span>{OUTCOME_LABEL[outcome]}</span>
            <span className={sx(styles.legendValue)}>{formatNumber(summary[outcome])}</span>
          </li>
        ))}
      </ul>
      <p className={sx(styles.note)}>{t("compare:agentPerformance.completionNote")}</p>
    </ResultsCard>
  );
}

export function Figures({ insights }: { insights: AgentRunInsights }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const metrics = performanceMetrics(insights.runs);
  const figures = [
    { label: t("compare:agentPerformance.medianTime"), value: metrics.medianCompletionMs === null ? "—" : formatRunDuration(metrics.medianCompletionMs), note: t("compare:agentPerformance.timeCoverage", { count: metrics.completed }) },
    { label: t("compare:agentPerformance.reportedSpend"), value: cost(metrics.reportedSpendUsd), note: t("compare:agentPerformance.costCoverage", { reported: formatNumber(metrics.reportedCostRuns), total: formatNumber(insights.runs.length) }) },
    { label: t("compare:agentPerformance.followUps"), value: insights.summary.correctionsPerRun === null ? "—" : formatNumber(insights.summary.correctionsPerRun, { maximumFractionDigits: 1 }), note: t("compare:agentPerformance.followUpsNote") },
  ];
  return (
    <ResultsCard id="results-figures" title={t("compare:agentPerformance.timeAndCost")} subtitle={t("compare:agentPerformance.figuresPurpose")}>
      <dl className={sx(styles.figures)}>
        {figures.map((figure) => (
          <div key={figure.label} className={sx(styles.figure)}>
            <dt className={sx(styles.figureLabel)}>{figure.label}</dt>
            <dd className={sx(styles.figureValue)}>{figure.value}</dd>
            <dd className={sx(styles.figureNote)}>{figure.note}</dd>
          </div>
        ))}
      </dl>
    </ResultsCard>
  );
}

export function Reasons({ summary }: { summary: ResultsSummary }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (!summary.reasons.length) return null;
  const total = summary.reasons.reduce((sum, item) => sum + item.count, 0);
  return (
    <ResultsCard id="results-reasons" title={t("compare:agentPerformance.stopReasons")} subtitle={t("compare:agentPerformance.stopReasonsNote")}>
      <ul className={sx(styles.reasons)}>
        {summary.reasons.map(({ reason, count }) => (
          <li key={reason} className={sx(styles.reason)}>
            <span className={sx(styles.reasonLabel)}><span>{RUN_END_REASON_LABELS[reason]}</span><span>{formatNumber(count)}</span></span>
            <span className={sx(styles.track)} aria-hidden><span className={sx(styles.fill)} style={{ inlineSize: `${count / total * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </ResultsCard>
  );
}

function RunRow({ run, now, onOpen }: { run: ResultRun; now: number; onOpen: (run: ResultRun) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const word = run.reason ? RUN_END_REASON_LABELS[run.reason] : OUTCOME_LABEL[run.outcome];
  return (
    <li>
      <Button layout="host" variant="quiet" xstyle={styles.runButton} aria-label={t("compare:agentPerformance.openReport", { name: run.name, outcome: word, date: formatRelativeTime(run.endedAt, now) })} onClick={() => onOpen(run)}>
        <StateIcon state={OUTCOME_STATE[run.outcome]} />
        <span className={sx(styles.runText)}><span className={sx(styles.runTitle)}>{word}</span><span className={sx(styles.runFigure)}>{formatRelativeTime(run.endedAt, now)} · {formatRunDuration(run.durationMs)} · {cost(run.costUsd)}</span></span>
        <ChevronRight className={sx(styles.chevron)} aria-hidden />
      </Button>
    </li>
  );
}

function AgentRow({ row, runs, now, onOpen }: { row: ResultsAgentRow; runs: readonly ResultRun[]; now: number; onOpen: (run: ResultRun) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [open, setOpen] = useState(false);
  const metrics = performanceMetrics(runs);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={sx(styles.agent)}>
      <Button layout="host" variant="quiet" xstyle={styles.rowButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Chevron aria-hidden className={sx(styles.chevron)} />
        <span className={sx(styles.rowName)}>{row.name}</span>
        {row.kind === "workflow" ? <span className={sx(styles.rowKind)}>{t("compare:resultsParts.workflow")}</span> : null}
        <span className={sx(styles.rowValue)}>{t("compare:agentPerformance.runCount", { count: runs.length })}</span>
      </Button>
      <dl className={sx(styles.facts)}>
        <div className={sx(styles.fact)}><dt className={sx(styles.factLabel)}>{t("compare:agentPerformance.completion")}</dt><dd className={sx(styles.factValue)}>{metrics.completionRate === null ? "—" : formatPercent(metrics.completionRate)}</dd></div>
        <div className={sx(styles.fact)}><dt className={sx(styles.factLabel)}>{t("compare:agentPerformance.medianReportedCost")}</dt><dd className={sx(styles.factValue)}>{cost(row.medianCostUsd)}</dd></div>
        <div className={sx(styles.fact)}><dt className={sx(styles.factLabel)}>{t("compare:agentPerformance.followUps")}</dt><dd className={sx(styles.factValue)}>{formatNumber(row.correctionsPerRun, { maximumFractionDigits: 1 })}</dd></div>
      </dl>
      {open ? (
        <div className={sx(styles.recentRuns)}>
          <p className={sx(styles.note)}>{t("compare:agentPerformance.recentReports", { count: Math.min(runs.length, 10) })}</p>
          <p className={sx(styles.note)}>{t("compare:agentPerformance.costCoverage", { reported: formatNumber(metrics.reportedCostRuns), total: formatNumber(runs.length) })}</p>
          <ul className={sx(styles.runs)} aria-label={t("compare:resultsParts.runs", { value1: row.name })}>
            {runs.slice(0, 10).map((run) => <RunRow key={run.agentRunId} run={run} now={now} onOpen={onOpen} />)}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function AgentTable({ insights, now, onOpen }: { insights: AgentRunInsights; now: number; onOpen: (run: ResultRun) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <ResultsCard id="results-agents" title={t("compare:agentPerformance.byAgent")} subtitle={t("compare:agentPerformance.byAgentNote")}>
      <ul className={sx(styles.agents)}>
        {insights.agents.map((row) => <AgentRow key={row.key} row={row} runs={insights.runs.filter((run) => `${run.kind}:${run.name}` === row.key)} now={now} onOpen={onOpen} />)}
      </ul>
    </ResultsCard>
  );
}
