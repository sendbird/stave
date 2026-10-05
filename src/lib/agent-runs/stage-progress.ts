import { i18n } from "@/i18n/runtime";
/**
 * How far a run of stages has come, as one progress value: the fraction the
 * track fills, the stage boundaries it marks, the tone it takes and the words
 * assistive technology reads. The Agent run bar, the agent run bar, the Progress
 * tab and Fleet cards draw the same projection, so they agree on the number.
 *
 * Pure. The drawing lives in `src/components/agent-runs/DitherProgress.tsx`.
 */
import type { StageStatus } from "./domain";
import { STAGE_STATUS_PRESENTATION, type AgentRunStageRow, type StageTone } from "./agent-run-view";

/** A stage that is behind the run: nothing in it is left to do. */
const SETTLED: ReadonlySet<StageStatus> = new Set(["completed", "skipped"]);

export interface StageProgress {
  /** 0..1, settled stages over all stages. A running stage counts once it ends. */
  fraction: number;
  /** The fraction as a whole percent, for the label and `aria-valuenow`. */
  percent: number;
  /** Interior stage boundaries, 0..1 exclusive, one per pair of stages. */
  ticks: number[];
  current: AgentRunStageRow;
  total: number;
  tone: StageTone;
  /** "Running", "Paused", "Waiting for your sign-off". */
  statusLabel: string;
  /** "3/5", for the head of the track. */
  count: string;
  /** "Stage 3 of 5, Verify, running", for `aria-valuetext`. */
  valueText: string;
}

/**
 * Where the run stands. The track starts at zero: stages before the current
 * one are behind it, and the current one counts once it is done or skipped.
 * A blocked, stuck or cancelled stage holds the fill where it is.
 *
 * `paused` holds a running (or not yet started) current stage as waiting.
 * `tone` replaces the stage's own tone when the run as a whole ended in a
 * state its stages do not name (a stopped agent run reads as attention).
 */
export function projectStageProgress(
  rows: readonly AgentRunStageRow[],
  options: { paused?: boolean; tone?: StageTone } = {},
): StageProgress | null {
  const total = rows.length;
  if (total === 0) return null;
  const current = rows.find((row) => row.current) ?? rows[total - 1]!;
  const settled = current.index + (SETTLED.has(current.status) ? 1 : 0);
  const fraction = Math.min(1, Math.max(0, settled / total));
  const held = Boolean(options.paused) && (current.status === "running" || current.status === "pending");
  const presentation = STAGE_STATUS_PRESENTATION[current.status];
  // A current stage that has not started yet is about to: it reads as the run.
  const ownTone = held ? "waiting" : presentation.tone === "idle" ? "active" : presentation.tone;
  const statusLabel = held ? i18n.t("agentRuns:stageProgress.statusLabel") : presentation.label;
  const position = `${current.index + 1}`;
  return {
    fraction,
    percent: Math.round(fraction * 100),
    ticks: stageTicks(total),
    current,
    total,
    tone: options.tone ?? ownTone,
    statusLabel,
    count: `${position}/${total}`,
    valueText: i18n.t("agentRuns:stageProgress.valueText", { value1: position, value2: total, value3: current.stage.title, value4: statusLabel.toLowerCase() }),
  };
}

/** The boundaries between `total` equal stages: 1/total … (total-1)/total. */
export function stageTicks(total: number): number[] {
  const ticks: number[] = [];
  for (let index = 1; index < total; index += 1) ticks.push(index / total);
  return ticks;
}

/**
 * Where the head label sits: its leading edge on the fill head, so it covers
 * the stage in progress and never the work already done, held inside the
 * track at both ends. A label wider than the track starts at zero.
 */
export function clampHeadLabel(head: number, labelWidth: number, trackWidth: number): number {
  return Math.max(0, Math.min(head, trackWidth - labelWidth));
}
