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

export function WorkspaceCleanupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const projectPath = useAppStore((s) => s.projectPath);
  const projectName = useAppStore((s) => s.projectName);
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
    if (!projectPath || busyRef.current) return;
    const token = ++generation.current;
    busyRef.current = true;
    setBusy(true); setSelected(new Set()); setConfirming(false); setMessage("");
    const next = cleanupWorkspaceRows();
    setRows(next);
    try {
      for (const row of next) {
        if (token !== generation.current) return;
        const checked = await inspectCleanupWorkspace(projectPath, row);
        if (token !== generation.current) return;
        setRows((previous) => previous.map((item) => item.id === row.id ? checked : item));
      }
    } finally {
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  }, [projectPath]);

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
    if (!projectPath || busyRef.current || selectedRows.length === 0) return;
    cleanupBusyRef.current = true;
    busyRef.current = true; setBusy(true); setConfirming(false);
    const token = generation.current;
    let finished = 0;
    try {
      for (const row of selectedRows) {
        if (token !== generation.current) return;
        let result: CleanupWorkspaceRow;
        try {
          result = await cleanWorkspace(projectPath, row);
        } catch (error) {
          result = { ...row, blocker: error instanceof Error ? error.message : "Cleanup failed" };
        }
        if (token !== generation.current) return;
        if (result.result) finished += 1;
        setRows((previous) => previous.map((item) => item.id === row.id ? result : item));
      }
      setSelected(new Set());
      setMessage(`${finished} workspace(s) archived. Check each row for disk removal results.`);
    } finally {
      cleanupBusyRef.current = false;
      if (token === generation.current) { busyRef.current = false; setBusy(false); }
    }
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!cleanupBusyRef.current) onOpenChange(value); }}>
    <DialogContent xstyle={styles.dialog} showCloseButton={!cleanupBusyRef.current}>
      <DialogHeader>
        <DialogTitle>Clean up workspaces</DialogTitle>
        <DialogDescription>{projectName ?? "Current project"} · Review inactive workspaces before removing them.</DialogDescription>
      </DialogHeader>
      <div className={sx(styles.toolbar)}>
        <span className={sx(styles.muted)}>Disk usage is scanned on request. Nested symlinks are not followed.</span>
        <div className={sx(styles.actions)}>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void scan()}>Scan disk usage</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refresh()}>Refresh checks</Button>
        </div>
      </div>
      <div className={sx(styles.filters)}>
        <Input xstyle={styles.search} aria-label="Search workspaces" placeholder="Search name, branch or path" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Checkbox label="Ready to clean" checked={eligibleOnly} onCheckedChange={(checked) => setEligibleOnly(Boolean(checked))} />
        <Button variant="ghost" size="sm" onClick={() => setSort((value) => value === "activity" ? "size" : "activity")}>Sort: {sort === "activity" ? "oldest activity" : "largest size"}</Button>
      </div>
      <div className={sx(styles.toolbar)}>
        <Checkbox label={`Select ${eligibleVisible.length} checked workspaces`} disabled={busy || !eligibleVisible.length} checked={eligibleVisible.length > 0 && eligibleVisible.every((row) => selected.has(row.id))} onCheckedChange={(checked) => {
          setConfirming(false);
          setSelected((previous) => { const next = new Set(previous); for (const row of eligibleVisible) { if (checked) next.add(row.id); else next.delete(row.id); } return next; });
        }} />
        <span className={sx(styles.muted)}>{selectedRows.length} selected · {visibleRows.length} shown</span>
      </div>
      <div className={sx(styles.list)} aria-label="Workspace cleanup results" aria-busy={busy}>
        {visibleRows.length === 0 && <p className={sx(styles.muted)}>No matching workspaces.</p>}
        {visibleRows.map((row) => <div key={row.id} className={sx(styles.row)}>
          <Checkbox aria-label={`Select ${row.name}`} controlOnly disabled={busy || !eligible(row)} checked={selected.has(row.id)} onCheckedChange={(checked) => {
            setConfirming(false);
            setSelected((previous) => { const next = new Set(previous); if (checked) next.add(row.id); else next.delete(row.id); return next; });
          }} />
          <div className={sx(styles.identity)}>
            <span className={sx(styles.name)} title={row.name}>{row.name}</span>
            <span className={sx(styles.muted, styles.truncate)} title={row.path}>{row.branch || "No branch"} · {row.path}</span>
            <span className={sx(styles.muted)}>{row.result ?? (row.checked ? row.blocker ?? "Clean · ready" : row.blocker ?? "Checking…")}{row.linked ? " · linked worktree" : ""} · {row.lastActive ? `Active ${new Date(row.lastActive).toLocaleDateString()}` : "Activity unknown"}</span>
            {row.remoteStatus && <span className={sx(styles.muted)}>{row.remoteStatus}</span>}
            {!row.blocker && row.recommendation && <span className={sx(styles.muted)}>Suggested: {row.recommendation}</span>}
            {prInfo[row.id]?.pr && <span className={sx(styles.muted)}>PR #{prInfo[row.id]!.pr!.number} · {prInfo[row.id]!.pr!.state.toLowerCase()} (last checked)</span>}
          </div>
          <span className={sx(styles.value)}>{row.bytes !== null ? formatResourceBytes(row.bytes) : row.sizeError ?? "Not scanned"}</span>
        </div>)}
      </div>
      <p className={sx(styles.muted)}>Cleanup archives the workspace and removes its clean worktree. Branches and linked external files are kept. Active workspaces, running sessions and changed files are protected.</p>
      {message && <p role="status" className={sx(styles.message)}>{message}</p>}
      {confirming && <p role="alert" className={sx(styles.message)}>Remove {selectedRows.length} selected workspace(s)? Unsaved page state is lost. Each workspace will be checked again before cleanup.</p>}
      <div className={sx(styles.toolbar)}>
        <span className={sx(styles.muted)}>{busy ? "Working…" : "Checks are refreshed before cleanup."}</span>
        <div className={sx(styles.actions)}>
          <Button variant="secondary" disabled={busy && cleanupBusyRef.current} onClick={() => confirming ? setConfirming(false) : onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy || selectedRows.length === 0} onClick={() => {
            const changed = selectedRows.some((row) => workspaceCleanupBlocker(useAppStore.getState(), projectPath ?? "", row.id, row.path));
            if (changed) { setMessage("Workspace activity changed. Refresh checks before continuing."); setConfirming(false); return; }
            if (confirming) void cleanup(); else setConfirming(true);
          }}>{confirming ? "Confirm cleanup" : `Clean up selected (${selectedRows.length})`}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
