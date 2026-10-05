import { formatRelativeTime } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, OctagonAlert, Timer, Users } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { StateIcon } from "@/components/ads/components/StateIcon";
import { WORK_STATE, type WorkState } from "@/components/ads/components/state-vocabulary";
import { sx } from "@/components/ads/utils/stylex";
import {
  RUN_END_REASON_LABELS,
  RUN_OUTCOMES,
  formatReadyRate,
  type AgentRunInsights,
  type ResultRun,
  type ResultsAgentRow,
  type ResultsSummary,
  type RunOutcome,
} from "@/lib/agent-runs/insights";
import { formatAge } from "@/lib/agent-runs/agent-run-view";
import { formatCostUsd } from "@/lib/agent-runs/usage";
import { formatRunDuration } from "@/lib/agent-runs/agent-run-status";
import { ResultsCard } from "./ResultsCard";
import { resultsBarToneStyles, resultsStyles as styles } from "./results.styles";

/**
 * An outcome wears the shared work-state shape: a result you had to correct is
 * work that needed you, and a run Stave stopped is a failed one.
 */
export const OUTCOME_STATE: Record<RunOutcome, WorkState> = {
  ready: "ready",
  rework: "needs-you",
  failed: "failed",
  stopped: "stopped",
};

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  get ready() { return i18n.t("common:status.ready"); },
  get rework() { return i18n.t("compare:resultsParts.rework"); },
  get failed() { return i18n.t("common:status.failed"); },
  get stopped() { return i18n.t("common:status.stopped"); },
};

/** The tone a bar segment paints: the same one its outcome's state icon wears in the legend. */
export function outcomeTone(outcome: RunOutcome) {
  return WORK_STATE[OUTCOME_STATE[outcome]].tone;
}

const cost = (value: number | null) => (value === null ? "—" : formatCostUsd(value));
const ago = (iso: string, now: number) => formatRelativeTime(iso, now);

/** Runs ended, split by outcome with the share that came out ready. */
export function OutcomeStrip({ summary, days }: { summary: ResultsSummary; days: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <ResultsCard id="results-outcomes" icon={ListChecks} title={t("compare:resultsParts.outcomes")} subtitle={t("compare:resultsParts.endedRunsD", { value1: days })} meta={`n = ${summary.ended}`}>
      <p className={sx(styles.headline)}>
        <span className={sx(styles.headlineValue)}>
          {summary.ready} / {summary.ended}
        </span>
        <span className={sx(styles.accentLabel)}>{t("compare:resultsParts.readyEnded")}</span>
        <span className={sx(styles.headlineRate)}>{formatReadyRate(summary.readyRate)}</span>
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
            <span className={sx(styles.legendLabel)}>{OUTCOME_LABEL[outcome]}</span>
            <span className={sx(styles.legendValue)}>{summary[outcome]}</span>
          </li>
        ))}
      </ul>
    </ResultsCard>
  );
}

/** Time and cost per ready result, and how much the runs needed you. */
export function Figures({ summary }: { summary: ResultsSummary }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const figures: Array<{ label: string; value: string; unit: string; note?: string }> = [
    { label: t("compare:resultsParts.timeToReady"), value: summary.medianReadyMs === null ? "—" : formatRunDuration(summary.medianReadyMs), unit: t("compare:messages.median") },
    {
      label: t("compare:resultsParts.cost"),
      value: cost(summary.costPerReady),
      unit: t("compare:resultsParts.perReadyResult"),
      note: summary.unreportedCost > 0 ? t("compare:messages.unreportedRuns", { count: summary.unreportedCost }) : undefined,
    },
    { label: t("compare:resultsParts.corrections"), value: summary.correctionsPerRun === null ? "—" : String(summary.correctionsPerRun), unit: t("compare:resultsParts.perRun") },
  ];
  return (
    <ResultsCard id="results-figures" icon={Timer} title={t("compare:resultsParts.figures")} subtitle={t("compare:resultsParts.readyResultsMedians")}>
      <dl className={sx(styles.figures)}>
        {figures.map((figure) => (
          <div key={figure.label} className={sx(styles.figure)}>
            <dt className={sx(styles.figureLabel)}>{figure.label}</dt>
            <dd className={sx(styles.figureValue)}>
              {figure.value}
              <span className={sx(styles.accentLabel)}>{figure.unit}</span>
            </dd>
            {figure.note ? <dd className={sx(styles.figureNote)}>{figure.note}</dd> : null}
          </div>
        ))}
      </dl>
    </ResultsCard>
  );
}

/** Why runs did not finish, most common first. */
export function Reasons({ summary, days }: { summary: ResultsSummary; days: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (summary.reasons.length === 0) return null;
  // Each bar is that reason's share of the runs that did not finish, so equal counts do not all read as full.
  const total = summary.reasons.reduce((sum, item) => sum + item.count, 0);
  return (
    <ResultsCard id="results-reasons" icon={OctagonAlert} title={t("compare:resultsParts.whyRunsDidNotFinish")} subtitle={t("compare:resultsParts.unfinishedRunsD", { value1: days })} meta={`n = ${total}`}>
      <ul className={sx(styles.reasons)}>
        {summary.reasons.map(({ reason, count }) => (
          <li key={reason} className={sx(styles.reason)}>
            <span className={sx(styles.legendRow)}>
              <span className={sx(styles.swatch)} aria-hidden />
              <span className={sx(styles.legendLabel)}>{RUN_END_REASON_LABELS[reason]}</span>
              <span className={sx(styles.legendValue)}>{count}</span>
            </span>
            <span className={sx(styles.track)} aria-hidden>
              <span className={sx(styles.fill)} style={{ inlineSize: `${(count / total) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </ResultsCard>
  );
}

/** "Last 10: 8 ready, 1 rework, 1 failed", for the cells that carry no words. */
function describeLast(last: readonly RunOutcome[]): string {
  const parts = RUN_OUTCOMES.flatMap((outcome) => {
    const count = last.filter((candidate) => candidate === outcome).length;
    return count ? [`${count} ${OUTCOME_LABEL[outcome].toLowerCase()}`] : [];
  });
  return i18n.t("compare:resultsParts.last", { value1: last.length, value2: parts.join(", ") });
}

function RunRow({ run, now, onOpen }: { run: ResultRun; now: number; onOpen: (run: ResultRun) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const state = OUTCOME_STATE[run.outcome];
  const word = run.reason ? RUN_END_REASON_LABELS[run.reason] : OUTCOME_LABEL[run.outcome];
  return (
    <li>
      <Button layout="host" variant="quiet" xstyle={styles.runButton} aria-label={t("compare:resultsParts.openReport", { value1: run.name, value2: word, value3: ago(run.endedAt, now) })} onClick={() => onOpen(run)}>
        <StateIcon state={state} />
        <span className={sx(styles.runTitle)}>{word}</span>
        <span className={sx(styles.runFigure)}>{ago(run.endedAt, now)}</span>
        <span className={sx(styles.runFigure)}>{formatRunDuration(run.durationMs)}</span>
        <span className={sx(styles.runFigure)}>{cost(run.costUsd)}</span>
      </Button>
    </li>
  );
}

function AgentRow({
  row,
  runs,
  now,
  onOpen,
}: {
  row: ResultsAgentRow;
  runs: readonly ResultRun[];
  now: number;
  onOpen: (run: ResultRun) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={sx(styles.agent)}>
      <Button layout="host" variant="quiet" xstyle={styles.rowButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Chevron aria-hidden className={sx(styles.chevron)} />
        <span className={sx(styles.rowName)} title={row.name}>
          {row.name}
        </span>
        {row.kind === "workflow" ? <span className={sx(styles.rowKind)}>{t("compare:resultsParts.workflow")}</span> : null}
        <span className={sx(styles.rowValue)}>{formatReadyRate(row.readyRate)}</span>
      </Button>
      <div className={sx(styles.agentBody)}>
        <span className={sx(styles.track)} aria-hidden>
          <span className={sx(styles.fill, styles.fillReady)} style={{ inlineSize: `${row.readyRate * 100}%` }} />
        </span>
        <dl className={sx(styles.facts)}>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>{t("compare:resultsParts.medianCost")}</dt>
            <dd className={sx(styles.factValue)}>{cost(row.medianCostUsd)}</dd>
          </div>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>{t("compare:resultsParts.corrections")}</dt>
            <dd className={sx(styles.factValue)}>{row.correctionsPerRun}</dd>
          </div>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>{t("compare:resultsParts.lastAdditional")}</dt>
            <dd className={sx(styles.factValue)}>
              <span className={sx(styles.cells)} role="img" aria-label={describeLast(row.last)}>
                {row.last.map((outcome, index) => (
                  <StateIcon key={index} state={OUTCOME_STATE[outcome]} size="xs" />
                ))}
              </span>
            </dd>
          </div>
        </dl>
      </div>
      {open ? (
        <ul className={sx(styles.runs)} aria-label={t("compare:resultsParts.runs", { value1: row.name })}>
          {runs.slice(0, 10).map((run) => (
            <RunRow key={run.agentRunId} run={run} now={now} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** One row per agent or workflow; a row opens its recent runs, and a run opens its report. */
export function AgentTable({ insights, now, onOpen }: { insights: AgentRunInsights; now: number; onOpen: (run: ResultRun) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <ResultsCard id="results-agents" icon={Users} title={t("settings:developerSection.claudeRuntime.agents")} subtitle={t("compare:resultsParts.readyRateLastD", { value1: insights.days })} meta={`n = ${insights.summary.ended}`}>
      <ul className={sx(styles.agents)}>
        {insights.agents.map((row) => (
          <AgentRow key={row.key} row={row} runs={insights.runs.filter((run) => `${run.kind}:${run.name}` === row.key)} now={now} onOpen={onOpen} />
        ))}
      </ul>
    </ResultsCard>
  );
}
