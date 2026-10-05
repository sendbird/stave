import { i18n } from "@/i18n/runtime";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  type FleetControlValidation,
  type FleetInteractionControlIdentity,
} from "@/lib/fleet/control-plane";
import { useAppStore } from "@/store/app.store";

export type ChildInteractionResponse =
  | { kind: "approval"; approved: boolean }
  | { kind: "user-input"; answers?: Record<string, string>; denied?: boolean };

/**
 * Answers a delegated child's request from another task. The response goes out
 * only while the child still shows that exact request — same repository,
 * workspace, task, turn, request and message — and through the store's normal
 * respond actions, so it reaches the child's host without selecting the child
 * or switching workspaces.
 */
export function respondToChildInteraction(
  expected: FleetInteractionControlIdentity,
  response: ChildInteractionResponse,
): FleetControlValidation {
  const state = useAppStore.getState();
  const validation = validateFleetInteractionAction({
    expected,
    current: resolveFleetCurrentTaskControlState({ state, expected }),
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
