import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { RUN_LINE_CLOCK_MS, useNow } from "@/components/agent-runs/useAgentRun";
import { useNowLine } from "@/components/agent-runs/useNowLine";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isTarsResponsibilityTerminal } from "@/lib/tars/attention";
import { isTarsWorkRunning, projectTarsLiveProgress, type TarsLiveProgress } from "@/lib/tars/live-progress";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useAppStore } from "@/store/app.store";

/** How often a line about work that is not running re-reads its age. */
const IDLE_CLOCK_MS = 30_000;

/**
 * One piece of work's live progress: the run this window read, plus the
 * provider turn activity of its task (the run's lead task), which the host
 * relays for every workspace. The selector returns the stored snapshot, so an
 * unrelated task's token does not re-render the line. The clock ticks only
 * while the work has not ended, faster while it runs, so "observed 2m ago"
 * and the stale mark follow the time without any new event.
 */
export function useTarsLiveProgress(row: Pick<TarsResponsibility, "id" | "state" | "agentRunId" | "taskId">, run: AgentRunDetail | null | undefined,
  options: { recentLimit?: number } = {}): { live: TarsLiveProgress; now: number } {
  const { i18n } = useTranslation();
  const taskId = run?.agentRun.leadTaskId ?? row.taskId ?? null;
  const turnActivity = useAppStore((state) => taskId ? state.providerTurnActivityByTask[taskId] : undefined);
  const ended = isTarsResponsibilityTerminal(row);
  const now = useNow(!ended, isTarsWorkRunning(row) ? RUN_LINE_CLOCK_MS : IDLE_CLOCK_MS);
  const language = i18n.language;
  const live = useMemo(() => projectTarsLiveProgress({ row: { id: row.id, state: row.state, agentRunId: row.agentRunId }, run: run ?? undefined,
    turnActivity, now, recentLimit: options.recentLimit }),
  // Recent entries are translated sentences, so a language switch reads them again.
  [row.id, row.state, row.agentRunId, run, turnActivity, now, options.recentLimit, language]);
  // A burst of tool calls reads as steady work: each phrase holds for a moment.
  const held = useNowLine(live.activity?.text ?? null);
  return { live: held && live.activity && held !== live.activity.text ? { ...live, activity: { ...live.activity, text: held } } : live, now };
}
