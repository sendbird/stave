/**
 * CommitContextMenu — right-click menu for a single git commit.
 *
 * Rendered as a programmatic DropdownMenu anchored to the mouse position via
 * an invisible virtual trigger div.  The caller opens it by passing a non-null
 * `anchor` prop; clearing it closes the menu.
 *
 * Context-menu primitive: DropdownMenu from @/components/ui/dropdown-menu
 *   (same component used throughout the app for dynamic/programmatic menus).
 * Dialog primitive: Dialog from @/components/ui/dialog
 *   (same component used in the broader layout for confirm + input dialogs).
 */
import { useRef, useState, useEffect } from "react";
import {
  Copy,
  GitBranch,
  GitCommitHorizontal,
  Tag,
  ChevronsUp,
  RotateCcw,
  Cherry,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommitContextMenuAnchor {
  x: number;
  y: number;
  hash: string;
  subject: string;
}

export interface CommitContextMenuProps {
  anchor: CommitContextMenuAnchor | null;
  onClose: () => void;
  onCopyHash: (hash: string) => void;
  onCheckout: (hash: string) => void;
  onCreateBranch: (hash: string, name: string) => Promise<void>;
  onCreateTag: (hash: string, name: string) => Promise<void>;
  onCherryPick: (hash: string) => Promise<void>;
  onRevert: (hash: string) => Promise<void>;
  onReset: (hash: string, mode: "soft" | "mixed" | "hard") => Promise<void>;
}

// ---------------------------------------------------------------------------
// Small confirm dialog
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
// Name-input dialog (branch / tag name)
// ---------------------------------------------------------------------------

interface NameInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
}

function NameInputDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  confirmLabel,
  onConfirm,
}: NameInputDialogProps) {
  const [value, setValue] = useState("");

  // Reset value when dialog opens
  useEffect(() => {
    if (open) setValue("");
  }, [open]);

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
// CommitContextMenu
// ---------------------------------------------------------------------------

type PendingDialog =
  | { kind: "createBranch" }
  | { kind: "createTag" }
  | { kind: "revert" }
  | { kind: "resetSoft" }
  | { kind: "resetMixed" }
  | { kind: "resetHard" }
  | null;

export function CommitContextMenu({
  anchor,
  onClose,
  onCopyHash,
  onCheckout,
  onCreateBranch,
  onCreateTag,
  onCherryPick,
  onRevert,
  onReset,
}: CommitContextMenuProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);

  // Snapshot the anchor at the time the menu opens so dialogs still
  // have access to the hash/subject after anchor is cleared.
  const [snapshot, setSnapshot] = useState<CommitContextMenuAnchor | null>(null);

  useEffect(() => {
    if (anchor) setSnapshot(anchor);
  }, [anchor]);

  const hash = snapshot?.hash ?? "";
  const subject = snapshot?.subject ?? "";
  const shortHash = hash.slice(0, 7);

  return (
    <>
      {/* Virtual trigger anchored to the right-click position */}
      <DropdownMenu
        open={anchor !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        {/* Zero-sized invisible anchor div positioned at mouse coords */}
        <DropdownMenuTrigger asChild>
          <div
            ref={triggerRef}
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
          className="w-56"
          align="start"
          side="bottom"
          sideOffset={0}
          alignOffset={0}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuLabel className="font-mono text-[11px] text-muted-foreground truncate">
            {shortHash} {subject}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              onCheckout(hash);
              onClose();
            }}
          >
            <GitCommitHorizontal className="size-4" />
            Checkout (detached)
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              onClose();
              setPendingDialog({ kind: "createBranch" });
            }}
          >
            <GitBranch className="size-4" />
            Create branch here
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              onClose();
              setPendingDialog({ kind: "createTag" });
            }}
          >
            <Tag className="size-4" />
            Create tag
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              onClose();
              void onCherryPick(hash);
            }}
          >
            <Cherry className="size-4" />
            Cherry-pick
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              onClose();
              setPendingDialog({ kind: "revert" });
            }}
          >
            <RotateCcw className="size-4" />
            Revert
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ChevronsUp className="size-4" />
              Reset to here
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "resetSoft" });
                }}
              >
                Soft
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "resetMixed" });
                }}
              >
                Mixed
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  onClose();
                  setPendingDialog({ kind: "resetHard" });
                }}
              >
                Hard
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              onCopyHash(hash);
              onClose();
            }}
          >
            <Copy className="size-4" />
            Copy hash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create branch dialog */}
      <NameInputDialog
        open={pendingDialog?.kind === "createBranch"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Create branch"
        placeholder="branch-name"
        confirmLabel="Create"
        onConfirm={(name) => void onCreateBranch(hash, name)}
      />

      {/* Create tag dialog */}
      <NameInputDialog
        open={pendingDialog?.kind === "createTag"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Create tag"
        placeholder="v1.0.0"
        confirmLabel="Create tag"
        onConfirm={(name) => void onCreateTag(hash, name)}
      />

      {/* Revert confirm dialog */}
      <ConfirmDialog
        open={pendingDialog?.kind === "revert"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Revert commit"
        description={`Create a new commit that undoes the changes from ${shortHash} ("${subject}"). The working tree must be clean.`}
        confirmLabel="Revert"
        destructive
        onConfirm={() => void onRevert(hash)}
      />

      {/* Reset — soft */}
      <ConfirmDialog
        open={pendingDialog?.kind === "resetSoft"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Reset (soft)"
        description={`Move HEAD to ${shortHash}. Staged changes are preserved; working tree is untouched.`}
        confirmLabel="Reset soft"
        onConfirm={() => void onReset(hash, "soft")}
      />

      {/* Reset — mixed */}
      <ConfirmDialog
        open={pendingDialog?.kind === "resetMixed"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Reset (mixed)"
        description={`Move HEAD to ${shortHash}. Staged changes become unstaged; working tree is untouched.`}
        confirmLabel="Reset mixed"
        onConfirm={() => void onReset(hash, "mixed")}
      />

      {/* Reset — hard (destructive) */}
      <ConfirmDialog
        open={pendingDialog?.kind === "resetHard"}
        onOpenChange={(open) => { if (!open) setPendingDialog(null); }}
        title="Hard reset — all local changes will be lost"
        description={`Move HEAD to ${shortHash} and discard ALL staged and unstaged changes. This cannot be undone.`}
        confirmLabel="Hard reset"
        destructive
        onConfirm={() => void onReset(hash, "hard")}
      />
    </>
  );
}
