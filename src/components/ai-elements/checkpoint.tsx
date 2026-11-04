import { i18n, useTranslation } from "@/i18n";
import { useState, type HTMLAttributes } from "react";
import { BookmarkIcon, RotateCcw } from "lucide-react";
import { Button, Loader } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import { ElapsedClock } from "@/components/agent-runs/ElapsedClock";
import { compactionElapsed } from "./compaction-progress";
import { checkpointStyles as s } from "./checkpoint.styles";

/**
 * Shown while compaction is in progress (status: "compacting").
 * Renders a subtle spinner + label inline in the conversation.
 */
export function CompactingIndicator({
  startedAt,
  active = true,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { startedAt?: string; active?: boolean }) {
  useTranslation();
  return (
    <div className={cx(sx(s.compacting), className)} {...props}>
      {active ? <Loader
        aria-hidden
        className={sx(s.compactingLoader)}
        size="xs"
        variant="persist"
      /> : null}
      <ElapsedClock live={active && Boolean(startedAt) && Number.isFinite(Date.parse(startedAt!))} now={Date.now()}>
        {(now) => {
          const duration = active ? compactionElapsed(startedAt, now) : null;
          return <span>{duration
            ? i18n.t("composer:checkpoint.compactingWithElapsed", { duration })
            : i18n.t("composer:checkpoint.compactingIndicator")}</span>;
        }}
      </ElapsedClock>
    </div>
  );
}

/**
 * Shown after compaction is complete (subtype: "compact_boundary").
 * Renders a full-width divider with a bookmark icon + label at the center.
 */
export function ContextCompactedCheckpoint({
  label = i18n.t("composer:checkpoint.contextCompactedCheckpoint"),
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
  useTranslation();
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
                title={i18n.t("composer:checkpoint.title")}
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
                {i18n.t("composer:checkpoint.contextCompactedCheckpoint2")}</Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                xstyle={s.action}
                disabled={restorePending}
                onClick={() => setConfirmingRestore(false)}
              >
                {i18n.t("composer:checkpoint.contextCompactedCheckpoint3")}</Button>
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
                  ? i18n.t("composer:checkpoint.title2")
                  : i18n.t("composer:checkpoint.title3")
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
              {i18n.t("composer:checkpoint.contextCompactedCheckpoint4")}</Button>
          )
        ) : null}
      </div>

      {/* Right line */}
      <div className={sx(s.line)} />
    </div>
  );
}
