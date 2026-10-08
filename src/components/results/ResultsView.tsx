import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useEffect, useState } from "react";
import { ChartNoAxesColumn, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ads/components/Dialog";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { AgentRunReportView } from "@/components/agent-runs/AgentRunReportView";
import { Segmented } from "@/components/workflows/Segmented";
import { centerStyles } from "@/components/layout/automation-center/automation-center-view.styles";
import type { AgentRunInsights, ResultRun } from "@/lib/agent-runs/insights";
import type { AgentRunReport } from "@/lib/agent-runs/report";
import { useAppStore } from "@/store/app.store";
import { AgentTable, Figures, OutcomeStrip, Reasons } from "./ResultsParts";
import { resultsStyles as styles } from "./results.styles";

const PERIODS = [
  { value: "7", get label() { return i18n.t("compare:resultsView.daysVariant5fcc6aa0"); } },
  { value: "30", get label() { return i18n.t("compare:resultsView.daysVariantddb84c3a"); } },
  { value: "90", get label() { return i18n.t("compare:resultsView.daysVariant1b1dafc0"); } },
] as const;
type Period = (typeof PERIODS)[number]["value"];

/** Reads the results for the last `days`: null when this build has no agent runs bridge (the browser preview). */
export type ResultsLoader = (days: number) => Promise<AgentRunInsights | null>;
/** Reads one ended run's report: null when it has none. */
export type ResultReportLoader = (agentRunId: string) => Promise<AgentRunReport | null>;

async function loadResults(days: number): Promise<AgentRunInsights | null> {
  const insights = window.api?.agentRuns?.insights;
  if (!insights) return null;
  const response = await insights({ days });
  if (!response.ok || !response.insights) throw new Error(response.message || i18n.t("compare:resultsView.resultsCouldNotBeReadAdditional"));
  return response.insights;
}

async function loadReport(agentRunId: string): Promise<AgentRunReport | null> {
  const get = window.api?.agentRuns?.get;
  if (!get) return null;
  const response = await get({ agentRunId });
  if (!response.ok) throw new Error(response.message || i18n.t("compare:resultsView.theReportCouldNotBeRead"));
  return response.agentRun?.report ?? null;
}

export type ResultsState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "failed"; message: string }
  /** `reloading`: a new period or retry is being read; the shown figures are the previous ones. */
  | { status: "ready"; insights: AgentRunInsights; reloading: boolean };

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
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <EmptyState
      role="alert"
      tone="danger"
      title={t("compare:resultsView.resultsCouldNotBeRead")}
      description={props.message}
      action={{ children: t("compare:resultsView.tryAgain"), onClick: props.onRetry }}
    />
  );
}

type ReportState = { run: ResultRun } & (
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; report: AgentRunReport | null }
);

/** The ended run's report, opened from a row. */
function ReportDialog(props: { state: ReportState | null; onClose: () => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { state } = props;
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      width="lg"
      title={state ? state.run.name : t("compare:resultsView.report")}
      description={state?.run.kind === "agent" ? t("compare:resultsView.runReport") : t("compare:resultsView.runReport")}
    >
      {state?.status === "ready" && state.report ? (
        <AgentRunReportView report={state.report} agentOrigin={state.run.kind === "agent"} />
      ) : state?.status === "failed" ? (
        <p role="alert" className={sx(styles.note)}>
          {state.message}
        </p>
      ) : state?.status === "ready" ? (
        <p className={sx(styles.note)}>{t("compare:resultsView.noReportWasSavedForThis")}</p>
      ) : (
        <p role="status" className={sx(styles.note)}>
          {t("compare:resultsView.readingTheReport")}</p>
      )}
    </Dialog>
  );
}

/**
 * Agent performance: did delegating pay off, and where did you have to step
 * in? One page for ended agent runs and legacy runs over 7, 30 or 90 days.
 * Rows open the run report, so the page is a lens onto reports, not a second
 * store. `embedded` renders it as the Agents view's Performance tab: that
 * surface owns the title, close and Escape, so only range and refresh remain.
 */
export function ResultsView(props: { load?: ResultsLoader; loadReport?: ResultReportLoader; now?: number; period?: "7" | "30" | "90"; onClose?: () => void; embedded?: boolean } = {}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const storeClose = useAppStore((state) => state.closeAgents);
  const close = props.onClose ?? storeClose;
  const embedded = props.embedded ?? false;
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
        setState({ status: "failed", message: error instanceof Error && error.message ? error.message : i18n.t("compare:resultsView.resultsCouldNotBeReadAdditional") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load, period, attempt]);

  useEffect(() => {
    if (embedded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || event.altKey || event.ctrlKey || event.metaKey) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, embedded]);

  const open = (run: ResultRun) => {
    setReport({ run, status: "loading" });
    readReport(run.agentRunId).then(
      (value) => setReport((current) => (current?.run === run ? { run, status: "ready", report: value } : current)),
      (error: unknown) =>
        setReport((current) =>
          current?.run === run
            ? { run, status: "failed", message: error instanceof Error && error.message ? error.message : i18n.t("compare:resultsView.theReportCouldNotBeRead") }
            : current,
        ),
    );
  };

  const insights = state.status === "ready" ? state.insights : null;
  const renderBody = () => {
    if (state.status === "loading") {
      return (
        <p role="status" className={sx(styles.note)}>
          {i18n.t("compare:resultsView.readingRuns")}</p>
      );
    }
    if (state.status === "failed") return <ResultsFailure message={state.message} onRetry={() => setAttempt((count) => count + 1)} />;
    if (!insights) return <p className={sx(styles.note)}>{i18n.t("compare:resultsView.resultsAreAvailableInTheDesktop")}</p>;
    if (insights.summary.ended === 0) return <EmptyState variant="plain" title={t("compare:agentPerformance.emptyTitle")} description={t("compare:agentPerformance.emptyDescription")} />;
    return (
      <>
        <OutcomeStrip summary={insights.summary} days={insights.days} />
        <Figures insights={insights} />
        <Reasons summary={insights.summary} />
        <AgentTable insights={insights} now={now} onOpen={open} />
        <details className={sx(styles.definitions)}>
          <summary className={sx(styles.disclosure, focusRing.ring)}>{t("compare:agentPerformance.dataScope")}</summary>
          <p>{t("compare:agentPerformance.sampleLimit")}</p>
          <p>{t("compare:agentPerformance.eventLimit")}</p>
          <p>{t("compare:agentPerformance.costLimit")}</p>
        </details>
      </>
    );
  };

  const reading = state.status === "loading" || (state.status === "ready" && state.reloading);
  const periodControl = (
    <span className={sx(styles.toolbar)}>
      <Segmented aria-label={t("compare:resultsView.period")} size="xs" value={period} options={PERIODS} onChange={setPeriod} />
    </span>
  );
  const refresh = (
    <Button variant="ghost" size="sm" xstyle={centerStyles.iconButton} aria-label={t("compare:agentPerformance.refresh")} title={t("compare:agentPerformance.refresh")} disabled={reading} onClick={() => setAttempt((count) => count + 1)}>
      <RefreshCw className={sx(centerStyles.actionIcon)} />
    </Button>
  );

  return (
    <div className={sx(embedded ? styles.embeddedRoot : centerStyles.root)}>
      {embedded ? null : (
        <header className={sx(centerStyles.header, styles.header)}>
          <div className={sx(centerStyles.headerText, styles.headerText)}>
            <div className={sx(centerStyles.headerTitleRow)}>
              <ChartNoAxesColumn className={sx(centerStyles.headerIcon)} aria-hidden />
              <h1 className={sx(centerStyles.headerTitle)}>{t("compare:agentPerformance.title")}</h1>
            </div>
            <p className={sx(centerStyles.headerSubtitle, styles.headerSubtitle)}>{t("compare:agentPerformance.purpose")}</p>
          </div>
          <div className={sx(centerStyles.headerActions)}>
            {periodControl}
            {refresh}
            <Button variant="ghost" size="sm" xstyle={centerStyles.iconButton} aria-label={t("compare:resultsView.closeResults")} title={t("compare:resultsView.closeResults")} onClick={close}>
              <X className={sx(centerStyles.actionIcon)} />
            </Button>
          </div>
        </header>
      )}
      <div className={sx(styles.scroll)}>
        {embedded ? (
          <div className={sx(styles.embeddedControls)}>
            {periodControl}
            {refresh}
          </div>
        ) : null}
        <div
          className={sx(styles.page, embedded && styles.pageEmbedded, state.status === "ready" && state.reloading && styles.pageReloading)}
          aria-busy={reading}
        >
          {renderBody()}
        </div>
      </div>
      <ReportDialog state={report} onClose={() => setReport(null)} />
    </div>
  );
}
