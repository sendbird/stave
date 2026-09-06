import { useState, type HTMLAttributes } from "react";
import { BookmarkIcon, RotateCcw } from "lucide-react";
import { Button, Loader } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import { checkpointStyles as s } from "./checkpoint.styles";

/**
 * Shown while compaction is in progress (status: "compacting").
 * Renders a subtle spinner + label inline in the conversation.
 */
export function CompactingIndicator({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(sx(s.compacting), className)} {...props}>
      <Loader
        aria-hidden
        className={sx(s.compactingLoader)}
        size="xs"
        variant="persist"
      />
      <span>Compacting conversation context…</span>
    </div>
  );
}

/**
 * Shown after compaction is complete (subtype: "compact_boundary").
 * Renders a full-width divider with a bookmark icon + label at the center.
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
      className={cx(sx(s.divider), className)}
      {...props}
    >
      {/* Left line */}
      <div className={sx(s.line)} />

      {/* Icon + label + restore action */}
      <div className={sx(s.chip)}>
        <span className={sx(s.chipLabel)}>
          <BookmarkIcon className={sx(s.chipIcon)} />
          {label}
          {displayTrigger}
        </span>
        {onRestore ? (
          confirmingRestore ? (
            <span className={sx(s.confirmRow)}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={[s.action, s.actionDanger]}
                disabled={restoreDisabled || restorePending}
                onClick={() => {
                  setConfirmingRestore(false);
                  onRestore();
                }}
                title="Discards uncommitted changes in the worktree and restores this checkpoint."
              >
                {restorePending ? (
                  <Loader
                    aria-hidden
                    className={sx(s.actionLoader)}
                    size="xs"
                    variant="persist"
                  />
                ) : (
                  <RotateCcw className={sx(s.actionIcon)} />
                )}
                Confirm restore
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={s.action}
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
              xstyle={s.action}
              disabled={restoreDisabled || restorePending}
              onClick={() => setConfirmingRestore(true)}
              title={
                restoreDisabled
                  ? "Restore unavailable for this checkpoint."
                  : "Restore workspace to this checkpoint (discards uncommitted changes)."
              }
            >
              {restorePending ? (
                <Loader
                  aria-hidden
                  className={sx(s.actionLoader)}
                  size="xs"
                  variant="persist"
                />
              ) : (
                <RotateCcw className={sx(s.actionIcon)} />
              )}
              Restore
            </Button>
          )
        ) : null}
      </div>

      {/* Right line */}
      <div className={sx(s.line)} />
    </div>
  );
}
