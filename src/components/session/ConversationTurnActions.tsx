import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { transition } from "@/components/ads/recipes/transition";
import { GitFork, Undo2 } from "lucide-react";
import { MessageAction } from "@/components/ai-elements";
import { Button, Loader, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { ConversationTurnActionState } from "@/lib/providers/thread-actions";
import { useAppStore } from "@/store/app.store";
import { conversationTurnActionsStyles as styles } from "./conversation-turn-actions.styles";

export function ConversationTurnActions(props: {
  taskId: string;
  messageId: string;
  state: ConversationTurnActionState;
  variant?: "inline" | "preview";
  className?: string;
  onRollbackDialogOpenChange?: (open: boolean) => void;
}) {
  useTranslation();
  const [pendingAction, setPendingAction] = useState<
    "fork" | "rollback" | null
  >(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const busy = pendingAction !== null;
  const preview = props.variant === "preview";

  function setRollbackDialogOpen(open: boolean) {
    setRollbackOpen(open);
    props.onRollbackDialogOpenChange?.(open);
  }

  async function forkHere() {
    if (!props.state.fork.enabled || busy) {
      return;
    }
    setPendingAction("fork");
    try {
      const result = await useAppStore.getState().forkConversationFromMessage({
        taskId: props.taskId,
        messageId: props.messageId,
      });
      if (result.ok) {
        toast.success(i18n.t("session:conversationTurnActions.forkHere"), { description: result.detail });
      } else {
        toast.error(i18n.t("session:conversationTurnActions.forkHere2"), { description: result.detail });
      }
    } catch (error) {
      toast.error(i18n.t("session:conversationTurnActions.forkHere3"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmRollback() {
    if (!props.state.rollback.enabled || busy) {
      return;
    }
    setPendingAction("rollback");
    try {
      const result = await useAppStore
        .getState()
        .rollbackConversationToMessage({
          taskId: props.taskId,
          messageId: props.messageId,
        });
      if (result.ok) {
        setRollbackDialogOpen(false);
        toast.success(i18n.t("session:conversationTurnActions.confirmRollback"), {
          description: result.detail,
        });
      } else {
        toast.error(i18n.t("session:conversationTurnActions.confirmRollback2"), { description: result.detail });
      }
    } catch (error) {
      toast.error(i18n.t("session:conversationTurnActions.confirmRollback3"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingAction(null);
    }
  }

  const forkDisabled = !props.state.fork.enabled || busy;
  const rollbackDisabled = !props.state.rollback.enabled || busy;

  return (
    <>
      <div
        role="group"
        aria-label={i18n.t("session:conversationTurnActions.ariaLabel")}
        className={cx(
          sx(preview ? styles.groupPreview : styles.groupInline),
          props.className,
        )}
      >
        <MessageAction
          label={i18n.t("session:conversationTurnActions.label")}
          tooltip={props.state.fork.reason}
          aria-disabled={forkDisabled}
          aria-busy={pendingAction === "fork"}
          data-conversation-turn-action="fork"
          className={sx(
            preview ? styles.actionPreview : styles.actionInline,
            forkDisabled && styles.actionDisabled,
            transition.control,
          )}
          onClick={() => {
            void forkHere();
          }}
        >
          {pendingAction === "fork" ? (
            <Loader aria-hidden size="xs" variant="persist" />
          ) : (
            <GitFork className={sx(styles.iconSm)} />
          )}
          {i18n.t("session:conversationTurnActions.conversationTurnActions")}</MessageAction>
        <MessageAction
          label={i18n.t("session:conversationTurnActions.label2")}
          tooltip={props.state.rollback.reason}
          aria-disabled={rollbackDisabled}
          aria-busy={pendingAction === "rollback"}
          data-conversation-turn-action="rollback"
          className={sx(
            preview ? styles.actionPreview : styles.actionInline,
            preview && props.state.rollback.enabled && styles.rollbackPreview,
            rollbackDisabled && styles.actionDisabled,
            // `control`, not `colors`: the disabled arm moves `opacity` too.
            transition.control,
          )}
          onClick={() => {
            if (props.state.rollback.enabled && !busy) {
              setRollbackDialogOpen(true);
            }
          }}
        >
          <Undo2 className={sx(styles.iconSm)} />
          {i18n.t("session:conversationTurnActions.conversationTurnActions2")}</MessageAction>
      </div>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent showCloseButton={!busy} xstyle={styles.dialogContent}>
          <DialogHeader>
            <DialogTitle>{i18n.t("session:conversationTurnActions.conversationTurnActions3")}</DialogTitle>
            <DialogDescription>
              {i18n.t("session:conversationTurnActions.conversationTurnActions4")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setRollbackDialogOpen(false)}
            >
              {i18n.t("session:conversationTurnActions.conversationTurnActions5")}</Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                void confirmRollback();
              }}
            >
              {pendingAction === "rollback" ? (
                <Loader aria-hidden size="xs" variant="persist" />
              ) : (
                <Undo2 className={sx(styles.iconMd)} />
              )}
              {i18n.t("session:conversationTurnActions.conversationTurnActions6")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
