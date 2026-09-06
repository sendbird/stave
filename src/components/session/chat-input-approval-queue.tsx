import { Button as AdsButton } from "@/components/ads/components/Button";
import { useEffect, useRef, useState } from "react";
import { ConfirmationCompact } from "@/components/ai-elements/confirmation";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import {
  buildTrustedToolEntryForApproval,
  formatTrustedToolEntry,
} from "@/lib/providers/trusted-tools";
import { cx, sx } from "@/components/ads/utils/stylex";
import { chatInputApprovalQueueStyles as styles } from "@/components/session/chat-input-approval-queue.styles";
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
  onResolveApproval: (args: {
    messageId: string;
    approved: boolean;
    scope?: "once" | "always";
  }) => void;
  onTrustAndApprove?: (args: {
    messageId: string;
    toolName: string;
    input?: string;
  }) => void;
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
    onTrustAndApprove,
    onDraftGuidance,
  } = args;
  const [guidanceMessageId, setGuidanceMessageId] = useState<string | null>(
    null,
  );
  const [guidanceText, setGuidanceText] = useState("");
  const [pendingDecisionRequestId, setPendingDecisionRequestId] = useState<
    string | null
  >(null);
  const guidanceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingGuidanceFocusRef = useRef(false);
  const handledGuidanceFocusNonceRef = useRef(0);

  const latest = approvals[0];
  const latestMessageId = latest?.messageId ?? null;
  const guidanceOpen =
    latestMessageId !== null && guidanceMessageId === latestMessageId;
  const queuedCount = approvals.length - 1;
  const decisionPending = pendingDecisionRequestId !== null;

  function resolveApproval(args: {
    messageId: string;
    requestId: string;
    approved: boolean;
    scope?: "once" | "always";
  }) {
    if (disabled || pendingDecisionRequestId) {
      return;
    }
    setPendingDecisionRequestId(args.requestId);
    onResolveApproval({
      messageId: args.messageId,
      approved: args.approved,
      ...(args.scope ? { scope: args.scope } : {}),
    });
  }

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

    if (
      guidanceMessageId &&
      !approvals.some((approval) => approval.messageId === guidanceMessageId)
    ) {
      setGuidanceMessageId(null);
      setGuidanceText("");
      pendingGuidanceFocusRef.current = false;
    }
  }, [approvals, guidanceMessageId, latestMessageId]);

  useEffect(() => {
    if (
      pendingDecisionRequestId &&
      !approvals.some(
        (approval) => approval.part.requestId === pendingDecisionRequestId,
      )
    ) {
      setPendingDecisionRequestId(null);
      return;
    }
    if (!pendingDecisionRequestId) {
      return;
    }

    // The provider acknowledgement is bounded to 30 seconds. Re-enable the
    // decision controls just after that deadline so a failed delivery can be
    // retried instead of leaving the approval surface permanently disabled.
    const timeoutId = window.setTimeout(
      () => setPendingDecisionRequestId(null),
      32_000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [approvals, pendingDecisionRequestId]);

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
  const trustedEntry = buildTrustedToolEntryForApproval({
    toolName: current.part.toolName,
    input: current.part.input,
  });

  return (
    <section
      aria-label="Approval queue"
      className={sx(
        styles.section,
        compact ? styles.sectionCompact : styles.sectionRegular,
      )}
    >
      {/* Latest approval */}
      <ConfirmationCompact
        toolName={current.part.toolName}
        description={current.part.description}
        state={current.part.state}
        disabled={disabled || decisionPending}
        disabledReason={
          decisionPending ? "Sending decision to the provider…" : disabledReason
        }
        showShortcutHint={!disabled && !decisionPending}
        onApprove={() =>
          resolveApproval({
            messageId: current.messageId,
            requestId: current.part.requestId,
            approved: true,
          })
        }
        onApproveAlways={
          current.part.supportsAllowAlways
            ? () =>
                resolveApproval({
                  messageId: current.messageId,
                  requestId: current.part.requestId,
                  approved: true,
                  scope: "always",
                })
            : undefined
        }
        onReject={() =>
          resolveApproval({
            messageId: current.messageId,
            requestId: current.part.requestId,
            approved: false,
          })
        }
      />
      {decisionPending ? (
        <p
          role="status"
          aria-live="polite"
          className={sx(styles.status)}
        >
          <Loader aria-hidden size="xs" variant="signal" />
          Waiting for the provider to accept the decision…
        </p>
      ) : null}
      {/*
        When the runtime persists the rule itself, Stave's client-side trusted
        list would be a second, weaker copy of the same decision. It is also the
        weaker one for ACP: the trusted entry is keyed on the serialized tool
        input, so it re-matches only that exact payload, while the provider rule
        generalizes to the command.
      */}
      {!disabled &&
      !decisionPending &&
      !current.part.supportsAllowAlways &&
      onTrustAndApprove &&
      trustedEntry ? (
        <AdsButton layout="host"
          type="button"
          xstyle={styles.linkAction}
          onClick={() =>
            onTrustAndApprove({
              messageId: current.messageId,
              toolName: current.part.toolName,
              input: current.part.input,
            })
          }
        >
          approve and always allow {formatTrustedToolEntry(trustedEntry)}
        </AdsButton>
      ) : null}

      {/* Guidance inline */}
      {!disabled && !decisionPending && onDraftGuidance ? (
        guidanceOpen ? (
          <div className={sx(styles.guidancePanel)}>
            <Textarea
              ref={guidanceTextareaRef}
              value={guidanceText}
              rows={2}
              xstyle={styles.guidanceField}
              onChange={(event) => setGuidanceText(event.target.value)}
              placeholder={`Instead of ${current.part.toolName}, do this…`}
            />
            <div className={sx(styles.guidanceActions)}>
              <Button
                type="button"
                size="sm"
                xstyle={styles.compactButton}
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
                xstyle={styles.compactButtonQuiet}
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
          <AdsButton layout="host"
            type="button"
            xstyle={styles.guideAction}
            onClick={() => openGuidanceDraft({ focusComposer: true })}
          >
            <Kbd className={sx(styles.guideKbd)}>Tab</Kbd>
            <span>guide instead</span>
          </AdsButton>
        )
      ) : null}

      {/* Queued count */}
      {queuedCount > 0 ? (
        <div className={sx(styles.queuedGroup)}>
          <details className="group">
            <summary className={sx(styles.queuedSummary)}>
              +{queuedCount} more queued
            </summary>
            <div className={sx(styles.queuedList)}>
              {approvals.slice(1).map((approval) => (
                <ConfirmationCompact
                  key={`${approval.messageId}:${approval.part.requestId}`}
                  toolName={approval.part.toolName}
                  description={approval.part.description}
                  state={approval.part.state}
                  disabled={disabled || decisionPending}
                  disabledReason={
                    decisionPending
                      ? "Another decision is being delivered."
                      : disabledReason
                  }
                  showShortcutHint={false}
                  onApprove={() =>
                    resolveApproval({
                      messageId: approval.messageId,
                      requestId: approval.part.requestId,
                      approved: true,
                    })
                  }
                  onApproveAlways={
                    approval.part.supportsAllowAlways
                      ? () =>
                          resolveApproval({
                            messageId: approval.messageId,
                            requestId: approval.part.requestId,
                            approved: true,
                            scope: "always",
                          })
                      : undefined
                  }
                  onReject={() =>
                    resolveApproval({
                      messageId: approval.messageId,
                      requestId: approval.part.requestId,
                      approved: false,
                    })
                  }
                />
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
