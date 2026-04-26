import { useEffect, useRef, useState } from "react";
import { ConfirmationCompact } from "@/components/ai-elements/confirmation";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ApprovalPart } from "@/types/chat";

export interface PendingApprovalQueueItem {
  messageId: string;
  part: ApprovalPart;
}

interface ChatInputApprovalQueueProps {
  approvals: readonly PendingApprovalQueueItem[];
  compact?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  guidanceFocusNonce?: number;
  onResolveApproval: (args: { messageId: string; approved: boolean }) => void;
  onDraftGuidance?: (args: {
    messageId: string;
    toolName: string;
    description: string;
    guidance: string;
  }) => void;
}

export function ChatInputApprovalQueue(args: ChatInputApprovalQueueProps) {
  const {
    approvals,
    compact,
    disabled,
    disabledReason,
    guidanceFocusNonce = 0,
    onResolveApproval,
    onDraftGuidance,
  } = args;
  const [guidanceMessageId, setGuidanceMessageId] = useState<string | null>(null);
  const [guidanceText, setGuidanceText] = useState("");
  const guidanceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingGuidanceFocusRef = useRef(false);
  const handledGuidanceFocusNonceRef = useRef(0);

  const latest = approvals[0];
  const latestMessageId = latest?.messageId ?? null;
  const guidanceOpen = latestMessageId !== null && guidanceMessageId === latestMessageId;
  const queuedCount = approvals.length - 1;

  function openGuidanceDraft(args: { focusComposer?: boolean }) {
    if (!latest || disabled || !onDraftGuidance) {
      return;
    }
    if (args.focusComposer) {
      pendingGuidanceFocusRef.current = true;
    }
    setGuidanceMessageId(latest.messageId);
    if (guidanceMessageId !== latest.messageId) {
      setGuidanceText("");
    }
  }

  useEffect(() => {
    if (latestMessageId === null) {
      setGuidanceMessageId(null);
      setGuidanceText("");
      pendingGuidanceFocusRef.current = false;
      return;
    }

    if (guidanceMessageId && !approvals.some((approval) => approval.messageId === guidanceMessageId)) {
      setGuidanceMessageId(null);
      setGuidanceText("");
      pendingGuidanceFocusRef.current = false;
    }
  }, [approvals, guidanceMessageId, latestMessageId]);

  useEffect(() => {
    if (!latest || disabled || guidanceFocusNonce <= 0 || !onDraftGuidance) {
      return;
    }
    if (handledGuidanceFocusNonceRef.current === guidanceFocusNonce) {
      return;
    }
    handledGuidanceFocusNonceRef.current = guidanceFocusNonce;
    openGuidanceDraft({ focusComposer: true });
  }, [disabled, guidanceFocusNonce, latest, onDraftGuidance]);

  useEffect(() => {
    if (!pendingGuidanceFocusRef.current || !guidanceOpen) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      pendingGuidanceFocusRef.current = false;
      const textarea = guidanceTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      const caretIndex = textarea.value.length;
      textarea.setSelectionRange(caretIndex, caretIndex);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [guidanceOpen]);

  if (approvals.length === 0) {
    return null;
  }

  // Safe after the length guard — TS can't narrow the earlier binding.
  const current = latest as PendingApprovalQueueItem;

  return (
    <section
      aria-label="Approval queue"
      className={cn(
        "mb-3 rounded-xl border border-warning/30 bg-background/90 shadow-sm supports-backdrop-filter:backdrop-blur-xs",
        compact ? "p-2" : "p-2.5",
      )}
    >
      {/* Latest approval */}
      <ConfirmationCompact
        toolName={current.part.toolName}
        description={current.part.description}
        state={current.part.state}
        disabled={disabled}
        disabledReason={disabledReason}
        showShortcutHint={!disabled}
        onApprove={() => onResolveApproval({ messageId: current.messageId, approved: true })}
        onReject={() => onResolveApproval({ messageId: current.messageId, approved: false })}
      />

      {/* Guidance inline */}
      {!disabled && onDraftGuidance ? (
        guidanceOpen ? (
          <div className="mt-2 space-y-1.5 px-0.5">
            <Textarea
              ref={guidanceTextareaRef}
              value={guidanceText}
              rows={2}
              className="min-h-0 resize-none bg-background/80 text-xs dark:bg-background/80"
              onChange={(event) => setGuidanceText(event.target.value)}
              placeholder={`Instead of ${current.part.toolName}, do this…`}
            />
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={!guidanceText.trim()}
                onClick={() => {
                  const guidance = guidanceText.trim();
                  if (!guidance) {
                    return;
                  }
                  onDraftGuidance({
                    messageId: current.messageId,
                    toolName: current.part.toolName,
                    description: current.part.description,
                    guidance,
                  });
                  setGuidanceMessageId(null);
                  setGuidanceText("");
                }}
              >
                Reject & Guide
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setGuidanceMessageId(null);
                  setGuidanceText("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-1.5 flex items-center gap-1 rounded px-1 py-0.5 text-[0.6875rem] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
            onClick={() => openGuidanceDraft({ focusComposer: true })}
          >
            <Kbd className="h-4 px-1 text-[0.625rem]">Tab</Kbd>
            <span>guide instead</span>
          </button>
        )
      ) : null}

      {/* Queued count */}
      {queuedCount > 0 ? (
        <div className="mt-2 border-t border-border/40 pt-2">
          <details className="group">
            <summary className="cursor-pointer select-none text-[0.6875rem] text-muted-foreground/70 hover:text-muted-foreground">
              +{queuedCount} more queued
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {approvals.slice(1).map((approval) => (
                <ConfirmationCompact
                  key={`${approval.messageId}:${approval.part.requestId}`}
                  toolName={approval.part.toolName}
                  description={approval.part.description}
                  state={approval.part.state}
                  disabled={disabled}
                  disabledReason={disabledReason}
                  showShortcutHint={false}
                  onApprove={() => onResolveApproval({ messageId: approval.messageId, approved: true })}
                  onReject={() => onResolveApproval({ messageId: approval.messageId, approved: false })}
                />
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
