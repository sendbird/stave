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
  type MissionInsights,
  type ResultRun,
  type ResultsAgentRow,
  type ResultsSummary,
  type RunOutcome,
} from "@/lib/missions/insights";
import { formatAge } from "@/lib/missions/mission-view";
import { formatCostUsd } from "@/lib/missions/usage";
import { formatRunDuration } from "@/lib/missions/agent-run-status";
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
  ready: "Ready",
  rework: "Rework",
  failed: "Failed",
  stopped: "Stopped",
};

/** The tone a bar segment paints: the same one its outcome's state icon wears in the legend. */
export function outcomeTone(outcome: RunOutcome) {
  return WORK_STATE[OUTCOME_STATE[outcome]].tone;
}

const cost = (value: number | null) => (value === null ? "—" : formatCostUsd(value));
const ago = (iso: string, now: number) => `${formatAge(now - Date.parse(iso))} ago`;

/** Runs ended, split by outcome with the share that came out ready. */
export function OutcomeStrip({ summary, days }: { summary: ResultsSummary; days: number }) {
  return (
    <ResultsCard id="results-outcomes" icon={ListChecks} title="Outcomes" subtitle={`ended runs · ${days} d`} meta={`n = ${summary.ended}`}>
      <p className={sx(styles.headline)}>
        <span className={sx(styles.headlineValue)}>
          {summary.ready} / {summary.ended}
        </span>
        <span className={sx(styles.accentLabel)}>ready / ended</span>
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
  const figures: Array<{ label: string; value: string; unit: string; note?: string }> = [
    { label: "Time to ready", value: summary.medianReadyMs === null ? "—" : formatRunDuration(summary.medianReadyMs), unit: "median" },
    {
      label: "Cost",
      value: cost(summary.costPerReady),
      unit: "per ready result",
      note: summary.unreportedCost > 0 ? `${summary.unreportedCost} ${summary.unreportedCost === 1 ? "run" : "runs"} not reported` : undefined,
    },
    { label: "Corrections", value: summary.correctionsPerRun === null ? "—" : String(summary.correctionsPerRun), unit: "per run" },
  ];
  return (
    <ResultsCard id="results-figures" icon={Timer} title="Figures" subtitle="ready results · medians">
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
  if (summary.reasons.length === 0) return null;
  // Each bar is that reason's share of the runs that did not finish, so equal counts do not all read as full.
  const total = summary.reasons.reduce((sum, item) => sum + item.count, 0);
  return (
    <ResultsCard id="results-reasons" icon={OctagonAlert} title="Why runs did not finish" subtitle={`unfinished runs · ${days} d`} meta={`n = ${total}`}>
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
  return `Last ${last.length}: ${parts.join(", ")}`;
}

function RunRow({ run, now, onOpen }: { run: ResultRun; now: number; onOpen: (run: ResultRun) => void }) {
  const state = OUTCOME_STATE[run.outcome];
  const word = run.reason ? RUN_END_REASON_LABELS[run.reason] : OUTCOME_LABEL[run.outcome];
  return (
    <li>
      <Button layout="host" variant="quiet" xstyle={styles.runButton} aria-label={`Open report: ${run.name}, ${word}, ${ago(run.endedAt, now)}`} onClick={() => onOpen(run)}>
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
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={sx(styles.agent)}>
      <Button layout="host" variant="quiet" xstyle={styles.rowButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Chevron aria-hidden className={sx(styles.chevron)} />
        <span className={sx(styles.rowName)} title={row.name}>
          {row.name}
        </span>
        {row.kind === "workflow" ? <span className={sx(styles.rowKind)}>workflow</span> : null}
        <span className={sx(styles.rowValue)}>{formatReadyRate(row.readyRate)}</span>
      </Button>
      <div className={sx(styles.agentBody)}>
        <span className={sx(styles.track)} aria-hidden>
          <span className={sx(styles.fill, styles.fillReady)} style={{ inlineSize: `${row.readyRate * 100}%` }} />
        </span>
        <dl className={sx(styles.facts)}>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>Median cost</dt>
            <dd className={sx(styles.factValue)}>{cost(row.medianCostUsd)}</dd>
          </div>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>Corrections</dt>
            <dd className={sx(styles.factValue)}>{row.correctionsPerRun}</dd>
          </div>
          <div className={sx(styles.fact)}>
            <dt className={sx(styles.factLabel)}>Last 10</dt>
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
        <ul className={sx(styles.runs)} aria-label={`${row.name} runs`}>
          {runs.slice(0, 10).map((run) => (
            <RunRow key={run.missionId} run={run} now={now} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** One row per agent or workflow; a row opens its recent runs, and a run opens its report. */
export function AgentTable({ insights, now, onOpen }: { insights: MissionInsights; now: number; onOpen: (run: ResultRun) => void }) {
  return (
    <ResultsCard id="results-agents" icon={Users} title="Agents" subtitle={`ready rate · last 10 · ${insights.days} d`} meta={`n = ${insights.summary.ended}`}>
      <ul className={sx(styles.agents)}>
        {insights.agents.map((row) => (
          <AgentRow key={row.key} row={row} runs={insights.runs.filter((run) => `${run.kind}:${run.name}` === row.key)} now={now} onOpen={onOpen} />
        ))}
      </ul>
    </ResultsCard>
  );
}
