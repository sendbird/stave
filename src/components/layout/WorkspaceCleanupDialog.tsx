import { refreshWorkspaceCleanupRegistry } from "@/store/workspace-cleanup-sync";
import { WorkspaceArchivedHistory } from "./WorkspaceArchivedHistory";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { GroupedVirtuoso } from "react-virtuoso";
import { Button, Input } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { sx } from "@/components/aui/utils/stylex";
import { formatResourceBytes } from "@/lib/performance/resource-manager";
import type { WorkspaceCleanupActArgs, WorkspaceCleanupApi, WorkspaceCleanupResult, WorkspaceCleanupRow } from "@/lib/workspace-cleanup-contract";
import { useTranslation } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { cleanupStyles as styles } from "./workspace-cleanup-center.styles";
import { notifyWorkspaceCleanupChanged, OPEN_WORKSPACE_CLEANUP_EVENT } from "./workspace-cleanup-events";

type Snapshot = Awaited<ReturnType<WorkspaceCleanupApi["list"]>>;
const rowKey = (row: Pick<WorkspaceCleanupRow, "repositoryPath" | "id">) => `${row.repositoryPath}\n${row.id}`;
const ready = (row: WorkspaceCleanupRow) => row.blockers.length === 0;

export function WorkspaceCleanupHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_WORKSPACE_CLEANUP_EVENT, show);
    return () => window.removeEventListener(OPEN_WORKSPACE_CLEANUP_EVENT, show);
  }, []);
  useEffect(() => {
    let live = true;
    let running = false;
    let pending = false;
    const reconcile = async () => {
      pending = true;
      if (running) return;
      running = true;
      try {
        while (live && pending) {
          pending = false;
          try { await refreshWorkspaceCleanupRegistry(); if (live) notifyWorkspaceCleanupChanged(); }
          catch (error) { console.warn("[workspace-cleanup] registry refresh failed", error); }
        }
      } finally { running = false; }
    };
    const unsubscribe = window.api?.workspaceCleanup?.onChanged?.(() => { void reconcile(); });
    return () => { live = false; unsubscribe?.(); };
  }, []);
  return open ? <WorkspaceCleanupDialog open={open} onOpenChange={setOpen} /> : null;
}

export function WorkspaceCleanupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(["workspace", "common"]);
  const [history, setHistory] = useState<{ workspaceId: string; repositoryPath: string } | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<WorkspaceCleanupResult[]>([]);
  const [undo, setUndo] = useState<WorkspaceCleanupActArgs[]>([]);
  const [confirming, setConfirming] = useState<WorkspaceCleanupActArgs["action"] | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [forceDeleteBranch, setForceDeleteBranch] = useState(false);
  const anchor = useRef<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (scanDisk = false) => {
    const token = ++generation.current;
    setBusy(true);
    try {
      const api = window.api?.workspaceCleanup;
      if (!api) throw new Error();
      const next = await api.list({ scanDisk });
      if (token === generation.current) setData(next);
    } catch { if (token === generation.current) setMessage(t("cleanupCenter.unavailable")); }
    finally { if (token === generation.current) setBusy(false); }
  }, [t]);
  useEffect(() => { if (open) void refresh(); return () => { generation.current++; }; }, [open, refresh]);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: WorkspaceCleanupRow[] }>();
    for (const row of data?.rows ?? []) {
      if (!`${row.name} ${row.branch} ${row.path} ${row.repositoryName}`.toLowerCase().includes(query.toLowerCase())) continue;
      const group = map.get(row.repositoryPath) ?? { name: row.repositoryName, rows: [] };
      group.rows.push(row); map.set(row.repositoryPath, group);
    }
    return Array.from(map.entries()).map(([path, value]) => ({ path, ...value }));
  }, [data, query]);
  const rows = groups.flatMap((group) => group.rows);
  const selectedRows = (data?.rows ?? []).filter((row) => selected.has(rowKey(row)));
  const choose = (row: WorkspaceCleanupRow, event?: MouseEvent) => {
    const key = rowKey(row);
    setConfirming(null);
    setSelected((previous) => {
      const next = new Set(event?.metaKey || event?.ctrlKey || !event ? previous : []);
      if (event?.shiftKey && anchor.current) {
        const a = rows.findIndex((item) => rowKey(item) === anchor.current);
        const b = rows.findIndex((item) => rowKey(item) === key);
        for (const item of rows.slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1)) next.add(rowKey(item));
      } else if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    anchor.current = key;
  };
  const actionRows = (action: WorkspaceCleanupActArgs["action"]) => selectedRows.filter((row) => action === "restore" ? row.archived : action === "deleteBranch" ? row.branchOnly && row.branchDeletable : action === "archive" ? !row.archived && !row.branchOnly : !row.branchOnly);
  const act = async (action: WorkspaceCleanupActArgs["action"], targets: WorkspaceCleanupActArgs[] = actionRows(action).map((row) => ({ action, workspaceId: row.id, repositoryPath: row.repositoryPath, deleteBranch, forceDeleteBranch }))) => {
    setBusy(true); setConfirming(null); setResults([]);
    const finished: WorkspaceCleanupResult[] = [];
    const archived: WorkspaceCleanupActArgs[] = [];
    for (const target of targets) {
      let result: WorkspaceCleanupResult;
      try { const api = window.api?.workspaceCleanup; if (!api) throw new Error(); result = await api.act(target); }
      catch { result = { ok: false, action: target.action, workspaceId: target.workspaceId, reason: "unavailable" }; }
      finished.push(result);
      if (result.ok && result.readOnly) setHistory({ workspaceId: target.workspaceId, repositoryPath: target.repositoryPath });
      if (result.ok && target.action === "archive") archived.push({ action: "restore", workspaceId: target.workspaceId, repositoryPath: target.repositoryPath });
    }
    setResults(finished); setUndo(archived); setSelected(new Set());
    setMessage(t("cleanupCenter.summary", { done: finished.filter((r) => r.ok).length, skipped: finished.filter((r) => !r.ok).length }));
    try { await refreshWorkspaceCleanupRegistry(); } catch { setMessage(t("cleanupCenter.unavailable")); }
    notifyWorkspaceCleanupChanged();
    await refresh();
  };
  const reasonText = (reason: string): string => reason.includes(",") ? reason.split(",").map(reasonText).join(" · ") : reason.startsWith("inactive:") ? t("cleanupCenter.reasons.inactive", { count: Number(reason.split(":")[1]) }) : t(`workspace:cleanupCenter.reasons.${reason}`, { defaultValue: t("cleanupCenter.reasonUnknown") });
  const renderRow = (row: WorkspaceCleanupRow) => <div className={sx(styles.row, selected.has(rowKey(row)) && styles.selected)} data-testid={`cleanup-row-${row.id}`}>
    <Checkbox controlOnly xstyle={styles.checkbox} aria-label={t("cleanupDialog.row.select", { name: row.name })} checked={selected.has(rowKey(row))} disabled={busy} onCheckedChange={() => choose(row)} />
    <Button variant="ghost" layout="host" xstyle={styles.identity} onClick={(event) => choose(row, event)} aria-pressed={selected.has(rowKey(row))}>
      <span className={sx(styles.truncate)}>{row.name}{row.archived ? ` · ${t("cleanupCenter.archived")}` : ""}</span>
      <span className={sx(styles.muted, styles.truncate)}>{row.branch} · {row.path}</span>
      <span className={sx(styles.muted)}>{row.blockers.length ? row.blockers.map(reasonText).join(" · ") : row.reasons.length ? row.reasons.map(reasonText).join(" · ") : t("cleanupDialog.row.ready")}</span>
    </Button>
    <span className={sx(styles.size)}>{row.bytes === null ? t("cleanupDialog.row.notScanned") : formatResourceBytes(row.bytes)}</span>
  </div>;
  const actionCount = (action: WorkspaceCleanupActArgs["action"]) => actionRows(action).length;
  return <><Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent xstyle={styles.dialog}>
      <DialogHeader><DialogTitle>{t("cleanupCenter.title")}</DialogTitle><DialogDescription>{t("cleanupCenter.description")}</DialogDescription></DialogHeader>
      <div className={sx(styles.toolbar)}>
        <Input aria-label={t("cleanupDialog.search.ariaLabel")} placeholder={t("cleanupDialog.search.placeholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className={sx(styles.actions)}><Button size="sm" variant="secondary" disabled={busy} onClick={() => void refresh(true)}>{t("cleanupDialog.scanDiskUsage")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>{t("cleanupDialog.refreshChecks")}</Button></div>
      </div>
      <div className={sx(styles.toolbar)}><Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected(new Set(rows.filter(ready).map(rowKey)))}>{t("cleanupCenter.selectReady")}</Button><span className={sx(styles.muted)}>{t("cleanupDialog.selectionSummary", { selected: selectedRows.length, shown: rows.length })}</span></div>
      <div aria-label={t("cleanupDialog.resultsAriaLabel")} aria-busy={busy} className={sx(styles.list)}>
        {rows.length > 80 ? <GroupedVirtuoso groupCounts={groups.map((group) => group.rows.length)} groupContent={(index) => <div className={sx(styles.heading)}>{groups[index]?.name}</div>} itemContent={(index) => rows[index] ? renderRow(rows[index]) : null} /> : groups.map((group) => <section key={group.path}><div className={sx(styles.heading)}>{group.name}</div>{group.rows.map((row) => <div key={rowKey(row)}>{renderRow(row)}</div>)}</section>)}
        {!busy && !rows.length && <p>{t("cleanupDialog.empty")}</p>}
      </div>
      {confirming && <div role="alert" className={sx(styles.identity)}><p>{t(confirming === "archive" ? "cleanupCenter.archiveConfirm" : confirming === "delete" ? "cleanupCenter.deleteConfirm" : "cleanupCenter.branchConfirm")}</p>
        <ul>{actionRows(confirming).map((row) => <li key={rowKey(row)}>{row.name} · {row.path} · {row.branch}</li>)}</ul>
        {confirming === "delete" && actionRows("delete").every((row) => row.branchDeletable) && <Checkbox label={t("cleanupCenter.alsoDeleteBranch")} checked={deleteBranch} onCheckedChange={(value) => setDeleteBranch(Boolean(value))} />}
        {confirming === "delete" && <Checkbox label={t("cleanupCenter.forceDeleteBranch")} checked={forceDeleteBranch} onCheckedChange={(value) => { setForceDeleteBranch(Boolean(value)); if (value) setDeleteBranch(true); }} />}
        <div className={sx(styles.actions)}><Button variant="secondary" onClick={() => setConfirming(null)}>{t("common:actions.cancel")}</Button><Button variant="destructive" onClick={() => void act(confirming)}>{t("cleanupCenter.confirm")}</Button></div>
      </div>}
      <div className={sx(styles.toolbar)}>{(["archive", "delete", "deleteBranch", "restore"] as const).map((action) => <Button key={action} size="sm" variant={action === "delete" || action === "deleteBranch" ? "destructive" : "secondary"} disabled={busy || !actionCount(action)} onClick={() => { setDeleteBranch(false); setForceDeleteBranch(false); if (action === "restore") void act(action); else setConfirming(action); }}>{t(`cleanupCenter.actions.${action}`, { count: actionCount(action) })}</Button>)}</div>
      {message && <p role="status" className={sx(styles.status)}>{message}{undo.length > 0 && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("restore", undo)}>{t("cleanupCenter.undo")}</Button>}</p>}
      {results.some((result) => !result.ok) && <div className={sx(styles.recent)}>{results.filter((r) => !r.ok).map((result, index) => <p className={sx(styles.status)} key={index}>{result.workspaceId} · {reasonText(result.reason ?? "unavailable")}</p>)}</div>}
      <details><summary className={sx(styles.disclosure)}>{t("cleanupCenter.recent")}</summary><div className={sx(styles.recent)}>{data?.recent.map((item, index) => <div key={index} className={sx(styles.toolbar)}><span className={sx(styles.muted)}>{formatDate(item.at, { dateStyle: "short", timeStyle: "short" })} · {item.workspaceId} · {item.ok ? t("cleanupCenter.completed") : reasonText(item.reason ?? "unavailable")}</span>{item.ok && (item.action === "archive" || item.action === "removeWorktree") && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act("restore", [{ action: "restore", workspaceId: item.workspaceId, repositoryPath: item.repositoryPath }])}>{t("cleanupCenter.restore")}</Button>}</div>)}</div></details>
    </DialogContent>
  </Dialog>{history && <WorkspaceArchivedHistory {...history} onClose={() => setHistory(null)} />}</>;
}
