import { formatDateTime, formatNumber } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { openWorkspaceCleanup, WORKSPACE_CLEANUP_CHANGED_EVENT } from "@/components/layout/workspace-cleanup-events";
import { formatResourceBytes } from "@/lib/performance/resource-manager";
import type { WorkspaceCleanupRow, WorkspaceDiskUsageReport } from "@/lib/workspace-cleanup-contract";
import { groupDiskByProject, reclaimableWorkspaces } from "./usage-projects";
import { usageStyles as styles } from "./usage.styles";

/** Disk is measured again at most this often while the Projects view is open; Measure again is always available. */
export const USAGE_DISK_REFRESH_MS = 5 * 60_000;
/** While folders are still being measured, their sizes are read again this often. */
export const USAGE_DISK_POLL_MS = 2_000;
/** Free up space lists this many workspaces; the cleanup dialog has the rest. */
const RECLAIMABLE_SHOWN = 5;

export interface UsageDiskSources {
  diskUsage?: (args: { refresh?: boolean }) => Promise<WorkspaceDiskUsageReport>;
  cleanupList?: () => Promise<{ rows: WorkspaceCleanupRow[] }>;
  openCleanup?: () => void;
}

type DiskStatus = "loading" | "ready" | "unavailable" | "failed";
export interface UsageDiskState {
  status: DiskStatus;
  report: WorkspaceDiskUsageReport | null;
  /** Cleanup rows, or null before the first read or when it failed. */
  cleanup: WorkspaceCleanupRow[] | null;
  cleanupFailed: boolean;
  refresh: () => void;
}

/**
 * Reads disk use when the view opens, every five minutes while the window is
 * visible, after a cleanup changes a workspace, and on Measure again (which
 * alone measures fresh folders again). The cleanup checks are read with it;
 * this view never runs a cleanup action.
 */
export function useWorkspaceDiskState(sources?: UsageDiskSources): UsageDiskState {
  const readers = useRef(sources);
  readers.current = sources;
  const [status, setStatus] = useState<DiskStatus>("loading");
  const [report, setReport] = useState<WorkspaceDiskUsageReport | null>(null);
  const [cleanup, setCleanup] = useState<WorkspaceCleanupRow[] | null>(null);
  const [cleanupFailed, setCleanupFailed] = useState(false);
  // Only the latest read of each kind may land; unmounting retires both.
  const generations = useRef({ disk: 0, cleanup: 0 });

  const readDisk = useCallback(async (refresh: boolean) => {
    const read = readers.current?.diskUsage ?? window.api?.workspaceCleanup?.diskUsage;
    const generation = ++generations.current.disk;
    if (!read) { setStatus("unavailable"); return; }
    try {
      const next = await read({ refresh });
      if (generation === generations.current.disk) { setReport(next); setStatus("ready"); }
    } catch {
      if (generation === generations.current.disk) setStatus("failed");
    }
  }, []);
  const readCleanup = useCallback(async () => {
    const list = readers.current?.cleanupList ?? window.api?.workspaceCleanup?.list;
    const generation = ++generations.current.cleanup;
    if (!list) return;
    try {
      const next = await list();
      if (generation === generations.current.cleanup) { setCleanup(next.rows); setCleanupFailed(false); }
    } catch {
      if (generation === generations.current.cleanup) setCleanupFailed(true);
    }
  }, []);
  const refresh = useCallback(() => { void readDisk(true); void readCleanup(); }, [readDisk, readCleanup]);

  useEffect(() => {
    const reread = () => { if (document.visibilityState !== "hidden") { void readDisk(false); void readCleanup(); } };
    void readDisk(false);
    void readCleanup();
    const timer = setInterval(reread, USAGE_DISK_REFRESH_MS);
    window.addEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, reread);
    const live = generations.current;
    return () => {
      clearInterval(timer);
      window.removeEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, reread);
      live.disk++;
      live.cleanup++;
    };
  }, [readDisk, readCleanup]);

  // Measurements finish one folder at a time; read again until the last one lands.
  useEffect(() => {
    if (!report?.measuring) return;
    const timer = setTimeout(() => void readDisk(false), USAGE_DISK_POLL_MS);
    return () => clearTimeout(timer);
  }, [report, readDisk]);

  return { status, report, cleanup, cleanupFailed, refresh };
}

const size = (bytes: number, atLeast: boolean) => atLeast ? `≥ ${formatResourceBytes(bytes)}` : formatResourceBytes(bytes);

/** Disk used per project and what cleanup could free, side by side. */
export function UsageProjectDisk(props: { state: UsageDiskState; openCleanup?: () => void; now?: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { state } = props;
  const report = state.report;
  const projects = useMemo(() => report ? groupDiskByProject(report) : [], [report]);
  const reclaim = useMemo(() => report && state.cleanup ? reclaimableWorkspaces(state.cleanup, report) : null, [report, state.cleanup]);
  const measuredAt = report?.rows.reduce<string | null>((latest, row) => {
    const at = row.measurement?.measuredAt ?? null;
    return at && (!latest || at > latest) ? at : latest;
  }, null) ?? null;
  const total = projects.reduce((sum, project) => sum + project.bytes, 0);
  const incomplete = projects.reduce((sum, project) => sum + project.incomplete, 0);
  const open = props.openCleanup ?? openWorkspaceCleanup;

  const disk = () => {
    if (state.status === "loading") return <p role="status" className={sx(styles.note)}>{t("usage:projects.disk.reading")}</p>;
    if (state.status === "unavailable") return <p className={sx(styles.note)}>{t("usage:projects.disk.unavailable")}</p>;
    if (state.status === "failed" && !report) return <p role="alert" className={sx(styles.note)}>{t("usage:projects.disk.failed")}</p>;
    if (!report || report.rows.length === 0) return <p className={sx(styles.note)}>{t("usage:projects.disk.empty")}</p>;
    return <>
      <p className={sx(styles.value)} data-usage-disk-total="">{size(total, incomplete > 0)}</p>
      {incomplete > 0 ? <p className={sx(styles.note)}>{t("usage:projects.disk.incomplete", { count: incomplete })}</p> : null}
      <div className={sx(styles.tableScroll)}>
        <Table data-usage-disk-table="" xstyle={local.compactTable}>
          <TableHeader><TableRow>
            <TableHead>{t("usage:projects.disk.columnProject")}</TableHead>
            <TableHead className={sx(styles.end)}>{t("usage:projects.disk.columnWorkspaces")}</TableHead>
            <TableHead className={sx(styles.end)}>{t("usage:projects.disk.columnSize")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{projects.map((project) => <TableRow key={project.key}>
            <TableCell className={sx(styles.wrap)}>{project.name}</TableCell>
            <TableCell className={sx(styles.end)}>{formatNumber(project.workspaces)}</TableCell>
            <TableCell className={sx(styles.end)}>{project.measured === 0
              ? <span className={sx(styles.note)}>{t("usage:projects.disk.notMeasured")}</span>
              : size(project.bytes, project.incomplete > 0)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
    </>;
  };

  const free = () => {
    if (state.status === "unavailable") return <p className={sx(styles.note)}>{t("usage:projects.disk.unavailable")}</p>;
    if (state.cleanupFailed && !state.cleanup) return <p role="alert" className={sx(styles.note)}>{t("usage:projects.free.failed")}</p>;
    if (!reclaim) return <p role="status" className={sx(styles.note)}>{t("usage:projects.free.reading")}</p>;
    if (reclaim.items.length === 0) return <p className={sx(styles.note)}>{t("usage:projects.free.none")}</p>;
    return <>
      <p className={sx(styles.value)} data-usage-reclaimable="">{size(reclaim.bytes, reclaim.incomplete)}</p>
      <ul className={sx(local.list)} aria-label={t("usage:projects.free.listLabel")}>
        {reclaim.items.slice(0, RECLAIMABLE_SHOWN).map((item) => <li key={`${item.row.repositoryPath}\n${item.row.id}`} className={sx(local.item)} data-usage-reclaimable-row={item.row.id}>
          <span className={sx(local.itemName)}>
            <span className={sx(local.itemTitle)}>{item.row.name}</span>
            <span className={sx(styles.note)}>{item.row.archived ? t("usage:projects.free.archivedIn", { project: item.row.repositoryName }) : item.row.repositoryName}</span>
          </span>
          <span className={sx(styles.number)}>{item.bytes === null ? t("usage:projects.free.notMeasured") : size(item.bytes, item.partial)}</span>
        </li>)}
      </ul>
      {reclaim.items.length > RECLAIMABLE_SHOWN ? <p className={sx(styles.note)}>{t("usage:projects.free.more", { count: reclaim.items.length - RECLAIMABLE_SHOWN })}</p> : null}
    </>;
  };

  return <div className={sx(styles.columns)}>
    <section className={sx(styles.section)} aria-label={t("usage:projects.disk.title")} data-usage-disk="">
      <div className={sx(local.cardHead)}>
        <div className={sx(styles.stack)}>
          <h2 className={sx(styles.heading)}>{t("usage:projects.disk.title")}</h2>
          <p className={sx(styles.note)}>{t("usage:projects.disk.description")}</p>
        </div>
        <Button variant="outlined" size="sm" disabled={state.status === "unavailable" || Boolean(report?.measuring)} onClick={state.refresh}>
          <RefreshCw aria-hidden />{t("usage:projects.disk.refresh")}
        </Button>
      </div>
      {report?.measuring ? <p role="status" className={sx(styles.note)}>{t("usage:projects.disk.measuring")}</p>
        : measuredAt ? <p className={sx(styles.note)}>{t("usage:projects.disk.measuredAt", { time: formatDateTime(measuredAt, { dateStyle: "medium", timeStyle: "short" }) })}</p> : null}
      {disk()}
    </section>
    <section className={sx(styles.section)} aria-label={t("usage:projects.free.title")} data-usage-free-space="">
      <div className={sx(local.cardHead)}>
        <div className={sx(styles.stack)}>
          <h2 className={sx(styles.heading)}>{t("usage:projects.free.title")}</h2>
          <p className={sx(styles.note)}>{t("usage:projects.free.description")}</p>
        </div>
        <Button variant="outlined" size="sm" onClick={open}>{t("usage:projects.free.review")}</Button>
      </div>
      {free()}
    </section>
  </div>;
}

const local = stylex.create({
  /** Three short columns fit a narrow surface, so this table does not keep the default minimum width. */
  compactTable: { minInlineSize: 0 },
  cardHead: { display: "flex", flexWrap: "wrap", alignItems: "start", justifyContent: "space-between", gap: vars["--aui-space-12"] },
  list: { display: "grid", margin: 0, padding: 0, listStyle: "none" },
  item: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: vars["--aui-space-12"], minInlineSize: 0,
    paddingBlock: vars["--aui-space-8"], borderBlockEndWidth: vars["--aui-border-width-hairline"], borderBlockEndStyle: "solid", borderBlockEndColor: vars["--aui-color-border"] },
  itemName: { display: "grid", gap: vars["--aui-space-4"], minInlineSize: 0 },
  itemTitle: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});
