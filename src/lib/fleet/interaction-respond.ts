import { i18n } from "@/i18n/runtime";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  type FleetControlValidation,
  type FleetInteractionControlIdentity,
} from "@/lib/fleet/control-plane";
import { findPendingUserInputMessageByRequestId } from "@/store/provider-message.utils";
import { useAppStore } from "@/store/app.store";
import type { ApprovalPart, UserInputPart } from "@/types/chat";

/**
 * A question that did not pause its turn: it can still be answered after the
 * turn ends, so every Fleet surface matches it without the turn.
 */
export function fleetInteractionOutlivesTurn(
  part: ApprovalPart | UserInputPart | null | undefined,
) {
  return part?.type === "user_input" && part.delivery === "async";
}

export type FleetInteractionResponse =
  | { kind: "approval"; approved: boolean; scope?: "once" | "always" }
  | { kind: "user-input"; answers?: Record<string, string>; denied?: boolean };

/**
 * Answers a pending request from outside its task — a Fleet row, a parent's
 * slot for a delegated child — through the store's normal respond actions, so
 * the task records the answer exactly as if it had been given there.
 *
 * The response goes out only while the task still shows that exact request:
 * same repository, workspace, task, turn, request and message, read from the
 * state at the moment of sending. An asynchronous question did not pause its
 * turn and may outlive it, so it is matched without the turn.
 */
export function respondToFleetInteraction(
  expected: FleetInteractionControlIdentity,
  response: FleetInteractionResponse,
): FleetControlValidation {
  const state = useAppStore.getState();
  const current = resolveFleetCurrentTaskControlState({ state, expected });
  const asyncQuestion =
    expected.kind === "user-input" &&
    fleetInteractionOutlivesTurn(
      findPendingUserInputMessageByRequestId({
        messages: current.messages,
        requestId: expected.requestId,
      })?.part,
    );
  const validation = validateFleetInteractionAction({
    expected: asyncQuestion ? { ...expected, turnId: null } : expected,
    current,
  });
  if (!validation.ok || response.kind !== expected.kind) {
    return validation.ok
      ? { ok: false, reason: i18n.t("app:errors.childMismatch") }
      : validation;
  }
  if (!validation.messageId) {
    return { ok: false, reason: i18n.t("app:errors.childMissingTarget") };
  }
  if (response.kind === "approval") {
    state.resolveApproval({
      taskId: expected.taskId,
      messageId: validation.messageId,
      requestId: expected.requestId,
      approved: response.approved,
      ...(response.approved && response.scope === "always"
        ? { scope: "always" as const }
        : {}),
    });
  } else {
    state.resolveUserInput({
      taskId: expected.taskId,
      messageId: validation.messageId,
      requestId: expected.requestId,
      answers: response.answers,
      denied: response.denied,
    });
  }
  return validation;
}
