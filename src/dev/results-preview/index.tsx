import { useLayoutEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { ActionButton } from "@/components/system/ActionButton";
import { ResultsView } from "@/components/results/ResultsView";
import { buildAgentRunFixtures } from "@/dev/agent-run-preview/agent-run-fixtures";
import { aggregateAgentRunInsights, type ResultSample, type RunEventCounts } from "@/lib/agent-runs/insights";
import { applyCustomTheme, applyThemeClass } from "@/lib/themes/apply";
import { BUILTIN_CUSTOM_THEMES } from "@/lib/themes/builtin-themes";

/*
 * Dev-only preview of the Results page: `?stavePreview=results`. Add
 * `&theme=dark` or `&theme=<built-in theme id>`, `&width=384` to narrow the
 * frame, `&state=empty|failed|loading` for the other states, `&period=7|30|90`,
 * and `&delay=<ms>` to slow every read (a period switch then shows the reload).
 */
const params = new URLSearchParams(window.location.search);

const NOW = new Date("2026-10-02T12:00:00.000Z").getTime();
const NONE: RunEventCounts = { userReplies: 0, changesRequested: 0, nudges: 0, stuckStages: 0, turnFailures: 0 };

type Kind = "ready" | "rework" | "failed" | "stopped";

/** One ended run, `daysAgo` before the preview clock. */
function run(name: string, kind: "agent" | "workflow", outcome: Kind, daysAgo: number, minutes: number, cost: number | null, patch: Partial<RunEventCounts> = {}, stopReason: ResultSample["stopReason"] = null): ResultSample {
  const endedAt = new Date(NOW - daysAgo * 86_400_000).toISOString();
  const id = `${name}-${daysAgo}-${minutes}-${outcome}`;
  return {
    agentRunId: id,
    workspaceId: "preview-workspace",
    leadTaskId: `task-${id}`,
    name,
    kind,
    providerId: cost === null ? "codex" : "claude-code",
    state: outcome === "ready" || outcome === "rework" ? "completed" : outcome === "failed" ? "stopped" : "cancelled",
    stopReason: outcome === "failed" ? (stopReason ?? "turn-cap-reached") : null,
    startedAt: new Date(NOW - daysAgo * 86_400_000 - minutes * 60_000).toISOString(),
    endedAt,
    counts: { ...NONE, ...(outcome === "rework" ? { changesRequested: 1 } : {}), ...patch },
    usage: cost === null ? null : { turns: 6, measuredTurns: 6, inputTokens: 120_000, outputTokens: 9_000, costUsd: cost },
  };
}

function samples(): ResultSample[] {
  return [
    ...[1, 2, 3, 4, 6, 8, 9, 12, 15, 20].map((day, index) => run("Reviewer", "agent", index === 4 ? "rework" : "ready", day, 9 + index, 0.28 + index * 0.01, index === 4 ? { userReplies: 2 } : {})),
    run("Reviewer", "agent", "stopped", 5, 4, 0.1),
    run("Migrator", "agent", "ready", 1, 35, 2.4, { userReplies: 3 }),
    run("Migrator", "agent", "failed", 2, 52, 3.1, { stuckStages: 1 }, "turn-cap-reached"),
    run("Migrator", "agent", "rework", 4, 41, 2.2, { userReplies: 4, nudges: 1 }),
    run("Migrator", "agent", "failed", 7, 60, 2.9, {}, "expired"),
    run("Migrator", "agent", "ready", 10, 28, 1.9),
    run("Migrator", "agent", "failed", 14, 3, null, {}, "task-unavailable"),
    run("Ship it", "workflow", "ready", 1, 22, 0.9, { nudges: 1 }),
    run("Ship it", "workflow", "ready", 3, 19, 0.8),
    run("Ship it", "workflow", "ready", 5, 24, null),
    run("Ship it", "workflow", "stopped", 6, 11, 0.4, { stuckStages: 1 }),
    run("Ship it", "workflow", "ready", 11, 17, 0.7, { userReplies: 1 }),
  ];
}

export function ResultsPreview() {
  const builtinTheme = BUILTIN_CUSTOM_THEMES.find((candidate) => candidate.id === params.get("theme")) ?? null;
  const [dark, setDark] = useState(() => params.get("theme") === "dark" || builtinTheme?.baseMode === "dark");
  useLayoutEffect(() => {
    applyThemeClass({ enabled: dark });
    applyCustomTheme({ theme: builtinTheme });
  }, [dark, builtinTheme]);
  const fixtures = useMemo(() => buildAgentRunFixtures(new Date(NOW - 3_600_000)), []);
  const state = params.get("state");
  const periodParam = params.get("period");
  const width = Number(params.get("width")) || null;
  const load = useMemo(
    () => async (days: number) => {
      const delay = Number(params.get("delay")) || 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (state === "failed") throw new Error("The run database is locked.");
      if (state === "loading") return new Promise<never>(() => {});
      const inPeriod = state === "empty" ? [] : samples().filter((sample) => Date.parse(sample.endedAt) >= NOW - days * 86_400_000);
      return aggregateAgentRunInsights(inPeriod, days);
    },
    [state],
  );
  const loadReport = useMemo(
    () => async (agentRunId: string) => (agentRunId.endsWith("failed") ? fixtures.failed.report : fixtures.ready.report),
    [fixtures],
  );
  return (
    <main className={sx(styles.page)}>
      <div className={sx(styles.bar)}>
        <strong>Results</strong>
        <ActionButton size="xs" onClick={() => setDark((value) => !value)}>
          {dark ? "Light theme" : "Dark theme"}
        </ActionButton>
      </div>
      <div className={sx(styles.frame)} style={width ? { maxInlineSize: width } : undefined}>
        <ResultsView period={periodParam === "7" || periodParam === "90" ? periodParam : "30"} load={load} loadReport={loadReport} now={NOW} onClose={() => {}} />
      </div>
    </main>
  );
}

const styles = stylex.create({
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: vars["--ads-color-canvas"],
    color: vars["--ads-color-text"],
  },
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingInline: vars["--ads-space-16"],
    paddingBlock: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-body"],
  },
  frame: { flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", inlineSize: "100%" },
});
