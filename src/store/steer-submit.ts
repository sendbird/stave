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
        "Steer delivery could not be confirmed. The provider may still accept it; wait for the current response before retrying or queueing.",
    };
  } catch {
    return {
      ok: false,
      delivery: "rejected",
      message: "The steer request could not reach the provider.",
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
        "Steer delivery could not be confirmed. Wait for the current response before retrying or queueing.",
    };
  }
  return {
    status: "steer-unavailable",
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    message:
      args.result.message ||
      "The active turn rejected the steer request — press Tab to queue instead.",
  };
}
