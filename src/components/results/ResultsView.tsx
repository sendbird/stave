import { useEffect, useState } from "react";
import { ChartNoAxesColumn, X } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ads/components/Dialog";
import { sx } from "@/components/ads/utils/stylex";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { MissionReportView } from "@/components/missions/MissionReportView";
import { Segmented } from "@/components/playbooks/Segmented";
import { centerStyles } from "@/components/layout/automation-center/automation-center-view.styles";
import type { MissionInsights, ResultRun } from "@/lib/missions/insights";
import type { MissionReport } from "@/lib/missions/report";
import { useAppStore } from "@/store/app.store";
import { AgentTable, Figures, OutcomeStrip, Reasons } from "./ResultsParts";
import { resultsStyles as styles } from "./results.styles";

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

/** Reads the results for the last `days`: null when this build has no missions bridge (the browser preview). */
export type ResultsLoader = (days: number) => Promise<MissionInsights | null>;
/** Reads one ended run's report: null when it has none. */
export type ResultReportLoader = (missionId: string) => Promise<MissionReport | null>;

async function loadResults(days: number): Promise<MissionInsights | null> {
  const insights = window.api?.missions?.insights;
  if (!insights) return null;
  const response = await insights({ days });
  if (!response.ok || !response.insights) throw new Error(response.message || "Results could not be read.");
  return response.insights;
}

async function loadReport(missionId: string): Promise<MissionReport | null> {
  const get = window.api?.missions?.get;
  if (!get) return null;
  const response = await get({ missionId });
  if (!response.ok) throw new Error(response.message || "The report could not be read.");
  return response.mission?.report ?? null;
}

export type ResultsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "failed"; message: string }
  /** `reloading`: a new period or retry is being read; the shown figures are the previous ones. */
  | { status: "ready"; insights: MissionInsights; reloading: boolean };

/**
 * The state while a read is in flight. Figures already on the page stay (a
 * period switch must not collapse four cards into "Reading runs…" and back);
 * only a page with nothing to show yet says it is reading.
 */
export function beginResultsLoad(previous: ResultsState): ResultsState {
  return previous.status === "ready" ? { ...previous, reloading: true } : { status: "loading" };
}

/** Reading the results failed: why, and a way to try again. */
export function ResultsFailure(props: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      role="alert"
      tone="danger"
      title="Results could not be read"
      description={props.message}
      action={{ children: "Try again", onClick: props.onRetry }}
    />
  );
}

type ReportState = { run: ResultRun } & (
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; report: MissionReport | null }
);

/** The ended run's report, opened from a row. */
function ReportDialog(props: { state: ReportState | null; onClose: () => void }) {
  const { state } = props;
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      width="lg"
      title={state ? state.run.name : "Report"}
      description={state?.run.kind === "agent" ? "Run report" : "Mission report"}
    >
      {state?.status === "ready" && state.report ? (
        <MissionReportView report={state.report} agentRun={state.run.kind === "agent"} />
      ) : state?.status === "failed" ? (
        <p role="alert" className={sx(styles.note)}>
          {state.message}
        </p>
      ) : state?.status === "ready" ? (
        <p className={sx(styles.note)}>No report was saved for this run.</p>
      ) : (
        <p role="status" className={sx(styles.note)}>
          Reading the report…
        </p>
      )}
    </Dialog>
  );
}

/**
 * Results: did delegating pay off, and where did you have to step in? One page
 * for ended agent runs and playbook missions over 7, 30 or 90 days. Rows open
 * the run report, so the page is a lens onto reports, not a second store.
 */
export function ResultsView(props: { load?: ResultsLoader; loadReport?: ResultReportLoader; now?: number; period?: "7" | "30" | "90"; onClose?: () => void } = {}) {
  const storeClose = useAppStore((state) => state.closeResults);
  const close = props.onClose ?? storeClose;
  const [period, setPeriod] = useState<Period>(props.period ?? "30");
  const [state, setState] = useState<ResultsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<ReportState | null>(null);
  const load = props.load ?? loadResults;
  const readReport = props.loadReport ?? loadReport;
  const now = props.now ?? Date.now();

  useEffect(() => {
    let cancelled = false;
    setState(beginResultsLoad);
    load(Number(period)).then(
      (result) => {
        if (!cancelled) setState(result ? { status: "ready", insights: result, reloading: false } : { status: "unavailable" });
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({ status: "failed", message: error instanceof Error && error.message ? error.message : "Results could not be read." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, period, attempt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || event.altKey || event.ctrlKey || event.metaKey) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const open = (run: ResultRun) => {
    setReport({ run, status: "loading" });
    readReport(run.missionId).then(
      (value) => setReport((current) => (current?.run === run ? { run, status: "ready", report: value } : current)),
      (error: unknown) =>
        setReport((current) =>
          current?.run === run
            ? { run, status: "failed", message: error instanceof Error && error.message ? error.message : "The report could not be read." }
            : current,
        ),
    );
  };

  const insights = state.status === "ready" ? state.insights : null;
  const renderBody = () => {
    if (state.status === "loading") {
      return (
        <p role="status" className={sx(styles.note)}>
          Reading runs…
        </p>
      );
    }
    if (state.status === "failed") return <ResultsFailure message={state.message} onRetry={() => setAttempt((count) => count + 1)} />;
    if (!insights) return <p className={sx(styles.note)}>Results are available in the desktop app.</p>;
    if (insights.summary.ended === 0) return <p className={sx(styles.empty)}>No run ended in the last {insights.days} days.</p>;
    return (
      <>
        <OutcomeStrip summary={insights.summary} days={insights.days} />
        <Figures summary={insights.summary} />
        <Reasons summary={insights.summary} days={insights.days} />
        <AgentTable insights={insights} now={now} onOpen={open} />
      </>
    );
  };

  return (
    <div className={sx(centerStyles.root)}>
      <header className={sx(centerStyles.header)}>
        <div className={sx(centerStyles.headerText)}>
          <div className={sx(centerStyles.headerTitleRow)}>
            <ChartNoAxesColumn className={sx(centerStyles.headerIcon)} aria-hidden />
            <h1 className={sx(centerStyles.headerTitle)}>Results</h1>
          </div>
          <p className={sx(centerStyles.headerSubtitle)}>Did delegated work come out ready, and where did you step in?</p>
        </div>
        <div className={sx(centerStyles.headerActions)}>
          <span className={sx(styles.toolbar)}>
            <Segmented aria-label="Period" size="xs" value={period} options={PERIODS} onChange={setPeriod} />
          </span>
          <Button variant="ghost" size="sm" xstyle={centerStyles.iconButton} aria-label="Close Results" title="Close Results" onClick={close}>
            <X className={sx(centerStyles.actionIcon)} />
          </Button>
        </div>
      </header>
      <div className={sx(styles.scroll)}>
        <div
          className={sx(styles.page, state.status === "ready" && state.reloading && styles.pageReloading)}
          aria-busy={state.status === "loading" || (state.status === "ready" && state.reloading)}
        >
          {renderBody()}
        </div>
      </div>
      <ReportDialog state={report} onClose={() => setReport(null)} />
    </div>
  );
}
