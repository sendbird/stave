import { i18n, Trans, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { transition } from "@/components/ads/recipes/transition";
import { useEffect, useRef, useState } from "react";
import {
  APPROVAL_DELIVERY_GUARD_MS,
  ToolApprovalCard,
} from "@/components/session/ToolApprovalCard";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import {
  buildTrustedToolEntryForApproval,
  formatTrustedToolEntry,
} from "@/lib/providers/trusted-tools";
import { sx } from "@/components/ads/utils/stylex";
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
  /**
   * Every decision names its request: one message can hold several approvals,
   * and the store would otherwise answer the message's latest one.
   */
  onResolveApproval: (args: {
    messageId: string;
    requestId: string;
    approved: boolean;
    scope?: "once" | "always";
  }) => void;
  onTrustAndApprove?: (args: {
    messageId: string;
    requestId: string;
    toolName: string;
    input?: string;
  }) => void;
  onDraftGuidance?: (args: {
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
    guidance: string;
  }) => void;
}

export function ChatInputApprovalQueue(args: ChatInputApprovalQueueProps) {
  useTranslation();
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
      requestId: args.requestId,
      approved: args.approved,
      ...(args.scope === "always" ? { scope: args.scope } : {}),
    });
  }

  /** Why a card's decisions are blocked, or nothing while they are live. */
  function describeBlockedDecision(item: PendingApprovalQueueItem) {
    if (pendingDecisionRequestId === item.part.requestId) {
      return undefined;
    }
    const reason = pendingDecisionRequestId
      ? i18n.t("session:chatInputApprovalQueue.extraCopy143")
      : disabled
        ? disabledReason
        : undefined;
    return reason ? (
      <span className={sx(styles.blockedNote)}>{reason}</span>
    ) : undefined;
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
      APPROVAL_DELIVERY_GUARD_MS,
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
      aria-label={i18n.t("session:chatInputApprovalQueue.ariaLabel")}
      className={sx(
        styles.section,
        compact ? styles.sectionCompact : styles.sectionRegular,
      )}
    >
      {/* Latest approval */}
      <ToolApprovalCard
        actions={
          !disabled && !decisionPending ? (
            <span className={sx(styles.shortcutHint)}>
              <Trans
                i18n={i18n}
                ns="session"
                i18nKey="chatInputApprovalQueue.enterToAllowOnce"
                components={{ key: <Kbd className={sx(styles.shortcutKbd)} /> }}
              />
            </span>
          ) : undefined
        }
        busy={pendingDecisionRequestId === current.part.requestId}
        density="compact"
        disabled={disabled || decisionPending}
        note={describeBlockedDecision(current)}
        onDecide={(decision) =>
          resolveApproval({
            messageId: current.messageId,
            requestId: current.part.requestId,
            approved: decision.approved,
            scope: decision.scope,
          })
        }
        part={current.part}
      />
      {decisionPending ? (
        <p
          role="status"
          aria-live="polite"
          className={sx(styles.status)}
        >
          <Loader aria-hidden size="xs" variant="signal" />
          {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue")}</p>
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
              requestId: current.part.requestId,
              toolName: current.part.toolName,
              input: current.part.input,
            })
          }
        >{i18n.t("session:chatInputApprovalQueue.sentence54", { value1: formatTrustedToolEntry(trustedEntry) })}</AdsButton>
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
              placeholder={i18n.t("session:chatInputApprovalQueue.placeholder", { value1: current.part.toolName })}
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
                    requestId: current.part.requestId,
                    toolName: current.part.toolName,
                    description: current.part.description,
                    guidance,
                  });
                  setGuidanceMessageId(null);
                  setGuidanceText("");
                }}
              >
                {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue3")}</Button>
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
                {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue4")}</Button>
            </div>
          </div>
        ) : (
          <AdsButton layout="host"
            type="button"
            xstyle={styles.guideAction}
            onClick={() => openGuidanceDraft({ focusComposer: true })}
          >
            <Kbd className={sx(styles.guideKbd)}>Tab</Kbd>
            <span>{i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue5")}</span>
          </AdsButton>
        )
      ) : null}

      {/* Queued count */}
      {queuedCount > 0 ? (
        <div className={sx(styles.queuedGroup)}>
          <details className="group">
            <summary className={sx(styles.queuedSummary, transition.colors)}>{i18n.t("session:chatInputApprovalQueue.sentence55", { value1: queuedCount })}</summary>
            <div className={sx(styles.queuedList)}>
              {approvals.slice(1).map((approval) => (
                <ToolApprovalCard
                  busy={pendingDecisionRequestId === approval.part.requestId}
                  density="compact"
                  disabled={disabled || decisionPending}
                  key={`${approval.messageId}:${approval.part.requestId}`}
                  note={describeBlockedDecision(approval)}
                  onDecide={(decision) =>
                    resolveApproval({
                      messageId: approval.messageId,
                      requestId: approval.part.requestId,
                      approved: decision.approved,
                      scope: decision.scope,
                    })
                  }
                  part={approval.part}
                />
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
