import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { formatResourceBytes } from "@/lib/performance/resource-manager";
import { workspaceCleanupBlocker } from "@/lib/workspace-cleanup";
import { managerStyles as styles } from "./resource-manager.styles";
import { cleanupWorkspaceRows, inspectCleanupWorkspace, scanCleanupWorkspaceSize, cleanWorkspace, type CleanupWorkspaceRow } from "./workspace-cleanup-operations";
import { useTranslation } from "@/i18n";
import { formatDate } from "@/i18n/format";

const PR_STATE_KEYS = {
  OPEN: "workspace:cleanupDialog.prState.open",
  CLOSED: "workspace:cleanupDialog.prState.closed",
  MERGED: "workspace:cleanupDialog.prState.merged",
} as const;

export function WorkspaceCleanupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(["workspace", "common"]);
  const repositoryPath = useAppStore((s) => s.repositoryPath);
  const repositoryName = useAppStore((s) => s.repositoryName);
  const prInfo = useAppStore((s) => s.workspacePrInfoById);
  const [rows, setRows] = useState<CleanupWorkspaceRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [sort, setSort] = useState<"activity" | "size">("activity");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const busyRef = useRef(false);
  const cleanupBusyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!repositoryPath || busyRef.current) return;
    const token = ++generation.current;
    busyRef.current = true;
    setBusy(true); setSelected(new Set()); setConfirming(false); setMessage("");
    const next = cleanupWorkspaceRows();
    setRows(next);
    try {
      for (const row of next) {
        if (token !== generation.current) return;
        const checked = await inspectCleanupWorkspace(repositoryPath, row);
        if (token !== generation.current) return;
        setRows((previous) => previous.map((item) => item.id === row.id ? checked : item));
      }
    } finally {
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  }, [repositoryPath]);

  useEffect(() => {
    if (open) { busyRef.current = false; void refresh(); }
    return () => { generation.current += 1; busyRef.current = false; };
  }, [open, refresh]);

  const eligible = (row: CleanupWorkspaceRow) => row.checked && !row.blocker && !row.result;
  const visibleRows = useMemo(() => rows.filter((row) => {
    const matches = `${row.name} ${row.path} ${row.branch}`.toLowerCase().includes(query.toLowerCase());
    return matches && (!eligibleOnly || (row.checked && !row.blocker && !row.result));
  }).sort((a, b) => sort === "size" ? (b.bytes ?? -1) - (a.bytes ?? -1) : (a.lastActive ? Date.parse(a.lastActive) : Infinity) - (b.lastActive ? Date.parse(b.lastActive) : Infinity)), [rows, query, eligibleOnly, sort]);
  const selectedRows = rows.filter((row) => selected.has(row.id) && eligible(row));
  const eligibleVisible = visibleRows.filter(eligible);

  const scan = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setConfirming(false);
    const token = generation.current;
    try {
      for (const row of rows) {
        if (token !== generation.current) return;
        if (!row.path || row.result) continue;
        const scanned = await scanCleanupWorkspaceSize(row);
        if (token !== generation.current) return;
        setRows((previous) => previous.map((item) => item.id === row.id ? scanned : item));
      }
    } finally {
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  };

  const cleanup = async () => {
    if (!repositoryPath || busyRef.current || selectedRows.length === 0) return;
    cleanupBusyRef.current = true;
    busyRef.current = true; setBusy(true); setConfirming(false);
    const token = generation.current;
    let finished = 0;
    try {
      for (const row of selectedRows) {
        if (token !== generation.current) return;
        let result: CleanupWorkspaceRow;
        try {
          result = await cleanWorkspace(repositoryPath, row);
        } catch (error) {
          result = { ...row, blocker: error instanceof Error ? error.message : t("cleanupDialog.cleanupFailed") };
        }
        if (token !== generation.current) return;
        if (result.result) finished += 1;
        setRows((previous) => previous.map((item) => item.id === row.id ? result : item));
      }
      setSelected(new Set());
      setMessage(t("cleanupDialog.archivedMessage", { count: finished }));
    } finally {
      cleanupBusyRef.current = false;
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!cleanupBusyRef.current) onOpenChange(value); }}>
    <DialogContent xstyle={styles.dialog} showCloseButton={!cleanupBusyRef.current}>
      <DialogHeader>
        <DialogTitle>{t("cleanupDialog.title")}</DialogTitle>
        <DialogDescription>{t("cleanupDialog.description", { repository: repositoryName ?? t("cleanupDialog.currentRepository") })}</DialogDescription>
      </DialogHeader>
      <div className={sx(styles.toolbar)}>
        <span className={sx(styles.muted)}>{t("cleanupDialog.scanHint")}</span>
        <div className={sx(styles.actions)}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void scan()}>{t("cleanupDialog.scanDiskUsage")}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>{t("cleanupDialog.refreshChecks")}</Button>
        </div>
      </div>
      <div className={sx(styles.filters)}>
        <Input xstyle={styles.search} aria-label={t("cleanupDialog.search.ariaLabel")} placeholder={t("cleanupDialog.search.placeholder")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <Checkbox label={t("cleanupDialog.readyOnly")} checked={eligibleOnly} onCheckedChange={(checked) => setEligibleOnly(Boolean(checked))} />
        <Button variant="ghost" size="sm" onClick={() => setSort((value) => value === "activity" ? "size" : "activity")}>{sort === "activity" ? t("cleanupDialog.sort.activity") : t("cleanupDialog.sort.size")}</Button>
      </div>
      <div className={sx(styles.toolbar)}>
        <Checkbox label={t("cleanupDialog.selectChecked", { count: eligibleVisible.length })} disabled={busy || !eligibleVisible.length} checked={eligibleVisible.length > 0 && eligibleVisible.every((row) => selected.has(row.id))} onCheckedChange={(checked) => {
          setConfirming(false);
          setSelected((previous) => { const next = new Set(previous); for (const row of eligibleVisible) { if (checked) next.add(row.id); else next.delete(row.id); } return next; });
        }} />
        <span className={sx(styles.muted)}>{t("cleanupDialog.selectionSummary", { selected: selectedRows.length, shown: visibleRows.length })}</span>
      </div>
      <div className={sx(styles.list)} aria-label={t("cleanupDialog.resultsAriaLabel")} aria-busy={busy}>
        {visibleRows.length === 0 && <p className={sx(styles.muted)}>{t("cleanupDialog.empty")}</p>}
        {visibleRows.map((row) => <div key={row.id} className={sx(styles.row)}>
          <Checkbox aria-label={t("cleanupDialog.row.select", { name: row.name })} controlOnly disabled={busy || !eligible(row)} checked={selected.has(row.id)} onCheckedChange={(checked) => {
            setConfirming(false);
            setSelected((previous) => { const next = new Set(previous); if (checked) next.add(row.id); else next.delete(row.id); return next; });
          }} />
          <div className={sx(styles.identity)}>
            <span className={sx(styles.name)} title={row.name}>{row.name}</span>
            <span className={sx(styles.muted, styles.truncate)} title={row.path}>{row.branch || t("cleanupDialog.row.noBranch")} · {row.path}</span>
            <span className={sx(styles.muted)}>{row.result ?? (row.checked ? row.blocker ?? t("cleanupDialog.row.ready") : row.blocker ?? t("cleanupDialog.row.checking"))}{row.linked ? ` · ${t("cleanupDialog.row.linkedWorktree")}` : ""} · {row.lastActive ? t("cleanupDialog.row.activeOn", { date: formatDate(row.lastActive, { year: "numeric", month: "numeric", day: "numeric" }) }) : t("cleanupDialog.row.activityUnknown")}</span>
            {row.remoteStatus && <span className={sx(styles.muted)}>{row.remoteStatus}</span>}
            {!row.blocker && row.recommendation && <span className={sx(styles.muted)}>{t("cleanupDialog.row.suggested", { recommendation: row.recommendation })}</span>}
            {prInfo[row.id]?.pr && <span className={sx(styles.muted)}>{t("cleanupDialog.row.prStatus", { number: prInfo[row.id]!.pr!.number, state: t(PR_STATE_KEYS[prInfo[row.id]!.pr!.state]) })}</span>}
          </div>
          <span className={sx(styles.value)}>{row.bytes !== null ? formatResourceBytes(row.bytes) : row.sizeError ?? t("cleanupDialog.row.notScanned")}</span>
        </div>)}
      </div>
      <p className={sx(styles.muted)}>{t("cleanupDialog.footnote")}</p>
      {message && <p role="status" className={sx(styles.message)}>{message}</p>}
      {confirming && <p role="alert" className={sx(styles.message)}>{t("cleanupDialog.confirm", { count: selectedRows.length })}</p>}
      <div className={sx(styles.toolbar)}>
        <span className={sx(styles.muted)}>{busy ? t("cleanupDialog.footer.working") : t("cleanupDialog.footer.hint")}</span>
        <div className={sx(styles.actions)}>
          <Button variant="secondary" disabled={busy && cleanupBusyRef.current} onClick={() => confirming ? setConfirming(false) : onOpenChange(false)}>{t("common:actions.cancel")}</Button>
          <Button variant="destructive" disabled={busy || selectedRows.length === 0} onClick={() => {
            const changed = selectedRows.some((row) => workspaceCleanupBlocker(useAppStore.getState(), repositoryPath ?? "", row.id, row.path));
            if (changed) { setMessage(t("cleanupDialog.activityChanged")); setConfirming(false); return; }
            if (confirming) void cleanup(); else setConfirming(true);
          }}>{confirming ? t("cleanupDialog.confirmCleanup") : t("cleanupDialog.cleanUpSelected", { count: selectedRows.length })}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
