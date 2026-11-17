import { toast } from "@/lib/notifications/toast";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: vars["--aui-space-12"], maxHeight: "50vh", overflowY: "auto" },
  row: { display: "flex", alignItems: "center", gap: vars["--aui-space-12"], justifyContent: "space-between" },
  title: { minWidth: 0, overflowWrap: "anywhere" },
  action: { flexShrink: 0 },
});

/** One startup notice for every ordinary task that needs a recovery decision. */
export function RestartContinuationNotice() {
  const { t } = useTranslation(["notifications"]);
  const tasks = useAppStore((state) => state.interruptedTasks);
  const continueTask = useAppStore((state) => state.continueInterruptedTask);
  const dismiss = useAppStore((state) => state.dismissInterruptedTasks);
  const [busy, setBusy] = useState(false);
  const resume = async (taskId?: string) => {
    setBusy(true);
    try {
      for (const task of tasks) {
        if (!taskId || task.taskId === taskId) await continueTask({ taskId: task.taskId });
      }
    } catch {
      toast.error(t("restart.failed"));
    } finally { setBusy(false); }
  };
  return <Dialog open={tasks.length > 0} onOpenChange={(open) => { if (!open && !busy) dismiss({}); }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>{t("restart.title")}</DialogTitle>
        <DialogDescription>{t("restart.description")}</DialogDescription>
      </DialogHeader>
      <div className={sx(styles.list)}>
        {tasks.map((task) => <div key={task.taskId} className={sx(styles.row)}>
          <span className={sx(styles.title)}>{task.title}</span>
          <Button xstyle={styles.action} variant="outlined" size="sm" disabled={busy} onClick={() => void resume(task.taskId)}>{t("restart.continue")}</Button>
        </div>)}
      </div>
      <DialogFooter>
        <Button variant="quiet" disabled={busy} onClick={() => dismiss({})}>{t("restart.dismiss")}</Button>
        <Button disabled={busy} onClick={() => void resume()}>{t("restart.continueAll")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
