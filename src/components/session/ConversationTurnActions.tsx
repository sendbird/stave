import { useState } from "react";
import { GitFork, LoaderCircle, Undo2 } from "lucide-react";
import { MessageAction } from "@/components/ai-elements";
import { Button, toast } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConversationTurnActionState } from "@/lib/providers/thread-actions";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

export function ConversationTurnActions(props: {
  taskId: string;
  messageId: string;
  state: ConversationTurnActionState;
  variant?: "inline" | "preview";
  className?: string;
  onRollbackDialogOpenChange?: (open: boolean) => void;
}) {
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
        toast.success("Task forked", { description: result.detail });
      } else {
        toast.error("Could not fork here", { description: result.detail });
      }
    } catch (error) {
      toast.error("Could not fork here", {
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
        toast.success("Conversation rolled back", {
          description: result.detail,
        });
      } else {
        toast.error("Could not roll back", { description: result.detail });
      }
    } catch (error) {
      toast.error("Could not roll back", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <div
        role="group"
        aria-label="Conversation history actions"
        className={cn(
          preview
            ? "grid w-full grid-cols-2 gap-1.5"
            : "ml-auto flex items-center gap-0.5",
          props.className,
        )}
      >
        <MessageAction
          label="Fork here"
          tooltip={props.state.fork.reason}
          aria-disabled={!props.state.fork.enabled || busy}
          aria-busy={pendingAction === "fork"}
          data-conversation-turn-action="fork"
          className={cn(
            preview
              ? "h-8 justify-start gap-1.5 rounded-md border border-border/70 bg-background/55 px-2 text-xs"
              : "h-7 gap-1 px-1.5 text-xs",
            (!props.state.fork.enabled || busy) &&
              "cursor-not-allowed opacity-70 hover:bg-transparent hover:text-muted-foreground hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={() => {
            void forkHere();
          }}
        >
          {pendingAction === "fork" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <GitFork className="size-3.5" />
          )}
          Fork here
        </MessageAction>
        <MessageAction
          label="Rollback to here"
          tooltip={props.state.rollback.reason}
          aria-disabled={!props.state.rollback.enabled || busy}
          aria-busy={pendingAction === "rollback"}
          data-conversation-turn-action="rollback"
          className={cn(
            preview
              ? "h-8 justify-start gap-1.5 rounded-md border border-border/70 bg-background/55 px-2 text-xs"
              : "h-7 gap-1 px-1.5 text-xs",
            preview &&
              props.state.rollback.enabled &&
              "text-destructive hover:bg-destructive/10 hover:text-destructive",
            (!props.state.rollback.enabled || busy) &&
              "cursor-not-allowed opacity-70 hover:bg-transparent hover:text-muted-foreground hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={() => {
            if (props.state.rollback.enabled && !busy) {
              setRollbackDialogOpen(true);
            }
          }}
        >
          <Undo2 className="size-3.5" />
          Rollback here
        </MessageAction>
      </div>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent showCloseButton={!busy} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Roll back to this response?</DialogTitle>
            <DialogDescription>
              Stave will remove every later message from this task. Any later
              Codex turns will also be removed from its thread. Workspace file
              changes are not reverted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setRollbackDialogOpen(false)}
            >
              Cancel
            </Button>
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
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Roll back conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
