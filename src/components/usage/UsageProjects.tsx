import { formatDateRange, formatDateTime, formatNumber, formatTokenCount } from "@/i18n/format";
import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { EmptyState } from "@/components/aui/components/EmptyState";
import { Select } from "@/components/aui/components/Select";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { WorkspaceUsageArgs, WorkspaceUsageReport } from "@/lib/providers/workspace-usage";
import { useAppStore } from "@/store/app.store";
import { COST, Cost, FigureDelta, TOKENS, Tokens } from "./UsageParts";
import { UsageInfo, NotReported } from "./UsageInfo";
import { UsageProjectDisk, useWorkspaceDiskState, type UsageDiskSources } from "./UsageProjectDisk";
import {
  buildUsageWorkspaceDirectory, groupUsageByProject, OTHER_PROJECTS_KEY, REMOVED_PROJECT_KEY, usageProjectChart,
  type UsageProject, type UsageProjectSort, type UsageProjectWorkspace,
} from "./usage-projects";
import { usageStyles as styles } from "./usage.styles";

export type WorkspaceUsageLoader = (args: WorkspaceUsageArgs) => Promise<WorkspaceUsageReport | null>;

/** Reads the Projects report from the desktop app; null outside it. */
export async function loadWorkspaceUsage(args: WorkspaceUsageArgs) {
  const read = window.api?.persistence?.workspaceUsage;
  if (!read) return null;
  const result = await read(args);
  if (!result.ok) throw new Error(result.message);
  return result.report;
}

export interface UsageProjectsSources extends UsageDiskSources {
  load?: WorkspaceUsageLoader;
  /** Projects and their workspaces, instead of the open repositories. */
  repositories?: ReadonlyArray<{ repositoryPath: string; repositoryName: string; workspaces: ReadonlyArray<{ id: string; name: string }> }>;
}

type ReadState = { status: "loading" | "unavailable" } | { status: "failed"; message: string } | { status: "ready"; report: WorkspaceUsageReport };

const SORT_OPTIONS = [
  { value: "tokens", get label() { return i18n.t("usage:projects.sortTokens"); } },
  { value: "cost", get label() { return i18n.t("usage:projects.sortCost"); } },
  { value: "recent", get label() { return i18n.t("usage:projects.sortRecent"); } },
];

/** The open repositories, read field by field so each selector returns a stored reference. */
function useOpenRepositories(override: UsageProjectsSources["repositories"]) {
  const recent = useAppStore((state) => state.recentRepositories);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const repositoryName = useAppStore((state) => state.repositoryName);
  const workspaces = useAppStore((state) => state.workspaces);
  return useMemo(() => override ?? [
    ...(repositoryPath ? [{ repositoryPath, repositoryName: repositoryName ?? repositoryPath, workspaces }] : []),
    ...recent,
  ], [override, recent, repositoryPath, repositoryName, workspaces]);
}

/**
 * Tokens and reported cost per project and workspace for the selected period,
 * with the disk its workspace folders use and what cleanup could free.
 */
export function UsageProjects(props: { args: WorkspaceUsageArgs; refreshKey: number; sources?: UsageProjectsSources; now?: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const load = props.sources?.load ?? loadWorkspaceUsage;
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const [sort, setSort] = useState<UsageProjectSort>("tokens");
  const disk = useWorkspaceDiskState(props.sources);
  const repositories = useOpenRepositories(props.sources?.repositories);
  const archived = disk.report?.rows;
  const directory = useMemo(() => buildUsageWorkspaceDirectory(repositories, archived), [repositories, archived]);

  const loadedArgs = useRef<WorkspaceUsageArgs | null>(null);
  useEffect(() => {
    let cancelled = false;
    // A periodic refresh keeps the shown report; changed filters must not show old totals.
    setState((previous) => previous.status === "ready" && loadedArgs.current === props.args ? previous : { status: "loading" });
    load(props.args).then((report) => {
      if (cancelled) return;
      loadedArgs.current = props.args;
      setState(report ? { status: "ready", report } : { status: "unavailable" });
    }, (error: unknown) => {
      if (!cancelled) setState({ status: "failed", message: error instanceof Error ? error.message : i18n.t("usage:projects.failed") });
    });
    return () => { cancelled = true; };
  }, [props.args, props.refreshKey, load]);

  const report = state.status === "ready" ? state.report : null;
  const projects = useMemo(() => report ? groupUsageByProject(report, directory, sort) : [], [report, directory, sort]);
  const usage = () => {
    if (state.status === "loading") return <p role="status" className={sx(styles.note)}>{t("usage:projects.reading")}</p>;
    if (state.status === "unavailable") return <EmptyState title={t("usage:usageView.usageHistoryIsAvailableInThe")} description={t("usage:usageView.openStaveDesktopToReadLocally")} />;
    if (state.status === "failed") return <EmptyState role="alert" tone="danger" title={t("usage:projects.failed")} description={state.message} />;
    if (!report || report.totals.turns === 0) return <EmptyState title={t("usage:usageView.noCompletedTurnsInThisSelection")} description={t("usage:usageView.chooseAnotherAccountModelOrPeriod")} />;
    return <>
      <ProjectFigures report={report} args={props.args} projects={projects} />
      <ProjectChart report={report} projects={projects} timeZone={props.args.timeZone} />
      <ProjectTable projects={projects} sort={sort} onSort={setSort} timeZone={props.args.timeZone} />
    </>;
  };
  return <div className={sx(styles.section)} data-usage-projects="">
    {usage()}
    <UsageProjectDisk state={disk} openCleanup={props.sources?.openCleanup} now={props.now} />
  </div>;
}

function ProjectFigures(props: { report: WorkspaceUsageReport; args: WorkspaceUsageArgs; projects: readonly UsageProject[] }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { totals, previousTotals } = props.report;
  const previous = props.args.previous;
  const period = previous ? formatDateRange(previous.from, new Date(Date.parse(previous.to) - 1), { month: "short", day: "numeric", timeZone: props.args.timeZone }) : "";
  const workspaces = props.report.workspaces.filter((row) => row.workspaceId !== null).length;
  const projects = props.projects.filter((project) => project.key !== REMOVED_PROJECT_KEY).length;
  return <div className={sx(styles.figures)} aria-label={t("usage:usageParts.usageTotals")}>
    <div className={sx(styles.figure)}>
      <div className={sx(styles.titleRow)}><p className={sx(styles.note)}>{t("usage:usageParts.tokensExcludingCacheReads")}</p>
        <UsageInfo title={t("usage:usageParts.tokenCountingTitle")}><p className={sx(styles.infoBody)}>{t("usage:usageView.tokenTotalsExcludeCacheReadsClaude")}</p></UsageInfo></div>
      <p className={sx(styles.value)}>{totals.measuredTurns === 0 ? t("usage:usageParts.notReported") : <Tokens value={totals.tokens} />}</p>
      <FigureDelta readings={[TOKENS]} current={totals} previous={previousTotals} period={period} />
      <p className={sx(styles.note)}>{t("usage:usageParts.ofTurnsReportedTokens", { value1: totals.measuredTurns, value2: totals.turns })}</p>
    </div>
    <div className={sx(styles.figure)}>
      <p className={sx(styles.note)}>{t("usage:usageParts.providerReportedCost")}</p>
      <p className={sx(styles.value)}><Cost value={totals.costUsd} /></p>
      <FigureDelta readings={[COST]} current={totals} previous={previousTotals} period={period} />
      <p className={sx(styles.note)}>{t("usage:projects.costNote")}</p>
    </div>
    <div className={sx(styles.figure)}>
      <p className={sx(styles.note)}>{t("usage:projects.workspacesFigure")}</p>
      <p className={sx(styles.value)}>{formatNumber(workspaces)}</p>
      <p className={sx(styles.note)}>{t("usage:projects.projectCount", { count: projects })}</p>
    </div>
  </div>;
}

const projectName = (project: Pick<UsageProject, "key" | "name">) =>
  project.key === OTHER_PROJECTS_KEY ? i18n.t("usage:projects.otherProjects")
    : project.name ?? i18n.t("usage:projects.removedGroup");

/** Daily tokens as stacked bars: the largest projects keep a color each, the rest share one. */
function ProjectChart(props: { report: WorkspaceUsageReport; projects: readonly UsageProject[]; timeZone: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const chart = useMemo(() => usageProjectChart(props.projects, props.report.days), [props.projects, props.report.days]);
  const names = new Map(chart.series.map((series) => [series.key, projectName(series)]));
  const slotOf = new Map(chart.series.map((series) => [series.key, series.slot]));
  const label = (bar: (typeof chart.bars)[number]) => bar.segments.length === 0
    ? t("usage:projects.barEmpty", { day: bar.day })
    : t("usage:projects.barLabel", { day: bar.day, tokens: formatTokenCount(bar.tokens),
      projects: bar.segments.map((segment) => t("usage:projects.projectValue", { name: names.get(segment.key) ?? "", value: formatTokenCount(segment.tokens) })).join(", ") });
  return <section className={sx(styles.section)} aria-label={t("usage:projects.chartTitle")}>
    <div className={sx(styles.stack)}>
      <h2 className={sx(styles.heading)}>{t("usage:projects.chartTitle")}</h2>
      <p className={sx(styles.note)}>{t("usage:projects.chartNote", { zone: props.timeZone })}</p>
    </div>
    {chart.max === 0 ? <p className={sx(styles.note)}>{t("usage:whole.noMeasurements", { metric: t("usage:usageParts.tokens") })}</p> : <>
      <ul className={sx(local.legend)} aria-label={t("usage:chart.legend")}>
        {chart.series.map((series) => <li key={series.key} className={sx(local.legendItem)}>
          <span aria-hidden className={sx(local.swatch, slotStyle(series.slot))} />{names.get(series.key)}
        </li>)}
      </ul>
      <div className={sx(styles.chartScroll)}>
        <div className={sx(styles.chart)} role="list" aria-label={t("usage:projects.chartLabel")} data-usage-project-chart="">
          {chart.bars.map((bar) => <div key={bar.day} role="listitem" aria-label={label(bar)} title={label(bar)} data-usage-project-bar={bar.day}
            className={sx(local.bar, bar.tokens === 0 && local.barEmpty)} style={{ height: `${Math.max(1.5, (bar.tokens / chart.max) * 100)}%` }}>
            {bar.segments.map((segment) => <span key={segment.key} aria-hidden className={sx(local.segment, slotStyle(slotOf.get(segment.key) ?? null))} style={{ flexGrow: segment.tokens }} />)}
          </div>)}
        </div>
      </div>
      <div className={sx(styles.chartEnds)}><span>{props.report.days[0]}</span>
        <span>{t("usage:messages.chartPeak", { metric: t("usage:usageParts.tokens"), value: formatTokenCount(chart.max) })}</span>
        <span>{props.report.days.at(-1)}</span></div>
    </>}
  </section>;
}

function workspaceName(workspace: UsageProjectWorkspace) {
  if (workspace.name) return workspace.name;
  return workspace.workspaceId === null ? i18n.t("usage:projects.deletedTasks") : i18n.t("usage:projects.removedWorkspace");
}

function ProjectTable(props: { projects: readonly UsageProject[]; sort: UsageProjectSort; onSort: (sort: UsageProjectSort) => void; timeZone: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const when = (value: string) => formatDateTime(value, { timeZone: props.timeZone, dateStyle: "medium", timeStyle: "short" });
  const tokens = (row: { metrics: { measuredTurns: number; tokens: number } }) => row.metrics.measuredTurns ? <Tokens value={row.metrics.tokens} /> : <NotReported />;
  return <section className={sx(styles.section)} aria-label={t("usage:projects.tableTitle")}>
    <div className={sx(local.tableHead)}>
      <h2 className={sx(styles.heading)}>{t("usage:projects.tableTitle")}</h2>
      <Select label={t("usage:projects.sortBy")} size="sm" value={props.sort} options={SORT_OPTIONS} xstyle={local.sort}
        onValueChange={(value) => { if (value) props.onSort(value as UsageProjectSort); }} />
    </div>
    <div className={sx(styles.tableScroll)}>
      <Table data-usage-project-table="">
        <TableHeader><TableRow>
          <TableHead>{t("usage:projects.columnProject")}</TableHead>
          <TableHead className={sx(styles.end)}>{t("usage:usageParts.tokens")}</TableHead>
          <TableHead className={sx(styles.end)}>{t("usage:usageParts.reportedUSD")}</TableHead>
          <TableHead>{t("usage:projects.columnLastActive")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{props.projects.map((project) => <Fragment key={project.key}>
          <TableRow data-usage-project-row={project.key}>
            <TableCell className={sx(styles.wrap, local.projectName)}>{projectName(project)}</TableCell>
            <TableCell className={sx(styles.end, local.projectName)}>{tokens(project)}</TableCell>
            <TableCell className={sx(styles.end, local.projectName)}><Cost value={project.metrics.costUsd} cell /></TableCell>
            <TableCell className={sx(styles.number, styles.note)}>{when(project.lastActiveAt)}</TableCell>
          </TableRow>
          {project.workspaces.map((workspace) => <TableRow key={`${project.key}:${workspace.key}`} data-usage-workspace-row={workspace.workspaceId ?? ""}>
            <TableCell className={sx(styles.wrap, local.workspaceName)}>{workspaceName(workspace)}</TableCell>
            <TableCell className={sx(styles.end)}>{tokens(workspace)}</TableCell>
            <TableCell className={sx(styles.end)}><Cost value={workspace.metrics.costUsd} cell /></TableCell>
            <TableCell className={sx(styles.number, styles.note)}>{when(workspace.lastActiveAt)}</TableCell>
          </TableRow>)}
        </Fragment>)}</TableBody>
      </Table>
    </div>
  </section>;
}

const SLOTS = stylex.create({
  1: { backgroundColor: vars["--aui-chart-1"] },
  2: { backgroundColor: vars["--aui-chart-2"] },
  3: { backgroundColor: vars["--aui-chart-3"] },
  4: { backgroundColor: vars["--aui-chart-4"] },
  5: { backgroundColor: vars["--aui-chart-5"] },
  6: { backgroundColor: vars["--aui-chart-6"] },
  other: { backgroundColor: vars["--aui-color-border-strong"] },
});
const slotStyle = (slot: number | null) => slot !== null && slot >= 1 && slot <= 6 ? SLOTS[slot as 1 | 2 | 3 | 4 | 5 | 6] : SLOTS.other;

const local = stylex.create({
  legend: { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: vars["--aui-space-12"], rowGap: vars["--aui-space-4"],
    margin: 0, padding: 0, listStyle: "none", fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  legendItem: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], minInlineSize: 0, overflowWrap: "anywhere" },
  swatch: { display: "inline-block", flexShrink: 0, inlineSize: vars["--aui-space-8"], blockSize: vars["--aui-space-8"], borderRadius: vars["--aui-radius-mark"] },
  /** A bar is its segments, painted bottom-up; its height is the day's share of the busiest day. */
  bar: { display: "flex", flexDirection: "column-reverse", flex: "1 0 12px", minInlineSize: 12, overflow: "hidden", borderRadius: vars["--aui-radius-mark"] },
  barEmpty: { backgroundColor: vars["--aui-color-border"] },
  segment: { flexBasis: 0, flexShrink: 0, minBlockSize: 0, inlineSize: "100%" },
  tableHead: { display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: vars["--aui-space-12"] },
  sort: { inlineSize: "auto", minInlineSize: "10rem" },
  projectName: { fontWeight: vars["--aui-font-weight-medium"] },
  workspaceName: { paddingInlineStart: vars["--aui-space-24"], color: vars["--aui-color-text-muted"] },
});
