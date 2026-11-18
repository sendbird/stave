import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { Tooltip as AuiTooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import type { WorkspaceCleanupRow } from "@/lib/workspace-cleanup-contract";
import { refreshWorkspaceCleanupRegistry } from "@/store/workspace-cleanup-sync";
import { archivedShelfStyles as styles } from "./archived-workspace-shelf.styles";
import { createArchivedShelfRefresh } from "./archived-workspace-shelf-refresh";
import { WorkspaceArchivedHistory } from "./WorkspaceArchivedHistory";
import { WORKSPACE_CLEANUP_CHANGED_EVENT, notifyWorkspaceCleanupChanged, openWorkspaceCleanup } from "./workspace-cleanup-events";

/**
 * Footer entry for archived workspaces. It stays out of the project list and
 * renders nothing until something is archived.
 */
export function ArchivedWorkspaceShelf(props: { compact?: boolean }) {
  const { t } = useTranslation("workspace");
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const [rows, setRows] = useState<WorkspaceCleanupRow[]>([]);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<WorkspaceCleanupRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = createArchivedShelfRefresh(async () => {
      const api = window.api?.workspaceCleanup;
      return api ? api.listArchived() : [];
    }, setRows);
    const run = () => { void refresh.run(); };
    run(); window.addEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, run);
    return () => { refresh.invalidate(); window.removeEventListener(WORKSPACE_CLEANUP_CHANGED_EVENT, run); };
  }, [repositoryPath]);

  async function restore(row: WorkspaceCleanupRow) {
    setBusyId(row.id); setError("");
    try {
      const api = window.api?.workspaceCleanup;
      if (!api) throw new Error();
      const result = await api.act({ action: "restore", workspaceId: row.id, repositoryPath: row.repositoryPath });
      if (!result.ok) throw new Error();
      if (result.readOnly) { setOpen(false); setHistory(row); }
      await refreshWorkspaceCleanupRegistry();
      notifyWorkspaceCleanupChanged();
    } catch { setError(t("cleanupCenter.unavailable")); } finally { setBusyId(null); }
  }

  const historyDialog = history
    ? <WorkspaceArchivedHistory workspaceId={history.id} repositoryPath={history.repositoryPath} onClose={() => setHistory(null)} />
    : null;
  if (!rows.length) return historyDialog;
  const label = t("archivedShelf.trigger", { count: rows.length });
  return (
    <>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(""); }}>
        <AuiTooltip content={label} side={props.compact ? "right" : "top"}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={props.compact ? styles.triggerCollapsed : styles.trigger}
                aria-label={label}
                data-testid="archived-workspaces-trigger"
              />
            }
          >
            <Archive aria-hidden className={sx(props.compact ? styles.iconCollapsed : styles.icon)} />
            {props.compact ? null : <span>{rows.length}</span>}
          </PopoverTrigger>
        </AuiTooltip>
        <PopoverContent side={props.compact ? "right" : "top"} align="end" sideOffset={8} xstyle={styles.content}>
          <div className={sx(styles.header)}>
            <p className={sx(styles.title)}>{t("archivedShelf.title")}</p>
            <span className={sx(styles.count)}>{rows.length}</span>
          </div>
          <ul className={sx(styles.list)} data-testid="archived-workspaces-list">
            {rows.map((row) => {
              const meta = row.branch && row.branch !== row.name ? `${row.repositoryName} · ${row.branch}` : row.repositoryName;
              return (
                <li key={`${row.repositoryPath}:${row.id}`} className={sx(styles.row)}>
                  <span className={sx(styles.rowText)}>
                    <span className={sx(styles.name)} title={row.name}>{row.name}</span>
                    <span className={sx(styles.meta)} title={meta}>{meta}</span>
                  </span>
                  <Button size="xs" variant="ghost" disabled={busyId !== null} aria-busy={busyId === row.id} onClick={() => { void restore(row); }}>
                    {t("cleanupCenter.restore")}
                  </Button>
                </li>
              );
            })}
          </ul>
          {error ? <p role="alert" className={sx(styles.error)}>{error}</p> : null}
          <div className={sx(styles.footer)}>
            <Button size="xs" variant="ghost" xstyle={styles.manage} onClick={() => { setOpen(false); openWorkspaceCleanup(); }}>
              {t("archivedShelf.manage")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {historyDialog}
    </>
  );
}
