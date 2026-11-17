import { sx } from "@/components/aui/utils/stylex";
import { conversationTurnActionsStyles as styles } from "./conversation-turn-actions.styles";
import { useEffect, useState } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Button, toast } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAppStore } from "@/store/app.store";
import { getRestoreConversationBeforeTurnPlan, restoreConversationBeforeTurn } from "@/store/turn-file-conversation";

/** The host resolves the task's worktree and makes every mutation decision. */
export function TurnFileActions(props: { taskId: string; messageId: string }) {
  useTranslation();
  const turnId = useAppStore((state) => state.messagesByTask[props.taskId]?.find((message) => message.id === props.messageId)?.turnId);
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[props.taskId]);
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRollback, setCanRollback] = useState(false);
  const [detail, setDetail] = useState("");
  if (!turnId || !workspaceId) return null;

  async function restore(rollback: boolean) {
    if (busy || running || !workspaceId || !turnId) return;
    setBusy(true);
    setDetail("");
    let filesRestored = false;
    try {
      if (rollback) {
        const plan = await getRestoreConversationBeforeTurnPlan(props);
        if (!plan.ok) { setDetail(plan.detail); return; }
      }
      const result = await window.api!.turnSnapshots!.restore({ workspaceId, taskId: props.taskId, turnId });
      if (!result.ok) { window.dispatchEvent(new Event("stave-file-restore")); setDetail(i18n.t(`session:turnFiles.${result.reason ?? "unavailable"}`)); return; }
      filesRestored = true;
      window.dispatchEvent(new Event("stave-file-restore"));
      if (rollback) {
        const conversation = await restoreConversationBeforeTurn(props);
        if (!conversation.ok) {
          setDetail(i18n.t("session:turnFiles.partial", { detail: conversation.detail }));
          return;
        }
      }
      setOpen(false);
      toast.success(i18n.t("session:turnFiles.restored"));
    } catch (error) {
      setDetail(filesRestored ? i18n.t("session:turnFiles.partial", { detail: String(error) }) : i18n.t("session:turnFiles.failed"));
    } finally { setBusy(false); }
  }

  return <>
    <Button variant="outline" size="sm" disabled={busy || running} onClick={async () => {
      setOpen(true); setDetail(""); setCanRollback(false);
      const plan = await getRestoreConversationBeforeTurnPlan(props);
      setCanRollback(plan.ok);
    }}>{i18n.t("session:turnFiles.restore")}</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{i18n.t("session:turnFiles.restore")}</DialogTitle>
          <DialogDescription>{i18n.t("session:turnFiles.description")}</DialogDescription>
        </DialogHeader>
        {detail && <p role="alert">{detail}</p>}
        <div className={sx(styles.fileChoices)}>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>{i18n.t("common:actions.cancel")}</Button>
          <Button disabled={busy || running} onClick={() => { void restore(false); }}>{i18n.t("session:turnFiles.keep")}</Button>
          {canRollback && <Button variant="destructive" disabled={busy || running} onClick={() => { void restore(true); }}>{i18n.t("session:turnFiles.rollback")}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

/** A task-level undo survives removed messages, scrolling and renderer restart. */
export function UndoFileRestore(props: { taskId: string }) {
  useTranslation();
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[props.taskId]);
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (workspaceId) void window.api?.turnSnapshots?.list({ workspaceId, taskId: props.taskId })
        .then((result) => { if (live) setAvailable(result.canUndo); }).catch(() => {});
    };
    refresh();
    window.addEventListener("stave-file-restore", refresh);
    window.addEventListener("focus", refresh);
    return () => { live = false; window.removeEventListener("stave-file-restore", refresh); window.removeEventListener("focus", refresh); };
  }, [workspaceId, props.taskId, running]);
  if (!available || !workspaceId) return null;
  return <Button variant="outline" size="sm" disabled={busy || running} onClick={async () => {
    setBusy(true);
    try {
      const result = await window.api!.turnSnapshots!.undo({ workspaceId, taskId: props.taskId });
      if (result.ok) { setAvailable(false); window.dispatchEvent(new Event("stave-file-restore")); }
      else toast.error(i18n.t(`session:turnFiles.${result.reason ?? "unavailable"}`));
    } catch { toast.error(i18n.t("session:turnFiles.failed")); }
    finally { setBusy(false); }
  }}>{i18n.t("session:turnFiles.undo")}</Button>;
}
