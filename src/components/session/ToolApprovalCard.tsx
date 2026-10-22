import { i18n, useTranslation } from "@/i18n";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import {
  Approval,
  type ApprovalDecision,
  type ApprovalOutcome,
} from "@/components/ads/components/Approval";
import { describeApprovalDecider } from "@/components/approvals/ApprovalRecord";
import { getToolTitle } from "@/components/session/message/assistant-trace.utils";
import { formatTime } from "@/i18n/format";
import type { ApprovalPart } from "@/types/chat";

/**
 * How long a sent decision keeps the controls blocked while the part is still
 * pending: just past the provider's 30 s acknowledgement, so a delivery that
 * failed silently can be retried instead of leaving the card locked.
 */
export const APPROVAL_DELIVERY_GUARD_MS = 32_000;

export interface ToolApprovalDecision {
  approved: boolean;
  scope: "once" | "always";
}

/**
 * A recorded approval, or `null` while the gate is still open.
 *
 * The decision word follows the part's state; who decided and when come from
 * its `resolution`. A person's allow names its grant (once or always) when it
 * was recorded; a part from before the record, or one allowed automatically,
 * is ADS's `allowed`, because a scoped word would state a fact nobody wrote
 * down. `approval-interrupted` is `lapsed` — the turn that asked ended —
 * which is neither a denial nor a pending gate.
 */
export function toApprovalOutcome(
  part: Pick<ApprovalPart, "state" | "resolution">,
): ApprovalOutcome | null {
  const { resolution } = part;
  const audit = resolution
    ? { by: describeApprovalDecider(resolution), at: formatTime(resolution.decidedAt) }
    : {};
  switch (part.state) {
    case "approval-requested":
      return null;
    case "approval-responded":
      return {
        decision: resolution?.source === "user" && resolution.scope
          ? (resolution.scope === "always" ? "allow-always" : "allow-once")
          : "allowed",
        ...audit,
      };
    case "output-denied":
      return { decision: "deny", ...audit };
    case "approval-interrupted":
      return { decision: "lapsed" };
  }
}

export function toToolApprovalDecision(
  decision: ApprovalDecision,
): ToolApprovalDecision {
  return {
    approved: decision !== "deny",
    scope: decision === "allow-always" ? "always" : "once",
  };
}

export type ToolApprovalCardProps = {
  part: ApprovalPart;
  onDecide: (decision: ToolApprovalDecision) => void;
  /** `compact` outside the transcript: the composer, a child slot, Fleet. */
  density?: "default" | "compact";
  /** Controlled in-flight state; omit to let the card track its own. */
  busy?: boolean;
  /** Blocks the decisions without claiming one is being recorded. */
  disabled?: boolean;
  /** Why the controls are blocked, shown after the decision set. */
  note?: ReactNode;
  /** Host actions after the decision set (a keyboard hint, for example). */
  actions?: ReactNode;
  /**
   * Offer "Always allow" here. It is shown only when the provider persists the
   * grant itself (`supportsAllowAlways`); `false` hides it where the surface
   * cannot send a scoped answer. It never widens what the provider supports.
   */
  allowAlways?: boolean;
} & Omit<
  ComponentProps<typeof Approval>,
  | "title"
  | "description"
  | "arguments"
  | "outcome"
  | "busy"
  | "onDecide"
  | "allowAlways"
  | "density"
  | "actions"
  // `part` is also an HTML attribute (CSS shadow parts); here it is the
  // approval part.
  | "part"
>;

/**
 * The one approval card: a tool approval part drawn with ADS `Approval`
 * wherever it is answered — the transcript, the composer queue, a delegated
 * child's slot and Fleet. Every surface shows the same title, description and
 * input and the same decision words ("Allow once", "Always allow" only when the
 * provider persists it, "Deny"), and blocks the decision set from the moment
 * one is sent until the part leaves pending or the delivery guard passes. A
 * surface that coordinates several cards passes `busy` itself; otherwise the
 * card keeps its own.
 */
export function ToolApprovalCard(props: ToolApprovalCardProps) {
  useTranslation();
  const {
    part,
    onDecide,
    density = "default",
    busy: controlledBusy,
    disabled = false,
    note,
    actions,
    allowAlways,
    ...rest
  } = props;
  const pending = part.state === "approval-requested";
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  const ownBusy = pending && sentRequestId === part.requestId;

  useEffect(() => {
    if (!ownBusy) {
      return;
    }
    const timer = window.setTimeout(
      () => setSentRequestId(null),
      APPROVAL_DELIVERY_GUARD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ownBusy]);

  const busy = controlledBusy ?? ownBusy;
  const hostActions =
    note != null || actions != null ? (
      <>
        {actions}
        {note}
      </>
    ) : undefined;

  return (
    <Approval
      {...rest}
      actions={hostActions}
      allowAlways={part.supportsAllowAlways === true && allowAlways !== false}
      arguments={
        part.input
          ? [
              {
                id: "input",
                label: i18n.t("session:turnEventDecisions.label"),
                value: part.input,
              },
            ]
          : undefined
      }
      busy={busy}
      data-approval-request-id={part.requestId}
      density={density}
      description={part.description || undefined}
      onDecide={
        disabled || !pending
          ? undefined
          : (decision) => {
              if (busy) {
                return;
              }
              setSentRequestId(part.requestId);
              onDecide(toToolApprovalDecision(decision));
            }
      }
      outcome={toApprovalOutcome(part)}
      title={getToolTitle(part.toolName)}
    />
  );
}
