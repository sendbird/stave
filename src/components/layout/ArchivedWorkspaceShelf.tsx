import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import type { WorkspaceCleanupRow } from "@/lib/workspace-cleanup-contract";
import { refreshWorkspaceCleanupRegistry } from "@/store/workspace-cleanup-sync";
import { cleanupStyles as styles } from "./workspace-cleanup-center.styles";
import { WorkspaceArchivedHistory } from "./WorkspaceArchivedHistory";
import { WORKSPACE_CLEANUP_CHANGED_EVENT, notifyWorkspaceCleanupChanged } from "./workspace-cleanup-events";

export function ArchivedWorkspaceShelf() {
  const { t } = useTranslation("workspace");
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const workspaces = useAppStore((state) => state.workspaces);
  const [rows, setRows] = useState<WorkspaceCleanupRow[]>([]);
  const [history, setHistory] = useState<WorkspaceCleanupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => { void window.api?.workspaceCleanup?.list().then((data) => { if (live) setRows(data.rows.filter((row) => row.archived)); }).catch(() => {}); };
    refresh(); window.addEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, refresh);
    return () => { live = false; window.removeEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, refresh); };
  }, [repositoryPath, workspaces]);
  if (!rows.length) return null;
  return <><details className={sx(styles.shelf)}><summary>{t("cleanupCenter.archived")} ({rows.length})</summary>{rows.map((row) => <div key={`${row.repositoryPath}:${row.id}`} className={sx(styles.toolbar)}><span className={sx(styles.muted, styles.truncate)} title={row.name}>{row.repositoryName} · {row.name}</span><Button size="2xs" variant="ghost" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { const api = window.api?.workspaceCleanup; if (!api) throw new Error(); const result = await api.act({ action: "restore", workspaceId: row.id, repositoryPath: row.repositoryPath }); if (!result.ok) throw new Error(); if (result.readOnly) setHistory(row); await refreshWorkspaceCleanupRegistry(); notifyWorkspaceCleanupChanged(); }
    catch { setError(t("cleanupCenter.unavailable")); } finally { setBusy(false); }
  }}>{t("cleanupCenter.restore")}</Button></div>)}{error && <p role="alert">{error}</p>}</details>{history && <WorkspaceArchivedHistory workspaceId={history.id} repositoryPath={history.repositoryPath} onClose={() => setHistory(null)} />}</>;
}
