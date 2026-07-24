import {
  RENDERER_STEER_ACK_TIMEOUT_MS,
  waitForSteerDelivery,
} from "@/lib/providers/steer-delivery";
import type {
  ProviderSteerTurnRequest,
  ProviderSteerTurnResponse,
} from "@/lib/providers/provider.types";

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
