import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { StateIcon } from "@/components/ads/components/StateIcon";
import { type WorkState } from "@/components/ads/components/state-vocabulary";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
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
import { formatRunDuration } from "@/lib/missions/agent-run-view";
import { resultsStyles as styles } from "./results.styles";

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

const BAR_STYLE = { ready: styles.barReady, rework: styles.barRework, failed: styles.barFailed, stopped: styles.barStopped } as const;

const cost = (value: number | null) => (value === null ? "—" : formatCostUsd(value));
const ago = (iso: string, now: number) => `${formatAge(now - Date.parse(iso))} ago`;

/** Runs ended, split by outcome with the share that came out ready. */
export function OutcomeStrip({ summary }: { summary: ResultsSummary }) {
  return (
    <section className={sx(styles.strip)} aria-label="Outcomes">
      <div className={sx(styles.stripHead)}>
        <p className={sx(styles.stripTotal)}>
          {summary.ended} {summary.ended === 1 ? "run" : "runs"} ended
        </p>
        <ul className={sx(styles.counts)}>
          {RUN_OUTCOMES.map((outcome) => (
            <li key={outcome} className={sx(styles.count)}>
              <StateIcon state={OUTCOME_STATE[outcome]} />
              {summary[outcome]}
              <span className={sx(styles.countWord)}>{OUTCOME_LABEL[outcome].toLowerCase()}</span>
            </li>
          ))}
        </ul>
        <p className={sx(styles.rate)}>
          {formatReadyRate(summary.readyRate)} <span className={sx(styles.rateWord)}>ready</span>
        </p>
      </div>
      <ul className={sx(styles.bar)} aria-hidden>
        {RUN_OUTCOMES.filter((outcome) => summary[outcome] > 0).map((outcome) => (
          <li key={outcome} className={sx(styles.barSegment, BAR_STYLE[outcome])} style={{ flexGrow: summary[outcome] }} />
        ))}
      </ul>
    </section>
  );
}

/** Time and cost per ready result, and how much the runs needed you. */
export function Figures({ summary }: { summary: ResultsSummary }) {
  const figures: Array<{ label: string; value: string; note?: string }> = [
    { label: "Time to ready (median)", value: summary.medianReadyMs === null ? "—" : formatRunDuration(summary.medianReadyMs) },
    {
      label: "Cost per ready result",
      value: cost(summary.costPerReady),
      note: summary.unreportedCost > 0 ? `${summary.unreportedCost} ${summary.unreportedCost === 1 ? "run" : "runs"} not reported` : undefined,
    },
    { label: "Corrections per run", value: summary.correctionsPerRun === null ? "—" : String(summary.correctionsPerRun) },
  ];
  return (
    <dl className={sx(styles.figures)}>
      {figures.map((figure) => (
        <div key={figure.label} className={sx(styles.figure)}>
          <dt className={sx(styles.figureLabel)}>{figure.label}</dt>
          <dd className={sx(styles.figureValue)}>
            {figure.value}
            {figure.note ? <span className={sx(styles.figureNote)}> · {figure.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Why runs did not finish, most common first. */
export function Reasons({ summary }: { summary: ResultsSummary }) {
  if (summary.reasons.length === 0) return null;
  const top = summary.reasons[0]!.count;
  return (
    <section className={sx(styles.section)} aria-labelledby="results-reasons">
      <h2 id="results-reasons" className={sx(styles.sectionTitle)}>
        Why runs did not finish
      </h2>
      <ul className={sx(styles.reasons)}>
        {summary.reasons.map(({ reason, count }) => (
          <li key={reason} className={sx(styles.reason)}>
            <span>{RUN_END_REASON_LABELS[reason]}</span>
            <span className={sx(styles.reasonCount)}>{count}</span>
            <span className={sx(styles.reasonTrack)} aria-hidden>
              <span className={sx(styles.reasonFill)} style={{ display: "block", inlineSize: `${(count / top) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
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
    <Fragment>
      <tr>
        <td className={sx(styles.td, styles.tdName)}>
          <Button layout="host" variant="quiet" xstyle={styles.rowButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <Chevron aria-hidden className={sx(styles.chevron)} />
            <span className={sx(styles.rowName)} title={row.name}>
              {row.name}
            </span>
            {row.kind === "playbook" ? <span className={sx(styles.rowKind)}>playbook</span> : null}
          </Button>
        </td>
        <td className={sx(styles.td)}>{formatReadyRate(row.readyRate)}</td>
        <td className={sx(styles.td)}>{cost(row.medianCostUsd)}</td>
        <td className={sx(styles.td)}>{row.correctionsPerRun}</td>
        <td className={sx(styles.td)}>
          <span className={sx(styles.cells)} role="img" aria-label={describeLast(row.last)}>
            {row.last.map((outcome, index) => (
              <StateIcon key={index} state={OUTCOME_STATE[outcome]} size="xs" />
            ))}
          </span>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={5} className={sx(styles.runsCell)}>
            <ul className={sx(styles.runs)} aria-label={`${row.name} runs`}>
              {runs.slice(0, 10).map((run) => (
                <RunRow key={run.missionId} run={run} now={now} onOpen={onOpen} />
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** One row per agent or playbook; a row opens its recent runs, and a run opens its report. */
export function AgentTable({ insights, now, onOpen }: { insights: MissionInsights; now: number; onOpen: (run: ResultRun) => void }) {
  return (
    <section className={sx(styles.section)} aria-labelledby="results-agents">
      <h2 id="results-agents" className={sx(styles.sectionTitle)}>
        Agents
      </h2>
      <div className={sx(styles.tableFrame)}>
        <table className={sx(styles.table)}>
          <thead>
            <tr>
              <th scope="col" className={sx(styles.th, styles.thName)}>
                <VisuallyHidden>Agent or playbook</VisuallyHidden>
              </th>
              <th scope="col" className={sx(styles.th)}>Ready</th>
              <th scope="col" className={sx(styles.th)}>Median cost</th>
              <th scope="col" className={sx(styles.th)}>Corrections</th>
              <th scope="col" className={sx(styles.th)}>Last 10</th>
            </tr>
          </thead>
          <tbody>
            {insights.agents.map((row) => (
              <AgentRow key={row.key} row={row} runs={insights.runs.filter((run) => `${run.kind}:${run.name}` === row.key)} now={now} onOpen={onOpen} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
