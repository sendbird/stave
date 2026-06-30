/**
 * RefContextMenu — right-click menu for a git ref badge (branch / remote / tag).
 *
 * Mirrors the same virtual-anchor + DropdownMenu + ConfirmDialog/NameInputDialog
 * primitives used by CommitContextMenu.  The caller opens it by passing a
 * non-null `anchor` prop and closes it by clearing it.
 *
 * Worktree guard: Checkout and Delete are disabled (with a tooltip reason) when
 * `isBranchAttachedElsewhere` returns true — the branch is checked out in
 * another worktree and the operation would be unsafe.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  GitBranch,
  GitMerge,
  Pencil,
  Trash2,
  Upload,
  Download,
  ChevronsUp,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isBranchAttachedElsewhere } from "@/lib/source-control-worktrees";
import type { GraphRef } from "@/lib/git-graph/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefContextMenuAnchor {
  x: number;
  y: number;
  ref: GraphRef;
}

export interface RefContextMenuProps {
  anchor: RefContextMenuAnchor | null;
  onClose: () => void;
  /** Current branch name reported by listBranches */
  currentBranch: string;
  /** worktreePathByBranch map from listBranches */
  worktreePathByBranch: Record<string, string>;
  /** cwd of the current workspace — used as the workspacePath for the worktree guard */
  workspacePath: string | undefined;
  onCheckout: (ref: GraphRef) => Promise<void>;
  onRename: (ref: GraphRef, newName: string) => Promise<void>;
  onDelete: (ref: GraphRef, force: boolean) => Promise<void>;
  onMergeInto: (ref: GraphRef) => Promise<void>;
  onRebaseOnto: (ref: GraphRef) => Promise<void>;
  onPush: (ref: GraphRef, force: boolean) => Promise<void>;
  onPull: (ref: GraphRef) => Promise<void>;
  onCopyName: (ref: GraphRef) => void;
}

// ---------------------------------------------------------------------------
// Shared ConfirmDialog (same API as CommitContextMenu's version)
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          {destructive ? (
            <div className="mb-1 flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              <DialogTitle className="text-destructive">{title}</DialogTitle>
            </div>
          ) : (
            <DialogTitle>{title}</DialogTitle>
          )}
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="sm"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Shared NameInputDialog
// ---------------------------------------------------------------------------

interface NameInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
}

function NameInputDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  initialValue = "",
  confirmLabel,
  onConfirm,
}: NameInputDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onOpenChange(false);
          }}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!value.trim()} onClick={handleSubmit}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// RefContextMenu
// ---------------------------------------------------------------------------

type PendingDialog =
  | { kind: "rename" }
  | { kind: "delete" }
  | { kind: "merge" }
  | { kind: "rebase" }
  | { kind: "push" }
  | { kind: "forcePush" }
  | null;

export function RefContextMenu({
  anchor,
  onClose,
  currentBranch,
  worktreePathByBranch,
  workspacePath,
  onCheckout,
  onRename,
  onDelete,
  onMergeInto,
  onRebaseOnto,
  onPush,
  onPull,
  onCopyName,
}: RefContextMenuProps) {
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);

  // Snapshot ref at open time so dialogs retain data after anchor clears
  const [snapshot, setSnapshot] = useState<RefContextMenuAnchor | null>(null);
  useEffect(() => {
    if (anchor) setSnapshot(anchor);
  }, [anchor]);

  const ref = snapshot?.ref ?? null;
  const refName = ref?.name ?? "";
  const refType = ref?.type ?? "localBranch";

  // Worktree guard — only relevant for local branches
  const attachedElsewhere =
    refType === "localBranch" &&
    isBranchAttachedElsewhere({
      branch: refName,
      workspacePath,
      worktreePathByBranch,
    });

  const worktreeTooltip = attachedElsewhere
    ? `"${refName}" is checked out in another worktree`
    : undefined;

  // Whether this ref IS the current HEAD branch
  const isCurrentBranch = refType === "localBranch" && refName === currentBranch;

  return (
    <>
      {/* Virtual trigger anchored to mouse position */}
      <DropdownMenu
        open={anchor !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DropdownMenuTrigger asChild>
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              top: anchor?.y ?? 0,
              left: anchor?.x ?? 0,
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-60"
          align="start"
          side="bottom"
          sideOffset={0}
          alignOffset={0}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header label */}
          <DropdownMenuLabel className="font-mono text-xs text-muted-foreground truncate">
            {refType === "remoteBranch" ? "remote: " : refType === "tag" ? "tag: " : ""}
            {refName}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* ---- localBranch actions ---- */}
          {refType === "localBranch" && (
            <>
              <DropdownMenuItem
                disabled={attachedElsewhere || isCurrentBranch}
                title={
                  attachedElsewhere
                    ? worktreeTooltip
                    : isCurrentBranch
                      ? "Already on this branch"
                      : undefined
                }
                onSelect={() => {
                  onClose();
                  void onCheckout(ref!);
                }}
              >
                <GitBranch className="size-4" />
                Checkout
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rename" });
                }}
              >
                <Pencil className="size-4" />
                Rename
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={isCurrentBranch}
                title={isCurrentBranch ? "Cannot merge the current branch into itself" : undefined}
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "merge" });
                }}
              >
                <GitMerge className="size-4" />
                Merge into current
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={isCurrentBranch}
                title={isCurrentBranch ? "Cannot rebase current branch onto itself" : undefined}
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rebase" });
                }}
              >
                <ChevronsUp className="size-4" />
                Rebase current onto
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "push" });
                }}
              >
                <Upload className="size-4" />
                Push
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                disabled={attachedElsewhere || isCurrentBranch}
                title={
                  attachedElsewhere
                    ? worktreeTooltip
                    : isCurrentBranch
                      ? "Cannot delete the currently checked-out branch"
                      : undefined
                }
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "delete" });
                }}
              >
                <Trash2 className="size-4" />
                Delete branch
              </DropdownMenuItem>
            </>
          )}

          {/* ---- remoteBranch actions ---- */}
          {refType === "remoteBranch" && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  void onCheckout(ref!);
                }}
              >
                <GitBranch className="size-4" />
                Checkout (track locally)
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  void onPull(ref!);
                }}
              >
                <Download className="size-4" />
                Pull
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "merge" });
                }}
              >
                <GitMerge className="size-4" />
                Merge into current
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rebase" });
                }}
              >
                <ChevronsUp className="size-4" />
                Rebase current onto
              </DropdownMenuItem>
            </>
          )}

          {/* ---- tag actions ---- */}
          {refType === "tag" && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  void onCheckout(ref!);
                }}
              >
                <GitBranch className="size-4" />
                Checkout (detached)
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Copy name — available for all ref types */}
          <DropdownMenuItem
            onSelect={() => {
              onCopyName(ref!);
              onClose();
            }}
          >
            <Copy className="size-4" />
            Copy name
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <NameInputDialog
        open={pendingDialog?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Rename branch"
        placeholder="new-branch-name"
        initialValue={refName}
        confirmLabel="Rename"
        onConfirm={(newName) => void onRename(ref!, newName)}
      />

      {/* Delete branch confirm dialog */}
      <ConfirmDialog
        open={pendingDialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Delete branch"
        description={`Delete branch "${refName}"? This cannot be undone if the branch has unmerged changes.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void onDelete(ref!, false)}
      />

      {/* Merge into current confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "merge"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Merge branch"
        description={`Merge "${refName}" into the current branch "${currentBranch}".`}
        confirmLabel="Merge"
        onConfirm={() => void onMergeInto(ref!)}
      />

      {/* Rebase current onto confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "rebase"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Rebase current branch"
        description={`Rebase "${currentBranch}" onto "${refName}". In-progress work may require conflict resolution.`}
        confirmLabel="Rebase"
        onConfirm={() => void onRebaseOnto(ref!)}
      />

      {/* Push confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "push"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Push branch"
        description={`Push "${refName}" to the remote. If the remote has diverged, the push will be rejected (use force-push if needed).`}
        confirmLabel="Push"
        onConfirm={() => void onPush(ref!, false)}
      />

      {/* Force push confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "forcePush"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title="Force-push branch"
        description={`Force-push "${refName}" to the remote using --force-with-lease. This will overwrite remote history. Make sure collaborators are aware.`}
        confirmLabel="Force push"
        destructive
        onConfirm={() => void onPush(ref!, true)}
      />
    </>
  );
}
