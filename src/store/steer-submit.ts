import { i18n } from "@/i18n/runtime";
import {
  RENDERER_STEER_ACK_TIMEOUT_MS,
  waitForSteerDelivery,
} from "@/lib/providers/steer-delivery";
import type {
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
} from "@/lib/providers/provider.types";
import type { SendUserMessageResult } from "@/store/app-store.types";

export async function submitSteerWithDeadline(args: {
  request: ProviderSteerTurnRequest;
  send: (
    request: ProviderSteerTurnRequest,
  ) => Promise<ProviderSteerTurnResponse>;
  timeoutMs?: number;
}): Promise<ProviderSteerTurnResponse> {
  try {
    const delivery = await waitForSteerDelivery({
      response: args.send(args.request),
      timeoutMs: args.timeoutMs ?? RENDERER_STEER_ACK_TIMEOUT_MS,
    });
    if (delivery.status === "resolved") {
      return delivery.value;
    }
    return {
      ok: false,
      delivery: "unknown",
      message:
        i18n.t("notifications:steerSubmit.steerDeliveryCouldNotBeConfirmedTheProviderMayStillAcceptItWaitForTheCurrentResponseB"),
    };
  } catch {
    return {
      ok: false,
      delivery: "rejected",
      message: i18n.t("notifications:steerSubmit.theSteerRequestCouldNotReachTheProvider"),
    };
  }
}

/**
 * The send result for a steer that did not land.
 *
 * Both shapes are returned BEFORE any state mutation, so whatever the user
 * tried to steer — composer text or a staged queue item — stays exactly where
 * it was and can be retried or left to dispatch normally.
 */
export function buildFailedSteerResult(args: {
  result: ProviderSteerTurnResponse;
  taskId: string;
  workspaceId: string;
}): SendUserMessageResult {
  if (args.result.delivery === "unknown") {
    return {
      status: "steer-delivery-unknown",
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      message:
        args.result.message ||
        i18n.t("notifications:steerSubmit.steerDeliveryCouldNotBeConfirmedWaitForTheCurrentResponseBeforeRetryingOrQueueing"),
    };
  }
  return {
    status: "steer-unavailable",
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    message:
      args.result.message ||
      i18n.t("notifications:steerSubmit.theActiveTurnRejectedTheSteerRequestPressTabToQueueInstead"),
  };
}
