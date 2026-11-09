import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ShieldAlert } from "lucide-react";
import { Button as AuiButton } from "@/components/aui/components/Button";
import { Tooltip } from "@/components/aui/components/Tooltip";
import {
  APPROVAL_DELIVERY_GUARD_MS,
  ApprovalExpiryNote,
  describeApprovalRisk,
} from "@/components/session/ToolApprovalCard";
import { getToolTitle } from "@/components/session/message/assistant-trace.utils";
import { Loader } from "@/components/ui/loader";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { sx } from "@/components/aui/utils/stylex";
import { composerApprovalRowStyles as styles } from "@/components/session/composer-approval-row.styles";
import {
  resolveShownApproval,
  stepShownApproval,
  summarizeApprovalRequest,
} from "@/components/session/composer-approval.utils";
import type { ApprovalPart } from "@/types/chat";

export interface PendingApprovalQueueItem {
  messageId: string;
  part: ApprovalPart;
  /** The subagent that asked, when its starting call is in the same message. */
  requestedBy?: string;
}

interface ChatInputApprovalQueueProps {
  approvals: readonly PendingApprovalQueueItem[];
  disabled?: boolean;
  disabledReason?: string;
  guidanceFocusNonce?: number;
  /**
   * The request the row shows. Controlled by the composer so its Enter and Tab
   * shortcuts answer the request the row names; omit it to let the row track
   * its own step.
   */
  shownRequestId?: string | null;
  onShownRequestChange?: (requestId: string | null) => void;
  /**
   * Offer "Always allow" where the runtime honors it (`supportsAllowAlways`).
   * `false` when the answer goes through the host, as on every other surface.
   */
  allowAlways?: boolean;
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
  onDraftGuidance?: (args: {
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
    guidance: string;
  }) => void;
}

/**
 * The current task's pending approvals, shown once, as a row attached to the
 * composer: the tool and what it would run, then Allow once (Enter), Always
 * allow wherever the runtime honors it (the same rule as the approval card),
 * and Deny. The description, the
 * full input and the other ways to answer sit behind the disclosure, which
 * scrolls inside a bounded height so the transcript keeps its room. Several
 * requests read as "1 of N" and are stepped through one at a time; every
 * decision names the request on the row.
 */
export function ChatInputApprovalQueue(args: ChatInputApprovalQueueProps) {
  useTranslation();
  const {
    approvals,
    disabled,
    disabledReason,
    guidanceFocusNonce = 0,
    onResolveApproval,
    onDraftGuidance,
  } = args;
  const detailsId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const reclaimFocusRef = useRef(false);
  const [ownShownRequestId, setOwnShownRequestId] = useState<string | null>(null);
  const shownRequestId =
    args.shownRequestId !== undefined ? args.shownRequestId : ownShownRequestId;
  const setShownRequestId = (requestId: string | null) => {
    setOwnShownRequestId(requestId);
    args.onShownRequestChange?.(requestId);
  };
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Guidance is written for one request, not for its message: another
  // request of the same message can arrive and take the row while it is open.
  const [guidanceTarget, setGuidanceTarget] = useState<{
    messageId: string;
    requestId: string;
  } | null>(null);
  const [guidanceText, setGuidanceText] = useState("");
  const [pendingDecisionRequestId, setPendingDecisionRequestId] = useState<
    string | null
  >(null);
  const guidanceTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingGuidanceFocusRef = useRef(false);
  const handledGuidanceFocusNonceRef = useRef(0);

  const shown = resolveShownApproval(approvals, shownRequestId);
  const latest = shown?.item;
  const latestMessageId = latest?.messageId ?? null;
  const latestRequestId = latest?.part.requestId ?? null;
  // Open only while its request is the one shown: the form sends for the
  // shown request, so a new request taking the row closes it instead of being
  // denied.
  const guidanceOpen =
    guidanceTarget !== null &&
    guidanceTarget.messageId === latestMessageId &&
    guidanceTarget.requestId === latestRequestId;
  const decisionPending = pendingDecisionRequestId !== null;

  function resolveApproval(decision: {
    messageId: string;
    requestId: string;
    approved: boolean;
    scope?: "once" | "always";
  }) {
    if (disabled || pendingDecisionRequestId) {
      return;
    }
    // The pressed button is disabled next; hand focus to the status line so a
    // keyboard user keeps a position and hears the decision being recorded.
    reclaimFocusRef.current = Boolean(
      document.activeElement?.closest?.("[data-composer-approval-actions]"),
    );
    setPendingDecisionRequestId(decision.requestId);
    onResolveApproval({
      messageId: decision.messageId,
      requestId: decision.requestId,
      approved: decision.approved,
      ...(decision.scope === "always" ? { scope: decision.scope } : {}),
    });
  }

  function openGuidanceDraft(options: { focusComposer?: boolean }) {
    if (!latest || disabled || !onDraftGuidance) {
      return;
    }
    if (options.focusComposer) {
      pendingGuidanceFocusRef.current = true;
    }
    setGuidanceTarget({ messageId: latest.messageId, requestId: latest.part.requestId });
    if (guidanceTarget?.requestId !== latest.part.requestId) {
      setGuidanceText("");
    }
  }

  useEffect(() => {
    if (latestMessageId === null) {
      setGuidanceTarget(null);
      setGuidanceText("");
      pendingGuidanceFocusRef.current = false;
      return;
    }

    // The request was answered or withdrawn: its draft goes with it. A draft
    // whose request only stopped showing is kept for when it shows again.
    if (
      guidanceTarget &&
      !approvals.some(
        (approval) =>
          approval.messageId === guidanceTarget.messageId &&
          approval.part.requestId === guidanceTarget.requestId,
      )
    ) {
      setGuidanceTarget(null);
      setGuidanceText("");
      pendingGuidanceFocusRef.current = false;
    }
  }, [approvals, guidanceTarget, latestMessageId]);

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
    if (!decisionPending || !reclaimFocusRef.current) {
      return;
    }
    reclaimFocusRef.current = false;
    statusRef.current?.focus({ preventScroll: true });
  }, [decisionPending]);

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

  if (!shown || !latest) {
    return null;
  }

  const current = latest;
  const { part } = current;
  const count = approvals.length;
  const live = !disabled && !decisionPending;
  const busy = pendingDecisionRequestId === part.requestId;
  const toolTitle = getToolTitle(part.toolName);
  const summary = summarizeApprovalRequest(part);
  const offersAllowAlways = part.supportsAllowAlways === true && args.allowAlways !== false;
  const risk = part.risk ? describeApprovalRisk(part.risk) : null;
  const requester = !part.ownerAgentId
    ? null
    : current.requestedBy
      ? i18n.t("ui:approval.requestedByPlain", { agent: current.requestedBy })
      : i18n.t("ui:approval.requestedBySubagent");
  // Why the decisions are blocked, or nothing while they are live.
  const blockedReason = busy
    ? undefined
    : decisionPending
      ? i18n.t("session:chatInputApprovalQueue.extraCopy143")
      : disabled
        ? disabledReason
        : undefined;
  const decide = (decision: { approved: boolean; scope?: "once" | "always" }) =>
    resolveApproval({
      messageId: current.messageId,
      requestId: part.requestId,
      approved: decision.approved,
      scope: decision.scope,
    });
  const step = (direction: -1 | 1) =>
    setShownRequestId(stepShownApproval(approvals, part.requestId, direction));
  const detailsLabel = i18n.t(
    detailsOpen
      ? "session:composerApprovalRow.hideDetails"
      : "session:composerApprovalRow.showDetails",
  );

  return (
    <section
      aria-label={i18n.t("session:chatInputApprovalQueue.ariaLabel")}
      className={sx(styles.section)}
      data-testid="composer-approval-row"
    >
      <div
        aria-busy={busy || undefined}
        aria-label={
          summary
            ? i18n.t("session:composerApprovalRow.groupLabel", { tool: toolTitle, summary })
            : i18n.t("session:composerApprovalRow.groupLabelTool", { tool: toolTitle })
        }
        className={sx(styles.row)}
        data-approval-request-id={part.requestId}
        role="group"
      >
        <div className={sx(styles.identity)}>
          <ShieldAlert aria-hidden className={sx(styles.statusIcon)} />
          <span className={sx(styles.tool)}>{toolTitle}</span>
          {summary ? (
            <code className={sx(styles.summary)} title={summary}>
              {summary}
            </code>
          ) : null}
          {risk ? (
            <span className={sx(styles.risk)} data-approval-risk="" title={risk}>
              {risk}
            </span>
          ) : null}
          {count > 1 ? (
            <span className={sx(styles.stepper)}>
              <Tooltip content={i18n.t("session:composerApprovalRow.previous")}>
                <AuiButton
                  aria-label={i18n.t("session:composerApprovalRow.previous")}
                  iconOnly
                  onClick={() => step(-1)}
                  size="xs"
                  variant="quiet"
                >
                  <ChevronLeft aria-hidden />
                </AuiButton>
              </Tooltip>
              <span aria-live="polite" className={sx(styles.position)}>
                {i18n.t("session:composerApprovalRow.position", {
                  index: shown.index + 1,
                  count,
                })}
              </span>
              <Tooltip content={i18n.t("session:composerApprovalRow.next")}>
                <AuiButton
                  aria-label={i18n.t("session:composerApprovalRow.next")}
                  iconOnly
                  onClick={() => step(1)}
                  size="xs"
                  variant="quiet"
                >
                  <ChevronRight aria-hidden />
                </AuiButton>
              </Tooltip>
            </span>
          ) : null}
        </div>
        <div className={sx(styles.trailing)}>
          <div
            aria-disabled={!live || undefined}
            className={sx(styles.actions)}
            data-composer-approval-actions=""
          >
            <AuiButton
              aria-keyshortcuts={live ? "Enter" : undefined}
              disabled={!live}
              onClick={() => decide({ approved: true, scope: "once" })}
              size="sm"
              variant="primary"
            >
              {i18n.t("ui:approval.allowOnce")}
              {live ? (
                <Kbd aria-hidden className={sx(styles.allowKey)}>↵</Kbd>
              ) : null}
            </AuiButton>
            {offersAllowAlways ? (
              <AuiButton
                disabled={!live}
                onClick={() => decide({ approved: true, scope: "always" })}
                size="sm"
                variant="secondary"
              >
                {i18n.t("ui:approval.alwaysAllow")}
              </AuiButton>
            ) : null}
            <AuiButton
              disabled={!live}
              onClick={() => decide({ approved: false })}
              size="sm"
              tone="danger"
              variant="outline"
            >
              {i18n.t("ui:approval.deny")}
            </AuiButton>
          </div>
          <Tooltip content={detailsLabel}>
            <AuiButton
              aria-controls={detailsOpen ? detailsId : undefined}
              aria-expanded={detailsOpen}
              aria-label={detailsLabel}
              data-testid="composer-approval-details-toggle"
              iconOnly
              onClick={() => setDetailsOpen((open) => !open)}
              size="sm"
              variant="quiet"
            >
              {detailsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </AuiButton>
          </Tooltip>
        </div>
      </div>

      {detailsOpen ? (
        <div className={sx(styles.details)} id={detailsId}>
          {/* Who asked: the row keeps its width for the command. */}
          {requester ? (
            <p className={sx(styles.requester)} data-approval-requester="">
              {requester}
            </p>
          ) : null}
          {/* When the runtime denies it if nobody answers, as on the card. */}
          <ApprovalExpiryNote part={part} />

          {part.description ? (
            <p className={sx(styles.description)}>{part.description}</p>
          ) : null}
          {part.input ? (
            <div className={sx(styles.argument)}>
              <p className={sx(styles.argumentLabel)}>
                {i18n.t("session:turnEventDecisions.label")}
              </p>
              <pre className={sx(styles.argumentValue)}>{part.input}</pre>
            </div>
          ) : null}
          {/* "Always allow" sits beside Allow once on the row, as on the card. */}
          {live && onDraftGuidance ? (
            <div className={sx(styles.detailActions)}>
              {!guidanceOpen ? (
                <AuiButton
                  aria-keyshortcuts="Tab"
                  onClick={() => openGuidanceDraft({ focusComposer: true })}
                  size="xs"
                  variant="quiet"
                >
                  <Kbd aria-hidden>Tab</Kbd>
                  {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue5")}
                </AuiButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {live && onDraftGuidance && guidanceOpen ? (
        <div className={sx(styles.details)}>
          <Textarea
            ref={guidanceTextareaRef}
            value={guidanceText}
            rows={2}
            xstyle={styles.guidanceField}
            onChange={(event) => setGuidanceText(event.target.value)}
            placeholder={i18n.t("session:chatInputApprovalQueue.placeholder", { value1: part.toolName })}
          />
          <div className={sx(styles.detailActions)}>
            <AuiButton
              disabled={!guidanceText.trim()}
              onClick={() => {
                const guidance = guidanceText.trim();
                if (!guidance) {
                  return;
                }
                onDraftGuidance({
                  messageId: current.messageId,
                  requestId: part.requestId,
                  toolName: part.toolName,
                  description: part.description,
                  guidance,
                });
                setGuidanceTarget(null);
                setGuidanceText("");
              }}
              size="sm"
              variant="primary"
            >
              {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue3")}
            </AuiButton>
            <AuiButton
              onClick={() => {
                setGuidanceTarget(null);
                setGuidanceText("");
              }}
              size="sm"
              variant="quiet"
            >
              {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue4")}
            </AuiButton>
          </div>
        </div>
      ) : null}

      {decisionPending ? (
        <p
          aria-live="polite"
          className={sx(styles.footer)}
          ref={statusRef}
          role="status"
          tabIndex={-1}
        >
          <Loader aria-hidden size="xs" variant="signal" />
          {i18n.t("session:chatInputApprovalQueue.chatInputApprovalQueue")}
        </p>
      ) : null}
      {blockedReason ? (
        <p className={sx(styles.footer)}>{blockedReason}</p>
      ) : null}
    </section>
  );
}
