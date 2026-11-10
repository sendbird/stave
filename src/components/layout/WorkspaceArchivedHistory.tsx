import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { loadWorkspaceShell, loadAllTaskMessages } from "@/lib/db/workspaces.db";
import { createWorkspaceFromHistory } from "@/store/workspace-cleanup-sync";
import { cleanupStyles as styles } from "./workspace-cleanup-center.styles";

export function WorkspaceArchivedHistory({ workspaceId, repositoryPath, onClose }: { workspaceId: string; repositoryPath: string; onClose: () => void }) {
  const { t } = useTranslation("workspace");
  const [history, setHistory] = useState<{ id: string; title: string; messages: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const shell = await loadWorkspaceShell({ workspaceId });
      if (!shell) throw new Error();
      const tasks = await Promise.all(shell.tasks.map(async (task) => ({ id: task.id, title: task.title, messages: (await loadAllTaskMessages({ workspaceId, taskId: task.id })).map((message) => message.content) })));
      if (live) setHistory(tasks);
    })().catch(() => { if (live) setError(t("cleanupCenter.unavailable")); });
    return () => { live = false; };
  }, [workspaceId, t]);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent xstyle={styles.dialog}><DialogHeader><DialogTitle>{t("cleanupCenter.historyTitle")}</DialogTitle><DialogDescription>{t("cleanupCenter.historyDescription")}</DialogDescription></DialogHeader>
    <div className={sx(styles.list)}>{history.map((task) => <section key={task.id}><h3 className={sx(styles.heading)}>{task.title}</h3>{task.messages.map((message, index) => <p key={index} className={sx(styles.history)}>{message}</p>)}</section>)}</div>
    {error && <p role="alert">{error}</p>}
    <Button disabled={busy} onClick={async () => { setBusy(true); try { await createWorkspaceFromHistory({ workspaceId, repositoryPath }); onClose(); } catch { setError(t("cleanupCenter.unavailable")); } finally { setBusy(false); } }}>{t("cleanupCenter.createFromHistory")}</Button>
  </DialogContent></Dialog>;
}
