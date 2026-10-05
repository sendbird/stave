import { i18n, useTranslation } from "@/i18n";
import { Checkbox } from "@/components/ads/components/Checkbox";
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
import { sx } from "@/components/ads/utils/stylex";
import { transition } from "@/components/ads/recipes/transition";
import { refContextMenuStyles as styles } from "./ref-context-menu.styles";

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
  worktreePathsAvailable: boolean;
  /** cwd of the current workspace — used as the workspacePath for the worktree guard */
  workspacePath: string | undefined;
  onCheckout: (ref: GraphRef) => Promise<void>;
  onRename: (ref: GraphRef, newName: string) => Promise<void>;
  onDelete: (ref: GraphRef, force: boolean) => Promise<void>;
  onMergeInto: (ref: GraphRef) => Promise<void>;
  onRebaseOnto: (ref: GraphRef) => Promise<void>;
  onPush: (ref: GraphRef, force: boolean) => Promise<void>;
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
  useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} xstyle={styles.dialogNarrow}>
        <DialogHeader>
          {destructive ? (
            <div className={sx(styles.destructiveHeader)}>
              <AlertTriangle className={sx(styles.destructiveIcon)} />
              <DialogTitle className={sx(styles.destructiveTitle)}>
                {title}
              </DialogTitle>
            </div>
          ) : (
            <DialogTitle>{title}</DialogTitle>
          )}
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {i18n.t("gitGraph:refContextMenu.cancel")}
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
  useTranslation();
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
      <DialogContent showCloseButton={false} xstyle={styles.dialogNarrow}>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {i18n.t("gitGraph:refContextMenu.cancel")}
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
// DeleteBranchDialog — extends ConfirmDialog with a force-delete option
// ---------------------------------------------------------------------------

interface DeleteBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refName: string;
  onConfirm: (force: boolean) => void;
}

function DeleteBranchDialog({
  open,
  onOpenChange,
  refName,
  onConfirm,
}: DeleteBranchDialogProps) {
  useTranslation();
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (open) setForce(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} xstyle={styles.dialogNarrow}>
        <DialogHeader>
          <div className={sx(styles.destructiveHeader)}>
            <AlertTriangle className={sx(styles.destructiveIcon)} />
            <DialogTitle className={sx(styles.destructiveTitle)}>
              {i18n.t("gitGraph:refContextMenu.deleteBranch")}
            </DialogTitle>
          </div>
          <DialogDescription>{i18n.t("gitGraph:refContextMenu.deleteBranchConfirmation", { name: refName })}</DialogDescription>
        </DialogHeader>

        {/* Force-delete toggle */}
        <label className={sx(styles.forceToggle, transition.colors)}>
          <Checkbox
            controlOnly
            checked={force}
            onCheckedChange={(checked) => setForce(checked)}
          />
          <span
            className={sx(
              force ? styles.forceLabelActive : styles.forceLabelMuted,
            )}
          >
            {i18n.t("gitGraph:refContextMenu.forceDeleteDiscardUnmergedCommits")}
          </span>
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {i18n.t("gitGraph:refContextMenu.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onConfirm(force);
              onOpenChange(false);
            }}
          >
            {force ? i18n.t("gitGraph:refContextMenu.forceDelete") : i18n.t("gitGraph:refContextMenu.delete")}
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
  | { kind: "deleteTag" }
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
  worktreePathsAvailable,
  workspacePath,
  onCheckout,
  onRename,
  onDelete,
  onMergeInto,
  onRebaseOnto,
  onPush,
  onCopyName,
}: RefContextMenuProps) {
  useTranslation();
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
    worktreePathsAvailable &&
    isBranchAttachedElsewhere({
      branch: refName,
      workspacePath,
      worktreePathByBranch,
    });
  const worktreeLocationsUnavailable =
    refType === "localBranch" && !worktreePathsAvailable;

  const worktreeTooltip = worktreeLocationsUnavailable
    ? i18n.t("gitGraph:refContextMenu.worktreeLocationsAreUnavailableSoThisAction")
    : attachedElsewhere
      ? i18n.t("gitGraph:refContextMenu.isCheckedOutInAnotherWorktree", { value1: refName })
      : undefined;

  // Whether this ref IS the current HEAD branch
  const isCurrentBranch =
    refType === "localBranch" && refName === currentBranch;

  return (
    <>
      {/* Virtual trigger anchored to mouse position */}
      <DropdownMenu
        open={anchor !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DropdownMenuTrigger
          nativeButton={false}
          render={
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
          }
        ></DropdownMenuTrigger>

        <DropdownMenuContent
          xstyle={styles.menu}
          align="start"
          alignOffset={0}
          collisionPadding={8}
          finalFocus={false}
        >
          {/* Header label */}
          <DropdownMenuLabel className={sx(styles.menuLabel)}>
            {refType === "remoteBranch"
              ? i18n.t("gitGraph:refContextMenu.remote")
              : refType === "tag"
                ? i18n.t("gitGraph:refContextMenu.tag")
                : ""}
            {refName}
          </DropdownMenuLabel>
          {worktreeLocationsUnavailable ? (
            <DropdownMenuLabel
              className={sx(styles.warningLabel)}
              role="status"
            >
              <AlertTriangle
                className={sx(styles.warningIcon)}
                aria-hidden="true"
              />
              {i18n.t("gitGraph:refContextMenu.worktreeLocationsCouldNotBeReadCheckout")}
            </DropdownMenuLabel>
          ) : attachedElsewhere ? (
            <DropdownMenuLabel
              className={sx(styles.warningLabel)}
              role="status"
            >
              <AlertTriangle
                className={sx(styles.warningIcon)}
                aria-hidden="true"
              />
              {i18n.t("gitGraph:refContextMenu.thisBranchIsCheckedOutInAnother")}
            </DropdownMenuLabel>
          ) : null}
          <DropdownMenuSeparator />

          {/* ---- localBranch actions ---- */}
          {refType === "localBranch" && (
            <>
              <DropdownMenuItem
                disabled={
                  worktreeLocationsUnavailable ||
                  attachedElsewhere ||
                  isCurrentBranch
                }
                title={
                  worktreeLocationsUnavailable || attachedElsewhere
                    ? worktreeTooltip
                    : isCurrentBranch
                      ? i18n.t("gitGraph:refContextMenu.alreadyOnThisBranch")
                      : undefined
                }
                onSelect={() => {
                  onClose();
                  void onCheckout(ref!);
                }}
              >
                <GitBranch className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.checkout")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rename" });
                }}
              >
                <Pencil className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.rename")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                disabled={isCurrentBranch}
                title={
                  isCurrentBranch
                    ? i18n.t("gitGraph:refContextMenu.cannotMergeTheCurrentBranchIntoItself")
                    : undefined
                }
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "merge" });
                }}
              >
                <GitMerge className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.mergeIntoCurrent")}
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={isCurrentBranch}
                title={
                  isCurrentBranch
                    ? i18n.t("gitGraph:refContextMenu.cannotRebaseCurrentBranchOntoItself")
                    : undefined
                }
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rebase" });
                }}
              >
                <ChevronsUp className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.rebaseCurrentOnto")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "push" });
                }}
              >
                <Upload className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.push")}
              </DropdownMenuItem>

              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "forcePush" });
                }}
              >
                <Upload className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.forcePush")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                disabled={
                  worktreeLocationsUnavailable ||
                  attachedElsewhere ||
                  isCurrentBranch
                }
                title={
                  worktreeLocationsUnavailable || attachedElsewhere
                    ? worktreeTooltip
                    : isCurrentBranch
                      ? i18n.t("gitGraph:refContextMenu.cannotDeleteTheCurrentlyCheckedOutBranch")
                      : undefined
                }
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "delete" });
                }}
              >
                <Trash2 className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.deleteBranch")}
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
                <GitBranch className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.checkoutTrackLocally")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "merge" });
                }}
              >
                <GitMerge className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.mergeIntoCurrent")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "rebase" });
                }}
              >
                <ChevronsUp className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.rebaseCurrentOnto")}
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
                <GitBranch className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.checkoutDetached")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "deleteTag" });
                }}
              >
                <Trash2 className={sx(styles.menuIcon)} />
                {i18n.t("gitGraph:refContextMenu.deleteTag")}
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
            <Copy className={sx(styles.menuIcon)} />
            {i18n.t("gitGraph:refContextMenu.copyName")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <NameInputDialog
        open={pendingDialog?.kind === "rename"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.renameBranch")}
        placeholder={i18n.t("gitGraph:refContextMenu.newBranchName")}
        initialValue={refName}
        confirmLabel={i18n.t("gitGraph:refContextMenu.rename")}
        onConfirm={(newName) => void onRename(ref!, newName)}
      />

      {/* Delete branch confirm dialog — with optional force-delete */}
      <DeleteBranchDialog
        open={pendingDialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        refName={refName}
        onConfirm={(force) => void onDelete(ref!, force)}
      />

      {/* Delete tag confirm dialog */}
      <ConfirmDialog
        open={pendingDialog?.kind === "deleteTag"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.deleteTag")}
        description={i18n.t("gitGraph:refContextMenu.deleteTagThisRemovesTheLocal", { value1: refName })}
        confirmLabel={i18n.t("gitGraph:refContextMenu.deleteTag")}
        destructive
        onConfirm={() => void onDelete(ref!, false)}
      />

      {/* Merge into current confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "merge"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.mergeBranch")}
        description={i18n.t("gitGraph:refContextMenu.mergeIntoTheCurrentBranch", { value1: refName, value2: currentBranch })}
        confirmLabel={i18n.t("gitGraph:refContextMenu.merge")}
        onConfirm={() => void onMergeInto(ref!)}
      />

      {/* Rebase current onto confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "rebase"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.rebaseCurrentBranch")}
        description={i18n.t("gitGraph:refContextMenu.rebaseOntoInProgressWorkMay", { value1: currentBranch, value2: refName })}
        confirmLabel={i18n.t("gitGraph:refContextMenu.rebase")}
        onConfirm={() => void onRebaseOnto(ref!)}
      />

      {/* Push confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "push"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.pushBranch")}
        description={i18n.t("gitGraph:refContextMenu.pushToTheRemoteIfThe", { value1: refName })}
        confirmLabel={i18n.t("gitGraph:refContextMenu.push")}
        onConfirm={() => void onPush(ref!, false)}
      />

      {/* Force push confirm */}
      <ConfirmDialog
        open={pendingDialog?.kind === "forcePush"}
        onOpenChange={(open) => {
          if (!open) setPendingDialog(null);
        }}
        title={i18n.t("gitGraph:refContextMenu.forcePushBranch")}
        description={i18n.t("gitGraph:refContextMenu.forcePushToTheRemoteUsingForceWithLease", { value1: refName })}
        confirmLabel={i18n.t("gitGraph:refContextMenu.forcePush")}
        destructive
        onConfirm={() => void onPush(ref!, true)}
      />
    </>
  );
}
