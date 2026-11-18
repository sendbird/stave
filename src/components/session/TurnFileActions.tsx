import { sx } from "@/components/aui/utils/stylex";
import { conversationTurnActionsStyles as styles } from "./conversation-turn-actions.styles";
import { useState } from "react";
import { FileClock } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { transition } from "@/components/aui/recipes/transition";
import { MessageAction } from "@/components/ai-elements";
import { Button, toast } from "@/components/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAppStore } from "@/store/app.store";
import { getRestoreConversationBeforeTurnPlan, restoreConversationBeforeTurn } from "@/store/turn-file-conversation";
import { resolveTurnFileAction } from "./turn-file-action-availability";
import { TURN_FILE_RESTORE_EVENT, useTurnSnapshotCatalog, useTurnSnapshotCatalogView } from "./turn-snapshot-catalog";

const announceRestore = () => window.dispatchEvent(new Event(TURN_FILE_RESTORE_EVENT));

/** The host resolves the task's worktree and makes every mutation decision. */
export function TurnFileActions(props: { taskId: string; messageId: string; variant?: "inline" | "preview" }) {
  useTranslation();
  const turnId = useAppStore((state) => state.messagesByTask[props.taskId]?.find((message) => message.id === props.messageId)?.turnId);
  const workspaceId = useAppStore((state) => state.taskWorkspaceIdById[props.taskId]);
  const running = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const catalog = useTurnSnapshotCatalogView(workspaceId, props.taskId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRollback, setCanRollback] = useState(false);
  const [detail, setDetail] = useState("");
  const action = resolveTurnFileAction({ turnId, catalog });
  if (!workspaceId || action.kind === "none") return null;
  if (action.kind === "noSnapshot") {
    return <span className={sx(styles.noSnapshot)}>{i18n.t("session:turnFiles.noSnapshot", { reason: i18n.t(`session:turnFiles.skipReason.${action.reason}`) })}</span>;
  }

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
      if (!result.ok) { announceRestore(); setDetail(i18n.t(`session:turnFiles.${result.reason ?? "unavailable"}`)); return; }
      filesRestored = true;
      announceRestore();
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
    {/* Same shell as Fork here / Rollback here: caption text, 14px glyph, no outline. */}
    <MessageAction
      label={i18n.t("session:turnFiles.restore")}
      aria-disabled={busy || running}
      data-turn-file-action="restore"
      className={sx(
        props.variant === "preview" ? styles.actionPreview : styles.actionInline,
        (busy || running) && styles.actionDisabled,
        transition.control,
      )}
      onClick={async () => {
        if (busy || running) return;
        setOpen(true); setDetail(""); setCanRollback(false);
        const plan = await getRestoreConversationBeforeTurnPlan(props);
        setCanRollback(plan.ok);
      }}
    >
      <FileClock aria-hidden className={sx(styles.iconSm)} />
      {i18n.t("session:turnFiles.restoreShort")}
    </MessageAction>
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
  const { canUndo } = useTurnSnapshotCatalog(workspaceId, props.taskId, running);
  const [busy, setBusy] = useState(false);
  if (!canUndo || !workspaceId) return null;
  return <Button variant="outline" size="sm" disabled={busy || running} onClick={async () => {
    setBusy(true);
    try {
      const result = await window.api!.turnSnapshots!.undo({ workspaceId, taskId: props.taskId });
      announceRestore();
      if (result.ok) toast.success(i18n.t("session:turnFiles.undone"));
      else toast.error(i18n.t(`session:turnFiles.${result.reason ?? "unavailable"}`));
    } catch { toast.error(i18n.t("session:turnFiles.failed")); }
    finally { setBusy(false); }
  }}>{i18n.t("session:turnFiles.undo")}</Button>;
}
