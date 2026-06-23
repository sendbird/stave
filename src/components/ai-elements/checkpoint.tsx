import { useState, type HTMLAttributes } from "react";
import { BookmarkIcon, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Shown while compaction is in progress (status: "compacting").
 * Renders a subtle spinner + label inline in the conversation.
 */
export function CompactingIndicator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-0.5 text-[0.75em] text-muted-foreground",
        className,
      )}
      {...props}
    >
      <LoaderCircle className="size-3 animate-spin shrink-0" />
      <span>Compacting conversation context…</span>
    </div>
  );
}

/**
 * Shown after compaction is complete (subtype: "compact_boundary").
 * Renders a full-width divider with a bookmark icon + label at the center,
 * inspired by the elements.ai-sdk.dev/components/checkpoint pattern.
 */
export function ContextCompactedCheckpoint({
  label = "Context compacted",
  trigger,
  onRestore,
  restorePending = false,
  restoreDisabled = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Human-readable label shown at the center of the divider */
  label?: string;
  /** compact_metadata.trigger value — "auto" | "manual" */
  trigger?: string;
  /** Restore callback for this compact boundary checkpoint. */
  onRestore?: () => void;
  /** True while restore command is running. */
  restorePending?: boolean;
  /** Disable restore action when boundary metadata is unavailable. */
  restoreDisabled?: boolean;
}) {
  const displayTrigger = trigger ? ` (${trigger})` : "";
  // Restore runs a destructive `git restore --worktree` that discards
  // uncommitted changes, so require an explicit second click to confirm.
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  return (
    <div
      role="separator"
      aria-label={`${label}${displayTrigger}`}
      className={cn(
        "flex items-center gap-2 py-1 text-[0.75em] text-muted-foreground select-none",
        className,
      )}
      {...props}
    >
      {/* Left line */}
      <div className="h-px flex-1 bg-border/60" />

      {/* Icon + label + restore action */}
      <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-1.5 py-0.5">
        <span className="inline-flex items-center gap-1.5 px-1 font-medium">
          <BookmarkIcon className="size-3 shrink-0" />
          {label}
          {displayTrigger}
        </span>
        {onRestore ? (
          confirmingRestore ? (
            <span className="inline-flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[0.6875em] text-destructive hover:text-destructive"
                disabled={restoreDisabled || restorePending}
                onClick={() => {
                  setConfirmingRestore(false);
                  onRestore();
                }}
                title="Discards uncommitted changes in the worktree and restores this checkpoint."
              >
                {restorePending
                  ? <LoaderCircle className="mr-1 size-3 animate-spin" />
                  : <RotateCcw className="mr-1 size-3" />}
                Confirm restore
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[0.6875em]"
                disabled={restorePending}
                onClick={() => setConfirmingRestore(false)}
              >
                Cancel
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[0.6875em]"
              disabled={restoreDisabled || restorePending}
              onClick={() => setConfirmingRestore(true)}
              title={restoreDisabled ? "Restore unavailable for this checkpoint." : "Restore workspace to this checkpoint (discards uncommitted changes)."}
            >
              {restorePending
                ? <LoaderCircle className="mr-1 size-3 animate-spin" />
                : <RotateCcw className="mr-1 size-3" />}
              Restore
            </Button>
          )
        ) : null}
      </div>

      {/* Right line */}
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}
