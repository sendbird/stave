import { i18n } from "@/i18n/runtime";
import { createBridgeProviderSource, hasBridgeProviderSource } from "@/lib/providers/bridge.source";
import { parseNormalizedEvent } from "@/lib/providers/runtime";
import type { NormalizedProviderEvent, ProviderAdapter, ProviderEventSource, ProviderId } from "@/lib/providers/provider.types";

const bridgeUnavailableSource: ProviderEventSource<NormalizedProviderEvent> = {
  async *streamTurn() {
    yield { type: "system", get content() { return i18n.t("providers:index.providerBridgeUnavailableUseBunRun"); } };
    yield { type: "done" };
  },
};

function createBridgeSource(providerId: ProviderId): ProviderEventSource<unknown> {
  if (hasBridgeProviderSource()) {
    return createBridgeProviderSource<unknown>({ providerId });
  }
  return bridgeUnavailableSource;
}

/**
 * Streams a turn from `source`, yielding only events that pass
 * `NormalizedProviderEventSchema`. The main process already emits normalized
 * events; an event that fails validation is reported and dropped.
 */
export function createBridgeProviderAdapter(args: {
  providerId: ProviderId;
  source: ProviderEventSource<unknown>;
}): ProviderAdapter {
  const { providerId, source } = args;
  return {
    id: providerId,
    async *runTurn(turnArgs) {
      for await (const payload of source.streamTurn(turnArgs)) {
        const event = parseNormalizedEvent({ payload });
        if (event) {
          yield event;
        }
      }
    },
  };
}

export function getProviderAdapter(args: { providerId: ProviderId }): ProviderAdapter {
  // Every provider uses the same IPC bridge. The stave meta-provider routes
  // to the real provider on the Electron side.
  return createBridgeProviderAdapter({
    providerId: args.providerId,
    source: createBridgeSource(args.providerId),
  });
}
